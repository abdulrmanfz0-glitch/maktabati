#!/usr/bin/env node
// Settings provider-detection e2e against a fake OpenAI-compatible server.
// Run against the Vite dev server:
//   node tests/e2e/ai-providers.mjs http://127.0.0.1:5173/
//
// The app saves real provider base URLs. This test rewrites window.fetch so those
// hosts hit the local fake server, without adding a test hook to the app.
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
const text = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent : ''; })()`);
const cfg = () => ev(`JSON.parse(localStorage.getItem('maktabati:ai') || '{}')`);
const setKey = key => ev(`(() => { const e = document.querySelector('#sKey'); e.focus(); e.value = ${JSON.stringify(key)}; e.dispatchEvent(new Event('input', { bubbles:true })); })()`);
const click = async sel => { const found = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`); assert(found, 'missing ' + sel); await settle(300); };
const mapFor = sandbox => ev(`window.__aiTestMap = ${JSON.stringify(sandbox)}`);

const sandbox = {
  'https://api.deepseek.com': fake.url + '/deepseek/v1',
  'https://generativelanguage.googleapis.com/v1beta/openai': fake.url + '/gemini/v1',
  'https://openrouter.ai/api/v1': fake.url + '/openrouter/v1',
  'https://api.groq.com/openai/v1': fake.url + '/groq/v1',
  'https://api.openai.com/v1': fake.url + '/openai/v1'
};

try {
  await b.goto(page);
  await b.waitFor(`!!document.querySelector('#v-lib')`, 20000);
  await mapFor(sandbox);
  /* Route the app's real provider bases to the fake server. The saved config keeps
     the real base, which is what the product now stores. */
  await ev(`(() => {
    const orig = window.fetch.bind(window);
    window.fetch = (input, init) => {
      let url = typeof input === 'string' ? input : (input && input.url);
      if (url) for (const from of Object.keys(window.__aiTestMap || {})) {
        if (url.startsWith(from)) { url = window.__aiTestMap[from] + url.slice(from.length); break; }
      }
      return orig(url, init);
    };
  })()`);
  await go('#/profile/ai');
  await b.waitFor(`!!document.querySelector('#sKey')`, 10000);

  // 1) An AQ. Gemini key detects Gemini, sets base/model/limits and saves
  await setKey('AQ.AbE2EKey');
  await waitText('#sDetect', 'Gemini');
  assert((await ev(`document.querySelector('#sBase').value`)) === 'https://generativelanguage.googleapis.com/v1beta/openai', 'Gemini base not saved');
  assert((await ev(`document.querySelector('#sModel').value`)) === 'gemini-2.5-flash', 'newest flash not chosen');
  assert((await ev(`document.querySelector('#sMax').value`)) === '4096', 'Gemini max limit not applied');
  assert(fake.stats.modelFetches.some(x => x.path === '/gemini/v1/models'), 'Gemini /models not called');
  const c1 = await cfg();
  assert(c1.key === 'AQ.AbE2EKey' && c1.model === 'gemini-2.5-flash' && c1.max === 4096, 'detected config was not saved');
  ok('AQ. Gemini key detected and saved', c1.model);

  // 2) Chat uses the saved config
  await go('#/');
  await b.waitFor(`!!document.querySelector('#v-home #chIn')`, 10000);
  await ev(`(() => { const t = document.querySelector('#v-home #chIn'); t.value = 'مرحبا'; t.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('#v-home #chSend').click(); })()`);
  await b.waitFor(`(() => { const e = document.querySelector('#v-home .cm-a'); return !!e && e.textContent.trim() === 'تم'; })()`, 15000);
  assert(fake.stats.last.model === 'gemini-2.5-flash', 'chat used the wrong model');
  assert(fake.stats.last.reasoning_effort === 'low', 'Gemini reasoning_effort missing');
  ok('chat uses the detected Gemini config', 'reasoning_effort=low');

  // 3) Typing a DeepSeek sk- key and pressing Save switches provider and resets limits
  await go('#/profile/ai');
  await setKey('sk-deepseek-e2e');
  await click('#sSave');
  await b.waitFor(`document.querySelector('#sBase').value === 'https://api.deepseek.com'`, 15000);
  assert((await ev(`document.querySelector('#sModel').value`)) === 'deepseek-flash', 'DeepSeek model not applied');
  assert((await ev(`document.querySelector('#sMax').value`)) === '1200', 'DeepSeek max limit not applied');
  const c3 = await cfg();
  assert(c3.base === 'https://api.deepseek.com' && c3.model === 'deepseek-flash', 'DeepSeek config not saved');
  assert((await text('#sDetect')).includes('DeepSeek'), 'status did not switch to DeepSeek');
  const dsModels = await ev(`[...document.querySelectorAll('#sModelPick option')].map(o => o.value).join('|')`);
  assert(dsModels.includes('deepseek-flash') && !dsModels.includes('gemini'), 'old model list was kept: ' + dsModels);
  ok('Gemini -> DeepSeek on Save', c3.base + ' · ' + c3.model);

  // 4) The reverse switch also works
  await setKey('AQ.AbReverseKey');
  await click('#sSave');
  await b.waitFor(`document.querySelector('#sBase').value === 'https://generativelanguage.googleapis.com/v1beta/openai'`, 15000);
  assert((await ev(`document.querySelector('#sModel').value`)) === 'gemini-2.5-flash', 'Gemini model not restored');
  assert((await ev(`document.querySelector('#sMax').value`)) === '4096', 'Gemini limits not restored');
  const c4 = await cfg();
  assert(c4.base === 'https://generativelanguage.googleapis.com/v1beta/openai' && c4.model === 'gemini-2.5-flash', 'reverse config not saved');
  ok('DeepSeek -> Gemini on Save', c4.model);

  // 4b) Test connection re-detects the provider before calling the model
  await setKey('sk-deepseek-test');
  await click('#sTest');
  await waitText('#sMsg', 'الاتصال شغّال', 15000);
  assert((await ev(`document.querySelector('#sBase').value`)) === 'https://api.deepseek.com', 'Test did not switch to DeepSeek');
  assert((await ev(`document.querySelector('#sModel').value`)) === 'deepseek-flash', 'Test did not apply the DeepSeek model');
  ok('Test connection re-detects first', 'Gemini -> DeepSeek');

  // 5) An unknown prefix shows the provider picker, no URL fields and no guessing
  const beforeUnknown = fake.stats.modelFetches.length;
  await setKey('totally-unknown-key');
  await b.waitFor(`!!document.querySelector('#sProviderPick')`, 12000);
  assert(await ev(`document.querySelector('#sAdv').hidden`), 'custom fields opened for an unknown key');
  const baseBox = await ev(`(() => { const e = document.querySelector('#sBase'); const r = e.getBoundingClientRect(); return { h:r.height, w:r.width }; })()`);
  assert(baseBox.h === 0, 'base URL field visible: ' + JSON.stringify(baseBox));
  const choices = await ev(`[...document.querySelectorAll('#sProviderPick option')].map(o => o.textContent).join('|')`);
  for (const name of ['DeepSeek', 'Gemini', 'OpenRouter', 'Groq', 'OpenAI', 'آخر / مخصّص']) assert(choices.includes(name), 'picker missing ' + name);
  assert(fake.stats.modelFetches.length === beforeUnknown, 'unknown key was sent to a provider');
  ok('unknown key shows the provider picker', 'no network, no URL fields');

  // 5b) Picking a provider verifies only that provider, then saves
  const beforePick = fake.stats.modelFetches.length;
  await ev(`(() => { const s = document.querySelector('#sProviderPick'); s.value = 'groq'; s.dispatchEvent(new Event('change', { bubbles:true })); })()`);
  await waitText('#sDetect', 'Groq');
  assert((await ev(`document.querySelector('#sBase').value`)) === 'https://api.groq.com/openai/v1', 'picked Groq base wrong');
  assert((await ev(`document.querySelector('#sModel').value`)) === 'llama-3.3-70b-versatile', 'picked Groq model wrong');
  const picked = fake.stats.modelFetches.slice(beforePick).map(x => x.path);
  assert(picked.length === 1 && picked[0] === '/groq/v1/models', 'picker sent the key elsewhere: ' + picked.join(' -> '));
  const c5 = await cfg();
  assert(c5.base === 'https://api.groq.com/openai/v1' && c5.model === 'llama-3.3-70b-versatile', 'picked provider was not saved');
  ok('picked provider is verified and saved', 'Groq only');

  // 6) /models 404 falls back to the provider's hardcoded default
  await mapFor(Object.assign({}, sandbox, { 'https://api.groq.com/openai/v1': fake.url + '/broken/v1' }));
  await setKey('gsk_e2e');
  await waitText('#sDetect', 'تعذّر');
  assert((await text('#sDetect')).includes('Groq'), 'Groq label missing after fallback');
  assert((await ev(`document.querySelector('#sBase').value`)) === 'https://api.groq.com/openai/v1', 'Groq base wrong');
  assert((await ev(`document.querySelector('#sModel').value`)) === 'llama-3.3-70b-versatile', 'Groq fallback model wrong');
  ok('failed /models falls back to the hardcoded default', 'Groq');

  // 7) A missing preferred model leaves the model empty and shows the list
  await mapFor(Object.assign({}, sandbox, { 'https://openrouter.ai/api/v1': fake.url + '/odd/v1' }));
  await setKey('sk-or-e2e');
  await waitText('#sDetect', 'OpenRouter');
  assert((await text('#sDetect')).includes('اختر موديلًا'), 'no model-choice prompt');
  assert((await ev(`document.querySelector('#sModel').value`)) === '', 'an unlisted default model was chosen');
  assert(await ev(`!!document.querySelector('#sModelPick')`), 'model dropdown missing');
  ok('missing preferred model shows the dropdown', 'no guessed default');

  // 8) A generic sk- key probes DeepSeek first, then OpenAI
  await mapFor(Object.assign({}, sandbox, {
    'https://api.deepseek.com': fake.url + '/missing/v1',
    'https://api.openai.com/v1': fake.url + '/openai/v1'
  }));
  const beforeProbe = fake.stats.modelFetches.length;
  await setKey('sk-generic-e2e');
  await waitText('#sDetect', 'OpenAI');
  assert((await ev(`document.querySelector('#sBase').value`)) === 'https://api.openai.com/v1', 'OpenAI base wrong');
  assert((await ev(`document.querySelector('#sModel').value`)) === 'gpt-4o-mini', 'OpenAI model wrong');
  const attempts = fake.stats.modelFetches.slice(beforeProbe).map(x => x.path);
  assert(attempts[0] === '/missing/v1/models' && attempts[1] === '/openai/v1/models', 'probe order: ' + attempts.join(' -> '));
  ok('generic sk- probes DeepSeek then OpenAI', attempts.join(' -> '));

  // 9) Anthropic keys are rejected with guidance
  await setKey('sk-ant-e2e');
  await waitText('#sDetect', 'Anthropic');
  assert((await text('#sDetect')).includes('OpenRouter'), 'no OpenRouter suggestion');
  ok('Anthropic key is rejected with guidance', 'OpenRouter suggested');

  // 10) An explicit custom endpoint survives reload
  await setKey('another-unknown-key');
  await b.waitFor(`!!document.querySelector('#sProviderPick')`, 12000);
  await ev(`(() => { const s = document.querySelector('#sProviderPick'); s.value = 'custom'; s.dispatchEvent(new Event('change', { bubbles:true })); })()`);
  await settle(300);
  assert(!(await ev(`document.querySelector('#sAdv').hidden`)), 'custom fields did not open');
  assert((await ev(`document.querySelector('#sBase').value`)) === '', 'custom base was not cleared');
  await ev(`document.querySelector('#sBase').value = ${JSON.stringify(fake.url + '/v1')}; document.querySelector('#sModel').value = 'fake-ok-json'`);
  await click('#sSave');
  await waitText('#sDetect', 'مخصّص');
  const c10 = await cfg();
  assert(c10.base === fake.url + '/v1' && c10.model === 'fake-ok-json', 'custom config not saved');

  await b.reload();
  await b.waitFor(`!!document.querySelector('#v-lib')`, 20000);
  await go('#/profile/ai');
  await b.waitFor(`!!document.querySelector('#sBase')`, 10000);
  assert((await ev(`document.querySelector('#sBase').value`)) === fake.url + '/v1', 'custom base lost after reload');
  assert((await ev(`document.querySelector('#sModel').value`)) === 'fake-ok-json', 'custom model lost after reload');
  assert(await ev(`document.querySelector('#sAdv').hidden`), 'Advanced should stay hidden by default');
  await click('#sCustomLink');
  assert(!(await ev(`document.querySelector('#sAdv').hidden`)), 'custom link did not open the fields');
  ok('custom endpoint survives reload', 'base + model kept, hidden by default');
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
