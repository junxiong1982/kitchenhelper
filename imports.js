import pg from 'pg';

let pool;
let schemaReady = false;
function verifiedConnectionString(value) {
  const url = new URL(value);
  if (url.searchParams.get('sslmode') === 'require') url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

async function database() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured on the server.');
  pool ??= new pg.Pool({ connectionString: verifiedConnectionString(process.env.DATABASE_URL), max: 3, connectionTimeoutMillis: 5000 });
  if (!schemaReady) {
    await pool.query(`CREATE TABLE IF NOT EXISTS kitchen_imports (
      kind text NOT NULL,
      source_id text NOT NULL,
      file_name text NOT NULL,
      payload jsonb NOT NULL,
      imported_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (kind, source_id)
    )`);
    schemaReady = true;
  }
  return pool;
}

function csvRows(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted && c === '"' && text[i + 1] === '"') { value += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(value); value = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(value); if (row.some(x => x !== '')) rows.push(row);
      row = []; value = '';
    } else value += c;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  if (!rows.length) throw new Error('CSV file is empty.');
  const [headers, ...data] = rows;
  if (new Set(headers).size !== headers.length) throw new Error('CSV has duplicate column names.');
  if (data.some(values => values.length !== headers.length)) throw new Error('CSV has an incomplete row.');
  return { headers, rows: data.map(values => Object.fromEntries(headers.map((key, i) => [key, values[i]]))) };
}

const required = {
  stock: ['ingredient_id', 'name', 'unit', 'on_hand', 'committed', 'pack_size', 'checked_at'],
  staff: ['id', 'name', 'employment_type', 'role', 'skills'],
  leave: ['id', 'staff_id', 'date', 'status'],
  availability: ['staff_id', 'date', 'start', 'end', 'status'],
  crm: ['export_id', 'exported_at', 'id', 'production_date', 'customer', 'product_id', 'quantity', 'status', 'received_at']
};

function nonempty(row, fields) { return fields.every(key => row[key] !== undefined && row[key] !== null && row[key] !== ''); }
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)); }
function validTime(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
function validInstant(value) { return typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)); }

export function validateUpload(kind, content, fileName) {
  if (!required[kind]) throw new Error('Choose a supported import type.');
  if (typeof content !== 'string' || content.length > 5_000_000) throw new Error('Choose a file smaller than 5 MB.');
  let rows, metadata = {};
  if (kind === 'crm') {
    const parsed = csvRows(content);
    const missing = required.crm.filter(key => !parsed.headers.includes(key));
    if (missing.length) throw new Error(`CRM CSV is missing: ${missing.join(', ')}.`);
    rows = parsed.rows;
  } else {
    let document;
    try { document = JSON.parse(content); } catch { throw new Error('This is not valid JSON.'); }
    rows = Array.isArray(document) ? document : document?.records;
    metadata = Array.isArray(document) ? {} : { export_id: document?.export_id, exported_at: document?.exported_at, effective_month: document?.effective_month };
  }
  if (!Array.isArray(rows) || !rows.length) throw new Error('The file has no records.');
  const ids = new Set();
  for (const [index, row] of rows.entries()) {
    if (!row || !nonempty(row, required[kind])) throw new Error(`${kind} record ${index + 1} has a missing required field.`);
    if (kind === 'stock' && (![row.on_hand, row.committed, row.pack_size].every(x => Number.isFinite(x)) || row.on_hand < 0 || row.committed < 0 || row.pack_size <= 0 || !validInstant(row.checked_at))) throw new Error(`Stock record ${index + 1} has invalid quantities or time.`);
    if (kind === 'staff' && (!['Permanent', 'Part-time'].includes(row.employment_type) || !Array.isArray(row.skills))) throw new Error(`Staff record ${index + 1} is invalid.`);
    if (kind === 'leave' && (!validDate(row.date) || !['Approved', 'Pending', 'Rejected'].includes(row.status))) throw new Error(`Leave record ${index + 1} is invalid.`);
    if (kind === 'availability' && (!validDate(row.date) || !validTime(row.start) || !validTime(row.end) || row.start >= row.end || !['Confirmed', 'Pending', 'Cancelled'].includes(row.status))) throw new Error(`Availability record ${index + 1} is invalid.`);
    if (kind === 'crm' && (!validDate(row.production_date) || !validInstant(row.received_at) || !validInstant(row.exported_at) || !Number.isSafeInteger(Number(row.quantity)) || Number(row.quantity) <= 0)) throw new Error(`CRM row ${index + 2} has invalid dates or quantity.`);
    const id = kind === 'stock' ? row.ingredient_id : kind === 'availability' ? `${row.staff_id}:${row.date}:${row.start}` : row.id;
    if (ids.has(id)) throw new Error(`Duplicate record ID: ${id}.`);
    ids.add(id);
  }
  const sourceId = kind === 'crm' ? rows[0].export_id : metadata.export_id ?? (kind === 'stock' ? rows[0].checked_at : null);
  if (!sourceId) throw new Error('The file is missing an export ID.');
  if (kind === 'crm' && rows.some(row => row.export_id !== sourceId || row.exported_at !== rows[0].exported_at)) throw new Error('CRM rows must share one export ID and export time.');
  return { kind, sourceId: String(sourceId).slice(0, 200), fileName: String(fileName ?? 'upload').slice(0, 200), payload: { records: rows, metadata }, count: rows.length };
}

export async function saveUpload(upload) {
  const db = await database();
  const result = await db.query(`INSERT INTO kitchen_imports (kind, source_id, file_name, payload)
    VALUES ($1, $2, $3, $4::jsonb)
    ON CONFLICT (kind, source_id) DO UPDATE SET file_name = EXCLUDED.file_name, payload = EXCLUDED.payload, imported_at = now()
    RETURNING imported_at`, [upload.kind, upload.sourceId, upload.fileName, JSON.stringify(upload.payload)]);
  return { ...upload, importedAt: result.rows[0].imported_at };
}

export async function loadUploads() {
  const db = await database();
  const result = await db.query(`SELECT DISTINCT ON (kind) kind, source_id, file_name, payload, imported_at
    FROM kitchen_imports ORDER BY kind, imported_at DESC, source_id DESC`);
  return Object.fromEntries(result.rows.map(row => [row.kind, row]));
}
