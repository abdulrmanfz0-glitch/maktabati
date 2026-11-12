#!/usr/bin/env node
// UX polish e2e: first-run demo hint, empty-library action, undo for highlight
// and conversation deletion, and dialog focus handling.
// Run against the Vite dev server (window.__rt is dev-only):
//   node tests/e2e/ux-polish.mjs http://127.0.0.1:5173/
import { launch } from '../../tools/lib/cdp.mjs';
import { startFakeAI } from '../../tools/fake-ai-server.mjs';

const page = process.argv[2] || 'http://127.0.0.1:5173/';
const results = [];
const ok = (n, note = '') => results.push(['PASS', n, note]);
const bad = (n, e) => results.push(['FAIL', n, String(e && e.message || e).slice(0, 220)]);
const assert = (c, m) => { if (!c) throw new Error(m); };

const fake = await startFakeAI();
const b = await launch({ width: 1280, height: 900 });
const ev = x => b.evaluate(x);
const settle = (ms = 500) => b.sleep(ms);
const go = async h => { await ev(`location.hash = ${JSON.stringify(h)}`); await settle(700); };
const setModel = m => ev(`localStorage.setItem('maktabati:ai', JSON.stringify({ base:${JSON.stringify(fake.url + '/v1')}, model:${JSON.stringify(m)}, key:'', max:1200, ctx:64000, first:5000 }))`);
const waitReady = () => b.waitFor(`!!document.querySelector('#v-home #chIn')`, 20000);
const sendHome = text => ev(`(() => { const t = document.querySelector('#v-home #chIn'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event('input', { bubbles:true })); document.querySelector('#v-home #chSend').click(); })()`);
const key = (type, k, code, vk, modifiers = 0) => b.send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, modifiers });

try {
  await b.goto(page); await waitReady();

  // 1) first run: the demo-books hint shows, dismisses and stays dismissed
  await go('#/lib');
  await b.waitFor(`!!document.querySelector('#demoHintX')`, 8000);
  assert(await ev(`document.querySelector('.demo-hint').textContent.includes('كتب تجريبية')`), 'hint text missing');
  await ev(`document.querySelector('#demoHintX').click()`); await settle(300);
  assert(!(await ev(`!!document.querySelector('#demoHintX')`)), 'hint did not dismiss');
  await go('#/'); await go('#/lib');
  assert(!(await ev(`!!document.querySelector('#demoHintX')`)), 'hint came back after leaving');
  ok('first-run demo hint dismisses and stays dismissed');

  // 2) deleting a conversation offers undo that restores it
  await setModel('fake-model');
  await go('#/'); await waitReady();
  await sendHome('اختبار التراجع');
  await b.waitFor(`(() => { const e = document.querySelector('#v-home .cm-a'); return !!e && e.textContent.includes('تم'); })()`, 12000);
  const id = (await ev('location.hash')).replace(/^#\/c\//, '');
  assert(id && id !== '#/', 'no conversation id');
  await b.waitFor(`!!document.querySelector('.side [data-cmenu="${id}"]')`, 5000);
  await ev(`document.querySelector('.side [data-cmenu="${id}"]').click()`); await settle(250);
  await ev(`document.querySelector('#ctxm [data-cm="del"]').click()`); await settle(250);
  await ev(`document.querySelector('#cfGo').click()`); await settle(400);
  assert(!(await ev(`!!document.querySelector('.side [data-conv-id="${id}"]')`)), 'conversation still listed');
  await b.waitFor(`(() => { const t = document.querySelector('#toast .toast-act'); return !!t && t.textContent === 'تراجع'; })()`, 5000);
  await ev(`document.querySelector('#toast .toast-act').click()`); await settle(500);
  assert(await ev(`!!document.querySelector('.side [data-conv-id="${id}"]')`), 'conversation did not come back');
  ok('chat delete undo restores the conversation');

  // 3) deleting a highlight offers undo that restores the mark
  await go('#/read/demo-experience/0-1-1');
  await b.waitFor(`!!document.querySelector('#v-read mark.hl')`, 15000);
  const anno = await ev(`document.querySelector('#v-read mark.hl').dataset.anno`);
  assert(anno, 'no seeded highlight mark on this screen');
  await ev(`document.querySelector('#v-read mark.hl').click()`); await settle(400);
  await b.waitFor(`!!document.querySelector('#sheet [data-act="del"]')`, 5000);
  await ev(`document.querySelector('#sheet [data-act="del"]').click()`); await settle(400);
  assert(!(await ev(`!!document.querySelector('#v-read mark.hl[data-anno="${anno}"]')`)), 'mark still rendered after delete');
  await b.waitFor(`(() => { const t = document.querySelector('#toast .toast-act'); return !!t && t.textContent === 'تراجع'; })()`, 5000);
  await ev(`document.querySelector('#toast .toast-act').click()`); await settle(600);
  assert(await ev(`!!document.querySelector('#v-read mark.hl[data-anno="${anno}"]')`), 'highlight did not come back');
  ok('highlight delete undo restores the highlight');

  // 4) dialog focus: Tab stays inside the modal and Esc returns focus to the trigger
  await go('#/lib');
  await ev(`(() => { const b = document.querySelector('#v-lib [data-add]'); b.focus(); b.click(); })()`); await settle(500);
  assert(!(await ev(`document.querySelector('#modal').hidden`)), 'modal did not open');
  const focusables = await ev(`(() => { const m = document.querySelector('#modalBox'); return [...m.querySelectorAll('button, a[href], input, textarea, select')].filter(el => el.offsetParent !== null).map(el => el.id || el.textContent.trim().slice(0, 8)); })()`);
  assert(focusables.length >= 2, 'modal has too few focusables: ' + JSON.stringify(focusables));
  await ev(`(() => { const m = document.querySelector('#modalBox'); const els = [...m.querySelectorAll('button, a[href], input, textarea, select')].filter(el => el.offsetParent !== null); els[els.length - 1].focus(); })()`);
  await key('rawKeyDown', 'Tab', 'Tab', 9); await key('keyUp', 'Tab', 'Tab', 9); await settle(150);
  const afterTab = await ev(`(() => { const m = document.querySelector('#modalBox'); const els = [...m.querySelectorAll('button, a[href], input, textarea, select')].filter(el => el.offsetParent !== null); return document.activeElement === els[0]; })()`);
  assert(afterTab, 'Tab escaped the modal');
  await key('rawKeyDown', 'Escape', 'Escape', 27); await key('keyUp', 'Escape', 'Escape', 27); await settle(300);
  assert(await ev(`document.querySelector('#modal').hidden`), 'modal did not close on Esc');
  const focused = await ev(`document.activeElement && document.activeElement.getAttribute('data-add') !== null ? 'add-btn' : String(document.activeElement.id || document.activeElement.className)`);
  assert(focused === 'add-btn', 'focus did not return to the trigger: ' + focused);
  ok('dialog traps Tab and returns focus on close', 'tab wrapped, esc refocused');

  // 5) an empty library shows an inline add action
  await ev(`(() => { window.__rt.rm('demo-experience'); window.__rt.rm('demo-forgetting'); location.hash = '#/'; setTimeout(() => location.hash = '#/lib', 60); })()`); await settle(900);
  await b.waitFor(`!!document.querySelector('#v-lib .empty-act [data-add]')`, 8000);
  await ev(`document.querySelector('#v-lib .empty-act [data-add]').click()`); await settle(500);
  assert(!(await ev(`document.querySelector('#modal').hidden`)), 'empty-state add did not open the upload modal');
  assert(await ev(`document.querySelector('#modalBox').textContent.includes('اختر ملف')`), 'upload modal wrong');
  await key('rawKeyDown', 'Escape', 'Escape', 27); await key('keyUp', 'Escape', 'Escape', 27); await settle(300);
  ok('empty library shows an inline add action');
} catch (e) {
  bad('ux-polish suite', e);
} finally {
  await b.close();
  await fake.close();
}

for (const r of results) console.log(r.join('\t'));
const failed = results.filter(r => r[0] === 'FAIL');
console.log(failed.length ? `${failed.length} failed` : `${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
