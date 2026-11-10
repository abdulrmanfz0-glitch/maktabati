// Phase E: robustness and performance on synthetic PDFs (no book text involved).
import { describe, it, expect } from 'vitest';
import { ingest, ingestToResult } from '../../packages/ingest/src/index.js';
import { makePdf, bookPages } from '../helpers/make-pdf.mjs';

const collect = async (input, opts) => { const ev = []; for await (const e of ingest(input, opts)) ev.push(e); return ev; };

describe('inputs that must fail clearly', () => {
  it('empty file', async () => {
    await expect(ingestToResult({ bytes: new Uint8Array(0), kind: 'pdf' })).rejects.toMatchObject({ code: 'empty' });
  });
  it('corrupt file', async () => {
    const junk = new Uint8Array(4000).map((_, i) => (i * 7919) % 251);
    junk.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    await expect(ingestToResult({ bytes: junk, kind: 'pdf' })).rejects.toMatchObject({ code: 'invalid-pdf' });
  });
  it('password-protected file is refused, never bypassed', async () => {
    const pdf = makePdf(bookPages({ pages: 3 }), { userPassword: 'secret' });
    await expect(ingestToResult({ bytes: pdf, kind: 'pdf' })).rejects.toMatchObject({ code: 'encrypted' });
  });
  it('truncated file either recovers or fails with invalid-pdf', async () => {
    const pdf = makePdf(bookPages({ pages: 6 }));
    const cut = pdf.slice(0, Math.floor(pdf.length * 0.6));
    try { const r = await ingestToResult({ bytes: cut, kind: 'pdf' }); expect(r.report.pages).toBeGreaterThan(0); }
    catch (e) { expect(e.code).toBe('invalid-pdf'); }
  });
});

describe('small inputs', () => {
  it('single page', async () => {
    const r = await ingestToResult({ bytes: makePdf(bookPages({ pages: 1 })), kind: 'pdf' });
    expect(r.report.pages).toBe(1);
    expect(r.report.issues.some(i => i.code === 'no-chapters')).toBe(true);
    expect(r.report.recommendation).not.toBe('ok');
  });
});

describe('end to end on a synthetic LTR book (general rules only)', () => {
  it('finds TOC chapters, removes headers and page numbers, links notes', async () => {
    const r = await ingestToResult({ bytes: makePdf(bookPages({ pages: 14, chapters: 3 })), kind: 'pdf' });
    const { book, report } = r;
    expect(report.chapters.method).toBe('toc');
    expect(report.chapters.count).toBe(3);
    expect(report.metrics.pageNumbersRemoved).toBeGreaterThanOrEqual(10);
    expect(report.metrics.headersRemoved).toBeGreaterThanOrEqual(10);
    expect(report.metrics.residualRepeats).toBe(0);
    expect(report.footnotes.found).toBeGreaterThanOrEqual(10);
    expect(report.footnotes.linked).toBe(report.footnotes.found);
    const text = JSON.stringify(book);
    expect(text).not.toContain('A Synthetic Book</');
    expect(book.chapters.every(c => c.notes && c.notes.every((n, i) => n.id === String(i + 1)))).toBe(true);
    // paragraphs: 4 per page, first lines indented, last lines short
    expect(report.metrics.paraTerminalShare).toBeGreaterThan(0.9);
    // Latin-only text is not scored for Arabic quality: review, not vision
    expect(report.recommendation).toBe('review');
    expect(report.issues.some(i => i.code === 'not-arabic')).toBe(true);
  });
});

describe('streaming, cancellation and scale', () => {
  it('emits increasing progress events and ends with the result', async () => {
    const ev = await collect({ bytes: makePdf(bookPages({ pages: 12 })), kind: 'pdf' });
    const ex = ev.filter(e => e.type === 'progress' && e.stage === 'extract').map(e => e.page);
    expect(ex.length).toBeGreaterThan(1);
    expect(ex).toEqual([...ex].sort((a, b) => a - b));
    expect(ev[ev.length - 1].type).toBe('result');
  });
  it('stops on AbortSignal', async () => {
    const ctrl = new AbortController();
    const run = async () => { for await (const e of ingest({ bytes: makePdf(bookPages({ pages: 60 })), kind: 'pdf' }, { signal: ctrl.signal })) if (e.stage === 'extract') ctrl.abort(); };
    await expect(run()).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('600 pages: completes; reports time and peak memory per 100 pages', async () => {
    const pdf = makePdf(bookPages({ pages: 600, chapters: 20 }));
    const t0 = Date.now(); let peak = process.memoryUsage().rss;
    const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 25);
    const r = await ingestToResult({ bytes: pdf, kind: 'pdf' });
    clearInterval(timer);
    const ms = Date.now() - t0;
    console.log('[perf] synthetic 600 pages: ' + ms + ' ms total, ' + Math.round(ms / 6) + ' ms per 100 pages, peak RSS ' + Math.round(peak / 1048576) + ' MB');
    expect(r.report.pages).toBe(600);
    expect(r.report.chapters.count).toBe(20);
  }, 300000);
});
