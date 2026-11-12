#!/usr/bin/env node
// Settings provider-detection e2e against a fake OpenAI-compatible server.
// Run against the Vite dev server:
//   node tests/e2e/ai-providers.mjs http://127.0.0.1:5173/
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
const waitText = (sel, text, timeout = 12000) => b.waitFor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && e.textContent.includes(${JSON.stringify(text)}); })()`, timeout);
const cfg = () => ev(`JSON.parse(localStorage.getItem('maktabati:ai') || '{}')`);
const paste = key => ev(`(() => { const e = document.querySelector('#sKey'); e.focus(); e.value = ${JSON.stringify(key)}; e.dispatchEvent(new Event('paste', { bubbles:true })); })()`);
const text = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent : ''; })()`);

try {
  await b.goto(page);
  await b.waitFor(`!!document.querySelector('#v-lib')`, 20000);
  /* DEV ONLY hook in app.js: route the real provider bases to this fake server. */
  await ev(`window.__aiTestProviderBase = ${JSON.stringify({
    gemini:fake.url + '/gemini/v1',
    deepseek:fake.url + '/deepseek/v1',
    openai:fake.url + '/openai/v1',
    groq:fake.url + '/groq/v1',
    openrouter:fake.url + '/openrouter/v1'
  })}`);
  await go('#/profile/ai');
  await b.waitFor(`!!document.querySelector('#sKey')`, 10000);

  // 1) A Gemini key is detected, /models is verified, the newest Flash is chosen, and it saves
  await paste('AQ.AbE2EKey');
  await waitText('#sDetect', 'تم التعرّف:');
  assert((await text('#sDetect')).includes('Gemini'), 'Gemini label missing: ' + await text('#sDetect'));
  const base1 = await ev(`document.querySelector('#sBase').value`);
  assert(base1 === fake.url + '/gemini/v1', 'Gemini base not filled: ' + base1);
  assert((await ev(`document.querySelector('#sModel').value`)) === 'gemini-2.5-flash', 'newest flash not chosen');
  assert(fake.stats.modelFetches[0].path === '/gemini/v1/models', 'wrong /models path');
  assert(fake.stats.modelFetches[0].hasAuth, 'no Authorization header on /models');
  const c1 = await cfg();
  assert(c1.key === 'AQ.AbE2EKey' && c1.base === fake.url + '/gemini/v1' && c1.model === 'gemini-2.5-flash', 'detected config was not saved');
  ok('Gemini key detected, verified and saved', c1.model);

  // 2) Chat works with the saved detected config
  await go('#/');
  await b.waitFor(`!!document.querySelector('#v-home #chIn')`, 10000);
  await ev(`(() => { const t = document.querySelector('#v-home #chIn'); t.value = 'مرحبا'; t.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('#v-home #chSend').click(); })()`);
  await b.waitFor(`(() => { const e = document.querySelector('#v-home .cm-a'); return !!e && e.textContent.trim() === 'تم'; })()`, 15000);
  ok('chat uses the detected config', 'assistant answered');

  // 3) An unknown prefix opens Advanced and asks for the base URL (fresh default config)
  await ev(`localStorage.removeItem('maktabati:ai')`);
  await go('#/'); await go('#/profile/ai');
  await paste('not-a-known-key');
  await waitText('#sDetect', 'ما عرفت المزوّد');
  assert(await ev(`document.querySelector('#sAdv').open`), 'Advanced section did not open');
  ok('unknown key opens Advanced', 'base URL requested');

  // 3b) The same unknown key uses the custom Advanced base/model for the test connection
  await ev(`document.querySelector('#sBase').value = ${JSON.stringify(fake.url + '/v1')}`);
  await ev(`document.querySelector('#sModel').value = 'fake-ok-json'`);
  await ev(`document.querySelector('#sTest').click()`);
  await waitText('#sMsg', 'الاتصال شغّال', 15000);
  const last = fake.stats.last;
  assert(last.model === 'fake-ok-json', 'Advanced model was not used: ' + last.model);
  assert(last.hasAuth, 'Authorization header missing');
  assert(!last.apiKeyHeader, 'x-goog-api-key must not be sent');
  assert(!last.queryKey, '?key= must not be sent');
  ok('unknown key uses Advanced base/model', 'Bearer only, no duplicate credentials');

  // 4) A failed /models call falls back to the hardcoded default and says so
  await ev(`window.__aiTestProviderBase.groq = ${JSON.stringify(fake.url + '/broken/v1')}`);
  await paste('gsk_e2e');
  await waitText('#sDetect', 'تعذّر جلب');
  assert((await text('#sDetect')).includes('Groq'), 'Groq label missing after fallback');
  assert((await ev(`document.querySelector('#sBase').value`)) === fake.url + '/broken/v1', 'fallback base wrong');
  assert((await ev(`document.querySelector('#sModel').value`)) === 'llama-3.3-70b-versatile', 'fallback model wrong');
  const c4 = await cfg();
  assert(c4.key === 'gsk_e2e' && c4.model === 'llama-3.3-70b-versatile', 'fallback config was not saved');
  ok('failed /models falls back to the hardcoded default', 'HTTP 404');

  // 5) When the preferred model is absent, show the /models list and no guessed default
  await ev(`window.__aiTestProviderBase.openrouter = ${JSON.stringify(fake.url + '/odd/v1')}`);
  await paste('sk-or-e2e');
  await waitText('#sDetect', 'اختر موديلًا');
  assert(await ev(`!!document.querySelector('#sModelPick')`), 'model dropdown missing');
  assert((await ev(`document.querySelector('#sModel').value`)) === '', 'an unlisted default model was chosen');
  ok('missing preferred model shows the dropdown', 'no guessed default');

  // 6) A generic sk- key probes DeepSeek first and uses OpenAI when DeepSeek fails
  await ev(`Object.assign(window.__aiTestProviderBase, ${JSON.stringify({
    deepseek:fake.url + '/missing/v1',
    openai:fake.url + '/openai/v1'
  })})`);
  const before = fake.stats.modelFetches.length;
  await paste('sk-generic-e2e');
  await waitText('#sDetect', 'تم التعرّف:');
  assert((await text('#sDetect')).includes('OpenAI'), 'OpenAI did not win: ' + await text('#sDetect'));
  assert((await ev(`document.querySelector('#sModel').value`)) === 'gpt-4o-mini', 'OpenAI default model wrong');
  const attempts = fake.stats.modelFetches.slice(before).map(x => x.path);
  assert(attempts[0] === '/missing/v1/models' && attempts[1] === '/openai/v1/models', 'probe order: ' + attempts.join(' -> '));
  ok('generic sk- probes DeepSeek first then OpenAI', attempts.join(' -> '));

  // 7) An Anthropic key is rejected with clear guidance to use OpenRouter
  await paste('sk-ant-e2e');
  await waitText('#sDetect', 'Anthropic');
  assert((await text('#sDetect')).includes('OpenRouter'), 'no OpenRouter suggestion');
  ok('Anthropic key is rejected with guidance', 'OpenRouter suggested');
} catch (e) {
  bad('provider settings suite', e);
} finally {
  await b.close();
  await fake.close();
}

for (const r of results) console.log(r.join('\t'));
const failed = results.filter(r => r[0] === 'FAIL');
console.log(failed.length ? `${failed.length} failed` : `${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
