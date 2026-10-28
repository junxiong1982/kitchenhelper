import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { validateUpload, saveUpload, loadUploads } from './imports.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, 'operating data');
const referenceDir = path.join(root, 'reference-data');
async function loadLocalEnv() {
  try {
    const contents = await readFile(path.join(root, '.env'), 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await loadLocalEnv();
const readJson = async name => JSON.parse(await readFile(path.join(referenceDir, name), 'utf8'));
async function sampleJson(name, fallback) {
  if (process.env.VERCEL) return fallback;
  try { return JSON.parse(await readFile(path.join(dataDir, name), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function sampleCsv() {
  if (process.env.VERCEL) return '';
  try { return await readFile(path.join(dataDir, 'CRM_Weekly_Sales_Orders_2026-10-28.csv'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted && c === '"' && text[i + 1] === '"') { field += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.some(value => value !== '')) rows.push(row);
      row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [headers, ...records] = rows;
  return records.map(values => Object.fromEntries(headers.map((key, i) => [key, values[i] ?? ''])));
}

async function calculate() {
  let uploaded = {}, databaseError = null;
  if (process.env.DATABASE_URL) {
    try { uploaded = await loadUploads(); }
    catch (error) { if (process.env.VERCEL) throw error; databaseError = 'Database connection unavailable; showing local sample files.'; }
  }
  const [scenario, catalog, supplier, sampleStock, sampleStaff, sampleLeave, sampleAvailability, csv] = await Promise.all([
    readJson('scenario.json'), readJson('products_and_recipes.json'), readJson('supplier.json'),
    sampleJson('current_inventory.json', []), sampleJson('HR_Staff_Master_2026-11.json', { records: [] }),
    sampleJson('HR_Leave_2026-11.json', { records: [] }), sampleJson('HR_Part_Time_Availability_2026-11.json', { records: [] }),
    sampleCsv()
  ]);
  const stock = uploaded.stock?.payload.records ?? sampleStock;
  const staffFile = { records: uploaded.staff?.payload.records ?? sampleStaff.records };
  const leaveFile = { records: uploaded.leave?.payload.records ?? sampleLeave.records };
  const availabilityFile = { records: uploaded.availability?.payload.records ?? sampleAvailability.records };
  const orders = uploaded.crm?.payload.records ?? (csv ? parseCsv(csv) : []);
  const cutoff = Date.parse(scenario.order_cutoff);
  const eligible = [], excluded = [];
  for (const order of orders) {
    const target = Date.parse(`${order.production_date}T00:00:00+08:00`);
    const received = Date.parse(order.received_at);
    const good = order.status.toLowerCase() === 'confirmed' && target >= Date.parse(`${scenario.week_start}T00:00:00+08:00`) && target <= Date.parse(`${scenario.week_end}T00:00:00+08:00`) && received <= cutoff;
    (good ? eligible : excluded).push({ ...order, quantity: Number(order.quantity), exclusion: good ? '' : received > cutoff ? 'Received after cutoff' : 'Outside week or not confirmed' });
  }
  const products = Object.fromEntries(catalog.products.map(p => [p.id, p]));
  const daily = {};
  for (const order of eligible) {
    daily[order.production_date] ??= { date: order.production_date, units: 0, labour: 0, products: {} };
    daily[order.production_date].units += order.quantity;
    daily[order.production_date].labour += order.quantity * (products[order.product_id]?.labour_hours_per_unit ?? 0);
    daily[order.production_date].products[order.product_id] = (daily[order.production_date].products[order.product_id] ?? 0) + order.quantity;
  }
  const ingredientNeed = {};
  for (const order of eligible) for (const recipe of catalog.recipes.filter(item => item.product_id === order.product_id)) {
    ingredientNeed[recipe.ingredient_id] = (ingredientNeed[recipe.ingredient_id] ?? 0) + order.quantity * recipe.quantity_per_unit;
  }
  const stockPlan = stock.map(item => {
    const required = ingredientNeed[item.ingredient_id] ?? 0;
    const available = Math.max(0, item.on_hand - item.committed);
    const shortage = Math.max(0, required - available);
    return { ...item, required, available, shortage, packs: shortage ? Math.ceil(shortage / item.pack_size) : 0 };
  });
  const leave = leaveFile.records.filter(x => x.status === 'Approved');
  const availability = availabilityFile.records.filter(x => x.status === 'Confirmed');
  const roster = [];
  for (const day of Object.values(daily).sort((a,b) => a.date.localeCompare(b.date))) {
    const permanent = staffFile.records.filter(s => s.employment_type === 'Permanent' && !leave.some(l => l.staff_id === s.id && l.date === day.date));
    const confirmedPartTime = availability.filter(a => a.date === day.date).map(a => ({ ...staffFile.records.find(s => s.id === a.staff_id), start: a.start, end: a.end })).filter(s => s.id);
    const demandPeople = Math.ceil(day.labour / scenario.settings.permanent_productive_hours);
    roster.push({ date: day.date, labour: Number(day.labour.toFixed(2)), demandPeople, permanent, confirmedPartTime, leave: leave.filter(l => l.date === day.date).map(l => staffFile.records.find(s => s.id === l.staff_id)?.name ?? l.staff_id) });
  }
  return { scenario, supplier, export: { id: orders[0]?.export_id, exportedAt: orders[0]?.exported_at }, eligible, excluded, days: Object.values(daily).sort((a,b)=>a.date.localeCompare(b.date)), roster, stock: stockPlan, imports: Object.fromEntries(Object.entries(uploaded).map(([kind, row]) => [kind, { sourceId: row.source_id, fileName: row.file_name, importedAt: row.imported_at }])), databaseError, usingSamples: !process.env.VERCEL && Object.keys(uploaded).length < 5 };
}

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function page(plan) {
  const cards = `<div class="cards"><article><strong>${plan.eligible.length}</strong><span>Eligible orders</span></article><article><strong>${plan.eligible.reduce((s,o)=>s+o.quantity,0).toLocaleString()}</strong><span>Sandwiches to make</span></article><article><strong>${plan.excluded.length}</strong><span>Manager review</span></article><article><strong>${plan.days.reduce((s,d)=>s+d.labour,0).toFixed(1)}</strong><span>Labour hours</span></article></div>`;
  const kinds = [['stock','Stock counts JSON'],['staff','Staff master JSON'],['leave','Leave JSON'],['availability','Part-time availability JSON'],['crm','Weekly CRM CSV']];
  const importPanel = `<section class="panel"><h2>Import your files</h2><p>Accepted uploads are checked and saved in PostgreSQL. Reimporting the same CRM export replaces it so orders are not counted twice.</p><div class="upload-grid">${kinds.map(([kind,label])=>`<form data-kind="${kind}"><label>${label}<input type="file" accept="${kind==='crm'?'.csv':'.json'}" required></label><button type="submit">Upload</button><small>${plan.imports[kind] ? `Saved: ${esc(plan.imports[kind].fileName)}` : 'No saved import'}</small></form>`).join('')}</div><p id="import-result" aria-live="polite"></p></section>`;
  const aiPanel = `<section class="panel"><h2>Test OpenAI connection</h2><p>Uses the private OPENAI_API_KEY from your .env file to send one short test request. The key stays on this computer's server.</p><button id="openai-test" type="button">Test OpenAI</button> <span id="openai-result" aria-live="polite"></span></section>`;
  const daily = plan.days.map(d => `<tr><td>${esc(d.date)}</td><td>${d.units.toLocaleString()}</td><td>${d.labour.toFixed(1)} hrs</td><td>${Object.entries(d.products).map(([id,n])=>`${esc(id)} ${n}`).join(' · ')}</td></tr>`).join('');
  const stock = plan.stock.map(i => `<tr><td>${esc(i.name)}</td><td>${i.required.toLocaleString()} ${esc(i.unit)}</td><td>${i.available.toLocaleString()} ${esc(i.unit)}</td><td>${i.packs ? `${i.packs} × ${esc(i.pack_name)}` : 'No order needed'}</td></tr>`).join('');
  const roster = plan.roster.map(r => `<tr><td>${esc(r.date)}</td><td>${r.labour} hrs<br><small>${r.demandPeople} permanent capacity slots needed</small></td><td>${r.permanent.map(s=>esc(s.name)).join(', ') || 'No permanent staff available'}</td><td>${r.confirmedPartTime.map(s=>`${esc(s.name)} (${esc(s.start)}–${esc(s.end)})`).join(', ') || 'No confirmed part-time staff'}${r.leave.length ? `<br><small>Approved leave: ${r.leave.map(esc).join(', ')}</small>` : ''}</td></tr>`).join('');
  const excluded = plan.excluded.map(o=>`<tr><td>${esc(o.id)}</td><td>${esc(o.customer)}</td><td>${esc(o.production_date)}</td><td>${o.quantity}</td><td>${esc(o.exclusion)}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kitchen Planner · Local</title><style>
  :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:#17231f;background:#f4f5f1}*{box-sizing:border-box}body{margin:0}.shell{max-width:1120px;margin:auto;padding:34px 24px 60px}.top{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:24px}.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#60746a;font-weight:700}h1{font-size:34px;letter-spacing:-.04em;margin:7px 0}p{color:#5b6a63}.top p{margin:0}.tag{border:1px solid #d7dfd8;background:white;padding:10px 14px;border-radius:999px;font-size:13px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:24px 0}.cards article,.panel{background:#fff;border:1px solid #e4e9e3;border-radius:14px;padding:20px}.cards strong{font-size:30px;display:block;letter-spacing:-.04em}.cards span{font-size:13px;color:#607169}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.panel{margin-bottom:16px}.panel h2{font-size:18px;margin:0 0 14px}.panel p{font-size:13px;line-height:1.55;margin:0 0 15px}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:#77847d;font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding:9px 8px;border-bottom:1px solid #e8ece7}td{padding:11px 8px;border-bottom:1px solid #eef1ed;vertical-align:top}tr:last-child td{border-bottom:0}small{font-size:11px;color:#7b8980}.alert{background:#fff7e9;border:1px solid #f1d5a4;border-radius:12px;padding:16px;margin-bottom:16px;color:#694b19}.alert strong{display:block;margin-bottom:4px}.wide{grid-column:1/-1}.footer{font-size:12px;color:#7b8980;margin-top:12px}@media(max-width:760px){.shell{padding:24px 14px}.top{display:block}.tag{display:inline-block;margin-top:16px}.cards{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.wide{grid-column:auto}table{font-size:12px}td,th{padding:9px 5px}}
  </style><body><main class="shell"><header class="top"><div><div class="eyebrow">Sample Central Kitchen · Local planner</div><h1>Weekly kitchen plan</h1><p>Production ${esc(plan.scenario.week_start)} to ${esc(plan.scenario.week_end)} · Singapore time</p></div><div class="tag">Cutoff · Wed 28 Oct, 12:00</div></header><div class="alert"><strong>${plan.usingSamples ? 'Local training preview' : 'Saved import plan'}</strong>${plan.databaseError ? esc(plan.databaseError) : plan.usingSamples ? 'The sample files are shown until you upload and save your own exports.' : 'Upload the five files below to build your plan.'} No staff are booked and no email is sent.</div>${importPanel}${aiPanel}${cards}<div class="grid"><section class="panel"><h2>Daily production</h2><table><thead><tr><th>Date</th><th>Units</th><th>Labour</th><th>Product mix</th></tr></thead><tbody>${daily}</tbody></table></section><section class="panel"><h2>Stock request</h2><table><thead><tr><th>Ingredient</th><th>Need</th><th>Available</th><th>Buy</th></tr></thead><tbody>${stock}</tbody></table></section><section class="panel wide"><h2>Draft roster view</h2><p>Confirmed availability and approved leave are shown below. The names are a capacity view, not assigned shifts.</p><table><thead><tr><th>Date</th><th>Demand</th><th>Permanent staff available</th><th>Confirmed part-time availability</th></tr></thead><tbody>${roster}</tbody></table></section><section class="panel wide"><h2>Excluded orders for manager review</h2><table><thead><tr><th>Order</th><th>Customer</th><th>Production date</th><th>Units</th><th>Reason</th></tr></thead><tbody>${excluded || '<tr><td colspan="5">None</td></tr>'}</tbody></table></section></div><div class="footer">Source export: ${esc(plan.export.id ?? 'none')} · Refresh the page to recalculate from saved imports.</div></main><script>document.querySelector('#openai-test').addEventListener('click',async()=>{const button=document.querySelector('#openai-test');const result=document.querySelector('#openai-result');button.disabled=true;result.textContent='Testing…';try{const response=await fetch('/api/openai-test',{method:'POST'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Test failed');result.textContent=data.message}catch(error){result.textContent=error.message}finally{button.disabled=false}});document.querySelectorAll('form[data-kind]').forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();const file=form.querySelector('input').files[0];const result=document.querySelector('#import-result');if(!file)return;result.textContent='Checking and saving…';try{const response=await fetch('/api/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:form.dataset.kind,fileName:file.name,content:await file.text()})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Import failed');result.textContent=data.message;location.reload()}catch(error){result.textContent=error.message}}));</script></body></html>`;
}

async function testOpenAI() {
  if (!process.env.OPENAI_API_KEY?.trim()) return { status: 400, body: { error: 'No API key found. Add it to the OPENAI_API_KEY line in .env, save the file, then restart the planner.' } };
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'gpt-6-luna', input: 'Reply with exactly: OpenAI connection successful.' })
    });
    const payload = await response.json();
    if (!response.ok) {
      const message = response.status === 401 ? 'OpenAI did not accept this key. Check the key in .env.' : response.status === 429 ? 'OpenAI returned a usage or rate limit. Check your API project limits.' : `OpenAI request failed (HTTP ${response.status}).`;
      return { status: 502, body: { error: message } };
    }
    const output = payload.output?.flatMap(item => item.content ?? []).find(item => item.type === 'output_text')?.text;
    return { status: 200, body: { message: output || 'OpenAI replied successfully.' } };
  } catch {
    return { status: 502, body: { error: 'Could not reach OpenAI. Check your internet connection and try again.' } };
  }
}

export default async function handler(req, res) {
  if (process.env.VERCEL) {
    if (!process.env.APP_PASSWORD) { res.writeHead(503); res.end('APP_PASSWORD is not configured.'); return; }
    const provided = (req.headers.authorization ?? '').replace(/^Basic\s+/i, '');
    let password = '';
    try { password = Buffer.from(provided, 'base64').toString('utf8').split(':').slice(1).join(':'); } catch {}
    const expected = Buffer.from(process.env.APP_PASSWORD);
    const actual = Buffer.from(password);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      res.writeHead(401, { 'www-authenticate': 'Basic realm="Kitchen Planner"' });
      res.end('Sign in to Kitchen Planner.'); return;
    }
  }
  if (req.method === 'POST' && req.url === '/api/import') {
    try {
      let body = typeof req.body === 'object' ? req.body : null;
      if (!body) { let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 6_000_000) throw new Error('File is too large.'); } body = JSON.parse(raw); }
      const upload = validateUpload(body.kind, body.content, body.fileName);
      await saveUpload(upload);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: `Saved ${upload.count} ${upload.kind} records from ${upload.sourceId}.` }));
    } catch (error) {
      res.writeHead(/DATABASE_URL|ECONNREFUSED|ENOTFOUND|timeout/i.test(error.message) ? 503 : 400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: /DATABASE_URL|ECONNREFUSED|ENOTFOUND|timeout/i.test(error.message) ? 'Database unavailable. The previous saved data remains unchanged.' : error.message }));
    }
    return;
  }
  if (req.method === 'POST' && req.url === '/api/openai-test') {
    const result = await testOpenAI();
    res.writeHead(result.status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result.body));
    return;
  }
  if (req.url !== '/' && req.url !== '/api/plan') { res.writeHead(404); res.end('Not found'); return; }
  try {
    const plan = await calculate();
    if (req.url === '/api/plan') { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(plan)); }
    else { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page(plan)); }
  } catch (error) { res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }); res.end(`Could not load local planning data: ${error.message}`); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  http.createServer(handler).listen(4173, '127.0.0.1', () => console.log('Kitchen Planner running at http://127.0.0.1:4173'));
}
