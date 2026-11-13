#!/usr/bin/env node
// PR5 screenshots at mobile width (390): consent, chip + badges, done book page.
import fs from 'node:fs';
import path from 'node:path';
import { launch, scratchDir } from '../../tools/lib/cdp.mjs';
import { serve } from '../../tools/lib/static-server.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const SHOTS = path.join(ROOT, 'docs', 'screens', 'ocr');
fs.mkdirSync(SHOTS, { recursive: true });
const TEXT = 'قال المعلم للطلاب إن العلم نور يضيء طريق الحياة، وإن القراءة باب واسع يدخل منه العاقل إلى المعرفة والفهم.';
const TMP = scratchDir('ocr-shots-');
const srv = await serve(path.join(ROOT, 'dist', 'web'));
const url = srv.url + '/index.html';
const b = await launch({ width: 390, height: 844 });
const boot = async () => { await b.goto(url); await b.waitFor(`(() => { const v = document.querySelector('main .view:not([hidden])'); return !!(v && v.innerHTML.length); })()`); await b.sleep(1000); };
try {
  await b.goto(srv.url + '/ocr-check.html');
  await b.waitFor('!!window.__ocrCheck');
  const b64 = await b.evaluate(`window.__ocrCheck.makeScanPdfBase64(${JSON.stringify(TEXT + ' ' + TEXT)}, 6)`);
  const f = path.join(TMP, 'scan.pdf');
  fs.writeFileSync(f, Buffer.from(b64, 'base64'));
  await boot();
  await b.evaluate(`location.hash = '#/lib'`); await b.sleep(400);
  await b.setFiles('#upFile', [f]);
  await b.waitFor(`!!document.querySelector('#pvGo')`, 120000);
  await b.screenshot(path.join(SHOTS, '01-consent-390.png'));
  await b.evaluate(`document.querySelector('#pvGo').click()`); await b.sleep(800);
  const g = await b.evaluate(`(() => {
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
  console.log('chip geometry (390):', JSON.stringify(g));
  if (!g.inside || g.sideOverlap || g.toastOverlap || g.toastAbove === false) { console.error('CHIP GEOMETRY FAIL at 390'); process.exitCode = 1; }
  await b.evaluate(`location.hash = '#/lib'`); await b.sleep(800);
  const pillRows = await b.evaluate(`new Set([...document.querySelectorAll('#v-lib .chips .chip')].map(x => Math.round(x.getBoundingClientRect().top))).size`);
  console.log('lib filter pill rows at 390:', pillRows);
  await b.screenshot(path.join(SHOTS, '02-chip-badges-390.png'));
  const bookId = await b.evaluate(`new Promise(res => { const q = indexedDB.open('maktabati'); q.onsuccess = () => { const r = q.result.transaction('items').objectStore('items').getAll(); r.onsuccess = () => res((r.result.find(i => i.source === 'scan') || {}).id); }; })`);
  await b.evaluate(`location.hash = '#/book/' + encodeURIComponent(${JSON.stringify(bookId)})`); await b.sleep(800);
  await b.waitFor(`new Promise(res => { const q = indexedDB.open('maktabati'); q.onsuccess = () => { const r = q.result.transaction('items').objectStore('items').get(${JSON.stringify(bookId)}); r.onsuccess = () => res(r.result && r.result.ocr && r.result.ocr.status === 'done'); }; })`, 120000);
  await b.evaluate(`location.hash = '#/book/' + encodeURIComponent(${JSON.stringify(bookId)})`); await b.sleep(800);
  await b.screenshot(path.join(SHOTS, '03-book-disclosure-390.png'));
  console.log('shots written to docs/screens/ocr/');
} finally { fs.rmSync(TMP, { recursive: true, force: true }); await b.close(); await srv.close(); }
