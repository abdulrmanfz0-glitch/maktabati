#!/usr/bin/env node
// Screenshots for automatic DeepSeek search at desktop and mobile widths:
// searching status, answer with sources, and the AI setting. Fake keys only.
//   node tests/e2e/ai-web-search-screens.mjs http://127.0.0.1:5173/
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../../tools/lib/cdp.mjs';
import { startFakeAI } from '../../tools/fake-ai-server.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const SHOTS = path.join(ROOT, 'docs', 'screens', 'web-search');
fs.mkdirSync(SHOTS, { recursive: true });
for (const f of fs.readdirSync(SHOTS)) if (f.endsWith('.png')) fs.unlinkSync(path.join(SHOTS, f));
const page = process.argv[2] || 'http://127.0.0.1:5173/';
const DEEPSEEK = 'https://api.deepseek.com';
const state = {
  v:2,
  connections:[
    { id:'c1', provider:'deepseek', base:DEEPSEEK, key:'sk-fake-screenshot-web-search', label:'DeepSeek', max:4096, ctx:64000, first:90000 }
  ],
  pinned:[{ connectionId:'c1', model:'deepseek-flash', label:'DeepSeek Flash' }],
  defaults:{ chat:{ connectionId:'c1', model:'deepseek-flash' } }
};

const fake = await startFakeAI();

async function shoot(width, mobile, suffix){
  const b = await launch({ width, height: mobile ? 844 : 900, mobile });
  try {
    await b.goto(page);
    await b.waitFor(`!!document.querySelector('#v-lib')`, 30000);
    await b.evaluate(`localStorage.setItem('maktabati:ai', ${JSON.stringify(JSON.stringify(state))})`);
    await b.evaluate(`localStorage.setItem('maktabati:profile', ${JSON.stringify(JSON.stringify({ ai:{ autoSearch:true, searchNoteSeen:false } }))})`);
    await b.reload();
    await b.waitFor(`!!document.querySelector('#v-lib')`, 30000);
    await b.evaluate(`(() => {
      const target = ${JSON.stringify(fake.url)};
      const base = ${JSON.stringify(DEEPSEEK)};
      const orig = window.fetch.bind(window);
      window.fetch = (input, init) => {
        let url = typeof input === 'string' ? input : (input && input.url);
        if (url && url.startsWith(base)) url = target + '/deepseek/v1' + url.slice(base.length);
        return orig(url, init);
      };
    })()`);
    await b.evaluate(`location.hash = '#/'`); await b.sleep(900);
    await b.waitFor(`!!document.querySelector('#v-home #chIn')`, 10000);
    fake.control.deepseekSlow = true;
    await b.evaluate(`(() => { const t = document.querySelector('#v-home #chIn'); t.value = 'من مؤلف الكتاب؟'; t.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('#v-home #chSend').click(); })()`);
    await b.waitFor(`(() => { const a = [...document.querySelectorAll('#v-home .cm-a')]; const l = a[a.length - 1]; return !!l && !!l.querySelector('.cm-search-live'); })()`, 15000);
    await b.screenshot(path.join(SHOTS, 'deepseek-searching-' + suffix + '.png'));
    await b.waitFor(`(() => { const a = [...document.querySelectorAll('#v-home .cm-a')]; const l = a[a.length - 1]; return !!l && l.textContent.includes('من الويب.') && !!l.querySelector('.cm-web .cm-src a'); })()`, 25000);
    await b.evaluate(`const d = document.querySelector('#v-home .cm-src'); if (d) d.open = true;`);
    await b.waitFor(`!document.querySelector('#toast').classList.contains('show')`, 8000);
    await b.sleep(300);
    await b.screenshot(path.join(SHOTS, 'deepseek-answer-' + suffix + '.png'));

    fake.control.deepseekMixed = true;
    await b.evaluate(`(() => { const t = document.querySelector('#v-home #chIn'); t.value = 'اذكر ناشري الكتاب وترجماته'; t.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('#v-home #chSend').click(); })()`);
    await b.waitFor(`(() => { const a = [...document.querySelectorAll('#v-home .cm-a')]; const l = a[a.length - 1]; return !!l && l.textContent.includes('Pantheon Books') && !!l.querySelector('sup.cite a'); })()`, 25000);
    await b.evaluate(`document.querySelectorAll('#v-home .cm-src').forEach(d => { d.open = true; })`);
    await b.sleep(300);
    await b.screenshot(path.join(SHOTS, 'deepseek-markers-' + suffix + '.png'));
    fake.control.deepseekMixed = false;

    await b.evaluate(`location.hash = '#/profile/ai'`); await b.sleep(900);
    await b.waitFor(`!!document.querySelector('[data-tg="ai.autoSearch"]')`, 10000);
    await b.evaluate(`document.querySelector('[data-tg="ai.autoSearch"]').scrollIntoView({ block:'center' })`);
    await b.sleep(300);
    await b.screenshot(path.join(SHOTS, 'setting-' + suffix + '.png'));
    fake.control.deepseekSlow = false;
    console.log(suffix + ' screenshots written');
  } finally { await b.close(); }
}

try {
  await shoot(1280, false, '1280');
  await shoot(390, true, '390');
} finally {
  fake.control.deepseekSlow = false;
  await fake.close();
}
