#!/usr/bin/env node
// Screenshots for chat web search at desktop and mobile widths: search on with
// sources, and the paid-key error. Fake keys only.
//   node tests/e2e/ai-web-search-screens.mjs http://127.0.0.1:5173/
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../../tools/lib/cdp.mjs';
import { startFakeAI } from '../../tools/fake-ai-server.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const SHOTS = path.join(ROOT, 'docs', 'screens', 'web-search');
fs.mkdirSync(SHOTS, { recursive: true });
const page = process.argv[2] || 'http://127.0.0.1:5173/';
const GEMINI = 'https://generativelanguage.googleapis.com';
const BASE = GEMINI + '/v1beta/openai';
const state = {
  v:2,
  connections:[
    { id:'c1', provider:'gemini', base:BASE, key:'AQ.fake-screenshot-web-search', label:'Gemini', max:4096, ctx:1000000, first:90000 }
  ],
  pinned:[{ connectionId:'c1', model:'gemini-3.8-flash', label:'Gemini 3.8 Flash' }],
  defaults:{ chat:{ connectionId:'c1', model:'gemini-3.8-flash' } }
};

const fake = await startFakeAI();

async function shoot(width, mobile, suffix){
  const b = await launch({ width, height: mobile ? 844 : 900, mobile });
  try {
    await b.goto(page);
    await b.waitFor(`!!document.querySelector('#v-lib')`, 30000);
    await b.evaluate(`localStorage.setItem('maktabati:ai', ${JSON.stringify(JSON.stringify(state))})`);
    await b.reload();
    await b.waitFor(`!!document.querySelector('#v-lib')`, 30000);
    await b.evaluate(`(() => {
      const target = ${JSON.stringify(fake.url)};
      const base = ${JSON.stringify(BASE)};
      const origin = ${JSON.stringify(GEMINI)};
      const orig = window.fetch.bind(window);
      window.fetch = (input, init) => {
        let url = typeof input === 'string' ? input : (input && input.url);
        if (url && url.startsWith(base)) url = target + '/gemini/v1' + url.slice(base.length);
        else if (url && url.startsWith(origin)) url = target + url.slice(origin.length);
        return orig(url, init);
      };
    })()`);
    await b.evaluate(`location.hash = '#/'`); await b.sleep(900);
    await b.waitFor(`!!document.querySelector('#v-home #chIn')`, 10000);
    await b.evaluate(`document.querySelector('#v-home [data-websearch]').click()`); await b.sleep(4200);
    await b.evaluate(`(() => { const t = document.querySelector('#v-home #chIn'); t.value = 'من هو مؤلف هذا الكتاب؟'; t.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('#v-home #chSend').click(); })()`);
    await b.waitFor(`!!document.querySelector('#v-home .cm-web .cm-src a')`, 20000);
    await b.evaluate(`document.querySelector('#v-home .cm-src summary').click()`);
    await b.sleep(400);
    await b.screenshot(path.join(SHOTS, 'search-on-' + suffix + '.png'));

    await b.evaluate(`document.querySelectorAll('#v-home .cm-src').forEach(d => { d.open = false; })`);
    fake.control.searchGroundingBlocked = true;
    await b.evaluate(`(() => { const t = document.querySelector('#v-home #chIn'); t.value = 'هل هو عايش؟'; t.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('#v-home #chSend').click(); })()`);
    await b.waitFor(`(() => { const e = document.querySelector('#v-home .msg.warn'); return !!e && e.textContent.includes('مفتاح Gemini مدفوع') && !!e.querySelector('[data-nosearch]'); })()`, 20000);
    await b.sleep(500);
    await b.screenshot(path.join(SHOTS, 'paid-key-' + suffix + '.png'));
    fake.control.searchGroundingBlocked = false;
    console.log(suffix + ' screenshots written');
  } finally { await b.close(); }
}

try {
  await shoot(1280, false, '1280');
  await shoot(390, true, '390');
} finally {
  await fake.close();
}
