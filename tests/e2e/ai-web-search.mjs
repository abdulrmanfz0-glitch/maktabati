#!/usr/bin/env node
// Reader-chat web search on the v2 AI connections: per-conversation toggle,
// clear search errors with a no-search retry, sources, and background streaming.
// Run against the Vite dev server:
//   node tests/e2e/ai-web-search.mjs http://127.0.0.1:5173/
import { launch } from '../../tools/lib/cdp.mjs';
import { startFakeAI } from '../../tools/fake-ai-server.mjs';

const page = process.argv[2] || 'http://127.0.0.1:5173/';
const GEMINI = 'https://generativelanguage.googleapis.com';
const BASE = GEMINI + '/v1beta/openai';
const DEEPSEEK = 'https://api.deepseek.com';
const dkey = 'sk-deepseek-web-search-e2e';
const gkey = 'AQ.fake-gemini-web-search-e2e';
const results = [];
const ok = (n, note = '') => results.push(['PASS', n, note]);
const bad = (n, e) => results.push(['FAIL', n, String(e && e.message || e).slice(0, 220)]);
const assert = (c, m) => { if (!c) throw new Error(m); };

const state = {
  v:2,
  connections:[
    { id:'c1', provider:'deepseek', base:DEEPSEEK, key:dkey, label:'DeepSeek', max:1200, ctx:64000, first:90000 },
    { id:'c2', provider:'gemini', base:BASE, key:gkey, label:'Gemini', max:4096, ctx:1000000, first:90000 }
  ],
  pinned:[
    { connectionId:'c1', model:'deepseek-flash', label:'DeepSeek Flash' },
    { connectionId:'c2', model:'gemini-3.8-flash', label:'Gemini 3.8 Flash' },
    { connectionId:'c2', model:'gemini-3.1-flash-lite', label:'Gemini 3.1 Flash Lite' }
  ],
  defaults:{ chat:{ connectionId:'c2', model:'gemini-3.8-flash' } }
};

const fake = await startFakeAI();
const b = await launch({ width:1280, height:900 });
const ev = x => b.evaluate(x);
const settle = (ms = 500) => b.sleep(ms);
const go = async h => { await ev(`location.hash = ${JSON.stringify(h)}`); await settle(900); };
const waitText = (sel, text, timeout = 20000) => b.waitFor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && e.textContent.includes(${JSON.stringify(text)}); })()`, timeout);
const waitLastAnswer = (text, timeout = 20000) => b.waitFor(`(() => { const a = [...document.querySelectorAll('#v-home .cm-a')]; const last = a[a.length - 1]; return !!last && last.textContent.includes(${JSON.stringify(text)}) && !last.querySelector('.msg.warn'); })()`, timeout);
const lastSearchError = () => ev(`(() => { const e = document.querySelector('#v-home .msg.warn'); return e ? e.textContent : ''; })()`);
const sendHome = text => ev(`(() => { const t = document.querySelector('#v-home #chIn'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('#v-home #chSend').click(); })()`);
const click = async sel => { const found = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`); assert(found, 'missing ' + sel); await settle(350); };
const choosePin = async (conn, model) => {
  await click('#v-home .ch-model-btn');
  await click(`#v-home [data-pin-conn="${conn}"][data-pin-model="${model}"]`);
};
const toggleSearch = () => click('#v-home [data-websearch]');
const systemPrompt = () => ev(`(() => { const m = window.__lastFull && window.__lastFull.messages; return m && m[0] ? String(m[0].content || '') : ''; })()`);

try {
  await b.goto(page);
  await b.waitFor(`!!document.querySelector('#v-lib')`, 20000);
  await ev(`localStorage.setItem('maktabati:ai', ${JSON.stringify(JSON.stringify(state))})`);
  await b.reload();
  await b.waitFor(`!!document.querySelector('#v-lib')`, 20000);
  await ev(`(() => {
    window.__origins = [];
    window.__warns = [];
    const map = { ${JSON.stringify(DEEPSEEK)}: ${JSON.stringify(fake.url + '/deepseek/v1')}, ${JSON.stringify(BASE)}: ${JSON.stringify(fake.url + '/gemini/v1')} };
    const target = ${JSON.stringify(fake.url)};
    const origin = ${JSON.stringify(GEMINI)};
    const orig = window.fetch.bind(window);
    window.fetch = (input, init) => {
      let url = typeof input === 'string' ? input : (input && input.url);
      if (url) {
        window.__origins.push(url);
        let mapped = false;
        for (const from of Object.keys(map)) if (url.startsWith(from)) { url = map[from] + url.slice(from.length); mapped = true; break; }
        if (!mapped && url.startsWith(origin)) url = target + url.slice(origin.length);
        if (url.includes('/chat/completions')) {
          const body = init && init.body ? JSON.parse(init.body) : null;
          if (body) window.__lastFull = body;
        }
      }
      return orig(url, init);
    };
    const warn = console.warn.bind(console);
    console.warn = (...args) => { window.__warns.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')); warn(...args); };
  })()`);
  await go('#/');
  await b.waitFor(`!!document.querySelector('#v-home #chIn')`, 10000);

  // 1) Gemini shows the toggle; a DeepSeek conversation hides it.
  assert(await ev(`!!document.querySelector('#v-home [data-websearch]')`), 'search toggle missing for Gemini');
  assert((await ev(`document.querySelector('#v-home [data-websearch]').getAttribute('aria-pressed')`)) === 'false', 'search toggle should start off');
  await choosePin('c1', 'deepseek-flash');
  assert(!(await ev(`!!document.querySelector('#v-home [data-websearch]')`)), 'search toggle visible for DeepSeek');
  await sendHome('مرحبا من ديب سيك');
  await waitLastAnswer('تم');
  assert(fake.stats.last.path === '/deepseek/v1/chat/completions', 'DeepSeek conversation used the wrong path: ' + fake.stats.last.path);
  assert(fake.stats.searchRequests === 0, 'DeepSeek request attempted a Gemini search');

  await choosePin('c2', 'gemini-3.8-flash');
  assert(await ev(`!!document.querySelector('#v-home [data-websearch]')`), 'search toggle missing after switching back to Gemini');
  assert((await ev(`document.querySelector('#v-home [data-websearch]').getAttribute('aria-pressed')`)) === 'false', 'search became on without the user');
  ok('toggle visibility follows the conversation model', 'DeepSeek hidden, Gemini visible');

  // 2) Enabling shows the one-time cost note, then chat sends native googleSearch.
  await toggleSearch();
  assert((await ev(`document.querySelector('#v-home [data-websearch]').getAttribute('aria-pressed')`)) === 'true', 'search did not turn on');
  const toast = await ev(`document.querySelector('#toast').textContent`);
  assert(toast.includes('قد يكلّف'), 'cost note missing: ' + toast);
  assert(!/\d/.test(toast), 'cost note contains numbers: ' + toast);
  await sendHome('من هو مؤلف هذا الكتاب؟');
  await waitText('#v-home', 'وصلت المعلومة من الويب.');
  await b.waitFor(`!!document.querySelector('#v-home .cm-web')`, 10000);
  const search = fake.stats.lastSearch;
  assert(search && search.model === 'gemini-3.8-flash', 'native search request did not arrive');
  assert(search.apiKeyHeader && !search.authHeader && !search.queryKey, 'native credential shape is wrong');
  assert(Array.isArray(search.tools) && search.tools[0] && search.tools[0].googleSearch, 'googleSearch tool missing');
  assert(!search.tools[0].google_search, 'search used the SDK name instead of the REST field');
  assert(search.system.includes('ابحث متى ما احتجت معلومة حديثة'), 'search instruction missing');
  assert(search.system.includes('جاوبه طبيعي وكامل'), 'general-request allowance missing');
  assert(!search.system.includes('ما أقدر أبحث في الإنترنت'), 'no-internet line was not replaced');
  const links = await ev(`[...document.querySelectorAll('#v-home .cm-web .cm-src a')].map(a => ({ href:a.href, target:a.target, rel:a.rel, text:a.textContent }))`);
  assert(links.length === 2, 'expected two sources, got ' + links.length);
  assert(links[0].target === '_blank' && /noopener/.test(links[0].rel) && /noreferrer/.test(links[0].rel), 'source link is not safe');
  assert(links.some(l => l.text.includes('example.com')), 'domain is not shown');
  assert((await ev(`document.querySelectorAll('#v-home .cm-a p a').length`)) === 0, 'an inline link was rendered in the answer');
  ok('native search and sources', 'googleSearch, two safe sources, no inline links');

  // 3) Switching the conversation model updates the toggle without changing the request route.
  await choosePin('c1', 'deepseek-flash');
  assert(!(await ev(`!!document.querySelector('#v-home [data-websearch]')`)), 'toggle stayed visible after switching to DeepSeek');
  await choosePin('c2', 'gemini-3.1-flash-lite');
  assert(await ev(`!!document.querySelector('#v-home [data-websearch]')`), 'toggle missing on another search-capable Gemini model');
  ok('toggle follows mid-chat model switches', 'hidden on DeepSeek, visible on Gemini 3.1');
  await choosePin('c2', 'gemini-3.8-flash');

  // 4) Free-tier grounding error: paid-key copy + send-without-search retry.
  fake.control.searchGroundingBlocked = true;
  const beforeGrounding = fake.stats.searchRequests;
  await sendHome('سؤال يحتاج بحثًا مدفوعًا');
  await waitText('#v-home', 'مفتاح Gemini مدفوع');
  assert((await lastSearchError()).includes('أرسل بدون بحث'), 'grounding error has no no-search action');
  await ev(`(() => { window.__lastFull = null; document.querySelector('#v-home [data-nosearch]').click(); })()`);
  await waitLastAnswer('تم');
  assert(fake.stats.searchRequests === beforeGrounding + 1, 'no-search retry made another search request');
  const plainSystem = await systemPrompt();
  assert(plainSystem && !plainSystem.includes('ما أقدر أبحث في الإنترنت') && !plainSystem.includes('ابحث متى'), 'no-search retry prompt still talks about the web');
  fake.control.searchGroundingBlocked = false;
  ok('grounding error and retry', 'paid-key copy + send without search');

  // 5) Rate limit with RetryInfo wait.
  fake.control.search429Once = true;
  await sendHome('سؤال سريع');
  await waitText('#v-home', 'حد الطلبات');
  const rateError = await lastSearchError();
  assert(rateError.includes('7'), 'rate-limit error did not show the wait time: ' + rateError);
  await click('#v-home [data-nosearch]');
  await waitLastAnswer('تم');
  ok('rate-limit error', 'wait time + retry works');

  // 6) Quota exhausted.
  fake.control.searchQuota = true;
  await sendHome('سؤال آخر');
  await waitText('#v-home', 'حصة بحث Gemini');
  await click('#v-home [data-nosearch]');
  await waitLastAnswer('تم');
  fake.control.searchQuota = false;
  ok('quota error', 'plain quota copy + retry works');

  // 7) A successful 200 without grounding metadata is not an error.
  fake.control.searchNoGrounding = true;
  await sendHome('سؤال بلا استشهادات');
  await waitText('#v-home', 'تم بلا مصادر');
  await b.waitFor(`(() => { const a = [...document.querySelectorAll('#v-home .cm-a')]; const last = a[a.length - 1]; return !!last && !last.querySelector('.cm-web') && !last.textContent.includes('تعذّر'); })()`, 15000);
  fake.control.searchNoGrounding = false;
  ok('missing grounding metadata', 'plain answer, no search error');

  // 8) Search streaming continues after the chat view closes (#7).
  fake.control.searchSlow = true;
  await sendHome('رد بحث يكمل في الخلفية');
  await waitText('#v-home', 'وصلت');
  const convId = (await ev('location.hash')).replace(/^#\/c\//, '');
  assert(convId && convId !== '#/', 'no conversation id');
  await go('#/lib');
  await settle(2500);
  await go('#/c/' + convId);
  await waitText('#v-home', 'وصلت المعلومة من الويب.');
  await b.waitFor(`!!document.querySelector('#v-home .cm-web .cm-src a')`, 10000);
  fake.control.searchSlow = false;
  ok('search keeps streaming after the view closes', 'full reply and sources after reopen');

  // 9) The [gemini-search] warning is present, includes the error kind, and never the key.
  const warns = await ev('window.__warns');
  assert(warns.some(w => w.includes('[gemini-search]') && w.includes('grounding')), 'grounding failure was not logged');
  assert(warns.some(w => w.includes('[gemini-search]') && w.includes('rate-limit')), 'rate failure was not logged');
  assert(warns.some(w => w.includes('[gemini-search]') && w.includes('quota')), 'quota failure was not logged');
  assert(!warns.join('\n').includes(gkey), 'key leaked to the console');
  ok('search diagnostics', 'status/kind warns, key never logged');

  // 10) Nothing left the configured connection origins.
  const origins = await ev('window.__origins');
  const allowed = new Set([DEEPSEEK, BASE, GEMINI, fake.url].map(u => new URL(u).origin));
  const foreign = origins.filter(url => { try { return !allowed.has(new URL(url).origin); } catch (e) { return true; } });
  assert(origins.length > 0 && !foreign.length, 'request left the configured origins: ' + foreign.join(', '));
  ok('no unconfigured provider requests', origins.length + ' requests on configured origins');
} catch (e) {
  bad('web search suite', e);
} finally {
  fake.control.searchSlow = false;
  fake.control.searchGroundingBlocked = false;
  fake.control.searchQuota = false;
  fake.control.search429Once = false;
  fake.control.searchNoGrounding = false;
  await b.close();
  await fake.close();
}

for (const r of results) console.log(r.join('\t'));
const failed = results.filter(r => r[0] === 'FAIL');
console.log(failed.length ? `${failed.length} failed` : `${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
