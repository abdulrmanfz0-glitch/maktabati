#!/usr/bin/env node
// Automated [SMOKE] items from CHECKLIST.md, in headless Chrome (desktop and phone size).
//
//   node tests/e2e/smoke.mjs <page> [--only ID,ID]
//
// page: a path under the repo root ("My Library.html", "dist/single/index.html") or a URL.
// Each run uses a fresh browser profile, so the app starts from its demo seed.
// Prints PASS / FAIL per item and exits 1 if anything failed.
import fs from 'node:fs';
import path from 'node:path';
import { launch, scratchDir } from '../../tools/lib/cdp.mjs';
import { serve } from '../../tools/lib/static-server.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const args = process.argv.slice(2);
const page = args.find(a => !a.startsWith('--')) || 'dist/single/index.html';
const only = (args[args.indexOf('--only') + 1] || '').split(',').filter(x => args.includes('--only') && x);
const TMP = scratchDir('mk-smoke-');
const KEY = 'sk-SMOKE-not-a-real-key-7731';
const BOOK = 'demo-experience';
const results = [];

export async function runSmoke(b, url, vp, extra = []) {
  const ev = (x) => b.evaluate(x);
  const settle = async (ms = 600) => { await b.sleep(ms); await ev('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); };
  const go = async h => { await ev(`location.hash = ${JSON.stringify(h)}`); await settle(); };
  const click = async sel => { const ok = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`); if (!ok) throw new Error('missing ' + sel); await settle(); };
  const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`);
  const vis = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.hidden) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; })()`);
  const txt = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent : ''; })()`);
  const count = sel => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const type = async (sel, v) => { await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles:true })); })()`); await settle(300); };
  const ready = () => b.waitFor(`(() => { const v = document.querySelector('main .view:not([hidden])'); return !!(v && v.innerHTML.length); })()`, 20000);
  const toastHas = s => ev(`document.querySelector('#toast').textContent.includes(${JSON.stringify(s)})`);
  // reader state through the app's dev hook; pos also changes when a turn moves to the next screen
  const rt = () => ev(`window.__rt && window.__rt.st ? { id: window.__rt.st.id, paged: !!window.__rt.st.paged, P: window.__rt.st.P, pages: window.__rt.st.pages, cols: window.__rt.st.g && window.__rt.st.g.cols, pos: window.__rt.st.P + '/' + document.querySelector('#v-read').textContent.length } : null`);
  const setTpl = async id => { await click('[data-rtt="aa"]'); await click(`#sheet [data-pref="tpl"] [data-v="${id}"]`); await ev(`document.querySelector('#sheet .sh-head [data-close], #sheet [data-close]') && document.querySelector('#sheet [data-close]').click()`); await settle(1200); };
  const assert = (c, m) => { if (!c) throw new Error(m); };

  async function item(id, fn) {
    if (only.length && !only.includes(id)) return;
    try { const note = await fn(); results.push([vp, id, 'PASS', note || '']); }
    catch (e) { results.push([vp, id, 'FAIL', String(e.message || e).slice(0, 200)]); }
    if (b.errors.length) { results.push([vp, id, 'FAIL', 'JS error: ' + b.errors.splice(0).join(' | ').slice(0, 200)]); }
  }

  await b.goto(url); await ready(); await settle(1500);

  await item('SET-01', async () => {
    assert(await ev(`document.documentElement.dir === 'rtl' && document.documentElement.lang === 'ar'`), 'not Arabic RTL');
    assert(!(await has('#__bundler_err')), 'bundle error bar');
  });

  if (vp === 'phone') {
    await item('NAV-04', async () => {
      await go('#/lib'); await click('#sideOpen');
      assert(await ev(`document.body.classList.contains('side-open')`), 'sidebar did not open');
      await click('#sideScrim'); assert(!(await ev(`document.body.classList.contains('side-open')`)), 'scrim did not close it');
      await click('#sideOpen'); await click('#side a[href="#/quotes"]');
      assert(!(await ev(`document.body.classList.contains('side-open')`)), 'link did not close it');
    });
  } else {
    await item('NAV-01', async () => {
      const want = { '#/': 'home', '#/lib': 'lib', '#/quotes': 'quotes', '#/hlall': 'hlall', '#/review': 'review', '#/glossary': 'glossary', '#/map': 'map', '#/templates': 'tpl', '#/profile': 'profile' };
      for (const [h, v] of Object.entries(want)) {
        await click(h === '#/profile' ? '#userChip' : `#side .sd-nav a[href="${h}"]`);
        const now = await ev('location.hash || "#/"');
        assert(now === h, 'clicked ' + h + ', got ' + now);
        assert(!(await ev(`document.querySelector('#v-${v}').hidden`)), 'view ' + v + ' hidden');
      }
      await go('#/settings'); assert((await ev('location.hash')) === '#/profile/ai', '#/settings did not redirect');
    });
  }

  await item('LIB-01', async () => {
    await go('#/lib');
    assert(await count('#v-lib .shelf-h') >= 1, 'no shelf heading');
    assert(await count('#v-lib [data-href^="#/book/"]') >= 2, 'demo items missing');
    assert((await txt('#side')).includes('3'), 'review badge 3 missing');
  });

  await item('LIB-03', async () => {
    await go('#/lib'); await type('#q', 'التنبؤ'); await settle(500);
    assert(!(await ev(`document.querySelector('#results').hidden`)), 'results hidden');
    return (await count('#results .res')) + ' results';
  });

  await item('BK-01', async () => {
    await go('#/book/' + BOOK);
    assert((await txt('#v-book .bp-h')).includes('آلة التجربة'), 'title missing');
    for (const a of ['chat', 'snd', 'more']) assert(await has(`#v-book [data-bpa="${a}"]`), 'button ' + a + ' missing');
    assert(await has(`#v-book [data-href="#/read/${BOOK}"]`), 'start reading missing');
  });

  if (vp === 'desktop') {
    await item('HOME-01', async () => {
      await go('#/');
      assert(await has('#v-home #chIn'), 'composer missing');
      assert((await txt('#v-home')).includes('وش تبي تقرأ اليوم'), 'heading missing');
    });
    await item('HOME-06', async () => {
      await go('#/'); await type('#v-home #chIn', 'وش الفكرة الأساسية في آلة التجربة؟'); await click('#v-home #chSend'); await settle(800);
      assert(/^#\/c\//.test(await ev('location.hash')), 'URL did not become #/c/<id>');
      assert(await has('#v-home a[href*="#/profile/ai"], #v-home a[href*="#/settings"], #v-home [data-go*="profile"]'), 'no link to settings');
    });
    await item('HOME-02', async () => {
      await go('#/lib'); await go('#/'); await type('#v-home #chIn', 'راجع'); await click('#v-home #chSend'); await settle(1500);
      assert((await ev('location.hash')) === '#/review', 'did not open review, at ' + await ev('location.hash'));
    });
    await item('REV-01', async () => {
      await go('#/review'); const t = await txt('#v-review');
      assert(t.includes('1 من 3') || t.includes('1 of 3'), 'no "card 1 of 3"');
    });
    await item('REV-02', async () => {
      await click('#v-review [data-rv="show"]'); await click('#v-review [data-rv="yes"]');
      assert((await txt('#v-review')).includes('2 من'), 'did not advance');
      assert((await txt('#side [href="#/review"]')).includes('2'), 'badge not 2');
    });
    await item('CH-01', async () => {
      await go('#/bchat/' + BOOK); await type('#v-home #chIn', 'سؤال عن الكتاب'); await click('#v-home #chSend'); await settle(800);
      await go('#/lib');
      assert(await count('#sideList [data-conv-id]') >= 2, 'expected home and book chats in sidebar');
      assert(await count('#sideList .sd-sub') >= 1, 'no date group');
    });
    await item('SND-01', async () => {
      await go('#/book/' + BOOK); await click('#v-book [data-bpa="snd"]');
      assert(await vis('#sndPanel'), 'panel hidden');
      // web build: six recorded sounds + the calm noise; single file: the calm noise and a note pointing to the web version
      const web = !(await has('#sndPanel .snd-web'));
      assert(await count('#sndPanel input[type="range"]') === (web ? 8 : 2), 'expected master + ' + (web ? 7 : 1) + ' sliders');
      assert(await count('#sndPanel [data-sn="brown"]') === 1, 'calm noise missing');
      await ev(`document.querySelector('#sndScrim').click(); document.body.click();`); await settle();
    });
  }

  await item('RT-01', async () => {
    await go('#/read/' + BOOK); await settle(1200);
    assert(await has('#rtPick'), 'template picker missing on first open');
    assert(await count('#rtPick [data-rtpick]') >= 3, 'picker options missing');
    await click('#rtPick [data-rtpick="modern"]'); await settle(1000);
    assert(!(await has('#rtPick')), 'picker did not close');
    const s = await rt(); assert(s && s.id === 'modern', 'template not modern');
  });

  await item('RD-01', async () => {
    const t = await txt('#v-read');
    assert(t.includes('آلة التجربة') && t.includes('ليش أقرأه'), 'cover missing');
    assert(t.includes('الفصول'), 'chapter map missing');
  });

  await item('RT-02', async () => {
    const seen = [];
    for (const id of ['book', 'manu', 'modern']) {
      await setTpl(id); const s = await rt();
      assert(s && s.id === id, 'switch to ' + id + ' failed');
      if (id !== 'modern') assert(s.paged, id + ' not paged');
      seen.push(id + (s.paged ? ' paged ' + s.pages + 'p cols ' + s.cols : ' scroll'));
    }
    return seen.join('; ');
  });

  await item('RD-02', async () => {
    await setTpl('book'); const a = await rt();
    const w = await ev('innerWidth'), h = await ev('innerHeight');
    await b.tap(Math.round(w * 0.05), Math.round(h / 2)); await settle(900); const c = await rt();
    assert(c.pos !== a.pos, 'edge tap did not turn the page (' + a.pos + ')');
    await b.tap(Math.round(w * 0.95), Math.round(h / 2)); await settle(900); const d = await rt();
    assert(d.pos === a.pos, 'opposite edge did not turn back (' + d.pos + ')');
    return a.pos + ' -> ' + c.pos + ' -> ' + d.pos;
  });

  if (vp === 'desktop') {
    await item('TB-07', async () => {
      await click('[data-rtt="aa"]');
      await click('#sheet [data-pref="theme"] [data-v="sepia"]'); await click('#sheet [data-pref="font"] [data-v="amiri"]');
      assert(await ev(`document.documentElement.dataset.theme === 'sepia' && document.documentElement.dataset.font === 'amiri'`), 'not applied');
      await b.reload(); await ready(); await settle(1200);
      assert(await ev(`document.documentElement.dataset.theme === 'sepia' && document.documentElement.dataset.font === 'amiri'`), 'not kept after reload');
    });

    await setTpl('modern').catch(() => {});
    const selectIn = async () => {
      await ev(`(() => { getSelection().removeAllRanges(); const p = [...document.querySelectorAll('#v-read [data-bk]')].find(e => { const r = e.getBoundingClientRect(); return r.top > 60 && r.bottom < innerHeight && e.textContent.trim().length > 40 && !e.querySelector('mark'); }) || [...document.querySelectorAll('#v-read [data-bk]')].find(e => e.textContent.trim().length > 40);
        p.scrollIntoView({ block:'center' }); const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode()) && n.data.trim().length < 25);
        const r = document.createRange(); r.setStart(n, 3); r.setEnd(n, 20); getSelection().addRange(r); })()`);
      await settle(700);
    };
    await item('SEL-02', async () => {
      await go('#/lib'); await go('#/read/' + BOOK + '/c0'); await settle(1200);
      await ev(`(() => { const e = [...document.querySelectorAll('#v-read [data-bk]')].find(x => x.closest('.chapter, section, article') && x.textContent.length > 60); if (e) e.scrollIntoView({ block:'center' }); })()`); await settle();
      await selectIn();
      assert(await vis('#selbar'), 'selection bar not shown');
      for (const k of ['imp', 'unc', 'q', 'explain']) assert(await has(`#selbar [data-sel="${k}"]`), k + ' missing');
    });
    await item('SEL-03', async () => {
      const n0 = await count('#v-read mark.hl'); await click('#selbar [data-sel="imp"]'); await settle();
      assert(await count('#v-read mark.hl') > n0, 'no highlight mark added');
    });
    await item('SEL-06', async () => {
      await click('#v-read mark.hl'); await settle();
      assert(await ev(`document.querySelector('#sheet').classList.contains('open')`), 'sheet not open');
      for (const k of ['imp', 'unc', 'q']) assert(await has(`#sheet [data-hk="${k}"]`), 'kind ' + k + ' missing');
      await ev(`document.querySelector('#sheet [data-close]') && document.querySelector('#sheet [data-close]').click()`); await settle();
    });
    await item('QC-01', async () => {
      await selectIn(); await click('#selbar [data-sel="quote"]'); await settle(900);
      assert(await has('#qeTx'), 'quote editor missing');
      await ev(`(document.querySelector('#modal [data-close], #sheet [data-close]') || document.body).click()`); await settle();
      await go('#/quotes'); assert(await count('#v-quotes [data-qcard]') >= 1, 'quote not saved');
      await click('#v-quotes [data-qcard]'); assert(await has('#qeTx'), 'editor did not open from My quotes');
      await ev(`(document.querySelector('#modal [data-close], #sheet [data-close]') || document.body).click()`); await settle();
    });
    await item('SET-04', async () => {
      const before = await count('#v-read mark.hl'); void before;
      await b.reload(); await ready(); await settle(1000); await go('#/hlall');
      assert((await txt('#v-hlall')).match(/\d+/) && await count('#v-hlall [data-href]') >= 1, 'highlights lost after reload');
    });

    await item('SETT-01', async () => {
      await go('#/profile/ai');
      for (const s of ['#sBase', '#sModel', '#sKey', '#sSave', '#sTest', '#sClear']) assert(await has(s), s + ' missing');
      assert((await ev(`document.querySelector('#sBase').value || document.querySelector('#sBase').placeholder`)).includes('deepseek'), 'default URL');
    });
    await item('EXP-01', async () => {
      await type('#sKey', KEY); await click('#sSave');
      const dl = path.join(TMP, vp); await b.downloadsTo(dl);
      await go('#/profile/privacy'); await click('#pvExp'); await settle(1500);
      const f = fs.readdirSync(dl).filter(x => /^maktabati-\d{4}-\d\d-\d\d\.json$/.test(x));
      assert(f.length === 1, 'no export file (' + fs.readdirSync(dl).join(',') + ')');
      return f[0];
    });
    await item('EXP-02', async () => {
      const dl = path.join(TMP, vp), f = fs.readdirSync(dl).find(x => /^maktabati-\d{4}/.test(x));
      const raw = fs.readFileSync(path.join(dl, f), 'utf8'), d = JSON.parse(raw);
      assert(d.app === 'maktabati' && d.v === 1 && d.exported && Array.isArray(d.items) && Array.isArray(d.annos) && Array.isArray(d.kv), 'shape');
      assert(!raw.includes(KEY), 'API KEY FOUND IN EXPORT');
      return d.items.length + ' items, ' + d.annos.length + ' annos, ' + d.kv.length + ' kv, no key';
    });
    await item('IMP-01', async () => {
      const f = path.join(TMP, 'imp.json');
      fs.writeFileSync(f, JSON.stringify({ app:'maktabati', v:1, exported:new Date().toISOString(), annos:[], kv:[], items:[{ id:'smoke-imp', type:'article', title:'Smoke import', createdAt:Date.now(), progress:0, chapters:[{ title:'One', sections:[{ title:'', blocks:[{ type:'p', text:'نص تجريبي للاستيراد.' }] }] }] }] }));
      await go('#/profile/privacy'); await b.setFiles('#pvImp', [f]); await settle(800);
      assert(await toastHas('استوردت 1'), 'toast: ' + await txt('#toast'));
      await go('#/lib'); assert((await txt('#v-lib')).includes('Smoke import'), 'item not in library');
    });
    await item('DEL-01', async () => {
      await go('#/book/smoke-imp'); await click('#v-book [data-bpa="more"]'); await click('#sheet [data-bpa="del"]');
      assert(await has('#modalBox #delExp'), 'no export-first button'); await click('#modalBox #cfGo'); await settle(800);
      assert((await ev('location.hash')) === '#/lib', 'not back in library');
      assert(!(await txt('#v-lib')).includes('Smoke import'), 'item still there');
    });
    await item('PF-01', async () => {
      for (const t of ['profile', 'read', 'ai', 'privacy', 'look', 'about']) { await go('#/profile/' + t); assert((await ev(`document.querySelector('#pfBody').innerHTML.length`)) > 50, t + ' empty'); }
      await ev(`document.querySelector('#sClear')`); await go('#/profile/ai'); await click('#sClear');
    });
    await item('TG-01', async () => {
      await go('#/templates'); assert(await count('#v-tpl .tg-card') === 3, 'expected 3 template cards');
      const saved = await ev(`(JSON.parse(localStorage.getItem('maktabati:profile') || '{}').tpl || {}).books`);
      await click('#v-tpl [data-tgtry="manu"]'); await settle(1500);
      const s = await rt(); assert(s && s.id === 'manu', 'did not open in manuscript');
      const after = await ev(`(JSON.parse(localStorage.getItem('maktabati:profile') || '{}').tpl || {}).books`);
      assert(JSON.stringify(saved) === JSON.stringify(after), 'trying changed the saved choice');
    });
    for (const [id, fn] of extra) await item(id, () => fn({ b, ev, go, click, has, vis, txt, count, type, settle, ready, toastHas, assert, TMP }));
    await item('SETT-06', async () => {
      await go('#/profile/look'); await ev(`document.querySelector('[data-seg="ui.lang"] [data-v="en"]').click()`); await b.sleep(1500); await ready(); await settle();
      assert(await ev(`document.documentElement.lang === 'en' && document.documentElement.dir === 'ltr'`), 'not English LTR');
      assert((await txt('#side')).includes('Library'), 'sidebar not translated');
      await go('#/profile/look'); await ev(`document.querySelector('[data-seg="ui.lang"] [data-v="ar"]').click()`); await b.sleep(1500); await ready();
      assert(await ev(`document.documentElement.lang === 'ar'`), 'did not switch back');
    });
  } else {
    await item('RT-02-phone', async () => {
      await setTpl('book'); const s = await rt();
      assert(s.cols === 1, 'expected one page on phone, got cols ' + s.cols);
    });
  }
}

const VIEWPORTS = { desktop: { width: 1280, height: 900 }, phone: { width: 390, height: 844, mobile: true } };

async function main() {
  const srv = /^(https?|file):/.test(page) ? null : await serve(ROOT);
  const url = srv ? srv.url + '/' + page.split('/').map(encodeURIComponent).join('/') : page;
  for (const [vp, size] of Object.entries(VIEWPORTS)) {
    const b = await launch(size);
    try { await runSmoke(b, url, vp); } catch (e) { results.push([vp, 'RUN', 'FAIL', String(e.message || e)]); } finally { await b.close(); }
  }
  if (srv) await srv.close();
  for (const r of results) console.log(r[2].padEnd(4) + ' ' + (r[0] + ' ' + r[1]).padEnd(22) + ' ' + r[3]);
  const fail = results.filter(r => r[2] === 'FAIL').length;
  console.log('\n' + (results.length - fail) + ' passed, ' + fail + ' failed  (' + page + ')');
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) main();
