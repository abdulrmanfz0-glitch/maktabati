#!/usr/bin/env node
// Whole-book translation e2e: 3 chapters, stop/reload/resume, TOC status, 429 fallback.
// Run against the Vite dev server:
//   node tests/e2e/translate-book.mjs http://127.0.0.1:5173/
import { launch } from '../../tools/lib/cdp.mjs';
import { startFakeAI } from '../../tools/fake-ai-server.mjs';

const page = process.argv[2] || 'http://127.0.0.1:5173/';
const fake = await startFakeAI();
const results = [];
const ok = (name, note = '') => results.push(['PASS', name, note]);
const bad = (name, e) => results.push(['FAIL', name, String(e && e.message || e).slice(0, 280)]);
const assert = (c, m) => { if (!c) throw new Error(m); };

const para = (n, i) => 'Paragraph ' + i + ' in chapter ' + n + '. ' + ('The river carried the old name through the valley and into the city, where everyone had forgotten what it meant. '.repeat(8));
const chapter = (n, count, title) => ({ title, sections: [{ title:'Section ' + n, blocks: Array.from({ length:count }, (_, i) => ({ type:'p', text:para(n, i) })) }] });
const book = (id, chapters) => ({ id, type:'book', title:'Whole Book Test', author:'Test', lang:'en', createdAt:Date.now(), progress:0, chapters });

const LONG = book('book-e2e', [
  chapter(1, 24, 'Chapter One'),
  chapter(2, 12, 'Chapter Two'),
  chapter(3, 12, 'Chapter Three')
]);
const RATE = book('book-429', [
  chapter(1, 4, 'Rate One'),
  chapter(2, 4, 'Rate Two')
]);

const b = await launch({ width:1280, height:900 });
const ev = x => b.evaluate(x);
const settle = (ms = 500) => b.sleep(ms);
const click = async sel => {
  const found = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden) return false; e.click(); return true; })()`);
  if (!found) throw new Error('missing or hidden ' + sel);
  await settle();
};
const waitText = (sel, text, timeout = 30000) => b.waitFor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && e.textContent.includes(${JSON.stringify(text)}); })()`, timeout);
const setAI = model => ev(`localStorage.setItem('maktabati:ai', JSON.stringify({ base:${JSON.stringify(fake.url + '/v1')}, model:${JSON.stringify(model)}, key:'', max:8000, ctx:64000, first:5000 }))`);
const go = async h => { await ev(`location.hash = ${JSON.stringify(h)}`); await settle(900); };
const seed = async data => ev(`new Promise((res, rej) => {
  const r = indexedDB.open('maktabati', 1);
  r.onupgradeneeded = () => { const d = r.result; ['items','annos'].forEach(n => d.objectStoreNames.contains(n) || d.createObjectStore(n, { keyPath:'id' })); d.objectStoreNames.contains('kv') || d.createObjectStore('kv', { keyPath:'k' }); };
  r.onsuccess = () => { const tx = r.result.transaction('items','readwrite'); tx.objectStore('items').put(${JSON.stringify(data)}); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); };
  r.onerror = () => rej(r.error);
})`);

try {
  await b.goto(page);
  await b.waitFor(`!!document.querySelector('main .view:not([hidden])')`, 20000);
  await settle(800);
  await seed(LONG); await seed(RATE);
  await setAI('fake-translate-book');
  await b.reload();
  await b.waitFor(`!!document.querySelector('main .view:not([hidden])')`, 20000);
  await settle(800);

  await go('#/book/book-e2e');
  await b.waitFor(`!!document.querySelector('#v-book [data-tr-book]')`, 10000);
  await setAI('deepseek-flash');
  await click('#v-book [data-tr-book]');
  await b.waitFor(`!!document.querySelector('#trBookGo')`, 10000);
  const costText = await ev(`document.querySelector('#modalBox').textContent`);
  assert(costText.includes('خارج الذروة') && costText.includes('الذروة'), 'book peak/off-peak estimate missing');
  await click('#modalBox [data-close]');
  await setAI('fake-translate-book');
  await click('#v-book [data-tr-book]');
  await b.waitFor(`!!document.querySelector('#trBookGo')`, 10000);
  const setup = await ev(`document.querySelector('#modalBox').textContent`);
  assert(setup.includes('التبويب لازم يبقى مفتوحًا'), 'tab-open notice missing');
  assert(setup.includes('الوقت التقديري'), 'time estimate missing');
  assert(setup.includes('التكلفة التقديرية') || setup.includes('التوكنات فقط'), 'cost estimate missing');
  assert(await ev(`document.querySelector('#trBookConc').value === '3'`), 'default concurrency is not 3');
  assert(!(await ev(`!!document.querySelector('#v-book .tr-toc.done')`)), 'TOC marked done before translation');
  await click('#trBookAck');
  await click('#trBookGo');
  await b.waitFor(`!document.querySelector('#trBookPill').hidden`, 10000);
  // Keep reading another chapter while the book runs; the pill must stay and stop it.
  await go('#/read/book-e2e/c0');
  await b.waitFor(`!document.querySelector('#trBookPill').hidden`, 10000);
  await settle(250);
  await click('[data-tr-pill-stop]');
  await b.waitFor(`document.querySelector('[data-tr-pill-stop]').textContent.includes('استكمال')`, 10000);
  ok('book setup + stop', 'cost/time/notice, pill stayed on chapter and stopped');

  // Reload and resume from the first unfinished segment.
  await b.reload();
  await b.waitFor(`!!document.querySelector('main .view:not([hidden])')`, 20000);
  await settle(800);
  await go('#/book/book-e2e');
  await b.waitFor(`!!document.querySelector('#v-book [data-tr-book]')`, 10000);
  await click('#v-book [data-tr-book]');
  await b.waitFor(`!!document.querySelector('#trBookGo')`, 10000);
  const resumeLabel = await ev(`document.querySelector('#trBookGo').textContent`);
  assert(resumeLabel.includes('استكمل'), 'book resume label missing after reload: ' + resumeLabel);
  await click('#trBookGo');
  await b.waitFor(`!!document.querySelector('#trBookRead')`, 40000);
  assert(await ev(`!!document.querySelector('.tr-warn-list')`), 'QA warning summary is missing');
  await click('#trBookRead');
  await b.waitFor(`document.querySelector('#v-read').getAttribute('dir') === 'rtl'`, 15000);
  ok('reload + resume whole book', 'book completed after reload');

  // TOC statuses and whole-book Arabic toggle.
  await b.waitFor(`document.querySelectorAll('#navList .tr-toc.done').length >= 3`, 15000);
  assert((await ev(`document.querySelectorAll('#navList .tr-toc.done').length`)) >= 3, 'TOC did not mark all chapters done');
  await go('#/read/book-e2e/c1');
  await b.waitFor(`document.querySelector('#v-read').getAttribute('dir') === 'rtl'`, 15000);
  const ar = await ev(`document.querySelector('#v-read').textContent`);
  assert(ar.includes('ترجمة عربية'), 'whole-book Arabic did not load chapter two');
  ok('TOC + whole-book toggle', 'three TOC badges, next chapter in Arabic');

  // 429 fallback on a second book.
  await setAI('fake-translate-429');
  await go('#/book/book-429');
  await b.waitFor(`!!document.querySelector('#v-book [data-tr-book]')`, 10000);
  await click('#v-book [data-tr-book]');
  await b.waitFor(`!!document.querySelector('#trBookGo')`, 10000);
  if (!(await ev(`document.querySelector('#trBookAck').checked`))) await click('#trBookAck');
  await click('#trBookGo');
  await b.waitFor(`!!document.querySelector('#trBookRead')`, 40000);
  assert(fake.stats.requests >= 4, '429 fallback did not retry: ' + fake.stats.requests + ' requests');
  ok('429 fallback', fake.stats.requests + ' requests');
} catch (e) {
  bad('whole-book translation e2e', e);
  console.log('BROWSER_ERRORS', JSON.stringify(b.errors).slice(0, 2000));
} finally {
  await b.close();
  await fake.close();
}

for (const r of results) console.log(r[0].padEnd(4) + ' ' + r[1].padEnd(30) + ' ' + r[2]);
const failed = results.filter(r => r[0] === 'FAIL');
console.log('\n' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed');
process.exitCode = failed.length ? 1 : 0;
