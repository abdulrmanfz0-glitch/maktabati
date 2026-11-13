#!/usr/bin/env node
// Multiple-connection provider detection e2e against a fake OpenAI-compatible server.
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
const waitText = (sel, text, timeout = 15000) => b.waitFor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && e.textContent.includes(${JSON.stringify(text)}); })()`, timeout);
const count = sel => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const text = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent : ''; })()`);
const click = async sel => { const found = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`); assert(found, 'missing ' + sel); await settle(350); };
const fill = (sel, value) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles:true })); return true; })()`);
const choose = (sel, value) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles:true })); return true; })()`);
const state = () => ev(`JSON.parse(localStorage.getItem('maktabati:ai') || '{}')`);
const sendHome = async text => {
  await ev(`(() => { const t = document.querySelector('#v-home #chIn'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('#v-home #chSend').click(); })()`);
};
const waitAnswer = (n = 1, timeout = 15000) => b.waitFor(`(() => { const e = document.querySelectorAll('#v-home .cm-a'); const last = e[e.length - 1]; return e.length >= ${n} && !!last && last.textContent.includes('تم'); })()`, timeout);
const mapFor = sandbox => ev(`window.__aiTestMap = ${JSON.stringify(sandbox)}`);

const sandbox = {
  'https://api.deepseek.com': fake.url + '/deepseek/v1',
  'https://generativelanguage.googleapis.com/v1beta/openai': fake.url + '/gemini/v1',
  'https://api.anthropic.com/v1': fake.url + '/anthropic/v1',
  'https://openrouter.ai/api/v1': fake.url + '/openrouter/v1',
  'https://api.groq.com/openai/v1': fake.url + '/groq/v1',
  'https://api.openai.com/v1': fake.url + '/openai/v1'
};

async function addConnection({ key, provider, base, model }) {
  const before = await count('.ai-conn');
  await click('#aiAdd');
  await b.waitFor(`!!document.querySelector('#aiKey')`, 5000);
  await fill('#aiKey', key);
  await settle(300);
  if (provider) await choose('#aiProviderPick', provider);
  if (base){
    await ev(`document.querySelector('#aiAdvBox').open = true`);
    await settle(200);
    await fill('#aiBase', base);
    await fill('#aiModel', model);
  }
  await click('#aiDoAdd');
  await b.waitFor(`document.querySelectorAll('.ai-conn').length === ${before + 1}`, 20000);
}
async function setChatDefault(connectionId, model) {
  await go('#/profile/ai');
  const ok = await choose('[data-ai-default="chat"]', connectionId + '|' + model);
  assert(ok, 'chat default select missing');
  await b.waitFor(`JSON.parse(localStorage.getItem('maktabati:ai')).defaults.chat.model === ${JSON.stringify(model)}`, 5000);
}

try {
  await b.goto(page);
  await b.waitFor(`!!document.querySelector('#v-lib')`, 20000);
  await mapFor(sandbox);
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
  await b.waitFor(`!!document.querySelector('#aiAdd')`, 10000);

  // 1) AQ. Gemini key detects Gemini, pins the default model, and applies limits.
  await addConnection({ key:'AQ.AbE2EKey' });
  let s = await state();
  const gem = s.connections[0];
  assert(gem.provider === 'gemini' && gem.base === 'https://generativelanguage.googleapis.com/v1beta/openai', 'Gemini base not saved');
  assert(gem.max === 4096 && gem.ctx === 1000000, 'Gemini limits not applied');
  assert(s.pinned[0].model === 'gemini-3.1-flash-lite', 'Gemini default model not pinned');
  assert(fake.stats.modelFetches.some(x => x.path === '/gemini/v1/models'), 'Gemini /models not called');
  await setChatDefault(gem.id, 'gemini-3.1-flash-lite');
  await go('#/'); await b.waitFor(`!!document.querySelector('#v-home #chIn')`, 10000);
  await sendHome('مرحبا'); await waitAnswer();
  assert(fake.stats.last.model === 'gemini-3.1-flash-lite', 'chat used the wrong Gemini model');
  assert(fake.stats.last.reasoning_effort === 'low', 'Gemini reasoning_effort missing');
  ok('AQ. Gemini key detected and used', gem.id + ' · limits 4096');

  // 2) A generic sk- key asks DeepSeek or OpenAI; choosing OpenAI verifies only OpenAI.
  const beforeAmbiguous = fake.stats.modelFetches.length;
  await click('#aiAdd');
  await b.waitFor(`!!document.querySelector('#aiKey')`, 5000);
  await fill('#aiKey', 'sk-generic-e2e');
  await waitText('#aiDetect', 'OpenAI');
  assert((await text('#aiDetect')).includes('DeepSeek'), 'ambiguous key does not mention DeepSeek');
  const picks = await ev(`[...document.querySelectorAll('#aiProviderPick option')].map(o => o.value).filter(Boolean)`);
  assert(picks.join(',') === 'deepseek,openai', 'picker should be exactly DeepSeek and OpenAI: ' + picks.join(','));
  assert(fake.stats.modelFetches.length === beforeAmbiguous, 'ambiguous key hit a provider before the choice');
  await choose('#aiProviderPick', 'openai');
  await click('#aiDoAdd');
  await b.waitFor(`document.querySelectorAll('.ai-conn').length === 2`, 20000);
  const probe = fake.stats.modelFetches.slice(beforeAmbiguous).map(x => x.path);
  assert(probe.length === 1 && probe[0] === '/openai/v1/models', 'choice sent the key somewhere else: ' + probe.join(' -> '));
  s = await state();
  const oa = s.connections.find(c => c.provider === 'openai');
  assert(oa && s.pinned.some(p => p.connectionId === oa.id && p.model === 'gpt-4o-mini'), 'OpenAI default not pinned');
  ok('ambiguous sk- asks, OpenAI verified only', probe.join(' -> '));

  // 3) Claude detection uses /models with x-api-key, then chat uses Bearer + browser header.
  await addConnection({ key:'sk-ant-e2e' });
  s = await state();
  const claude = s.connections.find(c => c.provider === 'anthropic');
  assert(claude && claude.base === 'https://api.anthropic.com/v1', 'Claude base not saved');
  assert(s.pinned.some(p => p.connectionId === claude.id && p.model === 'claude-haiku-5-5'), 'Claude Haiku not pinned');
  const claudeFetch = fake.stats.modelFetches.filter(x => x.path === '/anthropic/v1/models').at(-1);
  assert(claudeFetch && claudeFetch.xApiKey && !claudeFetch.hasAuth, 'Claude /models auth headers wrong');
  assert(claudeFetch.anthropicVersion === '2023-06-01' && claudeFetch.anthropicBrowser === 'true', 'Claude /models headers incomplete');
  await setChatDefault(claude.id, 'claude-haiku-5-5');
  await go('#/'); await b.waitFor(`!!document.querySelector('#v-home #chIn')`, 10000);
  await sendHome('مرحبا'); await waitAnswer();
  const chat = fake.stats.last;
  assert(chat.model === 'claude-haiku-5-5', 'Claude chat used the wrong model');
  assert(chat.hasAuth && !chat.xApiKey, 'Claude chat must use Bearer, not x-api-key');
  assert(chat.anthropicBrowser === 'true' && chat.anthropicVersion === null, 'Claude chat headers wrong');
  assert(chat.thinking === null && chat.reasoning_effort === null, 'Claude chat got thinking options');
  ok('sk-ant- key detects Claude', 'Haiku pinned, Bearer + browser access');

  // 4) An unknown prefix shows every provider plus custom, and sends nothing.
  const beforeUnknown = fake.stats.modelFetches.length;
  await click('#aiAdd');
  await b.waitFor(`!!document.querySelector('#aiKey')`, 5000);
  await fill('#aiKey', 'totally-unknown-key');
  await b.waitFor(`!!document.querySelector('#aiProviderPick')`, 12000);
  const choices = await ev(`[...document.querySelectorAll('#aiProviderPick option')].map(o => o.textContent).join('|')`);
  for (const name of ['DeepSeek', 'Gemini', 'Claude', 'OpenRouter', 'Groq', 'OpenAI', 'آخر / مخصّص']) assert(choices.includes(name), 'picker missing ' + name);
  assert(fake.stats.modelFetches.length === beforeUnknown, 'unknown key was sent to a provider');
  ok('unknown key shows the provider picker', 'no network, no guessing');

  // 5) Picking Groq verifies only Groq, then adds it.
  await choose('#aiProviderPick', 'groq');
  await click('#aiDoAdd');
  await b.waitFor(`document.querySelectorAll('.ai-conn').length === 4`, 20000);
  const groqPaths = fake.stats.modelFetches.slice(beforeUnknown).map(x => x.path);
  assert(groqPaths.length === 1 && groqPaths[0] === '/groq/v1/models', 'picker sent the key elsewhere: ' + groqPaths.join(' -> '));
  s = await state();
  const groq = s.connections.find(c => c.provider === 'groq');
  assert(groq && s.pinned.some(p => p.connectionId === groq.id && p.model === 'llama-3.3-70b-versatile'), 'Groq default not pinned');
  ok('picked provider is verified and added', 'Groq only');

  // 6) A /models 404 falls back to the provider default instead of blocking the add.
  await mapFor(Object.assign({}, sandbox, { 'https://api.groq.com/openai/v1': fake.url + '/broken/v1' }));
  await addConnection({ key:'gsk_broken_e2e' });
  s = await state();
  const broken = s.connections.filter(c => c.provider === 'groq').at(-1);
  assert(broken && s.pinned.some(p => p.connectionId === broken.id && p.model === 'llama-3.3-70b-versatile'), '404 fallback did not pin the provider default');
  ok('failed /models falls back to the provider default', 'Groq');

  // 7) A custom endpoint is added and survives reload.
  await mapFor(sandbox);
  await addConnection({ key:'custom-e2e-key', provider:'custom', base:fake.url + '/v1', model:'fake-chat' });
  s = await state();
  const custom = s.connections.find(c => c.provider === 'custom');
  assert(custom && custom.base === fake.url + '/v1' && s.pinned.some(p => p.connectionId === custom.id && p.model === 'fake-chat'), 'custom endpoint not saved');
  await setChatDefault(custom.id, 'fake-chat');
  await go('#/'); await b.waitFor(`!!document.querySelector('#v-home #chIn')`, 10000);
  await sendHome('مرحبا'); await waitAnswer();
  assert(fake.stats.last.path === '/v1/chat/completions' && fake.stats.last.model === 'fake-chat', 'custom chat went elsewhere');
  await b.reload();
  await b.waitFor(`!!document.querySelector('#v-lib')`, 20000);
  s = await state();
  assert(s.connections.some(c => c.provider === 'custom' && c.base === fake.url + '/v1'), 'custom endpoint lost after reload');
  await go('#/profile/ai');
  await b.waitFor(`document.querySelectorAll('.ai-conn').length === 6`, 10000);
  ok('custom endpoint survives reload', 'base + pinned model kept');
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
