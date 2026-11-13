// Scanned-page detection: thresholds, union coverage, routing, and the
// report.scanned summary, plus end-to-end runs on generated scan fixtures
// (see tests/helpers/make-pdf.mjs scannedPdf; no copyrighted material).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scorePages, route, scannedSummary, DETECTION_THRESHOLDS } from '../src/score.js';
import { imageCoverage, imageUnionCoverage } from '../src/stages/extract.js';
import { ingestToResult, DETECTION_THRESHOLDS as PUBLIC_THRESHOLDS } from '../src/index.js';
import { makePdf, bookPages } from '../../../tests/helpers/make-pdf.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const page = (image, extra = {}) => Object.assign({ page: 1, text: '', noText: true, image }, extra);
const row = (route, issues = []) => ({ page: 1, route, issues, scored: route === 'ok', score: 0.95, tokens: 100 });
const imgPage = (w, h, rects) => ({ width: w, height: h, images: rects.map(([x, y, iw, ih]) => ({ x, y, w: iw, h: ih })) });

describe('detection thresholds (public entry point)', () => {
  it('exports imageCoverage and visionShare from packages/ingest', () => {
    expect(PUBLIC_THRESHOLDS).toEqual({ imageCoverage: 0.5, visionShare: 0.5 });
    expect(PUBLIC_THRESHOLDS).toBe(DETECTION_THRESHOLDS);
  });
  it('thresholds are frozen', () => {
    expect(Object.isFrozen(DETECTION_THRESHOLDS)).toBe(true);
  });
});

describe('image union coverage', () => {
  it('keeps the largest-image value for a single full-page image', () => {
    const p = imgPage(450, 600, [[0, 0, 450, 600]]);
    expect(imageCoverage(p)).toBe(1);
    expect(imageUnionCoverage(p)).toBe(1);
  });
  it('strips under 50% individually but >= 50% combined', () => {
    const p = imgPage(450, 600, [[0, 0, 450, 180], [0, 300, 450, 180]]);
    expect(imageCoverage(p)).toBeCloseTo(0.3);
    expect(imageUnionCoverage(p)).toBeCloseTo(0.6);
  });
  it('caps the sum at 1 for overlapping tiles', () => {
    const p = imgPage(450, 600, [[0, 0, 450, 300], [0, 0, 450, 300], [0, 0, 450, 300]]);
    expect(imageUnionCoverage(p)).toBe(1);
  });
  it('no images gives 0', () => {
    expect(imageUnionCoverage(imgPage(450, 600, []))).toBe(0);
  });
});

describe('scorePages no-text routing (>= boundaries unchanged)', () => {
  it('below 50% image coverage is blank', () => {
    const s = scorePages([page(0.49)]);
    expect(s.pages[0].route).toBe('blank');
    expect(s.pages[0].issues).not.toContain('no-text-layer');
  });
  it('exactly 50% image coverage is vision', () => {
    const s = scorePages([page(0.5)]);
    expect(s.pages[0].route).toBe('vision');
    expect(s.pages[0].issues).toContain('no-text-layer');
  });
  it('above 50% image coverage is vision', () => {
    expect(scorePages([page(0.51)]).pages[0].route).toBe('vision');
  });
  it('first/last pages with images are covers, not scanned pages', () => {
    const s = scorePages([page(1, { edge: true }), page(0, { page: 2 })]);
    expect(s.pages[0].route).toBe('cover');
    expect(s.pages[0].issues).not.toContain('no-text-layer');
    expect(s.pages[1].route).toBe('blank');
  });
  it('blank pages (no text, no image) route blank', () => {
    expect(scorePages([page(0)]).pages[0].route).toBe('blank');
  });
});

describe('scannedSummary', () => {
  it('empty input: 0 pages, share 0 (never NaN)', () => {
    expect(scannedSummary([])).toEqual({ pages: 0, share: 0 });
  });
  it('counts only no-text-layer pages, not other vision causes', () => {
    expect(scannedSummary([row('vision', ['no-text-layer']), row('vision', ['low-score']), row('ok')])).toEqual({ pages: 1, share: 1 / 3 });
  });
  it('fully scanned book: share 1', () => {
    const rows = Array.from({ length: 4 }, () => row('vision', ['no-text-layer']));
    expect(scannedSummary(rows)).toEqual({ pages: 4, share: 1 });
  });
  it('covers and blanks are excluded from pages and denominator', () => {
    expect(scannedSummary([row('cover'), row('blank'), row('vision', ['no-text-layer']), row('ok')])).toEqual({ pages: 1, share: 0.5 });
  });
  it('mixed book: a few scanned pages inside a text book', () => {
    const rows = [row('vision', ['no-text-layer']), row('vision', ['no-text-layer'])].concat(Array.from({ length: 8 }, () => row('ok')));
    expect(scannedSummary(rows)).toEqual({ pages: 2, share: 0.2 });
  });
});

describe('route vision share (>= boundary unchanged)', () => {
  const rows = (n, vision) => Array.from({ length: n }, (_, i) => i < vision
    ? { page: i + 1, tokens: 100, issues: ['no-text-layer'], scored: false, score: null, route: 'vision' }
    : { page: i + 1, tokens: 100, issues: [], scored: true, score: 0.95, route: 'ok' });
  it('exactly 50% vision pages recommends vision', () => {
    expect(route(rows(10, 5), 0.95, [], 5).recommendation).toBe('vision');
  });
  it('40% vision pages alone does not recommend vision', () => {
    expect(route(rows(10, 4), 0.95, [], 5).recommendation).toBe('review');
  });
  it('no eligible pages keeps the empty-PDF behavior (vision, share 0)', () => {
    expect(route([], 0, [], 0).recommendation).toBe('vision');
    expect(scannedSummary([]).share).toBe(0);
  });
});

describe('generated scanned fixtures end to end', () => {
  const bytes = name => new Uint8Array(fs.readFileSync(path.join(FIX, name)));
  it('full-page image scan: vision, scanned.pages and share', async () => {
    const r = await ingestToResult({ bytes: bytes('scan-full.pdf'), kind: 'pdf' });
    expect(r.report.recommendation).toBe('vision');
    expect(r.report.scanned).toEqual({ pages: 3, share: 1 });
    expect(r.report.visionPages).toEqual([2, 3, 4]);
  }, 600000);
  it('split-strip scan: strips detected via union coverage', async () => {
    const r = await ingestToResult({ bytes: bytes('scan-strips.pdf'), kind: 'pdf' });
    expect(r.report.recommendation).toBe('vision');
    expect(r.report.scanned).toEqual({ pages: 2, share: 1 });
    expect(r.report.visionPages).toEqual([2, 3]);
  }, 600000);
  it('normal text PDF: scanned.pages is 0', async () => {
    const r = await ingestToResult({ bytes: makePdf(bookPages({ pages: 8, chapters: 2, toc: false, notes: false })), kind: 'pdf' });
    expect(r.report.scanned).toEqual({ pages: 0, share: 0 });
  }, 600000);
});
