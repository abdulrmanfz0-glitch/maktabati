#!/usr/bin/env node
// Gemini busy-model fallback e2e against the local fake server.
// Run against the Vite dev server:
//   node tests/e2e/ai-gemini-fallback.mjs http://127.0.0.1:5173/
import { launch } from '../../tools/lib/cdp.mjs';
import { startFakeAI } from '../../tools/fake-ai-server.mjs';

const page = process.argv[2] || 'http://127.0.0.1:5173/';
const results = [];
const ok = (n, note = '') => results.push(['PASS', n, note]);
const bad = (n, e) => results.push(['FAIL', n, String(e && e.message || e).slice(0, 220)]);
const assert = (c, m) => { if (!c) throw new Error(m); };

const fake = await startFakeAI();
const b = await launch({ width:1280, height:900 });
const ev = x => b.evaluate(x);
const settle = (ms = 500) => b.sleep(ms);
const go = async h => { await ev(`location.hash = ${JSON.stringify(h)}`); await settle(700); };
const waitText = (sel, text, timeout = 15000) => b.waitFor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && e.textContent.includes(${JSON.stringify(text)}); })()`, timeout);
const cfg = () => ev(`JSON.parse(localStorage.getItem('maktabati:ai') || '{}')`);
const setKey = key => ev(`(() => { const e = document.querySelector('#sKey'); e.focus(); e.value = ${JSON.stringify(key)}; e.dispatchEvent(new Event('input', { bubbles:true })); })()`);
const send = text => ev(`(() => { const t = document.querySelector('#v-home #chIn'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('#v-home #chSend').click(); })()`);

try {
  await b.goto(page);
  await b.waitFor(`!!document.querySelector('#v-lib')`, 20000);
  const base = 'https://generativelanguage.googleapis.com/v1beta/openai';
  await ev(`(() => {
    const map = { ${JSON.stringify(base)}: ${JSON.stringify(fake.url + '/gemini/v1')} };
    const orig = window.fetch.bind(window);
    window.fetch = (input, init) => {
      let url = typeof input === 'string' ? input : (input && input.url);
      if (url && url.startsWith(${JSON.stringify(base)})) url = ${JSON.stringify(fake.url + '/gemini/v1')} + url.slice(${JSON.stringify(base)}.length);
      return orig(url, init);
    };
  })()`);
  await go('#/profile/ai');
  await b.waitFor(`!!document.querySelector('#sKey')`, 10000);

  // 1) Default is 3.1 flash-lite; ids are stripped and non-chat ids are hidden
  await setKey('AQ.AbFallbackKey');
  await waitText('#sDetect', 'Gemini');
  assert((await ev(`document.querySelector('#sModel').value`)) === 'gemini-3.1-flash-lite', 'Gemini default is not 3.1 flash-lite');
  const choices = await ev(`[...document.querySelectorAll('#sModelPick option')].map(o => o.value)`);
  for (const id of ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.8-flash']) assert(choices.includes(id), 'missing ' + id);
  for (const badId of ['image', 'tts', 'transcribe', 'omni', 'lyria', 'nano-banana', 'customtools']) assert(!choices.some(id => id.includes(badId)), 'dropdown kept ' + badId);
  assert(!choices.some(id => id.startsWith('models/')), 'models/ prefix was not stripped');
  ok('Gemini model list', '3.1 lite default, stripped and filtered');

  // Use 3.8 so the busy fallback should land on 3.1 lite.
  await ev(`(() => { const s = document.querySelector('#sModelPick'); s.value = 'gemini-3.8-flash'; s.dispatchEvent(new Event('change', { bubbles:true })); })()`);
  assert((await cfg()).model === 'gemini-3.8-flash', 'selected model was not saved');

  // 2) One 503 falls back to 3.1 lite, shows the note and answers
  fake.control.gemini503Once = true;
  await go('#/');
  await b.waitFor(`!!document.querySelector('#v-home #chIn')`, 10000);
  await send('اكتب لي تعريفًا قصيرًا');
  await waitText('#v-home', 'Gemini مزدحم، استخدمت gemini-3.1-flash-lite', 20000);
  await b.waitFor(`(() => { const e = document.querySelectorAll('#v-home .cm-a'); const last = e[e.length - 1]; return !!last && last.textContent.includes('تم'); })()`, 15000);
  assert((await cfg()).model === 'gemini-3.8-flash', 'fallback changed the saved model');
  ok('Gemini 503 fallback', 'note + answer, saved model unchanged');

  // 3) All 503 shows the busy message without spinning for minutes
  fake.control.gemini503 = true;
  const started = Date.now();
  await send('جرّب مرة ثانية');
  await waitText('#v-home', 'خوادم Gemini مزدحمة الحين', 60000);
  const elapsed = Date.now() - started;
  assert(elapsed < 60000, 'busy message took ' + elapsed + 'ms');
  assert((await cfg()).model === 'gemini-3.8-flash', 'busy fallback changed the saved model');
  ok('all Gemini 503', 'busy message in ' + elapsed + 'ms');

  // 4) Gemini 404 shows the model-gone message
  fake.control.gemini503 = false;
  fake.control.gemini404 = true;
  await send('جرّب موديل قديم');
  await waitText('#v-home', 'هذا الموديل ما عاد متاح', 20000);
  ok('Gemini 404', 'model-gone message');
} catch (e) {
  bad('gemini fallback suite', e);
} finally {
  await b.close();
  await fake.close();
}

for (const r of results) console.log(r.join('\t'));
const failed = results.filter(r => r[0] === 'FAIL');
console.log(failed.length ? `${failed.length} failed` : `${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
