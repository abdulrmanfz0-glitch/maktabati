#!/usr/bin/env node
// OCR run e2e (PR4): a synthetic Arabic scanned PDF goes through the real local
// engine: start -> pause -> resume -> reload mid-run (paused, not auto-resumed)
// -> resume to completion -> chapters appear -> search finds a known word.
// Watches CDP network (incl. worker sessions): zero requests to other origins,
// and no AI-provider hosts are ever contacted.
import fs from 'node:fs';
import path from 'node:path';
import { launch, scratchDir } from '../../tools/lib/cdp.mjs';
import { serve } from '../../tools/lib/static-server.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const KNOWN = 'قال المعلم للطلاب إن العلم نور يضيء طريق الحياة، وإن القراءة باب واسع يدخل منه العاقل إلى المعرفة والفهم.';
// Dense pages and 80 of them keep the run long enough (tens of seconds) for
// the pause/reload windows to be deterministic; the real engine is fast.
const PAGE_TEXT = KNOWN + ' ' + KNOWN;
const PAGES = 80;
const TMP = scratchDir('ocr-run-');
const rows = [];
const row = (name, ok, note) => rows.push([ok ? 'PASS' : 'FAIL', name, note || '']);

const srv = await serve(path.join(ROOT, 'dist', 'web'));
const url = srv.url + '/index.html';
const origin = new URL(srv.url).origin;
const reqs = [];
const b = await launch({ width: 1280, height: 900 });
const off = b.on('Network.requestWillBeSent', p => reqs.push(p.request.url));
const offT = b.on('Target.attachedToTarget', async p => { if (p.targetInfo.type === 'worker') await b.send('Network.enable', {}, p.sessionId); });
await b.send('Network.enable');
await b.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });

const boot = async () => { await b.goto(url); await b.waitFor(`(() => { const v = document.querySelector('main .view:not([hidden])'); return !!(v && v.innerHTML.length); })()`); await b.sleep(1200); };
const ocrCounts = bookId => b.evaluate(`new Promise(res => { const q = indexedDB.open('maktabati'); q.onsuccess = () => { const t = q.result.transaction(['ocrPages','items']); const r1 = t.objectStore('ocrPages').getAll(); const r2 = t.objectStore('items').get(${JSON.stringify(bookId)}); r1.onsuccess = () => { r2.onsuccess = () => res({ n: r1.result.length, ids: new Set(r1.result.map(x => x.id)).size, ocr: (r2.result && r2.result.ocr) || null }); }; }; })`);
const itemOf = bookId => b.evaluate(`new Promise(res => { const q = indexedDB.open('maktabati'); q.onsuccess = () => { const r = q.result.transaction('items').objectStore('items').get(${JSON.stringify(bookId)}); r.onsuccess = () => res(r.result); }; })`);

try {
  // 1. build the synthetic scanned PDF from the check page
  await b.goto(srv.url + '/ocr-check.html');
  await b.waitFor(`!!window.__ocrCheck && !!window.__ocrCheck.makeScanPdfBase64`);
  const b64 = await b.evaluate(`window.__ocrCheck.makeScanPdfBase64(${JSON.stringify(PAGE_TEXT)}, ${PAGES})`);
  const scanFile = path.join(TMP, 'scan-ar.pdf');
  fs.writeFileSync(scanFile, Buffer.from(b64, 'base64'));

  // 2. upload and save in the app
  await boot();
  await b.evaluate(`location.hash = '#/lib'`); await b.sleep(400);
  await b.setFiles('#upFile', [scanFile]);
  await b.waitFor(`!!document.querySelector('#pvSave')`, 120000);
  row('scanned preview savable', await b.evaluate(`!document.querySelector('#pvSave').disabled`));
  await b.evaluate(`document.querySelector('#pvSave').click()`); await b.sleep(1600);
  const bookId = await b.evaluate(`new Promise(res => { const q = indexedDB.open('maktabati'); q.onsuccess = () => { const r = q.result.transaction('items').objectStore('items').getAll(); r.onsuccess = () => res((r.result.find(i => i.source === 'scan') || {}).id); }; })`);
  row('scanned book saved', !!bookId, bookId);

  // 3. start from the placeholder, pause mid-run
  await b.evaluate(`location.hash = '#/read/' + encodeURIComponent(${JSON.stringify(bookId)})`); await b.sleep(600);
  row('placeholder has start button', await b.evaluate(`!!document.querySelector('#ocrStart')`));
  await b.evaluate(`document.querySelector('#ocrStart').click()`); await b.sleep(2500);
  const diag = await b.evaluate(`({ pause: !!document.querySelector('#ocrPause'), start: !!document.querySelector('#ocrStart') })`);
  row('placeholder stays visible while running', diag.pause && diag.start, JSON.stringify(diag));
  await b.evaluate(`document.querySelector('#ocrPause').click()`); await b.sleep(1500);
  let st = await ocrCounts(bookId);
  row('pause stops the run', st.ocr && st.ocr.status === 'paused' && st.ocr.reason === 'cancel', JSON.stringify(st.ocr));
  row('partial progress persisted', st.n > 0 && st.n < PAGES, 'pages=' + st.n);

  // 4. resume, then reload mid-run: must stay paused, not auto-resume
  await b.evaluate(`document.querySelector('#ocrStart').click()`); await b.sleep(3500);
  await boot();
  st = await ocrCounts(bookId);
  row('reload leaves the run paused (interrupted)', st.ocr && st.ocr.status === 'paused' && st.ocr.reason === 'interrupted', JSON.stringify(st.ocr));
  row('no duplicate page records so far', st.ids === st.n, 'ids=' + st.ids + ' n=' + st.n);

  // 5. resume to completion
  await b.evaluate(`location.hash = '#/read/' + encodeURIComponent(${JSON.stringify(bookId)})`); await b.sleep(600);
  await b.evaluate(`document.querySelector('#ocrStart').click()`);
  await b.waitFor(`new Promise(res => { const q = indexedDB.open('maktabati'); q.onsuccess = () => { const r = q.result.transaction('items').objectStore('items').get(${JSON.stringify(bookId)}); r.onsuccess = () => res(r.result && r.result.ocr && r.result.ocr.status === 'done'); }; })`, 240000);
  st = await ocrCounts(bookId);
  row('run finishes with every page recorded once', st.n === PAGES && st.ids === PAGES, 'n=' + st.n);
  const item = await itemOf(bookId);
  row('book has merged chapters', item && Array.isArray(item.chapters) && item.chapters.length === 1 && item.chapters[0].sections.length === PAGES, JSON.stringify({ chapters: (item.chapters || []).length, sections: (item.chapters[0] && item.chapters[0].sections || []).length }));
  row('chapters contain the OCRed text', !!item && JSON.stringify(item).includes('المعرفة'));

  // 6. search finds a known word through the existing search path
  await b.evaluate(`location.hash = '#/lib'`); await b.sleep(700);
  await b.evaluate(`(() => { const i = document.querySelector('#q'); i.value = 'المعرفة'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await b.sleep(1600);
  row('search finds a known word', await b.evaluate(`document.querySelector('#results').textContent.includes('المعرفة')`));

  // 7. network hygiene: own origin only, no AI-provider hosts
  const bad = reqs.filter(u => /^https?:/.test(u) && !u.startsWith(origin));
  row('zero requests to other origins', bad.length === 0, bad.slice(0, 5).join(' | '));
  const ai = reqs.filter(u => /api\.deepseek|generativelanguage|api\.openai|api\.anthropic|api\.groq|openrouter/i.test(u));
  row('zero AI-provider requests', ai.length === 0, ai.slice(0, 3).join(' | '));
} catch (e) { row('run', false, e.message); }
finally { offT(); off(); fs.rmSync(TMP, { recursive: true, force: true }); await b.close(); await srv.close(); }
for (const r of rows) console.log(r[0].padEnd(4), r[1].padEnd(52), String(r[2]).slice(0, 180));
const fail = rows.filter(r => r[0] === 'FAIL').length;
console.log(rows.length - fail + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
