#!/usr/bin/env node
// Upload detection through the app's single entry point (headless Chrome).
// Inputs are generated here (synthetic text, no book text) plus one fixture PDF for the long-book case.
// Prints metrics only.
//
//   node tests/e2e/upload.mjs [page]
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { launch, scratchDir } from '../../tools/lib/cdp.mjs';
import { serve } from '../../tools/lib/static-server.mjs';
import { listFixtures } from '../../tools/lib/fixtures.mjs';
import { makePdf, bookPages, scannedPdf } from '../helpers/make-pdf.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const page = process.argv[2] || 'dist/web/index.html';
const TMP = scratchDir('mk-up-');

// ---- synthetic inputs ----
const AR = 'كان الطريق طويلا والمدينة بعيدة وفي الصباح خرج الناس إلى السوق يحملون الخبز والماء ويتحدثون عن المطر والحقول والبيت القديم'.split(' ');
let seed = 7; const rnd = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
const arWords = n => Array.from({ length: n }, () => AR[rnd(AR.length)]).join(' ');
const arPara = n => arWords(n) + '.';
const EN = 'the river ran past the old stone house where morning light fell on quiet paper and letters waited in the garden'.split(' ');
const enPara = n => Array.from({ length: n }, () => EN[rnd(EN.length)]).join(' ') + '.';
const files = {};
const put = (name, data) => { const f = path.join(TMP, name); fs.writeFileSync(f, data); files[name] = f; return f; };

async function epub(name, chapters, words) {
  const z = new JSZip();
  z.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  z.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/c.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  const items = Array.from({ length: chapters }, (_, i) => i + 1);
  z.file('OEBPS/c.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>كتاب تجريبي</dc:title><dc:creator>كاتب تجريبي</dc:creator><dc:language>ar</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' + items.map(i => '<item id="c' + i + '" href="c' + i + '.xhtml" media-type="application/xhtml+xml"/>').join('') + '</manifest><spine>' + items.map(i => '<itemref idref="c' + i + '"/>').join('') + '</spine></package>');
  z.file('OEBPS/nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>' + items.map(i => '<li><a href="c' + i + '.xhtml">الفصل ' + i + '</a></li>').join('') + '</ol></nav></body></html>');
  for (const i of items) z.file('OEBPS/c' + i + '.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>الفصل ' + i + '</h1>' + Array.from({ length: Math.ceil(words / chapters / 60) }, () => '<p>' + arPara(60) + '</p>').join('') + '</body></html>');
  // mimetype must be first and stored
  return put(name, await z.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' }));
}

async function main() {
  const longPdf = listFixtures().sort((a, b) => b.size - a.size).find(f => f.size < 20e6);
  put('short-article.pdf', makePdf(bookPages({ pages: 6, chapters: 1, toc: false, notes: false })));
  put('scan.pdf', makePdf(Array.from({ length: 12 }, (_, i) => '0.3 g 30 40 390 520 re f 1 g 60 ' + (100 + i * 10) + ' 300 20 re f')));
  put('scan-full.pdf', scannedPdf([[[0, 0, 450, 600]], [[0, 0, 450, 600]], [[0, 0, 450, 600]], [[0, 0, 450, 600]], [[0, 0, 450, 600]]]));
  await epub('long.epub', 5, 6000);
  await epub('short.epub', 2, 600);
  put('book.md', '# كتاب ماركداون\n\n' + [1, 2, 3, 4].map(i => '## الفصل ' + i + '\n\n' + Array.from({ length: 30 }, () => arPara(60)).join('\n\n')).join('\n\n'));
  put('note.txt', Array.from({ length: 6 }, () => arPara(40)).join('\n\n'));
  put('english.txt', Array.from({ length: 8 }, () => enPara(40)).join('\n\n'));
  put('library.json', JSON.stringify({ app: 'maktabati', v: 1, exported: new Date().toISOString(), annos: [], kv: [], items: [{ id: 'up-exp-1', type: 'article', title: 'Export item', createdAt: 1, progress: 0, chapters: [{ title: 'One', sections: [{ title: '', blocks: [{ type: 'p', text: 'نص.' }] }] }] }] }));
  put('random.bin', Buffer.from(Array.from({ length: 4000 }, (_, i) => (i * 37) % 256)));
  const pasted = Array.from({ length: 5 }, () => arPara(30)).join('\n\n');

  const srv = /^(https?|file):/.test(page) ? null : await serve(ROOT);
  const url = srv ? srv.url + '/' + page.split('/').map(encodeURIComponent).join('/') : page;
  const b = await launch({ width: 1280, height: 900 }), ev = x => b.evaluate(x), settle = (ms = 600) => b.sleep(ms);
  const rows = [];
  const row = (name, ok, note) => rows.push([ok ? 'PASS' : 'FAIL', name, note || '']);
  const pv = () => ev(`(() => { const p = s => { const e = document.querySelector(s + ' [aria-pressed="true"]'); return e && e.dataset.v; }; const s = document.querySelector('#pvSave'); return s ? { type: p('#pvType'), lang: p('#pvLang'), title: document.querySelector('#pvT').value.length, hasTitle: !!document.querySelector('#pvT').value.trim(), author: !!document.querySelector('#pvA').value.trim(), chapters: +document.querySelector('#pvN').textContent, disabled: s.disabled, rec: (document.querySelector('#modalBox .msg b') || {}).textContent ? 'report' : 'none' } : null; })()`);
  const waitPv = (t = 300000) => b.waitFor(`!!document.querySelector('#pvSave') || !!document.querySelector('#dupOpen') || !!document.querySelector('#libGo') || /ما قدرت|ما أعرف/.test(document.querySelector('#modalBox').textContent + document.querySelector('#toast').textContent)`, t);
  const items = () => ev(`new Promise(res => { const q = indexedDB.open('maktabati'); q.onsuccess = () => { const r = q.result.transaction('items').objectStore('items').getAll(); r.onsuccess = () => res(r.result.map(i => ({ id: i.id, type: i.type, lang: i.lang || null, hash: i.hash || null, title: i.title, chapters: (i.chapters || []).length, ingest: i.ingest ? i.ingest.rec : null, source: i.source || null, ocr: i.ocr || null, createdAt: i.createdAt }))); }; })`);
  const filesStore = () => ev(`new Promise(res => { const q = indexedDB.open('maktabati'); q.onsuccess = () => { const r = q.result.transaction('files').objectStore('files').getAll(); r.onsuccess = () => res(r.result.map(f => f.id)); }; })`);
  const upFile = async f => { await ev(`location.hash = '#/lib'`); await settle(300); await b.setFiles('#upFile', [f]); };
  const close = () => ev(`(document.querySelector('#modal:not([hidden]) [data-close]') || document.body).click()`);
  const saveNew = async () => { const before = (await items()).map(i => i.id); await ev(`document.querySelector('#pvSave').click()`); await settle(1200); return (await items()).find(i => !before.includes(i.id)); };

  try {
    await b.goto(url); await b.waitFor(`(() => { const v = document.querySelector('main .view:not([hidden])'); return !!(v && v.innerHTML.length); })()`); await settle(1200);
    row('sidebar has one upload action', await ev(`[...document.querySelectorAll('#side [data-add]')].length === 1 && document.querySelector('#side [data-add]').textContent.includes('ارفع')`));
    await ev(`document.querySelector('#side [data-add]').click()`); await settle();
    row('upload sheet has no type choice', await ev(`!!document.querySelector('#upPick') && !document.querySelector('#typeSeg, [data-type]')`)); await close(); await settle();

    // 1. PDF book (long fixture)
    await upFile(longPdf.path); await waitPv();
    let p = await pv(); row('PDF book -> book', p && p.type === 'book' && p.hasTitle && p.lang === 'ar', JSON.stringify(p));
    let it = await saveNew(); row('PDF book stored with hash, lang, report', it && it.type === 'book' && it.hash && it.lang === 'ar' && it.ingest, it && JSON.stringify({ type: it.type, lang: it.lang, ingest: it.ingest, chapters: it.chapters, hash: !!it.hash }));
    const pdfId = it && it.id;

    // 2. short PDF article (also checks one-tap correction of the type)
    await upFile(files['short-article.pdf']); await waitPv();
    p = await pv(); row('short PDF -> article', p && p.type === 'article', JSON.stringify(p));
    await ev(`document.querySelector('#pvType [data-v="book"]').click()`); await ev(`(() => { const t = document.querySelector('#pvT'); t.value = 'عنوان مصحّح'; })()`);
    it = await saveNew(); row('type and title corrected in preview', it && it.type === 'book' && it.title === 'عنوان مصحّح', it && it.type);

    // 3. scanned PDF
    await upFile(files['scan.pdf']); await waitPv();
    p = await pv(); row('PDF without text layer -> vision, not saved', p && p.disabled === true, JSON.stringify(p)); await close(); await settle();

    // 3b. scanned PDF with image pages: saved with bytes, badge and placeholder
    await upFile(files['scan-full.pdf']); await waitPv();
    p = await pv(); row('scanned PDF -> savable preview', p && p.disabled === false && p.rec === 'report', JSON.stringify(p));
    it = await saveNew(); const scanId = it && it.id;
    row('scanned PDF stored with marker', it && it.type === 'book' && it.ingest === 'vision' && it.source === 'scan' && it.ocr && it.ocr.status === 'pending' && it.ocr.pages === 5 && it.ocr.done === 0, it && JSON.stringify({ ingest: it.ingest, source: it.source, ocr: it.ocr, chapters: it.chapters }));
    row('PDF bytes kept in files store', (await filesStore()).length === 1 && (await filesStore())[0] === scanId, JSON.stringify(await filesStore()));
    await ev(`location.hash = '#/read/' + encodeURIComponent(${JSON.stringify(scanId)})`); await settle(700);
    row('scanned book opens placeholder', await ev(`document.querySelector('#v-read').textContent.includes('نص هالكتاب ما انقرأ بعد')`));
    await ev(`location.hash = '#/lib'`); await settle(600);
    row('library shows scanned badge', await ev(`document.querySelector('#v-lib').textContent.includes('ممسوح')`));
    await b.goto(url); await b.waitFor(`(() => { const v = document.querySelector('main .view:not([hidden])'); return !!(v && v.innerHTML.length); })()`); await settle(1200);
    await ev(`location.hash = '#/read/' + encodeURIComponent(${JSON.stringify(scanId)})`); await settle(700);
    row('scanned book survives reload with placeholder', await ev(`document.querySelector('#v-read').textContent.includes('نص هالكتاب ما انقرأ بعد')`));
    row('bytes survive reload', (await filesStore()).length === 1);
    await ev(`location.hash = '#/book/' + encodeURIComponent(${JSON.stringify(scanId)})`); await settle(600);
    await ev(`document.querySelector('#v-book [data-bpa="more"]').click()`); await settle(300);
    await ev(`[...document.querySelectorAll('#sheet [data-bpa]')].find(b => b.dataset.bpa === 'del').click()`); await settle(300);
    await ev(`document.querySelector('#cfGo').click()`); await settle(1500);
    row('scanned book deleted with its bytes', !(await items()).some(i => i.id === scanId) && (await filesStore()).length === 0);

    // 4. EPUB long and short
    await upFile(files['long.epub']); await waitPv();
    p = await pv(); row('EPUB -> book', p && p.type === 'book' && p.hasTitle && p.author, JSON.stringify(p)); it = await saveNew(); row('EPUB stored', !!it);
    await upFile(files['short.epub']); await waitPv();
    p = await pv(); row('very short EPUB -> article', p && p.type === 'article', JSON.stringify(p)); await close(); await settle();

    // 5. Markdown (via drag and drop anywhere)
    const mdB64 = fs.readFileSync(files['book.md']).toString('base64');
    await ev(`location.hash = '#/glossary'`); await settle(300);
    await ev(`(() => { const bin = atob(${JSON.stringify(mdB64)}), u = Uint8Array.from(bin, c => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([u], 'some-file-name.md', { type: '' })); for (const t of ['dragenter', 'dragover', 'drop']) document.querySelector('main').dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true })); })()`);
    await waitPv(30000);
    p = await pv(); row('Markdown dropped anywhere -> book, title from heading', p && p.type === 'book' && p.chapters === 4 && p.lang === 'ar', JSON.stringify(p));
    it = await saveNew(); row('Markdown title is the heading, not the file name', it && it.title !== 'some-file-name', it && ('len ' + it.title.length));
    const mdId = it && it.id;

    // 6. plain text via the chat paperclip; English text
    await ev(`location.hash = '#/'`); await settle();
    await b.setFiles('#chFile', [files['note.txt']]); await waitPv(30000);
    p = await pv(); row('text via paperclip -> article', p && p.type === 'article', JSON.stringify(p)); await close(); await settle();
    await upFile(files['english.txt']); await waitPv(30000);
    p = await pv(); row('English text -> lang en', p && p.lang === 'en', JSON.stringify(p)); it = await saveNew();
    row('English item stored ltr', it && it.lang === 'en');

    // 7. pasted long text outside a text field
    await ev(`location.hash = '#/lib'`); await settle();
    await ev(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', ${JSON.stringify(pasted)}); document.querySelector('#v-lib').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
    await waitPv(30000);
    p = await pv(); row('pasted text -> preview (article)', p && p.type === 'article', JSON.stringify(p)); it = await saveNew();
    row('pasted text stored with hash', it && !!it.hash);
    await ev(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', 'قصير'); document.querySelector('#v-lib').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`); await settle();
    row('short paste is ignored', await ev(`document.querySelector('#modal').hidden`));

    // 8. export file -> library import flow with confirmation
    await upFile(files['library.json']); await waitPv(30000);
    row('export file -> confirmation', await ev(`!!document.querySelector('#libGo')`));
    await ev(`document.querySelector('#libGo').click()`); await settle(900);
    row('export file imported', (await items()).some(i => i.id === 'up-exp-1'));

    // 9. duplicates
    await upFile(files['book.md']); await waitPv(30000);
    row('duplicate Markdown -> offer to open existing', await ev(`!!document.querySelector('#dupOpen')`));
    await ev(`document.querySelector('#dupOpen').click()`); await settle();
    row('open existing goes to its book page', (await ev('location.hash')) === '#/book/' + mdId);
    await upFile(longPdf.path); await waitPv();
    row('duplicate PDF detected before conversion', await ev(`!!document.querySelector('#dupOpen')`));
    await ev(`document.querySelector('#dupAdd').click()`); await waitPv();
    row('add another copy still converts', !!(await pv())); await close(); await settle();
    void pdfId;

    // 10. unknown content
    await upFile(files['random.bin']); await settle(800);
    row('unknown binary -> message, nothing stored', await ev(`document.querySelector('#toast').textContent.length > 0 && document.querySelector('#modal').hidden`));
    row('no JS errors', b.errors.length === 0, b.errors.slice(0, 2).join(' | ').slice(0, 200));
  } catch (e) { row('run', false, e.message); }
  finally { await b.close(); if (srv) await srv.close(); fs.rmSync(TMP, { recursive: true, force: true }); }
  for (const r of rows) console.log(r[0].padEnd(4), r[1].padEnd(52), r[2].slice(0, 160));
  const fail = rows.filter(r => r[0] === 'FAIL').length;
  console.log(rows.length - fail + ' passed, ' + fail + ' failed (' + page + ')');
  process.exit(fail ? 1 : 0);
}
main();
