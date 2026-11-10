import { describe, it, expect } from 'vitest';
import { visualToLogical, logicalToVisual, mirrorRtlBrackets, orderLineItems, resolveLevels, bidiClass, strongDir, bracketOrder } from '../src/bidi.js';

const rev = s => [...s].reverse().join('');

describe('bidi classes', () => {
  it('classifies the characters books use', () => {
    expect(bidiClass('ب')).toBe('AL');
    expect(bidiClass('a')).toBe('L');
    expect(bidiClass('7')).toBe('EN');
    expect(bidiClass(String.fromCodePoint(0x0663))).toBe('AN');
    expect(bidiClass(String.fromCodePoint(0x064E))).toBe('NSM');
    expect(bidiClass(' ')).toBe('WS');
    expect(bidiClass('(')).toBe('ON');
    expect(bidiClass(String.fromCodePoint(0xFEFB))).toBe('AL');
  });
  it('resolves numbers after Arabic as AN at level 2', () => {
    const lv = resolveLevels(['AL', 'WS', 'EN', 'EN'], 1);
    expect(lv).toEqual([1, 1, 2, 2]);
  });
});

describe('visual to logical (character level)', () => {
  it('reverses a pure Arabic line', () => {
    const logical = 'ذهب الولد إلى البيت';
    expect(visualToLogical(rev(logical))).toBe(logical);
  });

  it('keeps digit runs left to right inside RTL text', () => {
    const logical = 'ولد سنة 1990 في القرية';
    const visual = logicalToVisual(logical);
    expect(visual).toBe('ةيرقلا يف 1990 ةنس دلو');
    expect(visualToLogical(visual)).toBe(logical);
  });

  it('keeps Latin runs left to right and in word order', () => {
    const logical = 'قال Ahmed Ali ذلك';
    const visual = logicalToVisual(logical);
    expect(visual).toBe('كلذ Ahmed Ali لاق');
    expect(visualToLogical(visual)).toBe(logical);
  });

  it('mirrors brackets at RTL levels', () => {
    const logical = 'قال (نعم) فقط';
    const visual = logicalToVisual(logical);
    expect(visual).toBe('طقف (معن) لاق');
    expect(visualToLogical(visual)).toBe(logical);
  });

  it('does not mirror brackets inside a Latin run', () => {
    const logical = 'انظر f(x) هنا';
    expect(visualToLogical(logicalToVisual(logical))).toBe(logical);
    expect(logicalToVisual(logical)).toContain('f(x)');
  });

  it('keeps diacritics with their letters', () => {
    const logical = 'كَتَبَ الدَّرسَ';
    expect(visualToLogical(rev(logical))).toBe(logical);
  });

  it('LTR base leaves Latin alone', () => {
    expect(visualToLogical('hello world', 0)).toBe('hello world');
  });
});

describe('mirrorRtlBrackets (pdf.js output repair)', () => {
  it('fixes brackets that pdf.js reordered without mirroring', () => {
    // pdf.js turns visual "(معن)" into ")نعم(" : reversed but not mirrored
    expect(mirrorRtlBrackets(')نعم(')).toBe('(نعم)');
    expect(mirrorRtlBrackets('قال )نعم( فقط')).toBe('قال (نعم) فقط');
  });
  it('leaves text without brackets untouched', () => {
    expect(mirrorRtlBrackets('بلا أقواس')).toBe('بلا أقواس');
  });
  it('bracketOrder counts open-before-close', () => {
    expect(bracketOrder('(أ)')).toEqual({ good: 1, bad: 0 });
    expect(bracketOrder(')أ(')).toEqual({ good: 0, bad: 1 });
  });
});

describe('orderLineItems (item level)', () => {
  const item = (s, x, w = 20) => ({ s, x, w });
  it('orders Arabic items right to left', () => {
    const out = orderLineItems([item('ج', 100), item('أ', 300), item('ب', 200)]).map(i => i.s);
    expect(out).toEqual(['أ', 'ب', 'ج']);
  });
  it('keeps a Latin run left to right inside an RTL line', () => {
    const items = [item('هنا', 50), item('Ali', 200), item('Ahmed', 150), item('اسمه', 300), item('قال', 400)];
    expect(orderLineItems(items).map(i => i.s)).toEqual(['قال', 'اسمه', 'Ahmed', 'Ali', 'هنا']);
  });
  it('orders an LTR line left to right', () => {
    expect(orderLineItems([item('b', 200), item('a', 100)], 0).map(i => i.s)).toEqual(['a', 'b']);
  });
  it('strongDir', () => {
    expect(strongDir('كتاب')).toBe('R');
    expect(strongDir('book')).toBe('L');
    expect(strongDir('123')).toBe('N');
  });
});
