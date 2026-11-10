import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { ingestToResult, detectKind, toMarkdown } from '../src/index.js';
import { parseMarkdown, decodeText } from '../src/markdown.js';
import { htmlBlocks, noteTargetsOf, tokenize, decodeEntities } from '../src/html.js';
import { mdToItem } from '../../../tests/helpers/app-markdown.mjs';

const U = (...c) => String.fromCodePoint(...c);
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

async function epub3() {
  const z = new JSZip();
  z.file('mimetype', 'application/epub+zip');
  z.file('META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  z.file('OEBPS/content.opf', `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>كتاب &amp; تجربة</dc:title><dc:creator>مؤلف</dc:creator></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="text/c1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/c2.xhtml" media-type="application/xhtml+xml"/><item id="im" href="images/f.png" media-type="image/png"/></manifest>
<spine><itemref idref="nav"/><itemref idref="c1"/><itemref idref="c2"/></spine></package>`);
  z.file('OEBPS/nav.xhtml', `<html xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="text/c1.xhtml">الفصل الأول</a><ol><li><a href="text/c1.xhtml#s2">قسم</a></li></ol></li><li><a href="text/c2.xhtml#top">الفصل الثاني</a></li></ol></nav></body></html>`);
  z.file('OEBPS/text/c1.xhtml', `<html xmlns:epub="http://www.idpf.org/2007/ops"><head><title>x</title><style>p{}</style></head><body>
<h1>الفصل الأول</h1><p>فقرة فيها حاشية<a epub:type="noteref" href="#n1">1</a> ونص.</p>
<h2 id="s2">قسم فرعي</h2><p>فقرة&nbsp;ثانية <b>بخط</b> عريض.</p><ul><li>بند أول</li><li>بند ثان</li></ul>
<figure><img src="../images/f.png" alt="رسم"/><figcaption>شكل ١: رسم</figcaption></figure>
<aside epub:type="footnote" id="n1"><p>1. نص الحاشية.</p></aside></body></html>`);
  z.file('OEBPS/text/c2.xhtml', `<html><body><section id="top"><h1>الفصل الثاني</h1><p>نص الفصل الثاني<a href="#fn2"><sup>2</sup></a>.</p><ol><li id="fn2">حاشية ثانية</li></ol></section></body></html>`);
  z.file('OEBPS/images/f.png', PNG);
  return z.generateAsync({ type: 'uint8array' });
}

async function epub2() {
  const z = new JSZip();
  z.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>');
  z.file('content.opf', `<package><metadata><dc:title>Two</dc:title></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="a" href="a.html" media-type="application/xhtml+xml"/><item id="b" href="b.html" media-type="application/xhtml+xml"/></manifest><spine toc="ncx"><itemref idref="a"/><itemref idref="b"/></spine></package>`);
  z.file('toc.ncx', `<ncx><navMap><navPoint id="p1"><navLabel><text>أ</text></navLabel><content src="a.html"/></navPoint><navPoint id="p2"><navLabel><text>ب</text></navLabel><content src="b.html"/></navPoint></navMap></ncx>`);
  z.file('a.html', '<html><body><p>نص أ</p></body></html>');
  z.file('b.html', '<html><body><p>نص ب</p></body></html>');
  return z.generateAsync({ type: 'uint8array' });
}

describe('html helpers', () => {
  it('decodes entities', () => {
    expect(decodeEntities('&amp;&#1576;&#x628;&nbsp;&raquo;')).toBe('&بب »');
  });
  it('tokenizes tags, attributes and text', () => {
    const t = tokenize('<p class="a" id=\'x\'>نص<br/></p>');
    expect(t[0]).toMatchObject({ t: 'open', name: 'p', attrs: { class: 'a', id: 'x' } });
    expect(t[2]).toMatchObject({ t: 'open', name: 'br', self: true });
  });
  it('finds note targets and keeps note text out of the body', () => {
    const html = '<p>نص<a href="#n"><sup>1</sup></a></p><div id="n">حاشية</div>';
    const targets = noteTargetsOf(html);
    expect([...targets]).toEqual(['n']);
    const { blocks, notes } = htmlBlocks(html, targets);
    expect(notes.get('n')).toBe('حاشية');
    expect(blocks.filter(b => b.kind === 'p').length).toBe(1);
  });
});

describe('EPUB adapter', () => {
  it('uses the nav TOC, sections, notes, lists and figures', async () => {
    const res = await ingestToResult(await epub3());
    const { book, report, assets } = res;
    expect(book.title).toBe('كتاب & تجربة');
    expect(book.author).toBe('مؤلف');
    expect(book.chapters.map(c => c.title)).toEqual(['الفصل الأول', 'الفصل الثاني']);
    expect(report.chapters.method).toBe('epub-nav');
    const c1 = book.chapters[0];
    expect(c1.sections.map(s => s.title)).toEqual(['', 'قسم فرعي']);
    expect(c1.sections[0].blocks[0].text).toBe('فقرة فيها حاشية[^1] ونص.');
    expect(c1.notes).toEqual([{ id: '1', text: 'نص الحاشية.' }]);
    const blocks = c1.sections[1].blocks;
    expect(blocks.find(b => b.type === 'list').items).toEqual(['بند أول', 'بند ثان']);
    const fig = blocks.find(b => b.type === 'figure');
    expect(fig).toMatchObject({ src: 'img/001.png', caption: 'شكل ١: رسم' });
    expect(assets[0].mime).toBe('image/png');
    expect(book.chapters[1].notes).toEqual([{ id: '1', text: 'حاشية ثانية' }]);
    expect(book.chapters[1].sections[0].blocks[0].text).toBe('نص الفصل الثاني[^1].');
    expect(report.footnotes).toMatchObject({ found: 2, linked: 2 });
  });
  it('falls back to the EPUB 2 NCX', async () => {
    const res = await ingestToResult(await epub2());
    expect(res.report.chapters.method).toBe('epub-ncx');
    expect(res.book.chapters.map(c => c.title)).toEqual(['أ', 'ب']);
  });
  it('refuses DRM-encrypted EPUBs', async () => {
    const z = new JSZip();
    z.file('META-INF/container.xml', '<container/>');
    z.file('META-INF/encryption.xml', '<encryption><EncryptedData><CipherData/></EncryptedData></encryption>');
    await expect(ingestToResult(await z.generateAsync({ type: 'uint8array' }))).rejects.toMatchObject({ code: 'encrypted' });
  });
  it('reports a damaged zip clearly', async () => {
    await expect(ingestToResult({ bytes: new Uint8Array([0x50, 0x4b, 1, 2, 3]), kind: 'epub' })).rejects.toMatchObject({ code: 'invalid-epub' });
  });
});

describe('Markdown / text adapter', () => {
  const md = ['# عنوان', '', '## فصل أول', '', 'فقرة فيها حاشية[^a].', 'سطر ثان للفقرة.', '', '> [!KEY]', '> فكرة أساسية.', '', '### قسم', '', '- بند', '- بند آخر', '', '![وصف](https://example.org/i.png)', '', '## فصل ثان', '', 'نص[^a].', '', '[^a]: نص الحاشية.'].join('\n');
  it('parses the dialect with notes renumbered per chapter', () => {
    const b = parseMarkdown(md);
    expect(b.title).toBe('عنوان');
    expect(b.chapters.map(c => c.title)).toEqual(['فصل أول', 'فصل ثان']);
    expect(b.chapters[0].sections[0].blocks[0]).toEqual({ type: 'p', text: 'فقرة فيها حاشية[^1]. سطر ثان للفقرة.' });
    expect(b.chapters[0].sections[0].blocks[1]).toEqual({ type: 'box', kind: 'key', text: 'فكرة أساسية.' });
    expect(b.chapters[0].sections[1].title).toBe('قسم');
    expect(b.chapters[0].notes).toEqual([{ id: '1', text: 'نص الحاشية.' }]);
    expect(b.chapters[1].notes).toEqual([{ id: '1', text: 'نص الحاشية.' }]);
  });
  it('round-trips through toMarkdown and the app importer', async () => {
    const res = await ingestToResult(md);
    const item = mdToItem(toMarkdown(res), 'book', '');
    expect(item.chapters.map(c => c.title)).toEqual(['فصل أول', 'فصل ثان']);
  });
  it('repairs presentation forms and reversed pasted text', async () => {
    const words = ['الكتاب', 'البيت', 'القلم', 'الولد', 'المدرسة', 'البحر', 'الشمس', 'القمر', 'الطريق', 'الليل'];
    const logical = words.join(' ') + ' ' + words.join(' ');
    const pasted = [...logical].reverse().join('');
    const res = await ingestToResult({ bytes: new TextEncoder().encode(pasted), kind: 'txt' });
    expect(res.report.metrics.reversed).toBe(true);
    expect(res.book.chapters[0].sections[0].blocks[0].text).toBe(logical);
    const res2 = await ingestToResult({ bytes: new TextEncoder().encode(U(0xFEDB, 0xFE98, 0xFE8E, 0xFE8F)), kind: 'txt' });
    expect(res2.book.chapters[0].sections[0].blocks[0].text).toBe('كتاب');
  });
  it('decodes UTF-16 and Windows-1256', () => {
    const u16 = new Uint8Array([0xFF, 0xFE, 0x43, 0x06, 0x2A, 0x06]);
    expect(decodeText(u16)).toBe('كت');
    const cp = new Uint8Array(Array(60).fill([0xDF, 0xCA, 0xC7, 0xC8, 0x20]).flat());
    expect(decodeText(cp).startsWith('كتاب ')).toBe(true);
  });
  it('detects kinds from magic numbers', () => {
    expect(detectKind(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('pdf');
    expect(detectKind(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe('epub');
    expect(detectKind(new Uint8Array([0x23, 0x20]))).toBe('txt');
    expect(detectKind('# x')).toBe('md');
  });
});
