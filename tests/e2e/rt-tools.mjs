#!/usr/bin/env node
// Reading-template tool affordances stay still while reading.
//
//   node tests/e2e/rt-tools.mjs [page]
//
// «حديث»: the circle sits in the bottom end corner, is 44px, quiet at rest, does not move on touch or scroll,
// hides on scroll only when the Aa option is on, and shows a focus ring only after keyboard use.
// «الكتاب» and «مخطوطة»: the ribbon and the pen keep their place across page turns and taps.
import path from 'node:path';
import { launch } from '../../tools/lib/cdp.mjs';
import { serve } from '../../tools/lib/static-server.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const page = process.argv[2] || 'dist/single/index.html';
const results = [];

async function run(b, url, vp) {
  const ev = x => b.evaluate(x);
  const settle = async (ms = 500) => { await b.sleep(ms); await ev('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); };
  const click = async sel => { const ok = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`); if (!ok) throw new Error('missing ' + sel); await settle(); };
  const rect = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(','); })()`);
  const css = (sel, p) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? getComputedStyle(e)[${JSON.stringify(p)}] : null; })()`);
  const key = async k => { for (const type of ['keyDown', 'keyUp']) await b.send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: k === 'Tab' ? 9 : 27 }); await settle(200); };
  const touch = async (x, y) => { for (const type of ['touchStart', 'touchEnd']) await b.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] }); await settle(200); };
  const setTpl = async id => { await click('[data-rtt="aa"]'); await click(`#sheet [data-pref="tpl"] [data-v="${id}"]`); await click('#sheet [data-close]'); await settle(1000); };
  const assert = (c, m) => { if (!c) throw new Error(m); };
  async function item(id, fn) {
    try { results.push([vp, id, 'PASS', (await fn()) || '']); } catch (e) { results.push([vp, id, 'FAIL', String(e.message || e).slice(0, 220)]); }
    if (b.errors.length) results.push([vp, id, 'FAIL', 'JS error: ' + b.errors.splice(0).join(' | ').slice(0, 200)]);
  }

  await b.goto(url); await b.waitFor(`!!document.querySelector('main .view:not([hidden])')`, 20000); await settle(1200);
  await ev(`location.hash = '#/read/demo-experience'`); await settle(1200);
  if (await ev(`!!document.querySelector('#rtPick')`)) await click('[data-rtpick="modern"]');
  await settle(800);
  await ev(`(() => { const h = document.querySelector('#rtUI [data-rthint]'); if (h) h.click(); })()`); await settle(300);
  await ev(`(() => { const h = document.querySelector('#rtUI [data-rthint]'); if (h) h.click(); })()`); await settle(300);

  await item('FAB-place', async () => {
    const r = (await rect('#rtUI .rt-fab')).split(',').map(Number), W = await ev('innerWidth'), H = await ev('innerHeight');
    assert(r[2] === 44 && r[3] === 44, 'size ' + r);
    assert(r[0] <= 20, 'not in the bottom end (left) corner: ' + r + ' of ' + W);
    assert(H - (r[1] + r[3]) <= 20, 'not at the bottom: ' + r + ' of ' + H);
    const op = +(await css('#rtUI .rt-fab', 'opacity')); assert(op < 1 && op > .3, 'rest opacity ' + op);
    return r.join(',') + ' opacity ' + op;
  });

  await item('FAB-still', async () => {
    const a = await rect('#rtUI .rt-fab'), W = await ev('innerWidth'), H = await ev('innerHeight');
    await touch(W * .2, H * .85); await touch(W * .8, H * .85);
    await ev(`scrollBy(0, 400)`); await settle(80);
    const mid = await ev(`document.querySelector('#rtUI .rt-fab').classList.contains('hide')`);
    await ev(`scrollBy(0, 400)`); await settle(800);
    const z = await rect('#rtUI .rt-fab');
    assert(a === z, 'moved: ' + a + ' -> ' + z); assert(!mid, 'hid while scrolling with the option off');
  });

  await item('FOCUS-tap', async () => {
    const r = (await rect('#rtUI .rt-fab')).split(',').map(Number), x = r[0] + 22, y = r[1] + 22;
    await b.tap(x, y); await settle(300);
    assert(await ev(`!document.querySelector('#rtTools').hidden`), 'menu did not open');
    const f1 = await ev(`(() => { const a = document.activeElement; return a && a.closest('#rtUI') ? getComputedStyle(a).outlineStyle : 'none'; })()`);
    await b.tap(x, y); await settle(300);
    assert(await ev(`document.querySelector('#rtTools').hidden`), 'menu did not close');
    const f2 = await ev(`(() => { const a = document.activeElement; return a && a.closest('#rtUI') ? getComputedStyle(a).outlineStyle : 'none'; })()`);
    assert(f1 === 'none' && f2 === 'none', 'ring after tap: ' + f1 + ' / ' + f2);
  });

  await item('FOCUS-kbd', async () => {
    await ev(`document.querySelector('#rtUI .rt-fab').blur()`);
    await ev(`document.querySelector('#rtUI .rt-fab').focus()`); await key('Tab'); await key('Tab');
    await ev(`document.querySelector('#rtUI .rt-fab').focus()`);
    const o = await ev(`(() => { const a = document.activeElement; return a.matches(':focus-visible') + ' ' + getComputedStyle(a).outlineStyle; })()`);
    assert(o === 'true solid', 'no ring after keyboard: ' + o);
    await b.tap(5, 5); await settle(200);
  });

  await item('FAB-option', async () => {
    await click('[data-rtt="aa"]');
    assert(await ev(`!!document.querySelector('#sheet [data-pref="rthide"] [data-v="off"][aria-pressed="true"]')`), 'option missing or not off by default');
    await click('#sheet [data-pref="rthide"] [data-v="on"]'); await click('#sheet [data-close]');
    await ev(`scrollTo(0, 0)`); await settle(900); await ev(`scrollBy(0, 300)`); await settle(80);
    const hid = await ev(`document.querySelector('#rtUI .rt-fab').classList.contains('hide')`);
    await settle(900);
    const back = !(await ev(`document.querySelector('#rtUI .rt-fab').classList.contains('hide')`));
    await click('[data-rtt="aa"]'); await click('#sheet [data-pref="rthide"] [data-v="off"]'); await click('#sheet [data-close]');
    assert(hid && back, 'hide ' + hid + ' back ' + back);
  });

  for (const [tpl, sel] of [['book', '.rt-rib'], ['manu', '.rt-pen']]) {
    await item('STILL-' + tpl, async () => {
      await setTpl(tpl);
      const a = await rect('#rtUI ' + sel); assert(a, 'no ' + sel);
      const shots = [];
      for (let i = 0; i < 3; i++) { await ev('window.__rt.flip(1)'); await settle(450); shots.push(await rect('#rtUI ' + sel)); }
      const W = await ev('innerWidth'), H = await ev('innerHeight'); await touch(W * .5, H * .6); await settle(300); await touch(W * .5, H * .6);
      shots.push(await rect('#rtUI ' + sel));
      const h0 = await ev(`(() => { const i = document.querySelector('#rtUI .rt-rib i'); return i ? i.getBoundingClientRect().height : 0; })()`);
      assert(shots.every(s => s === a), sel + ' moved: ' + a + ' -> ' + shots.join(' | '));
      return a + (h0 ? ' ribbon ' + h0 : '');
    });
  }
  await setTpl('modern');
}

const VIEWPORTS = { phone: { width: 390, height: 844, mobile: true }, desktop: { width: 1280, height: 900 } };
const srv = /^(https?|file):/.test(page) ? null : await serve(ROOT);
const url = srv ? srv.url + '/' + page.split('/').map(encodeURIComponent).join('/') : page;
for (const [vp, size] of Object.entries(VIEWPORTS)) {
  const b = await launch(size);
  try { await run(b, url, vp); } catch (e) { results.push([vp, 'RUN', 'FAIL', String(e.message || e)]); } finally { await b.close(); }
}
if (srv) await srv.close();
for (const r of results) console.log(r[2].padEnd(4) + ' ' + (r[0] + ' ' + r[1]).padEnd(22) + ' ' + r[3]);
const fail = results.filter(r => r[2] === 'FAIL').length;
console.log('\n' + (results.length - fail) + ' passed, ' + fail + ' failed  (' + page + ')');
process.exit(fail ? 1 : 0);
