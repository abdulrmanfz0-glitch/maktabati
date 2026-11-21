// Line segmentation for scanned pages (ocr-lines.js) and the line-by-line
// reader in ocr-local.js, on synthetic pages and fake workers.
import { describe, it, expect } from 'vitest';
import { segmentLines, linePitch, inkProfile, rgbaToGray } from '../../apps/web/src/core/ocr-lines.js';
import { pageLines, readLines, lineLooksEmpty, createOcrEngine } from '../../apps/web/src/core/ocr-local.js';

// A synthetic Arabic-like page: each line has a dense baseline band, sparse
// ascenders above it, and a few tashkeel dots in the gap below/above.
function page({ w = 600, lines = 12, pitch = 50, top = 40, short = [], gapAfter = {}, seed = 1 } = {}) {
  let r = seed; const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  const ys = []; let y = top;
  for (let i = 0; i < lines; i++) { ys.push(y); y += pitch + (gapAfter[i] || 0); }
  const h = y + top;
  const g = new Uint8Array(w * h).fill(255);
  const dot = (x, yy) => { if (x >= 0 && x < w && yy >= 0 && yy < h) g[yy * w + x] = 0; };
  ys.forEach((base, i) => {
    const x0 = 30, x1 = short.includes(i) ? 200 : w - 30; // RTL: a short line ends early on the left... drawn from the right
    const L = w - x1, R = w - x0;
    for (let x = L; x < R; x++) {
      for (let k = 0; k < 4; k++) dot(x, base + k);                       // baseline band
      if (rnd() < 0.18) for (let k = 1; k < 16; k++) dot(x, base - k);  // ascenders
      if (rnd() < 0.02) { dot(x, base - 22); dot(x + 1, base - 22); }     // tashkeel above
      if (rnd() < 0.02) { dot(x, base + 12); dot(x + 1, base + 12); }     // tashkeel below
    }
  });
  return { w, h, g, ys };
}

describe('segmentLines', () => {
  it('finds every line of a regular page and cuts between baselines', () => {
    const p = page();
    const lines = segmentLines(p);
    expect(lines).not.toBeNull();
    expect(lines.length).toBe(12);
    lines.forEach((l, i) => {
      expect(l.y0).toBeLessThan(p.ys[i] - 10);   // ascenders inside the slice
      expect(l.y1).toBeGreaterThan(p.ys[i] + 4); // baseline inside the slice
      if (i) expect(l.y0).toBeGreaterThan(p.ys[i - 1] + 4); // never reaches the previous baseline
    });
    expect(lines.every((l, i) => !i || l.y0 >= lines[i - 1].y1)).toBe(true); // no overlap
  });
  it('pitch from the profile', () => {
    const p = page({ pitch: 64 });
    expect(Math.abs(linePitch(inkProfile(p)) - 64)).toBeLessThanOrEqual(2);
  });
  it('keeps a short closing line (weak peak) and trims lines to their ink', () => {
    const p = page({ short: [5, 11] });
    const lines = segmentLines(p);
    expect(lines.length).toBe(12);
    expect(lines[11].x0).toBeGreaterThan(p.w - 260); // trimmed to the right-hand ink
    expect(lines[11].x1).toBeLessThanOrEqual(p.w);
  });
  it('marks paragraph breaks: a short previous line or a larger gap', () => {
    const lines = segmentLines(page({ short: [3], gapAfter: { 7: 30 } }));
    const breaks = lines.map((l, i) => (l.parBreak ? i : -1)).filter(i => i >= 0);
    expect(breaks).toEqual([4, 8]);
  });
  it('gives up (null) on blank pages, tiny input and a single solid block', () => {
    expect(segmentLines({ w: 100, h: 100, g: new Uint8Array(10000).fill(255) })).toBeNull();
    expect(segmentLines({ w: 0, h: 0, g: new Uint8Array(0) })).toBeNull();
    const solid = new Uint8Array(200 * 200).fill(255); for (let y = 20; y < 180; y++) for (let x = 20; x < 180; x++) solid[y * 200 + x] = 0;
    expect(segmentLines({ w: 200, h: 200, g: solid })).toBeNull();
  });
  it('rgbaToGray', () => {
    expect(Array.from(rgbaToGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]), 3, 1))).toEqual([255, 0, 76]);
  });
});

// fake DOM IO: the "image" is the synthetic page; crops are plain objects
const fakeIO = p => ({
  gray: (img, scale) => {
    const w = Math.round(p.w * scale), h = Math.round(p.h * scale), g = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = p.g[Math.floor(y / scale) * p.w + Math.floor(x / scale)];
    return { w, h, g };
  },
  crop: (img, l) => ({ line: l }),
  release: () => {}
});

describe('line-by-line reading', () => {
  it('pageLines maps the half-size segmentation back to page coordinates', () => {
    const p = page({ w: 800, pitch: 60 });
    const lines = pageLines({ width: p.w, height: p.h }, fakeIO(p));
    expect(lines.length).toBe(12);
    lines.forEach((l, i) => { expect(l.y0).toBeLessThan(p.ys[i]); expect(l.y1).toBeGreaterThan(p.ys[i] + 3); expect(l.x1).toBeLessThanOrEqual(p.w); });
  });
  it('readLines: single-line mode first, raw-line retry for a line that came back empty, paragraphs joined', async () => {
    const lines = [{ x0: 0, x1: 500, y0: 0, y1: 40 }, { x0: 0, x1: 500, y0: 40, y1: 80 }, { x0: 300, x1: 500, y0: 80, y1: 120, parBreak: false }, { x0: 0, x1: 500, y0: 120, y1: 160, parBreak: true }];
    const calls = [];
    const recognize = async (c, psm) => {
      calls.push([c.line.y0, psm]);
      if (c.line.y0 === 40 && psm === '7') return { text: '', confidence: 0 }; // Tesseract dropped this line
      return { text: 'سطر ' + c.line.y0 + (psm === '13' ? ' خام' : '') + ' كامل الكلمات هنا', confidence: 80 };
    };
    const r = await readLines({}, lines, { recognize, io: fakeIO(page()) });
    expect(calls).toEqual([[0, '7'], [40, '7'], [40, '13'], [80, '7'], [120, '7']]);
    expect(r.text).toBe('سطر 0 كامل الكلمات هنا\nسطر 40 خام كامل الكلمات هنا\nسطر 80 كامل الكلمات هنا\n\nسطر 120 كامل الكلمات هنا');
    expect(r.confidence).toBe(80);
  });
  it('readLines stops on abort between lines', async () => {
    const ctrl = new AbortController();
    const lines = [0, 1, 2].map(i => ({ x0: 0, x1: 100, y0: i * 10, y1: i * 10 + 10 }));
    let n = 0;
    const recognize = async () => { if (++n === 1) ctrl.abort(); return { text: 'نص طويل بما يكفي هنا', confidence: 90 }; };
    await expect(readLines({}, lines, { recognize, io: fakeIO(page()), signal: ctrl.signal })).rejects.toMatchObject({ code: 'aborted' });
    expect(n).toBe(1);
  });
  it('lineLooksEmpty', () => {
    expect(lineLooksEmpty('', 500, 40)).toBe(true);
    expect(lineLooksEmpty('ab', 500, 40)).toBe(true);
    expect(lineLooksEmpty('قال رسول الله صلى الله عليه', 500, 40)).toBe(false);
  });
  it('engine: Arabic canvas pages go line by line, switching PSM only when it changes; English stays whole-page', async () => {
    const p = page({ w: 800, pitch: 60, lines: 5 });
    const params = [], recs = [];
    const fakeWorker = { setParameters: async x => { params.push(x); }, recognize: async img => { recs.push(img); return { data: { text: 'كلمات كثيرة في هذا السطر الطويل جدا', confidence: 70, blocks: [] } }; }, terminate: async () => {} };
    const mk = lang => createOcrEngine({ lang, createWorkerFn: async () => fakeWorker, paths: { workerPath: null, corePath: null, langPath: null }, lineIO: fakeIO(p) });
    const ara = mk('ara');
    const r = await ara.ocrPage({ width: p.w, height: p.h });
    expect(r.lines).toBe(5);
    expect(recs.length).toBe(5);
    expect(params.filter(x => x.tessedit_pageseg_mode).map(x => x.tessedit_pageseg_mode)).toEqual(['7']);
    expect(r.text.split('\n').length).toBe(5);
    await ara.terminate();
    params.length = 0; recs.length = 0;
    const eng = mk('eng');
    const r2 = await eng.ocrPage({ width: p.w, height: p.h });
    expect(r2.lines).toBeUndefined();
    expect(recs.length).toBe(1);
    await eng.terminate();
  });
});
