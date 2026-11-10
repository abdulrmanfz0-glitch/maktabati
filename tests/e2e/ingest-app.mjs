#!/usr/bin/env node
// Import each fixture PDF through the app (headless Chrome) and compare the stored book with the
// engine's own JSON (Node). Prints metrics only, never book text.
//
//   node tests/e2e/ingest-app.mjs [page] [--only <id,id>]
//
// page defaults to dist/web/index.html (a path under the repo, or a URL).
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../../tools/lib/cdp.mjs';
import { serve } from '../../tools/lib/static-server.mjs';
import { listFixtures } from '../../tools/lib/fixtures.mjs';
import { ingestFile } from '../../packages/ingest/src/adapters/node.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const args = process.argv.slice(2);
const page = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--only') || 'dist/web/index.html';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;

const metrics = book => {
  let notes = 0, markers = 0, figures = 0, blocks = 0;
  const bl = list => (list || []).forEach(b => { blocks++; if (b.type === 'figure') figures++; markers += ((b.text || '').match(/\[\^[^\]]+\]/g) || []).length; });
  bl(book.intro && book.intro.blocks);
  for (const c of book.chapters || []) { notes += (c.notes || []).length; for (const s of c.sections || []) bl(s.blocks); }
  return { chapters: (book.chapters || []).length, notes, markers, figures, blocks };
};

// How a file gets into the app. Kept in one place so the test follows the UI.
export async function upload(b, file) {
  await b.evaluate(`location.hash = '#/lib'`); await b.sleep(400);
  const hasUp = await b.evaluate(`!!document.querySelector('#upFile')`);
  if (hasUp) { await b.setFiles('#upFile', [file]); return; }
  await b.evaluate(`document.querySelector('[data-add]').click()`); await b.sleep(300);
  await b.evaluate(`document.querySelector('[data-mode="file"]').click()`); await b.sleep(200);
  await b.setFiles('#addFile', [file]);
}

const readDB = `new Promise(res => { const q = indexedDB.open('maktabati'); q.onsuccess = () => { const db = q.result, t = db.transaction(['items', 'kv']), out = {}; const a = t.objectStore('items').getAll(); const k = t.objectStore('kv').getAllKeys(); t.oncomplete = () => { res({ items: a.result.map(i => ({ id: i.id, ingest: i.ingest, json: JSON.stringify(i) })), figKeys: k.result.filter(x => String(x).startsWith('fig:')) }); db.close(); }; }; })`;

async function main() {
  const srv = /^(https?|file):/.test(page) ? null : await serve(ROOT);
  const url = srv ? srv.url + '/' + page.split('/').map(encodeURIComponent).join('/') : page;
  const b = await launch({ width: 1280, height: 900 });
  const rows = []; let fail = 0;
  try {
    await b.goto(url); await b.waitFor(`(() => { const v = document.querySelector('main .view:not([hidden])'); return !!(v && v.innerHTML.length); })()`); await b.sleep(1200);
    for (const fx of listFixtures()) {
      if (only && !only.includes(fx.id)) continue;
      const eng = await ingestFile(fx.path), want = metrics(eng.book), rec = eng.report.recommendation;
      const before = (await b.evaluate(readDB)).items.map(i => i.id);
      const t = Date.now();
      await upload(b, fx.path);
      await b.waitFor(`!!document.querySelector('#pvSave') || /ما قدرت أحوّل/.test(document.querySelector('#modalBox').textContent)`, 300000);
      const pv = await b.evaluate(`({ save: !!document.querySelector('#pvSave'), disabled: !!(document.querySelector('#pvSave') || {}).disabled, figs: document.querySelectorAll('#modalBox img[src^="blob:"]').length })`);
      const row = { id: fx.id, engineRec: rec, want, previewMs: Date.now() - t };
      if (!pv.save) { row.result = 'conversion error'; rows.push(row); fail++; await b.evaluate(`document.querySelector('#modal [data-close]').click()`); continue; }
      if (pv.disabled) { row.result = rec === 'vision' ? 'not saved (vision), as designed' : 'save disabled'; rows.push(row); if (rec !== 'vision') fail++; await b.evaluate(`document.querySelector('#modal [data-close]').click()`); continue; }
      await b.evaluate(`document.querySelector('#pvSave').click()`); await b.sleep(1500);
      const db = await b.evaluate(readDB), it = db.items.find(i => !before.includes(i.id));
      if (!it) { row.result = 'not stored'; rows.push(row); fail++; continue; }
      const got = metrics(JSON.parse(it.json)), figKeys = db.figKeys.filter(k => k.startsWith('fig:' + it.id + ':')).length;
      row.got = got; row.figBlobs = figKeys; row.storedRec = it.ingest && it.ingest.rec;
      const same = ['chapters', 'notes', 'markers', 'figures', 'blocks'].every(k => got[k] === want[k]) && figKeys === want.figures && row.storedRec === rec;
      row.result = same ? 'match' : 'MISMATCH'; if (!same) fail++;
      row.itemId = it.id; rows.push(row);
    }
  } finally { await b.close(); if (srv) await srv.close(); }
  for (const r of rows) console.log(r.id, r.result, JSON.stringify({ rec: r.engineRec, engine: r.want, app: r.got, figBlobs: r.figBlobs, ms: r.previewMs }));
  console.log(rows.length - fail + '/' + rows.length + ' ok (' + page + ')');
  process.exit(fail ? 1 : 0);
}
if (path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) main();
