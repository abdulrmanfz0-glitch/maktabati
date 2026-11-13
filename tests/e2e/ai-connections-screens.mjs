#!/usr/bin/env node
// Screenshots for multiple AI connections at desktop and mobile widths:
// connections list, choose-models sheet, and the chat switcher open.
//   node tests/e2e/ai-connections-screens.mjs http://127.0.0.1:5173/
// The fake keys are placeholders; they are never rendered by the UI.
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../../tools/lib/cdp.mjs';
import { startFakeAI } from '../../tools/fake-ai-server.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const SHOTS = path.join(ROOT, 'docs', 'screens', 'ai-connections');
fs.mkdirSync(SHOTS, { recursive: true });
const page = process.argv[2] || 'http://127.0.0.1:5173/';
const fake = await startFakeAI();
const DEEPSEEK = 'https://api.deepseek.com';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/openai';
const state = {
  v:2,
  connections:[
    { id:'c1', provider:'deepseek', base:DEEPSEEK, key:'sk-fake-screenshot-deepseek', label:'DeepSeek', max:1200, ctx:64000, first:90000 },
    { id:'c2', provider:'gemini', base:GEMINI, key:'AQ.fake-screenshot-gemini', label:'Gemini', max:4096, ctx:1000000, first:45000 }
  ],
  pinned:[
    { connectionId:'c1', model:'deepseek-flash', label:'DeepSeek Flash' },
    { connectionId:'c1', model:'deepseek-v4-pro', label:'DeepSeek V4 Pro' },
    { connectionId:'c2', model:'gemini-3.1-flash-lite', label:'Gemini 3.1 Flash Lite' },
    { connectionId:'c2', model:'gemini-3.8-flash', label:'Gemini 3.8 Flash' }
  ],
  defaults:{
    chat:{ connectionId:'c1', model:'deepseek-v4-pro' },
    translation:{ connectionId:'c2', model:'gemini-3.8-flash' },
    cards:{ connectionId:'c1', model:'deepseek-flash' }
  }
};

async function shoot(width, mobile, suffix){
  const b = await launch({ width, height: mobile ? 844 : 900, mobile });
  try {
    await b.goto(page);
    await b.waitFor(`!!document.querySelector('#v-lib')`, 30000);
    await b.evaluate(`localStorage.setItem('maktabati:ai', ${JSON.stringify(JSON.stringify(state))})`);
    await b.reload();
    await b.waitFor(`!!document.querySelector('#v-lib')`, 30000);
    await b.evaluate(`(() => {
      const map = { ${JSON.stringify(DEEPSEEK)}: ${JSON.stringify(fake.url + '/deepseek/v1')}, ${JSON.stringify(GEMINI)}: ${JSON.stringify(fake.url + '/gemini/v1')} };
      const orig = window.fetch.bind(window);
      window.fetch = (input, init) => {
        let url = typeof input === 'string' ? input : (input && input.url);
        if (url) for (const from of Object.keys(map)) if (url.startsWith(from)) { url = map[from] + url.slice(from.length); break; }
        return orig(url, init);
      };
    })()`);
    await b.evaluate(`location.hash = '#/profile/ai'`); await b.sleep(900);
    await b.waitFor(`document.querySelectorAll('.ai-conn').length === 2`, 10000);
    await b.screenshot(path.join(SHOTS, '01-connections-' + suffix + '.png'));

    await b.evaluate(`document.querySelector('[data-ai-models="c2"]').click()`);
    await b.waitFor(`document.querySelectorAll('#aiModelList input[data-model]').length > 0`, 15000);
    await b.sleep(400);
    await b.screenshot(path.join(SHOTS, '02-choose-models-' + suffix + '.png'));
    await b.evaluate(`document.querySelector('#modalBox [data-close]').click()`);
    await b.sleep(300);

    await b.evaluate(`location.hash = '#/'`); await b.sleep(900);
    await b.waitFor(`!!document.querySelector('.ch-model-btn')`, 10000);
    await b.evaluate(`document.querySelector('.ch-model-btn').click()`); await b.sleep(400);
    await b.screenshot(path.join(SHOTS, '03-chat-switcher-' + suffix + '.png'));
    console.log(suffix + ' screenshots written');
  } finally { await b.close(); }
}

try {
  await shoot(1280, false, '1280');
  await shoot(390, true, '390');
} finally {
  await fake.close();
}
