import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler, { setSampleProvider } from './server.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, 'operating data');
async function readOptionalJson(name, fallback) {
  try { return JSON.parse(await readFile(path.join(dataDir, name), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function readOptionalCsv() {
  try { return await readFile(path.join(dataDir, 'CRM_Weekly_Sales_Orders_2026-10-28.csv'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}
setSampleProvider(async () => {
  const [stock, staff, leave, availability, csv] = await Promise.all([
    readOptionalJson('current_inventory.json', []),
    readOptionalJson('HR_Staff_Master_2026-11.json', { records: [] }),
    readOptionalJson('HR_Leave_2026-11.json', { records: [] }),
    readOptionalJson('HR_Part_Time_Availability_2026-11.json', { records: [] }),
    readOptionalCsv()
  ]);
  return { stock, staff, leave, availability, csv };
});
http.createServer(handler).listen(4173, '127.0.0.1', () => console.log('Kitchen Planner running at http://127.0.0.1:4173'));
