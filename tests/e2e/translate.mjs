#!/usr/bin/env node
// Chapter translation e2e: setup, JSON mode, Arabic view, toggle, stop/resume, 429 pause, alignment retry.
// Run against the Vite dev server:
//   node tests/e2e/translate.mjs http://127.0.0.1:5173/
import { launch } from '../../tools/lib/cdp.mjs';
import { startFakeAI } from '../../tools/fake-ai-server.mjs';

const page = process.argv[2] || 'http://127.0.0.1:5173/';
const fake = await startFakeAI();
const results = [];
const ok = (name, note = '') => results.push(['PASS', name, note]);
const bad = (name, e) => results.push(['FAIL', name, String(e && e.message || e).slice(0, 280)]);
const assert = (c, m) => { if (!c) throw new Error(m); };

const BOOK = {
  id: 'tr-e2e', type: 'book', title: 'Translation Test', author: 'Test', lang: 'en', createdAt: Date.now(), progress: 0,
  chapters: [
    { title: 'Chapter One', sections: [{ title: 'Section A', blocks: [
      { type: 'p', text: 'History is not a record of facts, but a conversation between the past and the present.' },
      { type: 'p', text: 'In 1990 the argument changed, and the name Rivermere returned.' },
      { type: 'list', items: ['The first point matters.', 'The second point matters.'] },
      { type: 'box', kind: 'key', title: 'Key idea', text: ['The boxed paragraph is here.'] },
      { type: 'html', html: '<p>An HTML paragraph is here.</p>' }
    ] }] },
    { title: 'Chapter Two', sections: [{ title: 'Section B', blocks: [
      { type: 'p', text: 'The second chapter has its own paragraph for the slow request.' }
    ] }] },
    { title: 'Chapter Three', sections: [{ title: 'Section C', blocks: [
      { type: 'p', text: 'The third chapter tests the rate limit pause and resume.' }
    ] }] },
    { title: 'Chapter Four', sections: [{ title: 'Section D', blocks: [
      { type: 'p', text: 'The fourth chapter tests a missing id and the corrective retry.' }
    ] }] }
  ]
};

const b = await launch({ width: 1280, height: 900 });
const ev = x => b.evaluate(x);
const settle = (ms = 500) => b.sleep(ms);
const click = async sel => {
  const found = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden) return false; e.click(); return true; })()`);
  if (!found) throw new Error('missing or hidden ' + sel);
  await settle();
};
const waitText = (sel, text, timeout = 20000) => b.waitFor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && e.textContent.includes(${JSON.stringify(text)}); })()`, timeout);
const setAI = model => ev(`localStorage.setItem('maktabati:ai', JSON.stringify({ base:${JSON.stringify(fake.url + '/v1')}, model:${JSON.stringify(model)}, key:'', max:8000, ctx:64000, first:5000 }))`);
const go = async h => { await ev(`location.hash = ${JSON.stringify(h)}`); await settle(900); };
const translate = async () => {
  await click('#v-read [data-tr-open]');
  await b.waitFor(`!!document.querySelector('#trGo')`, 10000);
  if (!(await ev(`document.querySelector('#trAck').checked`))) await click('#trAck');
  await click('#trGo');
};

try {
  await b.goto(page);
  await b.waitFor(`!!document.querySelector('main .view:not([hidden])')`, 20000);
  await settle(1000);

  // Seed a real book in the app's own IndexedDB, then reload so init() loads it.
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

  await go('#/read/tr-e2e/c0');
  await b.waitFor(`!!document.querySelector('#v-read [data-tr-open]')`, 10000);

  // 0) The estimate panel shows both DeepSeek tariffs and is labelled an estimate.
  await setAI('deepseek-flash');
  await click('#v-read [data-tr-open]');
  await b.waitFor(`!!document.querySelector('#trGo')`, 10000);
  const estimateText = await ev(`document.querySelector('#modalBox').textContent`);
  assert(estimateText.includes('خارج الذروة') && estimateText.includes('الذروة'), 'DeepSeek peak/off-peak estimate missing');
  assert(estimateText.includes('تقدير'), 'estimate is not labelled as an estimate');
  assert(estimateText.includes('الشخصي فقط') && estimateText.includes('نص هذا الفصل'), 'personal-use/privacy notice missing');
  await click('#modalBox [data-close]');
  await setAI('fake-translate');

  // 1) Translate chapter one and read Arabic.
  await translate();
  await b.waitFor(`!!document.querySelector('#trRead')`, 30000);
  const req = fake.stats.last;
  assert(req && req.response_format && req.response_format.type === 'json_object', 'response_format was not json_object: ' + JSON.stringify(req));
  assert(Number(req.temperature) === 0.2, 'temperature was not 0.2');
  assert(req.hasUnits, 'request did not carry units');
  await click('#trRead');
  await b.waitFor(`document.querySelector('#v-read').getAttribute('dir') === 'rtl'`, 10000);
  assert(await ev(`document.querySelector('#v-read').getAttribute('lang') === 'ar'`), 'lang is not ar');
  const arText = await ev(`document.querySelector('#v-read').textContent`);
  assert(arText.includes('ترجمة عربية'), 'Arabic translation not visible');
  assert(arText.includes('Chapter') === false, 'English chapter title remained in the Arabic view');
  assert(await ev(`document.querySelector('#v-read .divider h2').textContent.includes('ترجمة عربية')`), 'chapter title was not translated');
  assert(await ev(`document.querySelector('#v-read .section h3').textContent.includes('ترجمة عربية')`), 'section title was not translated');
  assert(await ev(`document.querySelector('#navList').textContent.includes('ترجمة عربية')`), 'drawer chapter title was not translated');
  assert((await ev(`document.querySelectorAll('#v-read [data-bk]').length`)) >= 3, 'blocks disappeared');
  assert((await ev(`new Promise(res => { const r = indexedDB.open('maktabati-tr'); r.onsuccess = () => { const q = r.result.transaction('segments').objectStore('segments').count(); q.onsuccess = () => res(q.result); }; r.onerror = () => res(-1); })`)) > 0, 'segments were not stored');
  ok('translate chapter + titles', 'dir=rtl, blocks kept, segments stored');

  // 2) Toggle back to the original.
  await click('#v-read [data-tr-open]');
  await b.waitFor(`document.querySelector('#v-read').getAttribute('dir') === 'ltr'`, 10000);
  const enText = await ev(`document.querySelector('#v-read').textContent`);
  assert(enText.includes('History is not a record'), 'original text did not return');
  assert(await ev(`document.querySelector('#v-read [data-tr-open]').textContent.trim() === 'ترجمة الفصل'`), 'toggle label did not reset');
  ok('toggle original', 'text and label restored');

  // 2b) A different model must not silently resume the old job.
  await click('#v-read [data-tr-open]');
  await b.waitFor(`document.querySelector('#v-read').getAttribute('dir') === 'rtl'`, 10000);
  await setAI('fake-translate-missing');
  await click('#v-read [data-tr-setup]');
  await b.waitFor(`!!document.querySelector('#trGo')`, 10000);
  const mismatchText = await ev(`document.querySelector('#modalBox').textContent`);
  assert(mismatchText.includes('مختلف'), 'fingerprint mismatch was not shown');
  await click('#modalBox [data-close]');
  await setAI('fake-translate');
  ok('fingerprint blocks mixed resume', 'model change shown as mismatch');

  // 3) Stop within 2 seconds, then resume.
  await setAI('fake-translate-slow');
  await go('#/read/tr-e2e/c1');
  await b.waitFor(`!!document.querySelector('#v-read [data-tr-open]')`, 10000);
  const t0 = Date.now();
  await translate();
  await b.waitFor(`!!document.querySelector('#trStop')`, 10000);
  await click('#trStop');
  await b.waitFor(`!!document.querySelector('#trResume')`, 5000);
  const stopMs = Date.now() - t0;
  assert(stopMs < 2000, 'stop took ' + stopMs + 'ms');
  // Reload the tab before resuming: the completed segment and the job must survive.
  await b.reload();
  await b.waitFor(`!!document.querySelector('main .view:not([hidden])')`, 20000);
  await settle(700);
  await go('#/read/tr-e2e/c1');
  await b.waitFor(`!!document.querySelector('#v-read [data-tr-open]')`, 10000);
  await click('#v-read [data-tr-open]');
  await b.waitFor(`!!document.querySelector('#trGo')`, 10000);
  const resumeLabel = await ev(`document.querySelector('#trGo').textContent`);
  assert(resumeLabel.includes('استكمل'), 'resume label missing after reload: ' + resumeLabel);
  await click('#trGo');
  await b.waitFor(`!!document.querySelector('#trRead')`, 30000);
  ok('stop, close tab and resume', stopMs + 'ms to stop; job survived reload');

  // 4) Persistent 429 pauses, resume succeeds on the fourth request.
  await setAI('fake-translate-429');
  await go('#/read/tr-e2e/c2');
  await b.waitFor(`!!document.querySelector('#v-read [data-tr-open]')`, 10000);
  await translate();
  await b.waitFor(`!!document.querySelector('#trResume')`, 20000);
  const pauseMsg = await ev(`document.querySelector('#modalBox').textContent`);
  assert(pauseMsg.includes('429') || pauseMsg.includes('تهدئة'), '429 pause message missing');
  await click('#trResume');
  await b.waitFor(`!!document.querySelector('#trRead')`, 30000);
  ok('429 pause + resume', 'paused then completed');

  // 5) Missing id gets one corrective retry.
  await setAI('fake-translate-missing');
  await go('#/read/tr-e2e/c3');
  await b.waitFor(`!!document.querySelector('#v-read [data-tr-open]')`, 10000);
  const before = fake.stats.requests;
  await translate();
  await b.waitFor(`!!document.querySelector('#trRead')`, 30000);
  assert(fake.stats.requests > before + 1, 'missing id did not trigger a second request');
  ok('missing id retry', fake.stats.requests - before + ' requests');

  // 6) Deleting the book deletes its translation jobs and segments too.
  await go('#/book/tr-e2e');
  await b.waitFor(`!!document.querySelector('#v-book [data-bpa="more"]')`, 10000);
  await click('#v-book [data-bpa="more"]');
  await click('#sheet [data-bpa="del"]');
  await b.waitFor(`!!document.querySelector('#cfGo')`, 10000);
  await click('#cfGo');
  await settle(1800);
  const left = await ev(`new Promise(res => {
    const r = indexedDB.open('maktabati-tr');
    r.onsuccess = () => {
      const jobs = r.result.transaction('jobs').objectStore('jobs');
      const segs = r.result.transaction('segments').objectStore('segments');
      const a = jobs.index('bookId').count('tr-e2e');
      const b = segs.index('jobId').count('tr-e2e:c0');
      let ja = null, sb = null;
      a.onsuccess = () => { ja = a.result; if (sb != null) res([ja, sb]); };
      b.onsuccess = () => { sb = b.result; if (ja != null) res([ja, sb]); };
      a.onerror = b.onerror = () => res([-1, -1]);
    };
    r.onerror = () => res([-1, -1]);
  })`);
  assert(left[0] === 0 && left[1] === 0, 'translation rows survived book delete: ' + JSON.stringify(left));
  ok('delete book clears translations', JSON.stringify(left));
} catch (e) {
  bad('translation e2e', e);
  console.log('BROWSER_ERRORS', JSON.stringify(b.errors).slice(0, 2000));
} finally {
  await b.close();
  await fake.close();
}

for (const r of results) console.log(r[0].padEnd(4) + ' ' + r[1].padEnd(28) + ' ' + r[2]);
const failed = results.filter(r => r[0] === 'FAIL');
console.log('\n' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed');
process.exitCode = failed.length ? 1 : 0;
