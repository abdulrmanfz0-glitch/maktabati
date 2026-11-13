#!/usr/bin/env node
// Automatic web search in reader chat: DeepSeek server tools, Gemini auto/manual
// modes, live search status, sources, errors, and the master setting.
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
    { id:'c1', provider:'deepseek', base:DEEPSEEK, key:dkey, label:'DeepSeek', max:4096, ctx:64000, first:90000 },
    { id:'c2', provider:'gemini', base:BASE, key:gkey, label:'Gemini', max:4096, ctx:1000000, first:90000 }
  ],
  pinned:[
    { connectionId:'c1', model:'deepseek-flash', label:'DeepSeek Flash' },
    { connectionId:'c1', model:'deepseek-v4-pro', label:'DeepSeek V4 Pro' },
    { connectionId:'c2', model:'gemini-3.8-flash', label:'Gemini 3.8 Flash' },
    { connectionId:'c2', model:'gemini-2.5-flash', label:'Gemini 2.5 Flash' },
    { connectionId:'c2', model:'gemini-3.1-flash-lite', label:'Gemini 3.1 Flash Lite' }
  ],
  defaults:{ chat:{ connectionId:'c1', model:'deepseek-flash' } }
};
const profile = { ai:{ autoSearch:true, searchNoteSeen:false } };

const fake = await startFakeAI();
const b = await launch({ width:1280, height:900 });
const ev = x => b.evaluate(x);
const settle = (ms = 500) => b.sleep(ms);
const go = async h => { await ev(`location.hash = ${JSON.stringify(h)}`); await settle(900); };
const waitText = (sel, text, timeout = 20000) => b.waitFor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && e.textContent.includes(${JSON.stringify(text)}); })()`, timeout);
const lastAnswer = () => ev(`(() => { const a = [...document.querySelectorAll('#v-home .cm-a')]; const l = a[a.length - 1]; return l ? l.textContent : ''; })()`);
const waitLastAnswer = (text, timeout = 25000) => b.waitFor(`(() => { const a = [...document.querySelectorAll('#v-home .cm-a')]; const l = a[a.length - 1]; return !!l && l.textContent.includes(${JSON.stringify(text)}) && !l.querySelector('.msg.warn'); })()`, timeout);
const lastLinks = () => ev(`(() => { const a = [...document.querySelectorAll('#v-home .cm-a')]; const l = a[a.length - 1]; return l ? [...l.querySelectorAll('.cm-web .cm-src a')].map(x => ({ href:x.href, target:x.target, rel:x.rel, text:x.textContent })) : []; })()`);
const lastError = () => ev(`(() => { const e = document.querySelector('#v-home .msg.warn'); return e ? e.textContent : ''; })()`);
const sendHome = text => ev(`(() => { const t = document.querySelector('#v-home #chIn'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('#v-home #chSend').click(); })()`);
const assistantCount = () => ev(`document.querySelectorAll('#v-home .cm-a').length`);
const sendAndWait = async (text, expected, timeout = 25000) => {
  const before = await assistantCount();
  await sendHome(text);
  await b.waitFor(`document.querySelectorAll('#v-home .cm-a').length > ${before}`, 8000);
  if (expected) await b.waitFor(`(() => { const a = [...document.querySelectorAll('#v-home .cm-a')]; const l = a[a.length - 1]; return !!l && l.textContent.includes(${JSON.stringify(expected)}); })()`, timeout);
};
const clickAndWait = async (sel, expected, timeout = 25000) => {
  await click(sel);
  await b.waitFor(`(() => { const a = [...document.querySelectorAll('#v-home .cm-a')]; const l = a[a.length - 1]; return !!l && l.textContent.includes(${JSON.stringify(expected)}) && !l.querySelector('.msg.warn'); })()`, timeout);
};
const click = async sel => { const found = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`); assert(found, 'missing ' + sel); await settle(350); };
const choosePin = async (conn, model) => {
  await click('#v-home .ch-model-btn');
  await click(`#v-home [data-pin-conn="${conn}"][data-pin-model="${model}"]`);
};
const toggleSearch = () => click('#v-home [data-websearch]');
const searchPressed = () => ev(`(() => { const e = document.querySelector('#v-home [data-websearch]'); return e ? e.getAttribute('aria-pressed') : null; })()`);
const goSettings = async () => { await go('#/profile/ai'); await b.waitFor(`!!document.querySelector('[data-tg="ai.autoSearch"]')`, 10000); };
const autoSearchOn = () => ev(`document.querySelector('[data-tg="ai.autoSearch"]').getAttribute('aria-checked')`);
const toggleAutoSearch = () => click('[data-tg="ai.autoSearch"]');
const waitStatus = () => b.waitFor(`(() => { const a = [...document.querySelectorAll('#v-home .cm-a')]; const l = a[a.length - 1]; return !!l && !!l.querySelector('.cm-search-live') && l.textContent.includes('يبحث'); })()`, 15000);
const waitToast = text => b.waitFor(`(() => { const e = document.querySelector('#toast'); return e.classList.contains('show') && e.textContent.includes(${JSON.stringify(text)}); })()`, 10000);
const toastVisible = () => ev(`(() => { const e = document.querySelector('#toast'); return !!e && e.classList.contains('show'); })()`);
const profileState = () => ev(`JSON.parse(localStorage.getItem('maktabati:profile') || '{}')`);

try {
  await b.goto(page);
  await b.waitFor(`!!document.querySelector('#v-lib')`, 20000);
  await ev(`localStorage.setItem('maktabati:ai', ${JSON.stringify(JSON.stringify(state))})`);
  await ev(`localStorage.setItem('maktabati:profile', ${JSON.stringify(JSON.stringify(profile))})`);
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

  // 1) DeepSeek auto search: live status, sources, server_tool_calls, cost note.
  assert(!(await ev(`!!document.querySelector('#v-home [data-websearch]')`)), 'DeepSeek auto mode should not show a manual toggle');
  fake.control.deepseekSlow = true;
  const beforeFirst = await assistantCount();
  await sendHome('من مؤلف الكتاب؟');
  await b.waitFor(`document.querySelectorAll('#v-home .cm-a').length > ${beforeFirst}`, 8000);
  await waitStatus();
  await b.waitFor(`(() => { const a = [...document.querySelectorAll('#v-home .cm-a')]; const l = a[a.length - 1]; return !!l && l.textContent.includes('من الويب.'); })()`, 25000);
  await b.waitFor(`!!document.querySelector('#v-home .cm-web .cm-src a')`, 10000);
  const dsBody = fake.stats.lastFull;
  assert(Array.isArray(dsBody.tools) && dsBody.tools.length === 1 && dsBody.tools[0].type === 'deepseek_web_search', 'DeepSeek did not receive deepseek_web_search');
  assert(dsBody.title === undefined && dsBody.tool_choice === undefined, 'DeepSeek search sent title or tool_choice');
  assert(dsBody.thinking && dsBody.thinking.type === 'disabled', 'DeepSeek thinking setting changed');
  const dsLinks = await lastLinks();
  assert(dsLinks.length === 1 && dsLinks[0].text.includes('example.com'), 'DeepSeek sources missing');
  await waitToast('مزوّدك');
  assert((await profileState()).ai.searchNoteSeen === true, 'cost note was not marked seen');
  fake.control.deepseekSlow = false;
  ok('DeepSeek auto search', 'status + sources + server tool, no title/tool_choice');

  // 1b) The next turn passes the previous server_tool_calls back unchanged.
  await sendAndWait('ومن هو؟', 'من الويب.');
  const withCalls = fake.stats.lastFull.messages.some(m => m.role === 'assistant' && Array.isArray(m.server_tool_calls) && m.server_tool_calls[0] && m.server_tool_calls[0].calls[0].id === 'srvtoolu_fake');
  assert(withCalls, 'server_tool_calls were not passed back');
  ok('DeepSeek multi-turn', 'previous server_tool_calls passed back');

  // 1c) A model no-search answer shows no sources and repeats no cost note.
  await b.waitFor(`!document.querySelector('#toast').classList.contains('show')`, 8000);
  fake.control.deepseekSkipOnce = true;
  await sendAndWait('سؤال عادي', 'تم');
  assert((await lastLinks()).length === 0, 'no-search answer rendered sources');
  assert(!(await toastVisible()), 'cost note repeated on a later answer');
  ok('DeepSeek no-search answer', 'no sources, no repeated cost note');

  // 2) Master setting off: no tool and no manual toggle.
  await goSettings();
  assert((await autoSearchOn()) === 'true', 'automatic search should default on');
  await toggleAutoSearch();
  assert((await autoSearchOn()) === 'false', 'automatic search did not turn off');
  await go('#/');
  await b.waitFor(`!!document.querySelector('#v-home #chIn')`, 10000);
  await sendAndWait('سؤال بلا أدوات', 'تم');
  assert(!fake.stats.last.tools, 'setting off still sent a search tool');
  await choosePin('c2', 'gemini-3.8-flash');
  const beforeOffGemini = fake.stats.searchRequests;
  await sendAndWait('سؤال Gemini بدون أدوات', 'تم');
  assert(fake.stats.searchRequests === beforeOffGemini, 'setting off still used Gemini native search');
  assert(!(await ev(`!!document.querySelector('#v-home [data-websearch]')`)), 'manual toggle visible while master off');
  await choosePin('c2', 'gemini-2.5-flash');
  assert(!(await ev(`!!document.querySelector('#v-home [data-websearch]')`)), 'manual toggle visible for Gemini 2.5 while master off');
  const beforeOff25 = fake.stats.searchRequests;
  await sendAndWait('سؤال 2.5 بلا أدوات', 'تم');
  assert(fake.stats.searchRequests === beforeOff25, 'setting off still attached manual search');
  await goSettings(); await toggleAutoSearch();
  assert((await autoSearchOn()) === 'true', 'automatic search did not turn back on');
  await go('#/');
  ok('automatic search setting', 'off sends no tool, hides manual toggle');

  // 3) Gemini 3 auto: no toggle, googleSearch attached automatically.
  await choosePin('c2', 'gemini-3.8-flash');
  assert(!(await ev(`!!document.querySelector('#v-home [data-websearch]')`)), 'Gemini 3 auto should not show a toggle');
  const beforeG3 = fake.stats.searchRequests;
  await sendAndWait('من هو مؤلف الكتاب؟', 'من الويب.');
  assert(fake.stats.searchRequests === beforeG3 + 1, 'Gemini 3 did not auto-search');
  assert(fake.stats.lastSearch.tools[0].googleSearch, 'Gemini 3 search tool missing');
  assert((await lastLinks()).length === 2, 'Gemini sources missing');
  ok('Gemini 3 auto', 'googleSearch without a toggle');

  // 3b) Inline markers: DeepSeek annotations and Gemini groundingSupports.
  fake.control.deepseekMixed = true;
  await choosePin('c1', 'deepseek-flash');
  await sendAndWait('سؤال استشهادات مختلط', 'Pantheon Books');
  const dsMarkers = await ev(`(() => { const a = [...document.querySelectorAll('#v-home .cm-a')]; const l = a[a.length - 1]; return { text:l.textContent, links:[...l.querySelectorAll('sup.cite a')].map(x => ({ href:x.getAttribute('href'), rel:x.getAttribute('rel'), target:x.getAttribute('target'), n:x.textContent })), src:[...l.querySelectorAll('.cm-src a')].map(x => ({ href:x.getAttribute('href'), text:x.textContent })) }; })()`);
  assert(dsMarkers.text.includes('Pantheon Books،') && !dsMarkers.text.includes('Books ،'), 'DeepSeek stray space before punctuation not cleaned');
  assert(dsMarkers.links.length === 2, 'DeepSeek markers missing');
  assert(dsMarkers.links[0].href.startsWith('https://example.com/one') && dsMarkers.links[0].rel.includes('noopener') && dsMarkers.links[0].target === '_blank', 'DeepSeek marker link unsafe');
  assert(dsMarkers.src.length === 2, 'DeepSeek source list missing');
  assert(dsMarkers.src.some(x => x.text.includes('中信')) && dsMarkers.src.some(x => x.text.includes('筑摩')), 'foreign-language sources not listed');
  fake.control.deepseekMixed = false;
  ok('DeepSeek inline markers', '2 markers, cleaned punctuation, links match');

  fake.control.geminiArabic = true;
  await choosePin('c2', 'gemini-3.8-flash');
  await sendAndWait('سؤال استشهادات Gemini', 'Penguin');
  const gmMarkers = await ev(`(() => { const a = [...document.querySelectorAll('#v-home .cm-a')]; const l = a[a.length - 1]; return { text:l.textContent, links:[...l.querySelectorAll('sup.cite a')].map(x => ({ href:x.getAttribute('href'), n:x.textContent })) }; })()`);
  assert(gmMarkers.links.length === 2, 'Gemini markers missing');
  assert(gmMarkers.text.includes('أندي كلارك،') && !gmMarkers.text.includes('كلارك ،'), 'Gemini stray space before punctuation not cleaned');
  assert(gmMarkers.links[0].href.startsWith('https://example.com/one'), 'Gemini marker link wrong');
  fake.control.geminiArabic = false;
  ok('Gemini inline markers', 'byte indices converted, punctuation cleaned');

  // 4) Gemini 2.5 manual: toggle appears only here and controls the tool.
  await choosePin('c2', 'gemini-2.5-flash');
  assert(await ev(`!!document.querySelector('#v-home [data-websearch]')`), 'Gemini 2.5 manual toggle missing');
  assert((await searchPressed()) === 'false', 'manual toggle should start off');
  const beforeG25Off = fake.stats.searchRequests;
  await sendAndWait('سؤال Gemini 2.5 بدون بحث', 'تم');
  assert(fake.stats.searchRequests === beforeG25Off, 'manual off still searched');
  assert(fake.stats.last.path === '/gemini/v1/chat/completions', 'manual off used the native path');
  await toggleSearch();
  assert((await searchPressed()) === 'true', 'manual search did not turn on');
  await sendAndWait('سؤال Gemini 2.5 مع البحث', 'من الويب.');
  assert(fake.stats.lastSearch.model === 'gemini-2.5-flash', 'Gemini 2.5 manual search used the wrong model');
  await choosePin('c2', 'gemini-3.8-flash');
  assert(!(await ev(`!!document.querySelector('#v-home [data-websearch]')`)), 'toggle stayed visible on Gemini 3 auto');
  await choosePin('c2', 'gemini-2.5-flash');
  assert(await ev(`!!document.querySelector('#v-home [data-websearch]')`), 'manual toggle missing after switching back');
  ok('Gemini 2.5 manual', 'toggle only for per-prompt models, off -> chat, on -> native');

  // 5) A slow DeepSeek search keeps streaming after the view closes.
  await choosePin('c1', 'deepseek-flash');
  fake.control.deepseekSlow = true;
  const beforeBg = await assistantCount();
  await sendHome('رد بحث يكمل في الخلفية');
  await b.waitFor(`document.querySelectorAll('#v-home .cm-a').length > ${beforeBg}`, 8000);
  await waitText('#v-home', 'وصلت');
  const convId = (await ev('location.hash')).replace(/^#\/c\//, '');
  assert(convId && convId !== '#/', 'no conversation id');
  await go('#/lib');
  await settle(2500);
  await go('#/c/' + convId);
  await b.waitFor(`(() => { const a = [...document.querySelectorAll('#v-home .cm-a')]; const l = a[a.length - 1]; return !!l && l.textContent.includes('من الويب.') && !!l.querySelector('.cm-web .cm-src a'); })()`, 20000);
  fake.control.deepseekSlow = false;
  ok('DeepSeek background search', 'status/reply/sources after reopen');

  // 6) DeepSeek search errors: 402, 429 with wait, and a mid-stream error.
  await choosePin('c1', 'deepseek-flash');
  fake.control.deepseek402 = true;
  await sendAndWait('سؤال برصيد ناقص', 'رصيد DeepSeek ما يكفي');
  assert((await lastError()).includes('أرسل بدون بحث'), '402 has no no-search action');
  await clickAndWait('#v-home [data-nosearch]', 'تم');
  assert(!fake.stats.last.tools, '402 retry still sent the search tool');
  fake.control.deepseek402 = false;
  ok('DeepSeek 402', 'balance copy + send without search');

  fake.control.deepseek429 = true;
  await sendAndWait('سؤال سريع', 'حد الطلبات');
  const rateCopy = await lastError();
  assert(rateCopy.includes('5 ثوانٍ'), '429 wait did not use Arabic count: ' + rateCopy);
  await clickAndWait('#v-home [data-nosearch]', 'تم');
  fake.control.deepseek429 = false;
  ok('DeepSeek 429', 'wait time + no-search retry');

  fake.control.deepseekMidError = true;
  await sendAndWait('سؤال ينقطع', 'تعذّر البحث في DeepSeek');
  await clickAndWait('#v-home [data-nosearch]', 'تم');
  fake.control.deepseekMidError = false;
  ok('DeepSeek mid-stream error', 'clear error + no-search retry');

  // 5b) A tool-related 400 retries once without the tool and is remembered.
  fake.control.deepseekTool400 = true;
  const beforeTool400 = fake.stats.requests;
  await sendAndWait('سؤال أدوات غير مدعومة', 'تم');
  assert(fake.stats.requests === beforeTool400 + 2, 'DeepSeek tool 400 did not retry exactly once');
  assert(!fake.stats.last.tools, 'DeepSeek tool 400 retry still sent the tool');
  assert((await lastLinks()).length === 0, 'DeepSeek tool 400 rendered sources');
  fake.control.deepseekTool400 = false;
  await sendAndWait('سؤال بعد الحفظ', 'تم');
  assert(!fake.stats.last.tools, 'DeepSeek unsupported model was not remembered');
  ok('DeepSeek tool 400', 'one no-tool retry + session memory');

  // 6) Gemini paid-key error stays.
  await choosePin('c2', 'gemini-3.8-flash');
  fake.control.searchGroundingBlocked = true;
  await sendAndWait('سؤال مدفوع', 'مفتاح Gemini مدفوع');
  await clickAndWait('#v-home [data-nosearch]', 'تم');
  fake.control.searchGroundingBlocked = false;
  ok('Gemini grounding error', 'paid-key copy + no-search retry');

  // 6b) Gemini tool 400 retries once on the OpenAI path and is remembered.
  fake.control.geminiTool400 = true;
  const beforeGeminiTool400 = fake.stats.searchRequests;
  await sendAndWait('سؤال أدوات Gemini', 'تم');
  assert(fake.stats.searchRequests === beforeGeminiTool400 + 1, 'Gemini tool 400 did not attempt native once');
  assert((await lastLinks()).length === 0, 'Gemini tool 400 rendered sources');
  fake.control.geminiTool400 = false;
  const beforeGeminiMemory = fake.stats.searchRequests;
  await sendAndWait('سؤال بعد الحفظ Gemini', 'تم');
  assert(fake.stats.searchRequests === beforeGeminiMemory, 'Gemini unsupported model was not remembered');
  ok('Gemini tool 400', 'one no-tool retry + session memory');

  // 8) Diagnostics and request origins.
  const warns = await ev('window.__warns');
  assert(warns.some(w => w.includes('[gemini-search]') && w.includes('grounding')), 'Gemini grounding failure was not logged');
  assert(!warns.join('\n').includes(gkey), 'key leaked to the console');
  const origins = await ev('window.__origins');
  const allowed = new Set([DEEPSEEK, BASE, GEMINI, fake.url].map(u => new URL(u).origin));
  const foreign = origins.filter(url => { try { return !allowed.has(new URL(url).origin); } catch (e) { return true; } });
  assert(origins.length > 0 && !foreign.length, 'request left the configured origins: ' + foreign.join(', '));
  ok('diagnostics and origins', 'warning present, key hidden, no other providers');
} catch (e) {
  bad('web search suite', e);
} finally {
  fake.control.deepseekSlow = false;
  fake.control.deepseek402 = false;
  fake.control.deepseek429 = false;
  fake.control.deepseekMidError = false;
  fake.control.deepseekSkipOnce = false;
  fake.control.deepseekTool400 = false;
  fake.control.geminiTool400 = false;
  fake.control.deepseekMixed = false;
  fake.control.geminiArabic = false;
  fake.control.searchGroundingBlocked = false;
  await b.close();
  await fake.close();
}

for (const r of results) console.log(r.join('\t'));
const failed = results.filter(r => r[0] === 'FAIL');
console.log(failed.length ? `${failed.length} failed` : `${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
