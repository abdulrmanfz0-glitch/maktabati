#!/usr/bin/env node
// Export, then import into an empty state, then export again: the library must survive unchanged,
// including engine-imported books with figures (IndexedDB Blobs <-> data: URLs in the export).
// Also checks that the API key never appears in either export. Prints metrics only.
//
//   node tests/e2e/roundtrip.mjs [page] [--fixture <id>]
import fs from 'node:fs';
import path from 'node:path';
import { launch, scratchDir } from '../../tools/lib/cdp.mjs';
import { serve } from '../../tools/lib/static-server.mjs';
import { listFixtures } from '../../tools/lib/fixtures.mjs';
import { upload } from './ingest-app.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const args = process.argv.slice(2);
const page = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--fixture') || 'dist/web/index.html';
const fxId = args.includes('--fixture') ? args[args.indexOf('--fixture') + 1] : '5150ac47';
const TMP = scratchDir('mk-rt-');
const KEY = 'sk-ROUNDTRIP-not-a-real-key-4410';
const rows = []; const row = (n, ok, note) => rows.push([ok ? 'PASS' : 'FAIL', n, note || '']);

const srv = /^(https?|file):/.test(page) ? null : await serve(ROOT);
const url = srv ? srv.url + '/' + page.split('/').map(encodeURIComponent).join('/') : page;
const ready = b => b.waitFor(`(() => { const v = document.querySelector('main .view:not([hidden])'); return !!(v && v.innerHTML.length); })()`, 20000);

async function exportTo(b, dir) {
  await b.downloadsTo(dir);
  await b.evaluate(`location.hash = '#/profile/privacy'`); await b.sleep(600);
  await b.evaluate(`document.querySelector('#pvExp').click()`);
  await b.waitFor(`true`); for (let i = 0; i < 60 && !fs.readdirSync(dir).some(f => /^maktabati-.*\.json$/.test(f)); i++) await b.sleep(250);
  const f = fs.readdirSync(dir).find(f => /^maktabati-.*\.json$/.test(f));
  return f ? path.join(dir, f) : null;
}
const canon = d => {
  const by = (a, k) => [...a].sort((x, y) => String(x[k]).localeCompare(String(y[k])));
  return { items: by(d.items, 'id'), annos: by(d.annos, 'id'), kv: by(d.kv.filter(x => x.k !== 'log'), 'k') };
};

try {
  // A: demo library + an engine-imported book with figures and notes, a key saved
  const a = await launch({ width: 1280, height: 900 });
  let expA;
  try {
    await a.goto(url); await ready(a); await a.sleep(1200);
    await a.evaluate(`localStorage.setItem('maktabati:ai', JSON.stringify({ base:'https://api.deepseek.com', model:'deepseek-chat', key:'${KEY}' }))`);
    await upload(a, listFixtures().find(f => f.id === fxId).path);
    await a.waitFor(`!!document.querySelector('#pvSave')`, 300000);
    await a.evaluate(`document.querySelector('#pvSave').click()`); await a.sleep(1500);
    expA = await exportTo(a, path.join(TMP, 'a'));
    row('export A written', !!expA);
    row('no JS errors in A', a.errors.length === 0, a.errors.slice(0, 2).join(' | '));
  } finally { await a.close(); }
  const rawA = fs.readFileSync(expA, 'utf8'), A = JSON.parse(rawA);
  const figsA = A.kv.filter(x => x.k.startsWith('fig:'));
  row('export keeps the same top-level shape', ['app', 'v', 'exported', 'items', 'annos', 'kv'].every(k => k in A) && A.app === 'maktabati' && A.v === 1 && Object.keys(A).length === 6, Object.keys(A).join(','));
  row('figures travel as data: URLs', figsA.length > 0 && figsA.every(x => typeof x.v === 'string' && x.v.startsWith('data:image/')), figsA.length + ' figures');
  row('API key not in export', !rawA.includes(KEY));

  // B: fresh profile, wiped to an empty library, then import A
  const b = await launch({ width: 390, height: 844, mobile: true });
  let expB;
  try {
    await b.goto(url); await ready(b); await b.sleep(1200);
    await b.evaluate(`location.hash = '#/profile/privacy'`); await b.sleep(600);
    await b.evaluate(`document.querySelector('[data-wipe="all"]').click()`); await b.sleep(300);
    await b.evaluate(`(() => { const i = document.querySelector('#cfW'); i.value = 'احذف'; i.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('#cfGo').click(); })()`);
    await b.sleep(2500); await ready(b);
    const n0 = await b.evaluate(`new Promise(res => { const q = indexedDB.open('maktabati'); q.onsuccess = () => { const r = q.result.transaction('items').objectStore('items').count(); r.onsuccess = () => res(r.result); }; })`);
    row('B starts empty', n0 === 0, n0 + ' items');
    await upload(b, expA);
    await b.waitFor(`!!document.querySelector('#libGo')`, 20000);
    await b.evaluate(`document.querySelector('#libGo').click()`); await b.sleep(2500);
    const after = await b.evaluate(`new Promise(res => { const q = indexedDB.open('maktabati'); q.onsuccess = () => { const t = q.result.transaction(['items', 'kv']); const i = t.objectStore('items').count(), k = t.objectStore('kv').count(); t.oncomplete = () => res({ items: i.result, kv: k.result }); }; })`);
    row('import confirmed and stored', after.items === A.items.length, JSON.stringify(after) + ' toast: ' + (await b.evaluate(`document.querySelector('#toast').textContent`)).length + ' chars; export ' + Math.round(fs.statSync(expA).size / 1e6) + ' MB');
    // the imported book opens with its figures
    const it = A.items.find(i => i.ingest);
    const fc = it.chapters.findIndex(c => c.sections.some(s => s.blocks.some(x => x.fig)));
    await b.evaluate(`location.hash = '#/read/${it.id}/c${fc}'`); await b.sleep(2000);
    await b.evaluate(`(() => { const p = document.querySelector('#rtPick [data-rtpick]'); if (p) p.click(); })()`); await b.sleep(1500);
    await b.evaluate(`location.hash = '#/read/${it.id}/c${fc}'`); await b.sleep(1500);
    const fig = await b.evaluate(`(async () => { const im = document.querySelector('#v-read img[data-fig]'); if (!im) return null; if (!im.complete) await new Promise(r => { im.onload = im.onerror = r; setTimeout(r, 3000); }); return { blob: im.src.startsWith('blob:'), w: im.naturalWidth }; })()`);
    row('imported book shows its figures', fig && fig.blob && fig.w > 0, JSON.stringify(fig));
    await b.evaluate(`location.hash = '#/lib'`); await b.sleep(500);
    expB = await exportTo(b, path.join(TMP, 'b'));
    row('no JS errors in B', b.errors.length === 0, b.errors.slice(0, 2).join(' | '));
  } finally { await b.close(); }
  const B = JSON.parse(fs.readFileSync(expB, 'utf8'));
  const ca = canon(A), cb = canon(B);
  // B may have reading state from opening the book (loc, pos, status); compare A's records only
  const kvB = new Map(cb.kv.map(x => [x.k, x.v]));
  const kvMiss = ca.kv.filter(x => !(kvB.has(x.k) && JSON.stringify(kvB.get(x.k)) === JSON.stringify(x.v)) && !/:(loc|pos|status)$/.test(x.k) && x.k !== 'seeded');
  row('items identical after round trip', JSON.stringify(ca.items.map(i => Object.assign({}, i, { lastOpened: 0, progress: 0 }))) === JSON.stringify(cb.items.map(i => Object.assign({}, i, { lastOpened: 0, progress: 0 }))), ca.items.length + ' items');
  row('annotations identical', JSON.stringify(ca.annos) === JSON.stringify(cb.annos), ca.annos.length + ' annos');
  row('kv records identical (figures byte for byte)', kvMiss.length === 0, kvMiss.length ? 'differs: ' + kvMiss.slice(0, 3).map(x => x.k.replace(/:.*/, ':…')).join(', ') : ca.kv.length + ' records');
  row('API key not in re-export', !fs.readFileSync(expB, 'utf8').includes(KEY));
  // C: an export from the original app ("My Library.html", old books) opens in this build without migration
  if (srv) {
    const o = await launch({ width: 1280, height: 900 }); let expO;
    try { await o.goto(srv.url + '/' + encodeURIComponent('My Library.html')); await ready(o); await o.sleep(1500); expO = await exportTo(o, path.join(TMP, 'o')); }
    finally { await o.close(); }
    const O = JSON.parse(fs.readFileSync(expO, 'utf8'));
    const c = await launch({ width: 390, height: 844, mobile: true });
    try {
      await c.goto(url); await ready(c); await c.sleep(1200);
      await c.evaluate(`location.hash = '#/profile/privacy'`); await c.sleep(600);
      await c.evaluate(`document.querySelector('[data-wipe="all"]').click()`); await c.sleep(300);
      await c.evaluate(`(() => { const i = document.querySelector('#cfW'); i.value = 'احذف'; i.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('#cfGo').click(); })()`);
      await c.sleep(2500); await ready(c);
      await upload(c, expO); await c.waitFor(`!!document.querySelector('#libGo')`, 20000);
      await c.evaluate(`document.querySelector('#libGo').click()`); await c.sleep(1500);
      const n = await c.evaluate(`new Promise(res => { const q = indexedDB.open('maktabati'); q.onsuccess = () => { const t = q.result.transaction(['items', 'annos']); const i = t.objectStore('items').count(), a = t.objectStore('annos').count(); t.oncomplete = () => res({ items: i.result, annos: a.result }); }; })`);
      row('old export imports into an empty state', n.items === O.items.length && n.annos === O.annos.length, JSON.stringify(n));
      for (const it of O.items) {
        await c.evaluate(`location.hash = '#/read/${it.id}'`); await c.sleep(1500);
        await c.evaluate(`(() => { const p = document.querySelector('#rtPick [data-rtpick]'); if (p) p.click(); })()`); await c.sleep(800);
        row('old item opens in the reader (' + it.type + ')', await c.evaluate(`location.hash.startsWith('#/read/') && document.querySelector('#v-read').textContent.length > 200`));
      }
      row('no JS errors in C', c.errors.length === 0, c.errors.slice(0, 2).join(' | '));
    } finally { await c.close(); }
  }
} catch (e) { row('run', false, e.message); }
finally { if (srv) await srv.close(); fs.rmSync(TMP, { recursive: true, force: true }); }
for (const r of rows) console.log(r[0].padEnd(4), r[1].padEnd(44), String(r[2]).slice(0, 140));
const fail = rows.filter(r => r[0] === 'FAIL').length;
console.log(rows.length - fail + ' passed, ' + fail + ' failed (' + page + ')');
process.exit(fail ? 1 : 0);
