#!/usr/bin/env node
// Background-run e2e against a fake OpenAI-compatible server.
// Proves a reply keeps streaming after the chat view is closed, and that finishing
// in the background marks the conversation unread and shows a toast that reopens it.
// Run against the Vite dev server (window.__rt is dev-only):
//   node tests/e2e/ai-background.mjs http://127.0.0.1:5173/
import { launch } from '../../tools/lib/cdp.mjs';
import { startFakeAI } from '../../tools/fake-ai-server.mjs';

const page = process.argv[2] || 'http://127.0.0.1:5173/';
const results = [];
const ok = (n, note = '') => results.push(['PASS', n, note]);
const bad = (n, e) => results.push(['FAIL', n, String(e && e.message || e).slice(0, 220)]);
const assert = (c, m) => { if (!c) throw new Error(m); };

const fake = await startFakeAI();
const b = await launch({ width: 1280, height: 900 });
const ev = x => b.evaluate(x);
const settle = (ms = 500) => b.sleep(ms);
const go = async h => { await ev(`location.hash = ${JSON.stringify(h)}`); await settle(700); };
const waitText = (sel, text, timeout = 10000) => b.waitFor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && e.textContent.includes(${JSON.stringify(text)}); })()`, timeout);
const setModel = m => ev(`localStorage.setItem('maktabati:ai', JSON.stringify({ base:${JSON.stringify(fake.url + '/v1')}, model:${JSON.stringify(m)}, key:'', max:1200, ctx:64000, first:5000 }))`);
const waitReady = () => b.waitFor(`!!document.querySelector('#v-home #chIn')`, 20000);
async function sendHome(text) {
  await ev(`(() => { const t = document.querySelector('#v-home #chIn'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('#v-home #chSend').click(); })()`);
}
async function openPanelAndSend(text) {
  await ev(`window.__rt.tool('chat')`);
  await b.waitFor(`!document.querySelector('#chat').hidden && !!document.querySelector('#chatIn #chIn')`, 5000);
  await ev(`(() => { const t = document.querySelector('#chatIn #chIn'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('#chatIn #chSend').click(); })()`);
}

try {
  await b.goto(page); await waitReady();
  await ev(`document.querySelectorAll('#rtPick [data-rtpick="modern"]').forEach(x => x.click())`);

  // 1) send, navigate to the library mid-stream, wait, reopen: full reply is there and saved
  await setModel('fake-slow');
  await go('#/'); await waitReady();
  await sendHome('رد يكمل في الخلفية');
  await waitText('#v-home', 'بدأ', 8000);
  const id1 = (await ev('location.hash')).replace(/^#\/c\//, '');
  assert(id1 && id1 !== '#/', 'no conversation id');
  await go('#/lib');
  await settle(3200);
  await go('#/c/' + id1);
  await waitText('#v-home', 'بدأ ثم وصل الرد كامل', 10000);
  await b.reload(); await waitReady();
  await go('#/c/' + id1);
  await waitText('#v-home', 'بدأ ثم وصل الرد كامل', 10000);
  ok('reply completes and persists after leaving the chat', 'full reply after reload');

  // 2) expanding the panel mid-stream keeps the reply streaming
  await setModel('fake-slow');
  await go('#/read/demo-experience');
  await b.waitFor(`!!document.querySelector('#v-read')`, 15000);
  await ev(`document.querySelectorAll('#rtPick [data-rtpick="modern"]').forEach(x => x.click())`);
  await settle(500);
  await openPanelAndSend('وسّع أثناء البث');
  await waitText('#chatIn', 'بدأ', 8000);
  await ev(`document.querySelector('#chatIn [data-ch="expand"]').click()`);
  await b.waitFor(`!!document.querySelector('#v-home #chMsgs')`, 6000);
  await waitText('#v-home', 'بدأ ثم وصل الرد كامل', 15000);
  ok('expand keeps the reply streaming', 'full reply in full view');

  // 3) finishing in the background shows a toast that opens the conversation; unread clears
  await setModel('fake-slow');
  await go('#/'); await waitReady();
  await sendHome('رد بالتوست');
  await waitText('#v-home', 'بدأ', 8000);
  const id3 = (await ev('location.hash')).replace(/^#\/c\//, '');
  assert(id3 && id3 !== '#/', 'no conversation id');
  await go('#/lib');
  await b.waitFor(`(() => { const e = document.querySelector('#toast'); return e.classList.contains('show') && e.textContent.includes('وصل الرد'); })()`, 12000);
  await b.waitFor(`!!document.querySelector('.side [data-conv-id="${id3}"][data-unread]')`, 5000);
  await ev(`document.querySelector('#toast .toast-act').click()`);
  await b.waitFor(`location.hash === '#/c/${id3}'`, 5000);
  await settle(600);
  assert(!(await ev(`!!document.querySelector('.side [data-conv-id="${id3}"][data-unread]')`)), 'unread did not clear on open');
  ok('background finish shows a toast and clears unread on open', 'toast -> open');

  // 4) Stop still aborts the run
  await setModel('fake-close');
  await go('#/'); await waitReady();
  await sendHome('أوقف هذا');
  await waitText('#v-home', 'بدأ', 8000);
  const beforeStop = fake.stats.closed;
  await ev(`document.querySelector('#v-home #chSend').click()`);
  await settle(800);
  assert(fake.stats.closed > beforeStop, 'stop did not abort the stream');
  assert((await ev(`document.querySelector('#v-home #chSend').getAttribute('aria-label')`)) !== 'أوقف', 'composer still busy after stop');
  ok('Stop aborts the run', 'closed=' + fake.stats.closed);

  // 5) deleting a running conversation aborts it
  await setModel('fake-close');
  await go('#/'); await waitReady();
  await sendHome('احذف أثناء البث');
  await waitText('#v-home', 'بدأ', 8000);
  const id5 = (await ev('location.hash')).replace(/^#\/c\//, '');
  assert(id5 && id5 !== '#/', 'no conversation id');
  await b.waitFor(`!!document.querySelector('.side [data-cmenu="${id5}"]')`, 5000);
  const beforeDel = fake.stats.closed;
  await ev(`document.querySelector('.side [data-cmenu="${id5}"]').click()`); await settle(250);
  await ev(`document.querySelector('#ctxm [data-cm="del"]').click()`); await settle(250);
  await ev(`document.querySelector('#cfGo').click()`); await settle(1500);
  assert(fake.stats.closed > beforeDel, 'delete did not abort the stream');
  assert(!(await ev(`!!document.querySelector('.side [data-conv-id="${id5}"]')`)), 'conversation reappeared in sidebar');
  ok('delete aborts the running conversation', 'closed=' + fake.stats.closed);
} catch (e) {
  bad('ai-background suite', e);
} finally {
  await b.close();
  await fake.close();
}

for (const r of results) console.log(r.join('\t'));
const failed = results.filter(r => r[0] === 'FAIL');
console.log(failed.length ? `${failed.length} failed` : `${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
