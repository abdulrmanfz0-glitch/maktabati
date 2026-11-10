#!/usr/bin/env node
// Rendered-HTML snapshots of every route and screen, for "no behavior change" checks.
//
//   node tools/snapshot.mjs take <name> <page>       page is a path under the repo root ("My Library.html",
//                                                    "design-baseline/index.html", "dist/web/index.html") or a URL
//   node tools/snapshot.mjs compare <nameA> <nameB> [--save tests/snapshots/x.json]
//
// Output goes to out/snapshots/<name>/<viewport>/ (gitignored): one .html per screen (body DOM with scripts
// and styles removed, blob:/data: font URLs normalized) and a .png. Each run uses a fresh browser profile,
// a frozen clock and a seeded Math.random, so two runs of the same page give the same DOM.
// Only demo data is used (the app seeds it on a fresh origin), plus one quote and two chats added here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { launch } from './lib/cdp.mjs';
import { serve } from './lib/static-server.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const OUT = path.join(ROOT, 'out', 'snapshots');
const T0 = Date.UTC(2026, 9, 1, 9, 0, 0);
const VIEWPORTS = { desktop: { width: 1280, height: 900, mobile: false }, phone: { width: 390, height: 844, mobile: true } };
const BOOK = 'demo-experience', EXPL = 'demo-forgetting';

const FREEZE = `(() => {
  const T0 = ${T0}, RD = Date;
  class D extends RD { constructor(...a){ if (a.length) super(...a); else super(T0); } static now(){ return T0; } }
  window.Date = D;
  let s = 42; Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
})();`;

// Extra demo state written straight into IndexedDB (same shapes the app writes).
const EXTRA = `new Promise((res, rej) => {
  const q = indexedDB.open('maktabati');
  q.onerror = () => rej(q.error);
  q.onsuccess = () => {
    const db = q.result, tx = db.transaction(['annos', 'kv'], 'readwrite'), t = ${T0};
    tx.objectStore('annos').put({ id:'a-snapq', kind:'quote', itemId:'${BOOK}', bk:'0-1-1', text:'وهو أثمن ما يصل إلى الدماغ', t });
    const m = (role, content, dt) => ({ role, content, t: t - dt });
    tx.objectStore('kv').put({ k:'chat:lib', v:[{ id:'c-snaphome', t:t - 3600e3, msgs:[m('user', 'وش أبدأ أقرأ؟', 3600e3), m('assistant', 'ابدأ بـ**العقل المتنبّئ**، الفصل الأول قصير.', 3590e3)] }] });
    tx.objectStore('kv').put({ k:'chat:b:${BOOK}', v:[{ id:'c-snapbook', bookId:'${BOOK}', t:t - 7200e3, msgs:[m('user', 'وش يعني خطأ التنبّؤ؟', 7200e3), m('assistant', 'هو **الفرق** بين ما توقّعه الدماغ وما وصله فعلًا.', 7190e3)] }] });
    tx.oncomplete = () => { db.close(); res(true); }; tx.onerror = () => rej(tx.error);
  };
})`;

const CAPTURE = `(() => {
  const c = document.documentElement.cloneNode(true);
  c.querySelectorAll('script,style,link,noscript,[id^="__bundler"]').forEach(e => e.remove());
  // blank text nodes directly under body only reflect where build tools put <script> tags
  [...c.querySelector('body').childNodes].forEach(n => { if (n.nodeType === 3 && !n.data.trim()) n.remove(); });
  const attrs = [...c.attributes].map(a => a.name + '="' + a.value + '"').sort().join(' ');
  return '<html ' + attrs + '>\\n<title>' + document.title + '</title>\\n' + c.querySelector('body').outerHTML.replace(/></g, '>\\n<');
})()`;

// Screens: [name, hash, action?]. Actions run after the hash settles.
const SCREENS = [
  ['home', '#/'],
  ['home-chat', '#/c/c-snaphome'],
  ['library', '#/lib'],
  ['book-page', '#/book/' + BOOK],
  ['book-page-explainer', '#/book/' + EXPL],
  ['templates', '#/templates'],
  ...['profile', 'read', 'ai', 'privacy', 'look', 'about'].map(t => ['profile-' + t, '#/profile/' + t]),
  ['idea-map', '#/map'],
  ['chats-book-expanded', '#/bchat/' + BOOK],
  ['review', '#/review'],
  ['glossary', '#/glossary'],
  ['highlights-book', '#/hls/' + BOOK],
  ['highlights-all', '#/hlall'],
  ['quotes', '#/quotes'],
  ['quote-card-editor', '#/quotes', `document.querySelector('[data-qcard]').click()`],
  ['reader-explainer', '#/read/' + EXPL]
];
const TEMPLATES = { modern: 'حديث', book: 'الكتاب', manu: 'مخطوطة' };

async function take(name, page) {
  const srv = /^(https?|file):/.test(page) ? null : await serve(ROOT);
  const url = srv ? srv.url + '/' + page.split('/').map(encodeURIComponent).join('/') : page;
  const index = {};
  for (const [vp, size] of Object.entries(VIEWPORTS)) {
    const b = await launch(size);
    const dir = path.join(OUT, name, vp);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const settle = async (ms = 900) => { await b.sleep(ms); await b.evaluate('document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))'); };
    const shot = async screen => {
      const html = norm(await b.evaluate(CAPTURE));
      fs.writeFileSync(path.join(dir, screen + '.html'), html);
      await b.screenshot(path.join(dir, screen + '.png'));
      index[vp + '/' + screen] = { sha: sha(html), errors: b.errors.splice(0) };
    };
    const ready = () => b.waitFor(`(() => { const v = document.querySelector('main .view:not([hidden])'); return !!(v && v.innerHTML.length); })()`);
    try {
      await b.send('Page.addScriptToEvaluateOnNewDocument', { source: FREEZE });
      await b.goto(url); await ready(); await settle(1500);
      await b.evaluate(EXTRA);
      await b.reload(); await ready(); await settle();
      for (const [screen, hash, act] of SCREENS) {
        await b.evaluate(`location.hash = ${JSON.stringify(hash)}`); await settle();
        if (act) { await b.evaluate(act); await settle(); }
        await shot(screen);
        await b.evaluate(`location.hash = '#/lib'`); await settle(300);
      }
      // first open of a book shows the template picker
      await b.evaluate(`location.hash = '#/read/${BOOK}'`); await settle(1500);
      await shot('reader-template-picker');
      await b.evaluate(`location.hash = '#/lib'`); await settle(300);
      for (const [id] of Object.entries(TEMPLATES)) {
        await b.evaluate(`(() => { const p = JSON.parse(localStorage.getItem('maktabati:profile') || '{}') || {}; p.tpl = Object.assign({}, p.tpl); p.tpl.books = { '${BOOK}':'${id}' }; localStorage.setItem('maktabati:profile', JSON.stringify(p)); location.hash = '#/lib'; })()`);
        await b.reload(); await ready(); await settle();
        await b.evaluate(`location.hash = '#/read/${BOOK}'`); await settle(1500);
        await shot('reader-' + id);
        await b.evaluate(`window.MaktabatiSounds.open()`); await settle();
        await shot('sound-mixer-' + id);
        await b.evaluate(`location.hash = '#/lib'`); await settle(300);
      }
      // book chat panel inside the reader, then expanded
      await b.evaluate(`location.hash = '#/read/${BOOK}'`); await settle(1500);
      await b.evaluate(`document.querySelector('#talkBtn').click()`); await settle();
      await shot('reader-chat-panel');
      await b.evaluate(`document.querySelector('[data-ch="expand"]').click()`); await settle();
      await shot('reader-chat-expanded');
    } finally { await b.close(); }
  }
  fs.writeFileSync(path.join(OUT, name, 'index.json'), JSON.stringify({ page, url, index }, null, 2));
  if (srv) await srv.close();
  const errs = Object.entries(index).filter(([, v]) => v.errors.length);
  console.log(name + ': ' + Object.keys(index).length + ' screens' + (errs.length ? ', JS errors on ' + errs.map(e => e[0]).join(', ') : ', no JS errors'));
  errs.forEach(([k, v]) => console.log('  ' + k + ': ' + v.errors.join(' | ').slice(0, 300)));
}

function compare(a, b, save) {
  const A = JSON.parse(fs.readFileSync(path.join(OUT, a, 'index.json'))).index;
  const B = JSON.parse(fs.readFileSync(path.join(OUT, b, 'index.json'))).index;
  const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])].sort();
  const diff = keys.filter(k => !A[k] || !B[k] || A[k].sha !== B[k].sha);
  for (const k of diff) {
    const [vp, s] = k.split('/');
    const la = readLines(path.join(OUT, a, vp, s + '.html')), lb = readLines(path.join(OUT, b, vp, s + '.html'));
    let i = 0; while (i < la.length && la[i] === lb[i]) i++;
    console.log('DIFF ' + k + ' at line ' + (i + 1) + ':\n  - ' + String(la[i]).slice(0, 240) + '\n  + ' + String(lb[i]).slice(0, 240));
  }
  console.log(keys.length - diff.length + '/' + keys.length + ' screens match');
  if (save) {
    fs.mkdirSync(path.dirname(save), { recursive: true });
    fs.writeFileSync(save, JSON.stringify({ compared: [a, b], screens: Object.fromEntries(keys.map(k => [k, A[k] && A[k].sha])) }, null, 2) + '\n');
  }
  return diff.length === 0;
}

const readLines = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n') : [];
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const norm = h => h.replace(/blob:[^"')\s]+/g, 'blob:X').replace(/data:font\/[^"')]+/g, 'data:font');

const [cmd, x, y, ...rest] = process.argv.slice(2);
if (cmd === 'take' && x && y) await take(x, y);
else if (cmd === 'compare' && x && y) { const si = rest.indexOf('--save'); process.exit(compare(x, y, si >= 0 ? rest[si + 1] : null) ? 0 : 1); }
else { console.error('usage: snapshot.mjs take <name> <page> | compare <a> <b> [--save file]'); process.exit(2); }
