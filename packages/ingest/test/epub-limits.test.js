import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { checkZipLimits, EPUB_LIMITS } from '../src/epub.js';
import { ingestToResult } from '../src/index.js';

const fake = (name, uncompressed, compressed = uncompressed) => ({ name, dir:false, _data:{ uncompressedSize:uncompressed, compressedSize:compressed } });

function entries(n, size = 10, compressed = size) {
  const o = {};
  for (let i = 0; i < n; i++) o['f' + i] = fake('f' + i, size, compressed);
  return o;
}

describe('EPUB zip limits', () => {
  it('accepts a small normal zip', () => {
    const r = checkZipLimits(entries(4, 1024));
    expect(r.ok).toBe(true);
    expect(r.entries).toBe(4);
  });
  it('rejects too many entries', () => {
    const r = checkZipLimits(entries(EPUB_LIMITS.maxEntries + 1));
    expect(r.ok).toBe(false);
    expect(r.code).toBe('epub-limit');
    expect(r.reason).toBe('entries');
  });
  it('rejects one oversized entry', () => {
    const r = checkZipLimits({ a: fake('a', EPUB_LIMITS.maxEntryBytes + 1) });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('entry-size');
  });
  it('rejects too much uncompressed data', () => {
    const r = checkZipLimits(entries(5, 60 * 1024 * 1024));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('total-size');
  });
  it('rejects a suspicious compression ratio on a large entry', () => {
    const r = checkZipLimits({ a: fake('a', 10 * 1024 * 1024, 1000) });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('ratio');
  });
  it('rejects an unknown entry size', () => {
    const r = checkZipLimits({ a: { name:'a', dir:false, _data:{} } });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unknown-size');
  });
});

describe('minimal EPUB still converts', () => {
  it('parses a small valid EPUB', async () => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip');
    zip.file('META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    zip.file('OEBPS/content.opf', '<?xml version="1.0"?><package><metadata><title>كتاب صغير</title><creator>مؤلف</creator></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>');
    zip.file('OEBPS/nav.xhtml', '<html><body><nav epub:type="toc"><ol><li><a href="ch1.xhtml">الفصل الأول</a></li></ol></nav></body></html>');
    zip.file('OEBPS/ch1.xhtml', '<html><body><h1>الفصل الأول</h1><p>هذا نص عربي كافٍ لاختبار التحويل. هذا نص عربي كافٍ لاختبار التحويل.</p></body></html>');
    const bytes = await zip.generateAsync({ type:'uint8array', compression:'DEFLATE' });
    const r = await ingestToResult({ bytes, kind:'epub' });
    expect(r.book.chapters.length).toBeGreaterThanOrEqual(1);
    expect(r.report.recommendation).not.toBe('vision');
  });
});
