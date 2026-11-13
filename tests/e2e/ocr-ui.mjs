#!/usr/bin/env node
// PR5 OCR UX e2e: consent -> save+start -> global chip -> library badges ->
// pause/resume -> reload mid-run -> finish -> search page numbers -> highlight +
// quote -> chat with the fake AI (machine-read label present, no failed-page
// placeholder) -> zero requests to other origins. Takes desktop screenshots.
import fs from 'node:fs';
import path from 'node:path';
import { launch, scratchDir } from '../../tools/lib/cdp.mjs';
import { serve } from '../../tools/lib/static-server.mjs';
import { startFakeAI } from '../../tools/fake-ai-server.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const SHOTS = path.join(ROOT, 'docs', 'screens', 'ocr');
fs.mkdirSync(SHOTS, { recursive: true });
const KNOWN = 'قال المعلم للطلاب إن العلم نور يضيء طريق الحياة، وإن القراءة باب واسع يدخل منه العاقل إلى المعرفة والفهم.';
const PAGE_TEXT = KNOWN + ' ' + KNOWN;
const PAGES = 12;
const TMP = scratchDir('ocr-ui-');
const rows = [];
const row = (name, ok, note) => rows.push([ok ? 'PASS' : 'FAIL', name, note || '']);
const fake = await startFakeAI();
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
const items = () => b.evaluate(`new Promise(res => { const q = indexedDB.open('maktabati'); q.onsuccess = () => { const r = q.result.transaction('items').objectStore('items').getAll(); r.onsuccess = () => res(r.result); }; })`);
const annos = () => b.evaluate(`new Promise(res => { const q = indexedDB.open('maktabati'); q.onsuccess = () => { const r = q.result.transaction('annos').objectStore('annos').getAll(); r.onsuccess = () => res(r.result); }; })`);
const selectFirst = () => b.evaluate(`(() => {
  const el = document.querySelector('#v-read [data-bk]');
  if (!el) return false;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let tn = null;
  while ((tn = w.nextNode())) if (tn.textContent.trim().length > 12) break;
  if (!tn) return false;
  const r = document.createRange();
  r.setStart(tn, 0); r.setEnd(tn, Math.min(24, tn.textContent.length));
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  return true;
})()`);

let bookId = null;
try {
  // 1. synthetic scanned PDF from the check page
  await b.goto(srv.url + '/ocr-check.html');
  await b.waitFor('!!window.__ocrCheck');
  const b64 = await b.evaluate(`window.__ocrCheck.makeScanPdfBase64(${JSON.stringify(PAGE_TEXT)}, ${PAGES})`);
  const scanFile = path.join(TMP, 'scan.pdf');
  fs.writeFileSync(scanFile, Buffer.from(b64, 'base64'));

  // 2. upload: consent with size + estimate, then save and start
  await boot();
  await b.evaluate(`localStorage.setItem('maktabati:ai', JSON.stringify({ base: ${JSON.stringify(fake.url + '/deepseek/v1')}, model: 'deepseek-chat', key: 'test-key' }))`);
  await b.evaluate(`location.hash = '#/lib'`); await b.sleep(400);
  await b.setFiles('#upFile', [scanFile]);
  await b.waitFor(`!!document.querySelector('#pvGo')`, 120000);
  row('consent: scanned, page count, size, estimate', await b.evaluate(`(() => { const t = document.querySelector('#modalBox').textContent; return t.includes('كتاب ممسوح ضوئيًا') && t.includes('12 صفحة') && t.includes('4.6 ميجا') && t.includes('تقدير'); })()`));
  await b.screenshot(path.join(SHOTS, '01-consent-1280.png'));
  await b.evaluate(`document.querySelector('#pvGo').click()`); await b.sleep(1500);
  const diag = await b.evaluate(`({ toast: (document.querySelector('#toast')||{}).textContent || '', n: 0 })`);
  const allItems = await items();
  diag.n = allItems.length;
  row('diagnostic after save+start', allItems.some(i => i.source === 'scan'), JSON.stringify(diag));
  bookId = (allItems.find(i => i.source === 'scan') || {}).id;
  row('book saved with source:scan', !!bookId, bookId);

  // 3. chip visible while running, library badge while navigating
  row('global chip visible while running', await b.evaluate(`!document.querySelector('#ocrChip').hidden && document.querySelector('#ocrChip').textContent.includes('من')`));
  const chipGeom = () => b.evaluate(`(() => {
    const rect = el => { const b = el && el.getBoundingClientRect(); return b && (b.width || b.height) ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
    const chip = rect(document.querySelector('#ocrChip'));
    const sideEl = document.querySelector('#side');
    const side = rect(sideEl);
    const sideOn = side && getComputedStyle(sideEl).visibility !== 'hidden' && getComputedStyle(sideEl).display !== 'none';
    const toastEl = document.querySelector('#toast');
    const toast = (toastEl && getComputedStyle(toastEl).display !== 'none') ? rect(toastEl) : null;
    const inside = !!chip && chip.l >= 0 && chip.t >= 0 && chip.r <= innerWidth && chip.b <= innerHeight;
    const inter = (a, b) => a && b && !(a.r <= b.l || a.l >= b.r || a.b <= b.t || a.t >= b.b);
    return { inside, sideOverlap: inter(chip, sideOn ? side : null), toastOverlap: inter(chip, toast), toastAbove: !!(toast && chip && toast.b <= chip.t), chip: chip ? [chip.l, chip.t, chip.r, chip.b].map(Math.round).join(',') : null };
  })()`);
  const g = await chipGeom();
  row('chip fully inside the viewport (1280)', g.inside === true, JSON.stringify(g));
  row('chip not overlapped by sidebar or toast (1280)', g.sideOverlap === false && g.toastOverlap === false && g.toastAbove !== false, JSON.stringify(g));
  await b.evaluate(`location.hash = '#/lib'`); await b.sleep(700);
  const badgeDiag = await b.evaluate(`new Promise(res => { const q = indexedDB.open('maktabati'); q.onsuccess = () => { const r = q.result.transaction('items').objectStore('items').get(${JSON.stringify(bookId)}); r.onsuccess = () => res({ idb: (r.result && r.result.ocr) || null, hash: location.hash, meta: (document.querySelector('#v-lib .card-meta') || {}).textContent || '' }); }; })`);
  row('library badge shows reading progress', await b.evaluate(`document.querySelector('#v-lib').textContent.includes('يُقرأ النص')`), JSON.stringify(badgeDiag).slice(0, 300));
  await b.screenshot(path.join(SHOTS, '02-chip-badges-1280.png'));
  await b.evaluate(`location.hash = '#/read/' + encodeURIComponent(${JSON.stringify(bookId)})`); await b.sleep(600);

  // 4. pause via the chip, resume, reload mid-run, finish
  await b.evaluate(`document.querySelector('#ocrChip [data-ocrchip="pause"]').click()`); await b.sleep(1500);
  let it = (await items()).find(i => i.id === bookId);
  row('chip pause -> paused(cancel)', it.ocr.status === 'paused' && it.ocr.reason === 'cancel', JSON.stringify(it.ocr));
  await b.evaluate(`document.querySelector('#ocrStart').click()`); await b.sleep(2000);
  await boot();
  it = (await items()).find(i => i.id === bookId);
  row('reload mid-run -> paused(interrupted), not auto-resumed', it.ocr.status === 'paused' && it.ocr.reason === 'interrupted' && it.ocr.done > 0 && it.ocr.done < PAGES, JSON.stringify(it.ocr));
  await b.evaluate(`location.hash = '#/read/' + encodeURIComponent(${JSON.stringify(bookId)})`); await b.sleep(600);
  await b.evaluate(`document.querySelector('#ocrStart').click()`);
  await b.waitFor(`new Promise(res => { const q = indexedDB.open('maktabati'); q.onsuccess = () => { const r = q.result.transaction('items').objectStore('items').get(${JSON.stringify(bookId)}); r.onsuccess = () => res(r.result && r.result.ocr && r.result.ocr.status === 'done'); }; })`, 180000);
  row('run finishes', true);
  await b.waitFor(`!document.querySelector('#ocrStart')`, 15000); // finally re-renders the reader as a normal book
  await b.evaluate(`location.hash = '#/read/' + encodeURIComponent(${JSON.stringify(bookId)}) + '/c0'`); await b.sleep(700);
  row('done book opens as a normal book', await b.waitFor(`!!document.querySelector('#v-read [data-bk]')`, 15000));

  // 5. search shows the PDF page number
  await b.evaluate(`location.hash = '#/lib'`); await b.sleep(700);
  await b.evaluate(`(() => { const i = document.querySelector('#q'); i.value = 'المعرفة'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await b.sleep(1500);
  row('search result shows the page number', await b.evaluate(`document.querySelector('#results').textContent.includes('صفحة')`), (await b.evaluate(`document.querySelector('#results').textContent.slice(0, 200)`)).slice(0, 160));

  // 6. highlight + quote on OCR text, page number on the quote card
  await b.evaluate(`location.hash = '#/read/' + encodeURIComponent(${JSON.stringify(bookId)})`); await b.sleep(700);
  row('selection works on OCR text', await selectFirst());
  await b.sleep(500);
  await b.evaluate(`document.querySelector('#selbar [data-sel="imp"]').click()`); await b.sleep(700);
  row('highlight saved on OCR text', (await annos()).some(a => a.kind === 'hl' && a.itemId === bookId));
  await selectFirst(); await b.sleep(500);
  await b.evaluate(`document.querySelector('#selbar [data-sel="quote"]').click()`); await b.sleep(700);
  await b.evaluate(`document.querySelector('#modal:not([hidden]) [data-close]') ? document.querySelector('#modal:not([hidden]) [data-close]').click() : null`); await b.sleep(300);
  row('quote saved on OCR text', (await annos()).some(a => a.kind === 'quote' && a.itemId === bookId));
  await b.evaluate(`location.hash = '#/quotes'`); await b.sleep(700);
  row('quote card mentions the page number', await b.evaluate(`document.querySelector('#v-quotes').textContent.includes('صفحة')`));

  // 7. book page disclosure + screenshot
  await b.evaluate(`location.hash = '#/book/' + encodeURIComponent(${JSON.stringify(bookId)})`); await b.sleep(900);
  row('book page disclosure (OCR + Tesseract)', await b.evaluate(`document.querySelector('#v-book').textContent.includes('مقروء آليًا') && document.querySelector('#v-book').textContent.includes('Tesseract')`));
  row('retry button hidden when no pages failed', await b.evaluate(`!!document.querySelector('#ocrRetry') && document.querySelector('#ocrRetry').hidden === true`));
  await b.screenshot(path.join(SHOTS, '03-book-disclosure-1280.png'));

  // 8. chat with the fake AI from the reader chapter (OCR text is in context)
  await b.evaluate(`location.hash = '#/read/' + encodeURIComponent(${JSON.stringify(bookId)}) + '/c0'`); await b.sleep(800);
  await b.evaluate(`location.hash = '#/bchat/' + encodeURIComponent(${JSON.stringify(bookId)})`); await b.sleep(900);
  await b.waitFor(`!!document.querySelector('#chIn')`, 30000);
  await b.evaluate(`(() => { const t = document.querySelector('#chIn'); t.value = 'وش الكتاب هذا؟'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  row('chat input and send button ready', await b.evaluate(`!!document.querySelector('#chIn') && !!document.querySelector('#chSend')`));
  await b.evaluate(`(() => { const t = document.querySelector('#chIn'); t.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true })); })()`);
  await b.sleep(6000);
  const lastBody = JSON.stringify(fake.stats.lastFull || {});
  row('chat request body carries the machine-read label', lastBody.includes('مقروء آليًا'));
  row('chat request body never sends failed-page placeholders', !lastBody.includes('تعذّرت'));
  await b.evaluate(`(() => { const id = location.hash.split('/')[2]; location.hash = '#/lib'; setTimeout(() => { location.hash = '#/c/' + id; }, 100); })()`);
  await b.sleep(1500);
  await b.waitFor(`(document.querySelector('#v-home')||{}).textContent.includes('تم')`, 15000);
  row('chat reply rendered', true);

  // 9. network hygiene (the user-configured AI endpoint is allowed by design)
  const fakeOrigin = new URL(fake.url).origin;
  const bad = reqs.filter(u => /^https?:/.test(u) && !u.startsWith(origin) && !u.startsWith(fakeOrigin));
  row('zero requests to other origins', bad.length === 0, bad.slice(0, 5).join(' | '));
  const ai = reqs.filter(u => /api\.deepseek|generativelanguage|api\.openai|api\.anthropic|api\.groq|openrouter/i.test(u));
  row('zero AI-provider requests', ai.length === 0, ai.slice(0, 3).join(' | '));
} catch (e) { row('run', false, e.message); }
finally { offT(); off(); fs.rmSync(TMP, { recursive: true, force: true }); await b.close(); await srv.close(); await fake.close(); }
for (const r of rows) console.log(r[0].padEnd(4), r[1].padEnd(56), String(r[2]).slice(0, 180));
const fail = rows.filter(r => r[0] === 'FAIL').length;
console.log(rows.length - fail + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
