// Property and fuzz tests for the reorder and normalize stages (deterministic seeds).
import { describe, it, expect } from 'vitest';
import { visualToLogical, logicalToVisual, orderLineItems } from '../src/bidi.js';
import { mapForms, normalizePage, reversalStats } from '../src/stages/normalize.js';
import { RE_PRES } from '../src/text.js';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const AR = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
const arWord = r => { let w = ''; const n = 2 + Math.floor(r() * 6); for (let i = 0; i < n; i++) w += pick(r, AR); if (r() < 0.3) w = 'ال' + w; return w; };
const laWord = r => { let w = ''; const n = 2 + Math.floor(r() * 7); for (let i = 0; i < n; i++) w += pick(r, 'abcdefghijklmnopqrstuvwxyz'); return w; };
const num = r => String(Math.floor(r() * 100000));

/** Logical Arabic line with Latin runs, digit runs and bracketed words, always bounded by Arabic words. */
function logicalLine(r) {
  const out = [arWord(r)];
  const n = 3 + Math.floor(r() * 10);
  for (let i = 0; i < n; i++) {
    const k = r();
    if (k < 0.15) out.push(laWord(r) + (r() < 0.5 ? ' ' + laWord(r) : ''));
    else if (k < 0.3) out.push(num(r));
    else if (k < 0.4) out.push('(' + arWord(r) + ')');
    else if (k < 0.45) out.push('«' + arWord(r) + '»');
    else if (k < 0.5) out.push('[' + arWord(r) + ' ' + arWord(r) + ']');
    out.push(arWord(r));
  }
  return out.join(' ');
}

describe('property: bidi round trip', () => {
  it('visualToLogical(logicalToVisual(s)) === s for 2000 random mixed lines', () => {
    const r = rng(42);
    for (let t = 0; t < 2000; t++) {
      const s = logicalLine(r);
      expect(visualToLogical(logicalToVisual(s))).toBe(s);
    }
  });
  it('preserves the multiset of letters and digits', () => {
    const r = rng(7);
    const sig = s => [...s].filter(c => /[\p{L}\p{Nd}]/u.test(c)).sort().join('');
    for (let t = 0; t < 500; t++) { const s = logicalLine(r); expect(sig(logicalToVisual(s))).toBe(sig(s)); }
  });
  it('item order: random x placement of a logical sequence is recovered', () => {
    const r = rng(9);
    for (let t = 0; t < 300; t++) {
      const words = []; const n = 3 + Math.floor(r() * 8);
      for (let i = 0; i < n; i++) words.push(arWord(r));
      // RTL: first logical word is rightmost
      let x = 400; const items = words.map(w => { const it = { s: w, w: 30, x: x - 30 }; x -= 38; return it; });
      const shuffled = items.slice().sort(() => r() - 0.5);
      expect(orderLineItems(shuffled).map(i => i.s)).toEqual(words);
    }
  });
});

describe('property: presentation forms', () => {
  const RANGES = [[0xFE80, 0xFEFC], [0xFB50, 0xFBB1]];
  it('mapForms removes every presentation form and is idempotent', () => {
    const r = rng(3);
    for (let t = 0; t < 500; t++) {
      let s = '';
      for (let i = 0; i < 20; i++) { const [a, b] = pick(r, RANGES); s += String.fromCodePoint(a + Math.floor(r() * (b - a + 1))); if (r() < 0.2) s += ' '; }
      const m = mapForms(s);
      expect(RE_PRES.test(m.replace(/[﮲-﯁]/g, ''))).toBe(false);
      expect(mapForms(m)).toBe(m);
    }
  });
  it('every lam-alef ligature becomes lam followed by an alef', () => {
    for (let cp = 0xFEF5; cp <= 0xFEFC; cp++) expect(mapForms(String.fromCodePoint(cp))).toMatch(/^ل[اأإآ]$/);
  });
});

describe('fuzz: reversal detection and repair', () => {
  it('detects character-reversed pages and repairs them exactly (with lam-alef ligatures)', () => {
    const r = rng(11);
    for (let t = 0; t < 100; t++) {
      const words = [];
      for (let i = 0; i < 40; i++) words.push(r() < 0.5 ? 'ال' + arWord(r).replace(/^ال/, '') : arWord(r));
      words.splice(5, 0, String.fromCodePoint(0xFEFB));
      const logical = words.join(' ');
      expect(reversalStats(logical).reversed).toBe(false);
      const visual = [...logical].reverse().join('');
      const out = normalizePage([{ items: [{ s: visual, x: 10, y: 100, w: 400, size: 13, font: 'F', bold: false, italic: false, dir: 'ltr' }], y: 100, x0: 10, x1: 410, base: 1 }], {});
      expect(out.reversed).toBe(true);
      expect(out.lines[0].text).toBe(mapForms(logical));
    }
  });
});
