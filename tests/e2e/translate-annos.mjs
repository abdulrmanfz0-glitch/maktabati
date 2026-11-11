#!/usr/bin/env node
// Arabic-view reading tools: selection bar, Arabic highlights, source markers, AI source context.
// Run against the Vite dev server:
//   node tests/e2e/translate-annos.mjs http://127.0.0.1:5173/
import { launch } from '../../tools/lib/cdp.mjs';
import { startFakeAI } from '../../tools/fake-ai-server.mjs';

const page = process.argv[2] || 'http://127.0.0.1:5173/';
const fake = await startFakeAI();
const results = [];
const ok = (name, note = '') => results.push(['PASS', name, note]);
const bad = (name, e) => results.push(['FAIL', name, String(e && e.message || e).slice(0, 280)]);
const assert = (c, m) => { if (!c) throw new Error(m); };

const BOOK = {
  id:'anno-e2e', type:'book', title:'Annotation Test', author:'Test', lang:'en', createdAt:Date.now(), progress:0,
  chapters: [{ title:'Chapter One', sections: [{ title:'Section A', blocks: [
    { type:'p', text:'The river carried the old name through the valley and into the city, where everyone had forgotten what it meant.' },
    { type:'p', text:'A second paragraph about memory and the old bridge across the water.' },
    { type:'p', text:'A third paragraph gives the reader enough room to select a phrase.' }
  ] }] }]
};

const b = await launch({ width:1280, height:900 });
const ev = x => b.evaluate(x);
const settle = (ms = 500) => b.sleep(ms);
const click = async sel => {
  const found = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden) return false; e.click(); return true; })()`);
  if (!found) throw new Error('missing or hidden ' + sel);
  await settle();
};
const setAI = model => ev(`localStorage.setItem('maktabati:ai', JSON.stringify({ base:${JSON.stringify(fake.url + '/v1')}, model:${JSON.stringify(model)}, key:'', max:8000, ctx:64000, first:5000 }))`);
const go = async h => { await ev(`location.hash = ${JSON.stringify(h)}`); await settle(900); };
const selectText = (selector, length) => ev(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n = null;
  while ((n = w.nextNode())){ if (n.nodeValue && n.nodeValue.trim()) break; }
  if (!n || !n.nodeValue) return false;
  const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, Math.min(${length}, n.nodeValue.length));
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  document.dispatchEvent(new Event('selectionchange')); return true;
})()`);
const topBk = () => ev(`(() => { const els = [...document.querySelectorAll('#v-read [data-bk]')]; const e = els.find(x => x.getBoundingClientRect().bottom > 120); return e ? e.dataset.bk : null; })()`);

try {
  await b.goto(page);
  await b.waitFor(`!!document.querySelector('main .view:not([hidden])')`, 20000);
  await settle(800);
  await ev(`new Promise((res, rej) => {
    const r = indexedDB.open('maktabati', 1);
    r.onupgradeneeded = () => { const d = r.result; ['items','annos'].forEach(n => d.objectStoreNames.contains(n) || d.createObjectStore(n, { keyPath:'id' })); d.objectStoreNames.contains('kv') || d.createObjectStore('kv', { keyPath:'k' }); };
    r.onsuccess = () => { const tx = r.result.transaction('items','readwrite'); tx.objectStore('items').put(${JSON.stringify(BOOK)}); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); };
    r.onerror = () => rej(r.error);
  })`);
  await setAI('fake-translate');
  await b.reload();
  await b.waitFor(`!!document.querySelector('main .view:not([hidden])')`, 20000);
  await settle(800);
  await go('#/read/anno-e2e/c0');
  await b.waitFor(`!!document.querySelector('#v-read [data-bk]')`, 10000);

  // Original highlight before translation.
  assert(await selectText('#v-read [data-bk] p', 30), 'could not select original text');
  await settle(400);
  await click('#selbar [data-sel="imp"]');
  await b.waitFor(`!!document.querySelector('#v-read mark.hl')`, 10000);

  // Translate, then read Arabic.
  await click('#v-read [data-tr-open]');
  await b.waitFor(`!!document.querySelector('#trGo')`, 10000);
  if (!(await ev(`document.querySelector('#trAck').checked`))) await click('#trAck');
  await click('#trGo');
  await b.waitFor(`!!document.querySelector('#trRead')`, 30000);
  await click('#trRead');
  await b.waitFor(`document.querySelector('#v-read').getAttribute('dir') === 'rtl'`, 10000);
  await settle(500);
  assert(await ev(`!!document.querySelector('#v-read .tr-src-hl')`), 'original highlight marker missing in Arabic view');

  // Select Arabic text; bar must appear; term stays original-only.
  assert(await selectText('#v-read [data-bk] p', 16), 'could not select Arabic text');
  await settle(450);
  assert(await ev(`!document.querySelector('#selbar').hidden`), 'selection bar did not appear in Arabic view');
  assert(await ev(`document.querySelector('#selbar [data-sel="term"]').hidden`), 'term button should stay original-only');
  const selected = await ev(`getSelection().toString().replace(/\\s+/g, ' ').trim()`);
  assert(selected && !selected.includes('•'), 'selection quote contains the source marker glyph');
  await click('#selbar [data-sel="imp"]');
  await b.waitFor(`!!document.querySelector('#v-read mark.hl')`, 10000);
  const arAnno = await ev(`new Promise(res => { const r = indexedDB.open('maktabati'); r.onsuccess = () => { const q = r.result.transaction('annos').objectStore('annos').getAll(); q.onsuccess = () => res(q.result.find(a => a.lang === 'ar' && a.kind === 'hl') || null); q.onerror = () => res(null); }; r.onerror = () => res(null); })`);
  assert(arAnno && arAnno.lang === 'ar' && arAnno.trFp, 'Arabic highlight did not save lang/trFp');
  assert(!arAnno.text.includes('•'), 'saved Arabic highlight contains the source marker glyph');
  ok('Arabic selection + highlight', 'bar visible, lang/trFp saved, no marker in quote');

  // Reload: Arabic mark and source marker survive.
  await b.reload();
  await b.waitFor(`!!document.querySelector('main .view:not([hidden])')`, 20000);
  await settle(800);
  await go('#/read/anno-e2e/c0');
  await b.waitFor(`!!document.querySelector('#v-read [data-tr-open]')`, 10000);
  await click('#v-read [data-tr-open]');
  await b.waitFor(`document.querySelector('#v-read').getAttribute('dir') === 'rtl'`, 10000);
  await settle(500);
  assert(await ev(`!!document.querySelector('#v-read mark.hl')`), 'Arabic highlight did not survive reload');
  assert(await ev(`!!document.querySelector('#v-read .tr-src-hl')`), 'source marker did not survive reload');

  // Highlights list contains both.
  await go('#/hls/anno-e2e');
  await b.waitFor(`!!document.querySelector('#v-hls')`, 10000);
  await settle(500);
  const list = await ev(`document.querySelector('#v-hls').textContent`);
  assert(list.includes('ترجمة عربية') && list.includes('The'), 'highlights list does not contain both snippets');

  // Toggle back: Arabic mark hidden, original mark drawn, position kept.
  await go('#/read/anno-e2e/c0');
  await b.waitFor(`document.querySelector('#v-read').getAttribute('dir') === 'rtl'`, 15000);
  const before = await topBk();
  await click('#v-read [data-tr-open]');
  await b.waitFor(`document.querySelector('#v-read').getAttribute('dir') === 'ltr'`, 10000);
  assert(await ev(`!document.querySelector('#v-read mark.hl[data-anno="${arAnno.id}"]')`), 'Arabic highlight should be hidden in original view');
  assert(await ev(`!!document.querySelector('#v-read mark.hl')`), 'original highlight missing in original view');
  const after = await topBk();
  assert(before === after, 'toggle did not keep the same data-bk position (' + before + ' -> ' + after + ')');

  // Regression: original-view explain must attach the whole paragraph, not only the selection.
  await setAI('fake-chat');
  assert(await selectText('#v-read [data-bk] p', 20), 'could not select original text for explain');
  await settle(400);
  await click('#selbar [data-sel="explain"]');
  await b.waitFor(`!document.querySelector('#chat').hidden`, 10000);
  await ev(`(() => { const t = document.querySelector('#chatIn #chIn'); t.value = 'اشرح'; t.dispatchEvent(new Event('input', { bubbles:true })); })()`);
  await click('#chatIn #chSend');
  await b.waitFor(`(document.querySelector('#chatIn').textContent || '').includes('تم')`, 15000);
  await settle(500);
  const srcPayload = fake.stats.lastUserContent || '';
  assert(srcPayload.includes('forgotten what it meant'), 'original explain payload lost the paragraph tail');
  assert(!srcPayload.includes('<source_text>'), 'original explain should not add a source_text block');
  await click('#chatScrim');
  await b.waitFor(`document.querySelector('#chat').hidden`, 10000);
  await setAI('fake-translate');

  // Back to Arabic and open the source marker sheet.
  await click('#v-read [data-tr-open]');
  await b.waitFor(`document.querySelector('#v-read').getAttribute('dir') === 'rtl'`, 10000);
  await click('#v-read .tr-src-hl');
  await b.waitFor(`document.querySelector('#sheet').classList.contains('open')`, 10000);
  assert((await ev(`document.querySelector('#sheet').textContent`)).includes('The'), 'source marker sheet did not open the original highlight');
  await ev(`document.querySelector('#sheet [data-close]')?.click()`);

  // Explain: payload must contain the Arabic quote and the original paragraph.
  await setAI('fake-chat');
  assert(await selectText('#v-read [data-bk] p', 12), 'could not select Arabic text for explain');
  await settle(400);
  await click('#selbar [data-sel="explain"]');
  await b.waitFor(`!document.querySelector('#chat').hidden`, 10000);
  await ev(`(() => { const t = document.querySelector('#chatIn #chIn'); t.value = 'اشرح'; t.dispatchEvent(new Event('input', { bubbles:true })); })()`);
  await click('#chatIn #chSend');
  await b.waitFor(`(document.querySelector('#chatIn').textContent || '').includes('تم')`, 15000);
  await settle(500);
  const payload = fake.stats.lastUserContent || '';
  assert(payload.includes('ترجمة عربية'), 'explain payload missing Arabic selection');
  assert(payload.includes('للفقرة 0-0-0'), 'explain payload missing the full Arabic paragraph');
  assert(payload.includes('<source_text>') && payload.includes('The river carried the old name'), 'explain payload missing labelled original paragraph');
  assert(!payload.includes('•'), 'explain payload leaked the source marker glyph');
  ok('explain payload', 'Arabic quote + source_text present');
} catch (e) {
  bad('Arabic reading tools e2e', e);
  console.log('BROWSER_ERRORS', JSON.stringify(b.errors).slice(0, 2000));
} finally {
  await b.close();
  await fake.close();
}

for (const r of results) console.log(r[0].padEnd(4) + ' ' + r[1].padEnd(34) + ' ' + r[2]);
const failed = results.filter(r => r[0] === 'FAIL');
console.log('\n' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed');
process.exitCode = failed.length ? 1 : 0;
