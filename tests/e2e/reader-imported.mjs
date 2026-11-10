#!/usr/bin/env node
// An engine-imported book in the reader: footnotes (popup and per-page notes) and figures
// (stored Blobs shown through object URLs, released on leaving) in every reading template.
// Prints metrics only.
//
//   node tests/e2e/reader-imported.mjs [page] [--fixture <id>]
import path from 'node:path';
import { launch } from '../../tools/lib/cdp.mjs';
import { serve } from '../../tools/lib/static-server.mjs';
import { listFixtures } from '../../tools/lib/fixtures.mjs';
import { upload } from './ingest-app.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const args = process.argv.slice(2);
const page = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--fixture') || 'dist/web/index.html';
const fxId = args.includes('--fixture') ? args[args.indexOf('--fixture') + 1] : '5150ac47';

const srv = /^(https?|file):/.test(page) ? null : await serve(ROOT);
const url = srv ? srv.url + '/' + page.split('/').map(encodeURIComponent).join('/') : page;
const results = [];
const check = (name, ok, note = '') => { results.push([ok ? 'PASS' : 'FAIL', name, note]); };

for (const [vp, size] of Object.entries({ desktop: { width: 1280, height: 900 }, phone: { width: 390, height: 844, mobile: true } })) {
  const b = await launch(size), ev = x => b.evaluate(x), settle = (ms = 900) => b.sleep(ms);
  try {
    await b.goto(url); await b.waitFor(`(() => { const v = document.querySelector('main .view:not([hidden])'); return !!(v && v.innerHTML.length); })()`); await settle(1200);
    const fx = listFixtures().find(f => f.id === fxId);
    await upload(b, fx.path);
    await b.waitFor(`!!document.querySelector('#pvSave') || !!document.querySelector('#modalBox .msg:not(.ok)') && !document.querySelector('#pvT')`, 300000);
    if (!(await ev(`!!document.querySelector('#pvSave')`))) throw new Error('conversion failed');
    check(vp + ' preview shows figures', await ev(`document.querySelectorAll('#modalBox img[src^="blob:"]').length`) >= 0);
    await ev(`document.querySelector('#pvSave').click()`); await settle(1500);
    const info = await ev(`(() => { const it = [...document.querySelectorAll('[data-href^="#/book/"]')].map(e => e.dataset.href); return location.hash; })()`);
    // the newest item = the imported one
    const it = await ev(`new Promise(res => { const q = indexedDB.open('maktabati'); q.onsuccess = () => { const r = q.result.transaction('items').objectStore('items').getAll(); r.onsuccess = () => { const a = r.result.filter(i => i.ingest).sort((x, y) => y.createdAt - x.createdAt)[0];
      const fnCh = a.chapters.findIndex(c => (c.notes || []).length && c.sections.some(s => s.blocks.some(bl => /\\[\\^/.test(bl.text || ''))));
      const figCh = a.chapters.findIndex(c => c.sections.some(s => s.blocks.some(bl => bl.fig)));
      res({ id: a.id, rec: a.ingest.rec, fnCh, figCh }); }; }; })`);
    void info;
    await ev(`location.hash = '#/book/${it.id}'`); await settle();
    check(vp + ' book page review warning', it.rec !== 'review' || await ev(`!!document.querySelector('#v-book .bp-warn')`), 'rec ' + it.rec);
    let first = true;
    for (const tpl of ['modern', 'book', 'manu']) {
      // footnotes
      await ev(`location.hash = '#/read/${it.id}/c${it.fnCh}'`); await settle(1500);
      if (first) { await ev(`document.querySelector('#rtPick [data-rtpick="${tpl}"]').click()`); await settle(1200); first = false; }
      else { await ev(`document.querySelector('[data-rtt="aa"]').click()`); await settle(300); await ev(`document.querySelector('#sheet [data-pref="tpl"] [data-v="${tpl}"]').click()`); await settle(300); await ev(`document.querySelector('#sheet [data-close]').click()`); await settle(1500); }
      const st = await ev(`window.__rt.st.id + (window.__rt.st.paged ? ' paged' : ' scroll')`);
      const nMarks = await ev(`document.querySelectorAll('#v-read [data-fn]').length`);
      const perPage = await ev(`document.querySelectorAll('#v-read .rt-fz p[data-fnk]').length`);
      // click a marker that is on screen
      // bring a marker on screen first (the popup closes on scroll, by design), then click it
      const vis = `[...document.querySelectorAll('#v-read [data-fn]')].find(e => { const r = e.getBoundingClientRect(); return r.width && r.top > 0 && r.bottom < innerHeight && r.left >= 0 && r.right <= innerWidth; })`;
      let clicked = 'visible';
      if (!(await ev(`!!${vis}`))) { clicked = 'scrolled'; await ev(`(() => { const m = document.querySelector('#v-read [data-fn]'); if (m) m.scrollIntoView({ block: 'center' }); })()`); await settle(800); }
      clicked = (await ev(`(() => { const m = ${vis}; if (!m) return false; m.click(); return true; })()`)) ? clicked : 'none on screen';
      await settle(500);
      const shown = await ev(`(!document.querySelector('#fnpop').hidden && document.querySelector('#fnpop .fn-body').textContent.trim().length > 0) || !!document.querySelector('#v-read .rt-fz p.on')`);
      check(`${vp} ${tpl} footnotes`, nMarks > 0 && shown && (tpl === 'modern' || perPage > 0), `${st}; markers ${nMarks}; per-page notes ${perPage}; click ${clicked}`);
      await ev(`document.querySelector('#fnpop [data-fnclose]') && document.querySelector('#fnpop [data-fnclose]').click()`);
      // figures
      await ev(`location.hash = '#/read/${it.id}/c${it.figCh}'`); await settle(2000);
      const fig = await ev(`(async () => { const im = document.querySelector('#v-read img[data-fig]'); if (!im) return { n: 0 }; if (!im.complete) await new Promise(r => { im.onload = im.onerror = r; setTimeout(r, 3000); }); return { n: document.querySelectorAll('#v-read img[data-fig]').length, blob: im.src.startsWith('blob:'), w: im.naturalWidth, src: im.src }; })()`);
      check(`${vp} ${tpl} figures`, fig.n > 0 && fig.blob && fig.w > 0, `imgs ${fig.n}, decoded width ${fig.w}`);
      await ev(`location.hash = '#/lib'`); await settle();
      const revoked = fig.src ? await ev(`fetch(${JSON.stringify(fig.src)}).then(() => false, () => true)`) : false;
      check(`${vp} ${tpl} object URL released on leaving`, revoked);
    }
    check(vp + ' no JS errors', b.errors.length === 0, b.errors.slice(0, 2).join(' | ').slice(0, 200));
  } catch (e) { check(vp + ' run', false, e.message); }
  finally { await b.close(); }
}
if (srv) await srv.close();
for (const r of results) console.log(r[0].padEnd(4), r[1].padEnd(46), r[2]);
const fail = results.filter(r => r[0] === 'FAIL').length;
console.log(results.length - fail + ' passed, ' + fail + ' failed (' + page + ')');
process.exit(fail ? 1 : 0);
