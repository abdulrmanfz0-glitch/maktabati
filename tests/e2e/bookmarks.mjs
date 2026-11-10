#!/usr/bin/env node
// Bookmarks mark the reader's place, at paragraph level (CHECKLIST BM-01 to BM-04).
//
//   node tests/e2e/bookmarks.mjs [page]      (default dist/single/index.html)
//
// In «حديث» (scroll and pages), «الكتاب» and «مخطوطة», at desktop and phone size:
//   - the bookmark tool marks the place: scroll, first paragraph whose top is at or below the top quarter of the
//     viewport; pages, first paragraph starting on the visible page(s), else the one continuing onto them
//   - the tool shows its state, and pressing it again removes the bookmark
//   - the bookmarks list jumps to that exact paragraph and highlights it
//   - «الكتاب» and «مخطوطة» show a ribbon on pages with a bookmark
//   - an old bookmark (block key only, no paragraph index) still lists and opens at its block
import path from 'node:path';
import { launch } from '../../tools/lib/cdp.mjs';
import { serve } from '../../tools/lib/static-server.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const page = process.argv[2] || 'dist/single/index.html';
const BOOK = 'demo-experience';
const results = [];
const PARA = i => 'الفقرة ' + (i + 1) + ': الدماغ يصنع في كل لحظة تخمينًا عمّا يُفترض أن يصله، ثم يستعمل الحواس لفحص هذا التخمين وتصحيحه. ' + 'وهذا يفسّر لماذا نرى ما نتوقّعه أحيانًا. '.repeat(3);
const LONG = { id:'bm-long', type:'book', title:'كتاب طويل للاختبار', author:'اختبار', createdAt:Date.now(),
  chapters:[{ title:'الفصل الأول', sections:[{ title:'قسم', blocks:[{ type:'p', text:Array.from({ length:30 }, (_, i) => PARA(i)) }, { type:'p', text:Array.from({ length:30 }, (_, i) => PARA(30 + i)) }] }] }] };

async function run(b, url, vp) {
  const ev = x => b.evaluate(x);
  const settle = async (ms = 400) => { await b.sleep(ms); await ev('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); };
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const item = async (id, fn) => {
    try { results.push([vp, id, 'PASS', (await fn()) || '']); } catch (e) { results.push([vp, id, 'FAIL', String(e.message || e).slice(0, 260)]); }
    if (b.errors.length) results.push([vp, id, 'FAIL', 'JS error: ' + b.errors.splice(0).join(' | ').slice(0, 200)]);
  };
  const click = async sel => {
    const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; })()`);
    if (!r) throw new Error('missing or hidden ' + sel); await b.tap(r[0], r[1]); await settle();
  };
  const tools = async () => { await click('#rtUI .rt-fab, #rtUI .rt-rib, #rtUI .rt-pen'); };
  const pressBm = async () => { await tools(); await click('#rtTools [data-rtt="bm"]'); };
  const bmState = async () => { await tools(); const s = await ev(`document.querySelector('#rtTools [data-rtt="bm"]').getAttribute('aria-pressed')`); await ev(`window.__rt.menu(false)`); await settle(); return s; };
  // the paragraphs a bookmark can point at, same rule as the app: leaf blocks of text inside each [data-bk]
  const UNITS = `(bk => { const S = 'p, li, h4, blockquote, pre, figure, table'; const us = [...bk.querySelectorAll(S)].filter(u => { const o = u.parentElement.closest(S); return !o || !bk.contains(o); }); return us.length ? us : [bk]; })`;
  // the expected place, computed in the test from what is on screen
  const expected = () => ev(`(() => {
    const U = ${UNITS}, st = window.__rt.st; let pick = null, span = null;
    if (st.paged){
      const g = st.g, fr = document.querySelector('#v-read .rt-flow').getBoundingClientRect(), P = st.P, e = P + g.cols - 1;
      const pg = r => Math.max(0, Math.floor(((g.rtl ? fr.right - r.right : r.left - fr.left) + g.gap / 2) / g.step));
      for (const bk of document.querySelectorAll('#v-read .rt-flow [data-bk]')) for (const u of U(bk)) {
        const rs = u.getClientRects(); if (!rs.length) continue; const a = pg(rs[0]), z = pg(rs[rs.length - 1]);
        if (!pick && a >= P && a <= e) pick = u; if (!span && a < P && z >= P) span = u;
      }
    } else {
      const line = innerHeight / 4 - 3;
      for (const bk of document.querySelectorAll('#v-read [data-bk]')) for (const u of U(bk)) {
        const r = u.getBoundingClientRect(); if (!pick && r.top >= line && r.top < innerHeight) pick = u; if (!span && r.top < line && r.bottom > line) span = u;
      }
    }
    const u = pick || span; if (!u) return null; const bk = u.closest('[data-bk]');
    window.__bmExp = u; return { bk: bk.dataset.bk, pi: U(bk).indexOf(u), first: U(bk)[0] === u, text: u.textContent.replace(/\\s+/g, ' ').trim().slice(0, 30) };
  })()`);
  const marked = () => ev(`[...document.querySelectorAll('#v-read .is-bm')].map(e => e === window.__bmExp ? 'expected' : (e.closest('[data-bk]') || e).dataset.bk + ':' + e.tagName)`);
  const openList = async () => { await tools(); await click('#rtTools [data-rtt="toc"]'); await settle(300); };
  const visibleNow = () => ev(`(() => { const u = window.__bmExp, st = window.__rt.st; if (!u || !u.isConnected) return 'gone';
    if (st.paged){ const g = st.g, fr = document.querySelector('#v-read .rt-flow').getBoundingClientRect(), r = u.getClientRects()[0]; const p = Math.max(0, Math.floor(((g.rtl ? fr.right - r.right : r.left - fr.left) + g.gap / 2) / g.step)); return p >= st.P && p < st.P + g.cols ? 'ok' : 'page ' + p + ' not in ' + st.P; }
    const t = u.getBoundingClientRect().top; return Math.abs(t - innerHeight / 4) < 6 ? 'ok' : 'top ' + Math.round(t) + ' vs ' + Math.round(innerHeight / 4); })()`);

  await b.goto(url); await b.waitFor(`!!document.querySelector('main .view:not([hidden])')`, 20000); await settle(1200);
  await ev(`location.hash = '#/read/${BOOK}/c0'`); await settle(1200); // chapter 1: the cover screen has almost no text
  if (await ev(`!!document.querySelector('#rtPick')`)) await ev(`document.querySelector('#rtPick [data-rtpick="modern"]').click()`);
  await settle(800); await ev(`document.querySelectorAll('#rtUI [data-rthint]').forEach(x => x.click())`);

  const CONFIGS = [['modern', 'scroll'], ['modern', 'paged'], ['book', 'paged'], ['manu', 'paged']];
  // the demo book (mostly one paragraph per block), then a book like an import: two blocks of 30 paragraphs each,
  // where the old block-level bookmark always fell back to the block's first paragraph
  for (const [bookId, tag] of [[BOOK, ''], ['bm-long', 'long-']]) {
  if (bookId !== BOOK) {
    await ev(`window.__rt.add(${JSON.stringify(LONG)})`);
    await ev(`location.hash = '#/read/bm-long/c0'`); await settle(1200);
    if (await ev(`!!document.querySelector('#rtPick')`)) await ev(`document.querySelector('#rtPick [data-rtpick="modern"]').click()`);
    await settle(900);
  }
  for (const [tpl, mode] of CONFIGS) {
    await item(tag + tpl + '-' + mode, async () => {
      if ((await ev('window.__rt.st.id')) !== tpl) { await ev(`window.__rt.set('${tpl}')`); await settle(1200); }
      if (tpl === 'modern' && (await ev(`window.__rt.st.paged ? 'paged' : 'scroll'`)) !== mode) {
        await tools(); await click('#rtTools [data-rtt="aa"]'); await click(`#sheet [data-pref="rtmode"] [data-v="${mode}"]`); await click('#sheet [data-close]'); await settle(1200);
      }
      await ev(`document.querySelectorAll('#rtUI [data-rthint]').forEach(x => x.click())`); await settle();
      // go somewhere in the middle of a long run of text, away from any block start
      if (mode === 'scroll') {
        await ev(`(() => { const bk = [...document.querySelectorAll('#v-read [data-bk]')].filter(b => ${UNITS}(b).length > 2)[1] || document.querySelectorAll('#v-read [data-bk]')[6]; const us = ${UNITS}(bk), u = us[Math.min(2, us.length - 1)]; scrollTo(0, u.getBoundingClientRect().top + scrollY - innerHeight * .4); })()`);
      } else await ev(`window.__rt.turn(Math.min(window.__rt.st.pages - 2, Math.max(2, Math.floor(window.__rt.st.pages * .3))), true)`);
      await settle(700);
      const exp = await expected(); assert(exp, 'no paragraph on screen');
      assert(await bmState() === 'false', 'tool shows a bookmark before adding one');
      await pressBm(); await settle(300);
      const m = await marked(); assert(m.length === 1 && m[0] === 'expected', 'marked ' + JSON.stringify(m) + ', expected ' + JSON.stringify(exp));
      assert(await bmState() === 'true', 'tool not filled on a bookmarked place');
      if (tpl !== 'modern') assert(await ev(`document.querySelectorAll('#v-read .rt-bmk').length`) === 1, 'no ribbon mark on the bookmarked page');
      // remove, then add again
      await pressBm(); assert((await marked()).length === 0, 'second press did not remove the bookmark');
      assert(await bmState() === 'false', 'tool still filled after removing');
      if (tpl !== 'modern') assert(await ev(`document.querySelectorAll('#v-read .rt-bmk').length`) === 0, 'ribbon mark left after removing');
      await pressBm();
      // leave, then come back through the list
      if (mode === 'scroll') await ev('scrollTo(0, 0)'); else await ev('window.__rt.turn(0, true)');
      await settle(500);
      if (tpl !== 'modern') assert(await ev(`document.querySelectorAll('#v-read .rt-bmk').length`) === 0, 'ribbon mark on a page without a bookmark');
      await openList();
      const n = await ev(`document.querySelectorAll('#navList [data-gobm]').length`); assert(n === 1, 'list has ' + n + ' bookmarks');
      const label = await ev(`document.querySelector('#navList [data-gobm]').textContent`);
      assert(label.replace(/\s+/g, ' ').includes(exp.text.slice(0, 15)), 'list excerpt "' + label + '" does not match "' + exp.text + '"');
      await click('#navList [data-gobm]'); await settle(900);
      const v = await visibleNow(); assert(v === 'ok', 'jump did not land on the paragraph: ' + v);
      assert(await ev(`window.__bmExp.classList.contains('bm-flash')`), 'paragraph not highlighted after the jump');
      if (tpl !== 'modern') assert(await ev(`document.querySelectorAll('#v-read .rt-bmk').length`) === 1, 'no ribbon after the jump');
      // clean up for the next template
      await pressBm(); assert((await marked()).length === 0, 'cleanup failed');
      if (tag) assert(exp.pi > 0, 'long blocks: expected a paragraph inside the block, got #' + exp.pi);
      return exp.bk + ' #' + exp.pi + (exp.first ? ' (first of its block)' : '');
    });
  }
  }
  await ev(`location.hash = '#/read/${BOOK}/c0'`); await settle(1200);

  await item('old-bookmark', async () => {
    // an export-era bookmark: block key and date only
    const bk = await ev(`([...document.querySelectorAll('#v-read [data-bk]')].find(b => ${UNITS}(b).length > 1) || document.querySelector('#v-read [data-bk]')).dataset.bk`);
    await ev(`new Promise((res, rej) => { const r = indexedDB.open('maktabati'); r.onsuccess = () => { const tx = r.result.transaction('annos', 'readwrite'); tx.objectStore('annos').put({ id:'old-bm-1', kind:'bm', itemId:'${BOOK}', bk:${JSON.stringify(bk)}, t:Date.now() - 864e5 }); tx.oncomplete = () => res(); tx.onerror = rej; }; r.onerror = rej; })`);
    await b.reload(); await b.waitFor(`!!document.querySelector('#v-read [data-bk]')`, 20000); await settle(1500);
    await ev(`document.querySelectorAll('#rtUI [data-rthint]').forEach(x => x.click())`);
    await ev(`window.__bmExp = document.querySelector('#v-read [data-bk="${bk}"]')`);
    assert((await marked()).includes('expected'), 'old bookmark not marked on its block');
    await openList(); assert(await ev(`!!document.querySelector('#navList [data-gobm="old-bm-1"]')`), 'old bookmark missing from the list');
    await click('#navList [data-gobm="old-bm-1"]'); await settle(900);
    await ev(`window.__bmExp = document.querySelector('#v-read [data-bk="${bk}"]')`);
    assert(await ev(`window.__bmExp.classList.contains('bm-flash')`), 'old bookmark jump did not highlight its block');
    return bk;
  });
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
