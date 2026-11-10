#!/usr/bin/env node
// Sound mixer stays open while used (CHECKLIST SND-05).
//
//   node tests/e2e/mixer.mjs [page]      (default dist/web/index.html, so the presets and nature sounds exist)
//
// Desktop (popover) and phone (bottom sheet); entry points: book page, floating pill, and the reader tools of
// «حديث», «الكتاب» and «مخطوطة». Every action uses real mouse input, so clicks bubble the way a user's do.
// The mixer may close only on its close button, a click outside, Esc, or back; closing never stops the audio.
import path from 'node:path';
import { launch } from '../../tools/lib/cdp.mjs';
import { serve } from '../../tools/lib/static-server.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const page = process.argv[2] || 'dist/web/index.html';
const BOOK = 'demo-experience';
const results = [];

async function run(b, url, vp) {
  const ev = x => b.evaluate(x);
  const settle = async (ms = 350) => { await b.sleep(ms); await ev('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); };
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const item = async (id, fn) => {
    try { results.push([vp, id, 'PASS', (await fn()) || '']); } catch (e) { results.push([vp, id, 'FAIL', String(e.message || e).slice(0, 240)]); }
    if (b.errors.length) results.push([vp, id, 'FAIL', 'JS error: ' + b.errors.splice(0).join(' | ').slice(0, 200)]);
  };
  // a real click at the element's center (scrolled into view first)
  const click = async sel => {
    const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block:'nearest' }); const r = e.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; })()`);
    if (!r) throw new Error('missing or hidden ' + sel); await b.tap(r[0], r[1]); await settle();
  };
  const open = () => ev(`!document.querySelector('#sndPanel').hidden`);
  const playing = () => ev(`!document.querySelector('#sndPill').hidden`); // the pill element exists whenever audio plays (CSS hides it in the reader)
  const key = async k => { for (const type of ['keyDown', 'keyUp']) await b.send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: 27 }); await settle(); };

  // every in-panel action; the panel must still be open after each
  async function use(tag) {
    const steps = [
      ['play', '#sndPanel [data-sc="pp"]'],
      ['toggle sound', '#sndPanel [data-sn="brown"]'],
      ['toggle sound back', '#sndPanel [data-sn="brown"]'],
      ['slider', '#sndPanel [data-sv="rain"]'],
      ['master', '#sndM'],
      ['mix', '#sndPanel [data-sp="p:rainy"]'],
      ['timer', '#sndPanel [data-st="15"]'],
      ['timer off', '#sndPanel [data-st="0"]'],
      ['pause', '#sndPanel [data-sc="pp"]'],
      ['play again', '#sndPanel [data-sc="pp"]'],
    ];
    for (const [n, sel] of steps) { await click(sel); assert(await open(), tag + ': closed after "' + n + '"'); }
    assert(await playing(), tag + ': not playing after the actions');
  }
  async function closes(tag, how) {
    assert(await open(), tag + ': not open before ' + how);
    const h0 = await ev('location.hash');
    if (how === 'close button') await click('#sndPanel [data-sc="close"]');
    else if (how === 'outside') { const W = await ev('innerWidth'); await b.tap(Math.round(W / 2), 14); await settle(); } // above the sheet on phones (the scrim), page area on desktop
    else if (how === 'esc') await key('Escape');
    else if (how === 'back') { await ev('history.back()'); await settle(500); }
    assert(!(await open()), tag + ': still open after ' + how);
    assert(await playing(), tag + ': audio stopped when closing by ' + how);
    assert((await ev('location.hash')) === h0, tag + ': ' + how + ' left the page (' + h0 + ' -> ' + (await ev('location.hash')) + ')');
  }

  await b.goto(url); await b.waitFor(`!!document.querySelector('main .view:not([hidden])')`, 20000); await settle(1200);
  await ev(`location.hash = '#/book/${BOOK}'`); await settle(900);

  await item('book-page', async () => {
    await click('#v-book [data-bpa="snd"]'); await use('book page'); await closes('book page', 'outside');
    await click('#v-book [data-bpa="snd"]'); await closes('book page', 'close button');
    await click('#v-book [data-bpa="snd"]'); await closes('book page', 'esc');
    await click('#v-book [data-bpa="snd"]'); await closes('book page', 'back');
  });
  await item('pill', async () => {
    assert(await ev(`!!document.querySelector('#sndPill .sp-main')`), 'no pill while playing');
    // while the mixer is open the pill sits under it (desktop popover, phone scrim), so the mixer's own controls are used
    await click('#sndPill .sp-main'); assert(await open(), 'pill did not open the mixer');
    await use('pill'); await closes('pill', 'outside');
    await click('#sndPill .sp-main'); await closes('pill', 'back');
  });

  // reader: open the book, then each template
  await ev(`location.hash = '#/read/${BOOK}'`); await settle(1200);
  if (await ev(`!!document.querySelector('#rtPick')`)) await ev(`document.querySelector('#rtPick [data-rtpick="modern"]').click()`);
  await settle(800); await ev(`document.querySelectorAll('#rtUI [data-rthint]').forEach(x => x.click())`);
  for (const tpl of ['modern', 'book', 'manu']) {
    await item('reader-' + tpl, async () => {
      if ((await ev('window.__rt.st.id')) !== tpl) { await ev(`window.__rt.set('${tpl}')`); await settle(1200); await ev(`document.querySelectorAll('#rtUI [data-rthint]').forEach(x => x.click())`); await settle(); }
      const P0 = await ev('window.__rt.st.P');
      const viaTools = async () => { await click('#rtUI .rt-fab, #rtUI .rt-rib, #rtUI .rt-pen'); await click('#rtTools [data-rtt="snd"]'); assert(await open(), 'tools did not open the mixer'); };
      await viaTools(); await use(tpl); await closes(tpl, 'outside');
      assert((await ev('window.__rt.st.P')) === P0, 'the outside click also turned the page');
      assert(await ev(`(() => { const o = document.querySelector('#rtUI .rt-ov'); return !o || o.hidden; })()`), 'the outside click also opened the reading overlay');
      await viaTools(); await closes(tpl, 'close button');
      await viaTools(); await closes(tpl, 'esc');
      assert(await ev(`location.hash.startsWith('#/read/')`), 'Esc left the reader');
      await viaTools(); await closes(tpl, 'back');
      return (await ev(`window.__rt.st.paged ? 'paged' : 'scroll'`));
    });
  }
  await ev(`document.querySelector('#sndPanel [data-sc="pp"]') ? 0 : 0`);
}

const VIEWPORTS = { desktop: { width: 1280, height: 900 }, phone: { width: 390, height: 844, mobile: true } };
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
