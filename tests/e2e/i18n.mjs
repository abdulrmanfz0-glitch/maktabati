// English/Arabic localization end-to-end check.
// Requires a dev server: npm run dev -- --host 127.0.0.1
// Usage: node tests/e2e/i18n.mjs http://127.0.0.1:5173/
import { launch } from '../../tools/lib/cdp.mjs';

const page = process.argv[2] || 'http://127.0.0.1:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* UI copy only: book/user text is inside these containers and must stay in the
   author's language. The list mirrors TR_SKIP plus the card title attributes. */
const SCAN = `(() => {
  const AR = /[\\u0600-\\u06FF]/;
  const skip = 'script,style,noscript,template,[data-no-tr],.rtp-p,.rtp-run,.book-text,.bk,.cv,.bcv,.card,.hlq,.rv-q,.rv-a,.gl-ar,.gl-def,.sh-quote,.qa .q,.qa .ans,.terms td,.rt-rh,.rt-cw,.rt-fz,.rt-gl,.rt-ovc,.rd-prev,.bp-h,.bp-sub,.bp-au,.bp-why p,.bp-ch .t,.rv-src,.bp-cv,#pageTitle,#tbTitle,textarea,pre,code,bdi';
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const out = new Map();
  const add = (text, el, kind) => {
    text = text.replace(/\\s+/g, ' ').trim();
    if (!text || !AR.test(text)) return;
    if (el.closest && el.closest(skip)) return;
    if (!el.closest || !vis(el.closest('*'))) return;
    const k = kind + '|' + text;
    if (!out.has(k)) {
      const path = []; let p = el;
      for (let i = 0; i < 5 && p; i++, p = p.parentElement) path.unshift(p.localName + (p.id ? '#' + p.id : '') + (p.className ? '.' + String(p.className).split(' ').join('.') : ''));
      out.set(k, { text, kind, path: path.join(' > ') });
    }
  };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) add(n.nodeValue, n.parentElement, 'text');
  document.querySelectorAll('[aria-label],[placeholder],[title]').forEach(el =>
    ['aria-label', 'placeholder', 'title'].forEach(a => { if (el.hasAttribute(a)) add(el.getAttribute(a), el, a); }));
  return [...out.values()];
})()`;

const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); if (!ok) console.error('FAIL', name, detail); };

const b = await launch({ width: 1280, height: 900 });
const ev = x => b.evaluate(x);
const go = async (h, wait = 700) => { await ev(`location.hash = ${JSON.stringify(h)}`); await sleep(wait); };
const click = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) e.click(); return !!e; })()`);
const closeDialog = async () => { await ev(`(() => { const c = document.querySelector('#modal [data-close], #sheet [data-close], #sheet .sh-head button, #modal .mhead button'); if (c) c.click(); else { const m = document.querySelector('#modal'); if (m && !m.hidden) m.click(); } })()`); await sleep(300); };
async function englishLeaks() { return ev(SCAN); }

try {
  await b.goto(page);
  await b.waitFor(`!!document.querySelector('#v-lib')`, 20000);
  await ev(`localStorage.setItem('reader:lang', '"en"')`);
  await ev(`(() => { try{ const p = JSON.parse(localStorage.getItem('maktabati:profile') || '{}'); p.tpl = { def:'modern', books:{'demo-guide':'modern'} }; localStorage.setItem('maktabati:profile', JSON.stringify(p)); }catch(e){} })()`);
  await b.reload();
  await b.waitFor(`document.documentElement.lang === 'en'`, 20000);
  await sleep(900);

  check('html lang is en', await ev(`document.documentElement.lang === 'en'`));
  check('html dir is ltr', await ev(`document.documentElement.dir === 'ltr'`));
  check('document title is English', !/[\u0600-\u06FF]/.test(await ev('document.title')), await ev('document.title'));
  check('sidebar is English', await ev(`document.querySelector('#side .sd-nav').textContent.includes('Library')`));

  const routes = ['#/lib', '#/', '#/quotes', '#/hlall', '#/review', '#/glossary', '#/map', '#/templates', '#/profile', '#/profile/read', '#/profile/ai', '#/profile/privacy', '#/profile/look', '#/profile/about', '#/book/demo-guide', '#/read/demo-guide', '#/read/demo-guide/c0', '#/hls/demo-guide'];
  for (const route of routes) {
    await go(route, 800);
    const leaks = await englishLeaks();
    check('English UI clean ' + route, leaks.length === 0, JSON.stringify(leaks.slice(0, 4)));
  }

  // Reader content stays in the author's language while its chrome is English.
  await go('#/read/demo-guide/c0', 900);
  check('reader chrome is English', (await ev(`document.querySelector('#v-read .label') ? document.querySelector('#v-read .label').textContent : ''`)).includes('Chapter map'));
  check('book chapter title is untouched', await ev(`document.querySelector('#v-read .divider h2').textContent.trim() === 'حدّد واسأل'`));
  check('Arabic book keeps RTL direction', await ev(`document.querySelector('#v-read').dir === 'rtl'`));

  // Dialogs: book menu, delete confirm, quote editor, sounds, AI add.
  await go('#/lib', 700);
  await click('.cv-more');
  await b.waitFor(`document.querySelector('#sheet').classList.contains('open')`, 5000);
  check('book menu is English', (await ev(`document.querySelector('#sheet').innerText`)).includes('Add to a collection'));
  const menuLeaks = await englishLeaks();
  check('book menu has no Arabic UI', menuLeaks.length === 0, JSON.stringify(menuLeaks.slice(0, 4)));
  await click('[data-bm="del"]'); await sleep(400);
  check('delete confirm is English', (await ev(`document.querySelector('#modalBox').innerText`)).includes('Delete book'));
  const delLeaks = await englishLeaks();
  check('delete confirm has no Arabic UI', delLeaks.length === 0, JSON.stringify(delLeaks.slice(0, 4)));
  await closeDialog();

  await go('#/quotes', 700);
  await click('[data-qcard]'); await sleep(900);
  check('quote editor has no Arabic UI', (await englishLeaks()).length === 0);
  await closeDialog();

  await go('#/read/demo-guide', 900);
  await click('#sndBtn'); await sleep(500);
  check('sound mixer is English', (await ev(`document.querySelector('#sndPanel').innerText`)).includes('Timer'));
  check('sound mixer has no Arabic UI', (await englishLeaks()).length === 0);
  await ev(`document.querySelector('#sndScrim').click()`); await sleep(300);

  await go('#/profile/ai', 700);
  await click('#aiAdd'); await sleep(500);
  check('AI dialog is English', (await ev(`document.querySelector('#modalBox').innerText`)).includes('Add connection'));
  check('AI dialog has no Arabic UI', (await englishLeaks()).length === 0);
  await closeDialog();

  // A toast follows the selected language (bookmark added/removed).
  await go('#/read/demo-guide/c0', 900);
  await click('#bmBtn'); await sleep(500);
  const toast = await ev(`document.querySelector('#toast').textContent`);
  check('toast is English', toast.trim().length > 0 && !/[\u0600-\u06FF]/.test(toast), toast);

  // Template gallery and the reading template chrome.
  await go('#/templates', 800);
  check('template gallery is English', (await ev(`document.querySelector('#v-tpl').innerText`)).includes('Template gallery'));
  check('template gallery has no Arabic UI', (await englishLeaks()).length === 0);

  // Every reading template keeps English chrome over RTL book content.
  await go('#/read/demo-guide/c0', 900);
  for (const tpl of ['book', 'manu', 'tidy', 'modern']) {
    await ev(`window.__rt && window.__rt.set(${JSON.stringify(tpl)})`); await sleep(900);
    const leaks = await englishLeaks();
    check('template chrome is English: ' + tpl, leaks.length === 0, JSON.stringify(leaks.slice(0, 4)));
    check('template content direction: ' + tpl, await ev(`document.querySelector('#v-read').dir === 'rtl'`));
  }

  // Switch to Arabic through the real settings control.
  await go('#/profile/look', 700);
  await click('[data-seg="ui.lang"] [data-v="ar"]');
  await b.waitFor(`document.documentElement.lang === 'ar'`, 15000);
  await sleep(700);
  check('Arabic html lang', await ev(`document.documentElement.lang === 'ar'`));
  check('Arabic dir is rtl', await ev(`document.documentElement.dir === 'rtl'`));
  check('Arabic sidebar is back', await ev(`document.querySelector('#side .sd-nav').textContent.includes('المكتبة')`));
  check('Arabic preference persisted', await ev(`localStorage.getItem('reader:lang') === '"ar"'`));
  await go('#/read/demo-guide/c0', 900);
  check('Arabic reader chrome is Arabic', (await ev(`document.querySelector('#v-read .label').textContent`)).includes('خريطة الفصل'));

  // Switch back to English and confirm persistence.
  await go('#/profile/look', 700);
  await click('[data-seg="ui.lang"] [data-v="en"]');
  await b.waitFor(`document.documentElement.lang === 'en'`, 15000);
  await sleep(700);
  check('English preference persisted', await ev(`localStorage.getItem('reader:lang') === '"en"'`));
  check('English sidebar after switch', await ev(`document.querySelector('#side .sd-nav').textContent.includes('Library')`));

  // LTR layout does not scroll horizontally on a phone width.
  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await ev(`window.dispatchEvent(new Event('resize'))`); await sleep(400);
  const overflow = await ev(`document.scrollingElement.scrollWidth - innerWidth`);
  check('no horizontal overflow at 390px', overflow <= 1, String(overflow));

  const failed = checks.filter(c => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.error('I18N E2E FAIL', e && (e.stack || e.message || e));
  process.exitCode = 1;
} finally {
  await b.close();
}
