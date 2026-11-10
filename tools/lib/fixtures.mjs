// Shared helpers for the ingest tools. Files are identified by a content hash, never by name,
// so no book title is ever printed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PDF_DIR = path.join(ROOT, 'tests', 'fixtures', 'pdf');

export function listFixtures(dir = PDF_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /\.pdf$/i.test(f)).sort().map(f => {
    const full = path.join(dir, f);
    const bytes = fs.readFileSync(full);
    const id = crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 8);
    return { id, path: full, size: bytes.length, bytes: () => new Uint8Array(fs.readFileSync(full)) };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

export function table(rows, cols) {
  const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
  const line = r => cols.map((c, i) => String(r[c] ?? '').padEnd(w[i])).join('  ');
  return [line(Object.fromEntries(cols.map(c => [c, c]))), w.map(n => '-'.repeat(n)).join('  '), ...rows.map(line)].join('\n');
}

export const mb = n => (n / 1048576).toFixed(0);
