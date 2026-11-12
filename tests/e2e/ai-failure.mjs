#!/usr/bin/env node
// Failure-path e2e against a fake OpenAI-compatible server.
// Run against the Vite dev server (window.__rt is dev-only):
//   node tests/e2e/ai-failure.mjs http://127.0.0.1:5173/
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
async function sendHome(text) {
  await ev(`(() => { const t = document.querySelector('#v-home #chIn'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('#v-home #chSend').click(); })()`);
}
async function waitReady() { await b.waitFor(`!!document.querySelector('#v-home #chIn')`, 20000); }
async function openSettingsTest() {
  await go('#/'); await waitReady();
  await go('#/profile/ai');
  await b.waitFor(`!!document.querySelector('#sTest')`, 10000);
}

try {
  await b.goto(page); await waitReady();
  await ev(`document.querySelectorAll('#rtPick [data-rtpick="modern"]').forEach(x => x.click())`);

  // 1) 429 then success
  await setModel('fake-429');
  await go('#/'); await waitReady();
  await sendHome('اختبر 429');
  await waitText('#v-home', 'نجح بعد 429', 12000);
  assert(fake.stats.requests >= 2, '429 was not retried');
  ok('429 then success', fake.stats.requests + ' requests');

  // 2) closeChat during a stream
  await setModel('fake-close');
  await go('#/read/demo-experience');
  await b.waitFor(`!!document.querySelector('#v-read')`, 15000);
  await ev(`document.querySelectorAll('#rtPick [data-rtpick="modern"]').forEach(x => x.click())`);
  await settle(500);
  await ev(`window.__rt.tool('chat')`);
  await b.waitFor(`!document.querySelector('#chat').hidden && !!document.querySelector('#chatIn #chIn')`, 5000);
  await ev(`(() => { const t = document.querySelector('#chatIn #chIn'); t.value = 'ابدأ ثم أغلق'; t.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('#chatIn #chSend').click(); })()`);
  await waitText('#chatIn', 'بدأ', 8000);
  const beforeClose = fake.stats.closed;
  await ev(`document.querySelector('#chatScrim').click()`);
  await settle(1200);
  assert(await ev(`document.querySelector('#chat').hidden`), 'chat did not close');
  assert(fake.stats.closed > beforeClose, 'server did not see the stream close');
  ok('closeChat aborts stream', 'closed=' + fake.stats.closed);

  // 3) deleteConv during a stream
  await setModel('fake-close');
  await go('#/'); await waitReady();
  await sendHome('احذفني أثناء البث');
  await waitText('#v-home', 'بدأ', 8000);
  const id = (await ev('location.hash')).replace(/^#\/c\//, '');
  assert(id && id !== '#/', 'no conversation id');
  await b.waitFor(`!!document.querySelector('.side [data-cmenu="${id}"]')`, 5000);
  const beforeDelete = fake.stats.closed;
  await ev(`document.querySelector('.side [data-cmenu="${id}"]').click()`); await settle(250);
  await ev(`document.querySelector('#ctxm [data-cm="del"]').click()`); await settle(250);
  await ev(`document.querySelector('#cfGo').click()`); await settle(1500);
  assert(fake.stats.closed > beforeDelete, 'stream was not aborted on delete');
  assert(!(await ev(`!!document.querySelector('.side [data-conv-id="${id}"]')`)), 'conversation reappeared in sidebar');
  assert(!(await ev(`location.hash === '#/c/${id}'`)), 'conversation route was recreated');
  ok('deleteConv aborts and does not recreate', 'closed=' + fake.stats.closed);

  // 4) stream stalls past the idle timeout (20 s)
  await setModel('fake-idle');
  await go('#/'); await waitReady();
  await sendHome('سكون طويل');
  await waitText('#v-home', 'تأخر مزوّد الذكاء', 26000);
  ok('idle stream timeout', '20s + slack');

  // 5) Gemini-like empty answer: only a final chunk with finish_reason length, no content
  await setModel('fake-empty-length');
  await go('#/'); await waitReady();
  await sendHome('رد فاضي');
  await waitText('#v-home', 'استهلك حدّ التوكنز', 12000);
  assert(!(await ev(`!!document.querySelector('#v-home .typing')`)), 'typing spinner still visible');
  assert((await ev(`document.querySelector('#v-home #chSend').getAttribute('aria-label')`)) !== 'أوقف', 'composer still busy');
  ok('empty answer with finish_reason length', 'Arabic error, spinner cleared');

  // 6) test connection (non-stream) shows the same empty-answer error
  await setModel('fake-empty-json');
  await go('#/profile/ai');
  await b.waitFor(`!!document.querySelector('#sTest')`, 10000);
  await ev(`document.querySelector('#sTest').click()`);
  await waitText('#sMsg', 'استهلك حدّ التوكنز', 12000);
  ok('test connection empty JSON', 'Arabic error shown');

  // 7) test connection shows the provider's own 400 text
  await setModel('fake-error-400');
  await openSettingsTest();
  await ev(`document.querySelector('#sTest').click()`);
  await waitText('#sMsg', 'Invalid Auth key.', 12000);
  ok('test connection 400 provider text', 'Invalid Auth key.');

  // 8) test connection shows the provider's 401 reason
  await setModel('fake-error-401');
  await openSettingsTest();
  await ev(`document.querySelector('#sTest').click()`);
  await waitText('#sMsg', 'ACCESS_TOKEN_TYPE_UNSUPPORTED', 12000);
  ok('test connection 401 reason', 'ACCESS_TOKEN_TYPE_UNSUPPORTED');
  await go('#/'); await waitReady();

  // 9) two tabs: a write in tab A shows the reload notice in tab B
  await ev(`(() => { const b = document.createElement('button'); b.id = '__openOther'; b.textContent = 'open'; b.style = 'position:fixed;top:0;left:0;z-index:99999'; b.onclick = () => { window.__other = window.open(location.href, '_blank'); }; document.body.appendChild(b); })()`);
  const r = await ev(`(() => { const x = document.querySelector('#__openOther').getBoundingClientRect(); return { x:x.left + 5, y:x.top + 5 }; })()`);
  await b.tap(r.x, r.y);
  await b.sleep(800);
  const opened = await ev(`!!window.__other`);
  await ev(`document.querySelector('#__openOther') && document.querySelector('#__openOther').remove()`);
  if (!opened) results.push(['SKIP', 'two tabs', 'popup blocked by the browser']);
  else {
    try{
      await b.waitFor(`!!(window.__other && window.__other.document && window.__other.document.querySelector('#v-home #chIn'))`, 20000);
      await b.sleep(500);
      await go('#/read/demo-experience');
      await b.waitFor(`window.__other.document.querySelector('#toast').textContent.includes('تم تعديل المكتبة')`, 8000);
      ok('two tabs reload notice');
    } catch(e){ bad('two tabs reload notice', e); }
    finally { await ev(`try { window.__other.close(); } catch(e) {}`); }
  }

  // 6) forced IndexedDB failure: no demo seed, clear storage state
  const c = await launch({ width: 390, height: 844, mobile: true });
  try {
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(globalThis, 'indexedDB', { configurable:true, value:{ open(){ throw new Error('blocked for test'); } } });` });
    await c.goto(page); await c.waitFor(`!!document.querySelector('#v-lib')`, 20000);
    await c.evaluate(`location.hash = '#/lib'`); await c.sleep(500);
    const txt = await c.evaluate(`document.querySelector('#v-lib').textContent`);
    assert(txt.includes('التخزين غير متاح'), 'storage-unavailable state is missing');
    assert(!/آلة التجربة/.test(txt), 'demo was seeded despite storage failure');
    ok('forced IndexedDB failure', 'no demo seed');
  } finally { await c.close(); }
} catch (e) {
  bad('ai-failure suite', e);
} finally {
  await b.close();
  await fake.close();
}

for (const r of results) console.log(r.join('\t'));
const failed = results.filter(r => r[0] === 'FAIL');
console.log(failed.length ? `${failed.length} failed` : `${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
