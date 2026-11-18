#!/usr/bin/env node
// Book chat panel: the close button is always reachable, closing returns to the same place in the
// book, and expanding carries the same conversation into the full chat.
//
//   node tests/e2e/chat-panel.mjs <page>
//
// page is a URL ("http://127.0.0.1:5173/") or a path under the repo root
// ("dist/web/index.html"). Needs Chrome/Edge and a fresh browser profile; no fake AI server is
// used because nothing is sent to a provider — a pinned model only has to render.
//
// Regression: with a model pinned, the panel header used to overflow. The close button was pushed
// outside the panel (clipped on phones, painted over the reader on desktop) and the book title
// collapsed, so there was no visible way back to the book.
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../../tools/lib/cdp.mjs';
import { serve } from '../../tools/lib/static-server.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const page = process.argv[2] || 'http://127.0.0.1:5173/';
const BOOK = 'demo-guide';
const TITLE = 'دليل مكتبتي';
const CONV = 'c-panel-check';
const ASK = 'وش معنى خطأ التنبؤ؟';
const REPLY = 'هو الفرق بين ما توقعه الدماغ وما وصل إليه فعلاً.';
const NEW_CHAT = 'محادثة جديدة';
const results = [];

const seedProfile = `(() => {
  const p = JSON.parse(localStorage.getItem('maktabati:profile') || '{}') || {};
  p.tpl = Object.assign({ def:'modern', books:{}, seen:{} }, p.tpl || {});
  p.tpl.books['${BOOK}'] = 'modern'; p.tpl.seen['${BOOK}'] = 1;
  localStorage.setItem('maktabati:profile', JSON.stringify(p));
  /* a pinned model is what used to break the header layout */
  localStorage.setItem('maktabati:ai', JSON.stringify({ base:'https://api.deepseek.com', model:'deepseek-flash', key:'sk-e2e-not-a-real-key', max:4096, ctx:128000, first:30000 }));
})()`;

const seedChat = `new Promise((res, rej) => {
  const q = indexedDB.open('maktabati');
  q.onerror = () => rej(q.error);
  q.onsuccess = () => {
    const db = q.result, t = Date.now();
    const tx = db.transaction(['kv'], 'readwrite');
    tx.objectStore('kv').put({ k:'chat:b:${BOOK}', v:[{ id:'${CONV}', bookId:'${BOOK}', t, msgs:[
      { role:'user', content:'${ASK}', t:t - 60000 },
      { role:'assistant', content:'${REPLY}', t:t - 59000 }
    ] }] });
    tx.oncomplete = () => { db.close(); res(true); };
    tx.onerror = () => rej(tx.error);
  };
})`;

const GEOM = `(() => {
  const head = document.querySelector('#chatIn .ch-head');
  const btn = document.querySelector('#chatIn .ch-head [data-ch="close"]');
  const ttl = document.querySelector('#chatIn .ch-ttl');
  const ex = document.querySelector('#chatIn [data-ch="expand"]');
  const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x:Math.round(b.x), y:Math.round(b.y), w:Math.round(b.width), h:Math.round(b.height), right:Math.round(b.right), bottom:Math.round(b.bottom) }; };
  const cr = box(btn), hit = cr && document.elementFromPoint(cr.x + cr.w / 2, cr.y + cr.h / 2);
  return {
    open: !document.querySelector('#chat').hidden,
    headOverflow: head ? head.scrollWidth - head.clientWidth : null,
    close: cr, closeHit: !!(hit && hit.closest('[data-ch="close"]')),
    title: ttl ? { text:ttl.textContent.trim(), w:Math.round(ttl.getBoundingClientRect().width) } : null,
    expand: box(ex),
    vw: innerWidth, vh: innerHeight
  };
})()`;

async function run(b, url, vp) {
  const ev = x => b.evaluate(x);
  const settle = async (ms = 500) => { await b.sleep(ms); await ev('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); };
  const click = async sel => { const ok = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`); if (!ok) throw new Error('missing ' + sel); await settle(); };
  const ready = () => b.waitFor(`(() => { const v = document.querySelector('main .view:not([hidden])'); return !!(v && v.innerHTML.length); })()`, 30000);
  const escape = async () => { for (const type of ['keyDown', 'keyUp']) await b.send('Input.dispatchKeyEvent', { type, key:'Escape', code:'Escape', windowsVirtualKeyCode:27, nativeVirtualKeyCode:27 }); await settle(250); };
  const panelOpen = () => ev(`!document.querySelector('#chat').hidden && !!document.querySelector('#chatIn .ch-head')`);
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const inside = (r, w, h) => r && r.x >= 0 && r.y >= 0 && r.right <= w && r.bottom <= h;

  async function item(id, fn) {
    try { const note = await fn(); results.push([vp, id, 'PASS', note || '']); }
    catch (e) { results.push([vp, id, 'FAIL', String(e.message || e).slice(0, 220)]); }
    if (b.errors.length) results.push([vp, id, 'FAIL', 'JS error: ' + b.errors.splice(0).join(' | ').slice(0, 220)]);
  }

  await b.goto(url); await ready(); await settle(900);
  await ev(seedProfile); await ev(seedChat);
  await b.reload(); await ready(); await settle(700);
  await ev(`location.hash = '#/read/${BOOK}'`); await settle(1600);
  await ev(`document.querySelectorAll('#rtPick [data-rtpick="modern"]').forEach(x => x.click())`); await settle(900);
  await ev('window.scrollTo(0, 520)'); await settle(700);
  const start = await ev(`({ hash:location.hash, y:Math.round(window.scrollY), read:!document.querySelector('#v-read').hidden })`);
  assert(start.read, 'reader did not open');

  let g = null;
  await item('panel opens with a visible close button', async () => {
    await click('#talkBtn');
    await b.waitFor(`!document.querySelector('#chat').hidden`, 5000);
    g = await ev(GEOM);
    assert(g.open, 'panel did not open');
    assert(g.headOverflow <= 1, 'header overflows by ' + g.headOverflow + 'px');
    assert(g.close, 'no close button');
    assert(inside(g.close, g.vw, g.vh), 'close button is outside the viewport: ' + JSON.stringify(g.close));
    assert(g.close.w >= 40 && g.close.h >= 40, 'close button is too small: ' + g.close.w + 'x' + g.close.h);
    assert(g.closeHit, 'something covers the close button');
    assert(g.title && g.title.w > 0 && g.title.text.includes(TITLE), 'title is missing');
    assert(inside(g.expand, g.vw, g.vh), 'expand button is outside the viewport');
    return g.close.w + 'x' + g.close.h + ' at ' + g.close.x + ',' + g.close.y + ' · title ' + g.title.w + 'px';
  });

  await item('same conversation continues in the panel', async () => {
    const text = await ev(`document.querySelector('#chatIn #chMsgs').textContent`);
    assert(text.includes(REPLY), 'the saved reply is not in the panel');
    return 'saved reply shown';
  });

  await item('⋯ menu opens, Escape closes it and keeps the panel', async () => {
    await click('#chatIn [data-chmore]');
    assert(await ev(`!document.querySelector('#chatIn .ch-menu').hidden`), 'menu did not open');
    assert(await ev(`document.querySelector('#chatIn .ch-menu').innerText.includes(${JSON.stringify(NEW_CHAT)})`), 'menu has no new-chat item');
    await escape();
    assert(await ev(`document.querySelector('#chatIn .ch-menu').hidden`), 'menu did not close');
    assert(await panelOpen(), 'the panel closed too');
    return 'menu closed, panel kept';
  });

  await item('close returns to the book in the same place', async () => {
    await escape();
    assert(!(await panelOpen()), 'Escape did not close the panel');
    await click('#talkBtn');
    await b.waitFor(`!document.querySelector('#chat').hidden`, 5000);
    await click('#chatIn [data-ch="close"]');
    await b.waitFor(`document.querySelector('#chat').hidden`, 5000);
    const now = await ev(`({ hash:location.hash, y:Math.round(window.scrollY), cls:document.body.className, read:!document.querySelector('#v-read').hidden })`);
    assert(now.hash === start.hash, 'left the reader: ' + now.hash);
    assert(now.read, 'the reader is hidden');
    assert(!now.cls.includes('chat-open'), 'chat-open was not removed');
    assert(now.y === start.y, 'scroll moved from ' + start.y + ' to ' + now.y);
    return 'still at ' + now.y + 'px';
  });

  await item('expand carries the same conversation to the full chat', async () => {
    await click('#talkBtn');
    await b.waitFor(`!document.querySelector('#chat').hidden`, 5000);
    await click('#chatIn [data-ch="expand"]');
    await b.waitFor(`location.hash === '#/c/${CONV}'`, 5000);
    await b.waitFor(`document.querySelector('#v-home #chMsgs') && document.querySelector('#v-home #chMsgs').textContent.includes(${JSON.stringify(REPLY)})`, 5000);
    assert(await ev(`document.querySelector('#chat').hidden`), 'the panel is still open');
    assert(await ev(`(document.querySelector('#v-home .cb') || {}).textContent.includes('${TITLE}')`), 'the book is not linked from the expanded chat');
    return 'at #/c/' + CONV;
  });
}

async function main() {
  const srv = /^(https?|file):/.test(page) ? null : await serve(ROOT);
  const url = srv ? srv.url + '/' + page.split('/').map(encodeURIComponent).join('/') : page;
  for (const [vp, size] of Object.entries({ desktop: { width: 1280, height: 900 }, phone: { width: 390, height: 844, mobile: true }, small: { width: 360, height: 740, mobile: true } })) {
    const b = await launch(size);
    try { await run(b, url, vp); } catch (e) { results.push([vp, 'RUN', 'FAIL', String(e.message || e)]); } finally { await b.close(); }
  }
  if (srv) await srv.close();
  for (const r of results) console.log(r[2].padEnd(4) + ' ' + (r[0] + ' ' + r[1]).padEnd(48) + ' ' + r[3]);
  const fail = results.filter(r => r[2] === 'FAIL').length;
  console.log('\n' + (results.length - fail) + ' passed, ' + fail + ' failed  (' + page + ')');
  process.exit(fail ? 1 : 0);
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) main();
