#!/usr/bin/env node
// Multiple connections, pinned models, per-task defaults, and the chat switcher.
// Runs against the Vite dev server and a local fake OpenAI-compatible server:
//   node tests/e2e/ai-connections.mjs http://127.0.0.1:5173/
//
// The app stores real provider base URLs. This test rewrites window.fetch so
// those hosts reach the fake server; every pre-map URL is recorded so the test
// can prove nothing was sent anywhere else.
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
const go = async h => { await ev(`location.hash = ${JSON.stringify(h)}`); await settle(900); };
const waitText = (sel, text, timeout = 15000) => b.waitFor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && e.textContent.includes(${JSON.stringify(text)}); })()`, timeout);
const text = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent : ''; })()`);
const count = sel => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const click = async sel => { const found = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`); assert(found, 'missing ' + sel); await settle(350); };
const fill = (sel, value) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.focus(); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles:true })); return true; })()`);
const choose = (sel, value) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles:true })); return true; })()`);
const sendHome = async text => {
  await ev(`(() => { const t = document.querySelector('#v-home #chIn'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('#v-home #chSend').click(); })()`);
};
const waitAnswer = (n, timeout = 15000) => b.waitFor(`(() => { const e = document.querySelectorAll('#v-home .cm-a'); const last = e[e.length - 1]; return e.length >= ${n} && !!last && last.textContent.includes('تم'); })()`, timeout);
const lastModelLabel = () => ev(`(() => { const e = document.querySelectorAll('#v-home .cm-a .cm-model'); return e.length ? e[e.length - 1].textContent : ''; })()`);
const state = () => ev(`JSON.parse(localStorage.getItem('maktabati:ai') || '{}')`);

const deepseekBase = 'https://api.deepseek.com';
const geminiBase = 'https://generativelanguage.googleapis.com/v1beta/openai';
const dkey = 'sk-deepseek-connections-e2e';
const gkey = 'AQ.fake-gemini-connections-e2e';

try {
  await b.goto(page);
  await b.waitFor(`!!document.querySelector('#v-lib')`, 20000);
  await ev(`localStorage.setItem('maktabati:profile', JSON.stringify({ ai:{ autoSearch:false } }))`);
  await b.reload();
  await b.waitFor(`!!document.querySelector('#v-lib')`, 20000);
  await ev(`(() => {
    window.__origins = [];
    const map = { ${JSON.stringify(deepseekBase)}: ${JSON.stringify(fake.url + '/deepseek/v1')}, ${JSON.stringify(geminiBase)}: ${JSON.stringify(fake.url + '/gemini/v1')} };
    const orig = window.fetch.bind(window);
    window.fetch = (input, init) => {
      let url = typeof input === 'string' ? input : (input && input.url);
      if (url) {
        window.__origins.push(url);
        for (const from of Object.keys(map)) if (url.startsWith(from)) { url = map[from] + url.slice(from.length); break; }
      }
      return orig(url, init);
    };
  })()`);

  await go('#/profile/ai');
  await b.waitFor(`!!document.querySelector('#aiAdd')`, 10000);

  // 1) Add two connections through the UI.
  await click('#aiAdd');
  await b.waitFor(`!!document.querySelector('#aiKey')`, 5000);
  await fill('#aiKey', dkey);
  await waitText('#aiDetect', 'OpenAI');
  await choose('#aiProviderPick', 'deepseek');
  await click('#aiDoAdd');
  await b.waitFor(`document.querySelectorAll('.ai-conn').length === 1`, 20000);
  const c1 = (await state()).connections[0];
  assert(c1.provider === 'deepseek' && c1.key === dkey && c1.base === deepseekBase, 'DeepSeek connection not saved correctly');
  assert((await state()).pinned.length === 1 && (await state()).pinned[0].model === 'deepseek-flash', 'add must pin only the provider default');
  ok('DeepSeek connection added', c1.label + ' · one default pin');

  await click('#aiAdd');
  await b.waitFor(`!!document.querySelector('#aiKey')`, 5000);
  await fill('#aiKey', gkey);
  await waitText('#aiDetect', 'Gemini');
  await click('#aiDoAdd');
  await b.waitFor(`document.querySelectorAll('.ai-conn').length === 2`, 20000);
  const s2 = await state();
  const c2 = s2.connections.find(c => c.provider === 'gemini');
  assert(c2 && c2.key === gkey && c2.base === geminiBase, 'Gemini connection not saved correctly');
  assert(s2.pinned.filter(p => p.connectionId === c2.id).length === 1, 'Gemini add must pin only the default');
  ok('Gemini connection added', c2.label + ' · one default pin');

  // 2) Pin two models on each connection. Gemini's picker is filtered.
  await click(`[data-ai-models="${c1.id}"]`);
  await b.waitFor(`document.querySelectorAll('#aiModelList input[data-model]').length > 0`, 15000);
  const dsModels = await ev(`[...document.querySelectorAll('#aiModelList input[data-model]')].map(x => x.dataset.model)`);
  assert(dsModels.includes('deepseek-flash') && dsModels.includes('deepseek-v4-pro'), 'DeepSeek models missing: ' + dsModels.join(','));
  await ev(`(() => { const cb = [...document.querySelectorAll('#aiModelList input[data-model]')].find(x => x.dataset.model === 'deepseek-v4-pro'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles:true })); })()`);
  await click('#aiModelsSave');
  await b.waitFor(`document.querySelectorAll('.ai-conn')[0].textContent.includes('deepseek-v4-pro') || document.body.textContent.includes('DeepSeek V4 Pro')`, 10000);

  await click(`[data-ai-models="${c2.id}"]`);
  await b.waitFor(`document.querySelectorAll('#aiModelList input[data-model]').length > 0`, 15000);
  const gemModels = await ev(`[...document.querySelectorAll('#aiModelList input[data-model]')].map(x => x.dataset.model)`);
  assert(gemModels.includes('gemini-3.1-flash-lite') && gemModels.includes('gemini-3.8-flash'), 'Gemini models missing: ' + gemModels.join(','));
  assert(!gemModels.some(id => /image|tts|transcribe/.test(id)), 'Gemini filter leaked non-chat models: ' + gemModels.join(','));
  assert(!gemModels.some(id => id.startsWith('models/')), 'Gemini model ids keep the models/ prefix');
  await ev(`(() => { const cb = [...document.querySelectorAll('#aiModelList input[data-model]')].find(x => x.dataset.model === 'gemini-3.8-flash'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles:true })); })()`);
  await click('#aiModelsSave');
  await b.waitFor(`location.hash === '#/profile/ai' && document.body.textContent.includes('Gemini 3.8 Flash')`, 10000);
  const pinned = (await state()).pinned;
  assert(pinned.filter(p => p.connectionId === c1.id).length === 2, 'DeepSeek should have two pins');
  assert(pinned.filter(p => p.connectionId === c2.id).length === 2, 'Gemini should have two pins');
  ok('two pinned models on each connection', pinned.length + ' pins');

  // 3) Translation uses Gemini 3.8 Flash; chat uses DeepSeek V4 Pro.
  const chooseOk = await choose('[data-ai-default="translation"]', c2.id + '|gemini-3.8-flash');
  assert(chooseOk, 'translation default select missing');
  await b.waitFor(`JSON.parse(localStorage.getItem('maktabati:ai')).defaults.translation.model === 'gemini-3.8-flash'`, 5000);
  const chatChooseOk = await choose('[data-ai-default="chat"]', c1.id + '|deepseek-v4-pro');
  assert(chatChooseOk, 'chat default select missing');
  await b.waitFor(`JSON.parse(localStorage.getItem('maktabati:ai')).defaults.chat.model === 'deepseek-v4-pro'`, 5000);
  const defaults = (await state()).defaults;
  assert(defaults.translation.model === 'gemini-3.8-flash' && defaults.chat.model === 'deepseek-v4-pro', 'task defaults not saved');
  ok('per-task defaults', 'chat=deepseek-v4-pro · translation=gemini-3.8-flash');

  // 4) First chat message goes to DeepSeek/chat and shows its short label.
  await go('#/');
  await b.waitFor(`!!document.querySelector('#v-home #chIn')`, 10000);
  await sendHome('مرحبا');
  await waitAnswer(1);
  assert(fake.stats.last.path === '/deepseek/v1/chat/completions', 'chat used the wrong base: ' + fake.stats.last.path);
  assert(fake.stats.last.model === 'deepseek-v4-pro', 'chat used the wrong model: ' + fake.stats.last.model);
  assert((await lastModelLabel()).includes('DeepSeek V4 Pro'), 'assistant model label missing');
  ok('chat uses the chat default', 'DeepSeek V4 Pro @ /deepseek/v1');

  // 5) Switching the conversation model changes only the next request.
  await click('#v-home .ch-model-btn');
  await click(`#v-home [data-pin-conn="${c2.id}"][data-pin-model="gemini-3.8-flash"]`);
  await waitText('#v-home .ch-model-btn', 'Gemini 3.8 Flash');
  await sendHome('السؤال الثاني');
  await waitAnswer(2);
  assert(fake.stats.last.path === '/gemini/v1/chat/completions', 'switched chat used the wrong base: ' + fake.stats.last.path);
  assert(fake.stats.last.model === 'gemini-3.8-flash', 'switched chat used the wrong model: ' + fake.stats.last.model);
  assert((await lastModelLabel()).includes('Gemini 3.8 Flash'), 'second assistant label missing');
  assert((await state()).defaults.chat.model === 'deepseek-v4-pro', 'switching a conversation changed the chat default');
  ok('chat switcher is per conversation', 'then Gemini 3.8 Flash @ /gemini/v1');

  // 6) Reload keeps the connection, pins, defaults, and that conversation choice.
  const convId = (await ev('location.hash')).replace(/^#\/c\//, '');
  assert(convId && convId !== '#/', 'no conversation id');
  const originsBefore = await ev('window.__origins');
  await b.reload();
  await b.waitFor(`!!document.querySelector('#v-lib')`, 20000);
  await go('#/c/' + convId);
  await waitText('#v-home .ch-model-btn', 'Gemini 3.8 Flash');
  const after = await state();
  assert(after.connections.length === 2 && after.connections[1].key === gkey, 'connections lost after reload');
  assert(after.defaults.translation.model === 'gemini-3.8-flash', 'translation default lost after reload');
  assert(after.defaults.chat.model === 'deepseek-v4-pro', 'chat default lost after reload');
  ok('reload keeps connections, pins, defaults, conversation model');

  // 7) Export includes labels/pins/defaults and never a key.
  await ev(`(() => {
    window.__exportText = null;
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { if (blob instanceof Blob) blob.text().then(t => { window.__exportText = t; }); return orig(blob); };
  })()`);
  await go('#/profile/privacy');
  await click('#pvExp');
  await b.waitFor(`!!window.__exportText`, 10000);
  const exported = JSON.parse(await ev('window.__exportText'));
  assert(exported.ai && exported.ai.connections && exported.ai.pinned && exported.ai.defaults, 'export missing AI metadata');
  const raw = JSON.stringify(exported);
  for (const key of [dkey, gkey]) assert(!raw.includes(key), 'export leaked a key');
  for (const c of exported.ai.connections) assert(!('key' in c), 'export connection includes key');
  assert(!/"(key|apiKey)"\s*:/.test(JSON.stringify(exported.ai)), 'export AI section has a key field');
  assert(exported.ai.pinned.length === 4, 'export should carry the four pins');
  assert(exported.ai.defaults.translation.model === 'gemini-3.8-flash', 'export should carry task defaults');
  ok('export has AI metadata and no key', exported.ai.connections.length + ' connections, ' + exported.ai.pinned.length + ' pins');

  // 8) Ambiguous sk- asks DeepSeek or OpenAI before any network request.
  await go('#/profile/ai');
  const beforeFetches = fake.stats.modelFetches.length;
  await click('#aiAdd');
  await b.waitFor(`!!document.querySelector('#aiKey')`, 5000);
  await fill('#aiKey', 'sk-generic-ambiguous');
  await waitText('#aiDetect', 'DeepSeek');
  assert((await text('#aiDetect')).includes('OpenAI'), 'ambiguous key did not ask about OpenAI');
  const picks = await ev(`[...document.querySelectorAll('#aiProviderPick option')].map(o => o.value).filter(Boolean)`);
  assert(picks.join(',') === 'deepseek,openai', 'ambiguous picker should offer exactly DeepSeek and OpenAI: ' + picks.join(','));
  assert(fake.stats.modelFetches.length === beforeFetches, 'ambiguous key hit a provider before the choice');
  await click('#modalBox [data-close]');
  ok('ambiguous sk- asks DeepSeek or OpenAI', 'no network before choice');

  // 9) A failing key names its connection and offers the switcher.
  const S = await state();
  const dconn = S.connections.find(c => c.provider === 'deepseek');
  await click(`[data-ai-models="${dconn.id}"]`);
  await b.waitFor(`!!document.querySelector('#aiModelManual')`, 10000);
  await fill('#aiModelManual', 'fake-error-401');
  await click('#aiModelAddManual');
  await click('#aiModelsSave');
  await go('#/');
  await b.waitFor(`!!document.querySelector('#v-home #chIn')`, 10000);
  await click('#v-home .ch-model-btn');
  await click(`#v-home [data-pin-conn="${dconn.id}"][data-pin-model="fake-error-401"]`);
  await sendHome('اختبر مفتاحًا فاشلًا');
  await b.waitFor(`(() => { const e = document.querySelector('#v-home .msg.warn'); return !!e && e.textContent.includes('DeepSeek'); })()`, 15000);
  const failure = await text('#v-home .msg.warn');
  assert(failure.includes('مفتاح') || failure.includes('غير صالح'), 'key failure message is not plain Arabic: ' + failure);
  assert(await ev(`!!document.querySelector('#v-home .msg.warn [data-chmodel]')`), 'key failure does not offer the switcher');
  await click('#v-home .msg.warn [data-chmodel]');
  assert(await ev(`!!document.querySelector('#v-home .ch-model-menu') && !document.querySelector('#v-home .ch-model-menu').hidden`), 'switcher did not open from the error');
  ok('key failure names the connection and offers a switch', failure.slice(0, 60));

  // 10) Every request stayed on a configured provider host, never another origin.
  const origins = Array.isArray(originsBefore) ? originsBefore : [];
  assert(origins.length >= 4, 'request log is empty: ' + origins.length);
  const allowed = new Set([deepseekBase, geminiBase, fake.url].map(u => new URL(u).origin));
  const foreign = origins.filter(url => { try { return !allowed.has(new URL(url).origin); } catch (e) { return true; } });
  assert(!foreign.length, 'request left the configured origins: ' + foreign.join(', '));
  assert(!fake.stats.modelFetches.some(x => x.path.includes('openai')), 'OpenAI was probed without a choice');
  ok('no request to any unconfigured provider', origins.length + ' requests on configured bases');
} catch (e) {
  bad('ai connections suite', e);
} finally {
  await b.close();
  await fake.close();
}

for (const r of results) console.log(r.join('\t'));
const failed = results.filter(r => r[0] === 'FAIL');
console.log(failed.length ? `${failed.length} failed` : `${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
