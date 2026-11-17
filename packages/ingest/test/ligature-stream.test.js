import { describe, it, expect } from 'vitest';
import { ligatureStream, fixItemLigatures } from '../src/stages/extract.js';
import { mapForms, pairOrderVotes, decidePairOrder, mirrorPairs } from '../src/stages/normalize.js';

const OPS = { setFont: 1, showText: 2, showSpacedText: 3 };
// Build an operator list from glyph texts in stream (visual, left to right) order.
const opsOf = runs => ({ fnArray: runs.map(() => OPS.showText), argsArray: runs.map(r => [r.map(u => ({ unicode: u }))]) });
// What pdf.js returns for a right-to-left chunk: the characters reversed.
const pdfjsText = runs => [...runs.map(r => r.join('')).join('')].reverse().join('');

describe('ligatures from the glyph stream', () => {
  it('restores a multi-letter glyph exactly', () => {
    // 'في' drawn as one glyph, then a space, then 'على' drawn as ع + لى.
    const runs = [['لى', 'ع', ' ', 'في']];
    const s = pdfjsText(runs);
    expect(s).toBe('يف عىل');
    expect(fixItemLigatures(s, ligatureStream(opsOf(runs), OPS), { at: 0 })).toBe('في على');
  });
  it('tells a reversed pair from a real one: عبر (ligature بر) and عرب (three glyphs)', () => {
    const runs = [['ب', 'ر', 'ع', ' ', 'بر', 'ع']];
    const s = pdfjsText(runs);
    expect(s).toBe('عرب عرب');
    expect(fixItemLigatures(s, ligatureStream(opsOf(runs), OPS), { at: 0 })).toBe('عبر عرب');
  });
  it('works when every glyph is its own show-text operation', () => {
    const runs = [['ة'], ['ف'], ['س'], ['لا'], ['ف'], ['ل'], ['ا']];
    const s = pdfjsText(runs);
    expect(s).toBe('الفالسفة');
    expect(fixItemLigatures(s, ligatureStream(opsOf(runs), OPS), { at: 0 })).toBe('الفلاسفة');
  });
  it('keeps numbers and Latin in place and leaves a page without ligatures alone', () => {
    const runs = [['في', ' ', '1', '9', '8', '1', ' ', 'م', 'ا', 'ع']];
    const stream = ligatureStream(opsOf(runs), OPS);
    expect(fixItemLigatures('عام 1981 يف', stream, { at: 0 })).toBe('عام 1981 في');
    expect(ligatureStream(opsOf([['ع', 'ب']]), OPS)).toBe(null);
  });
  it('returns null for an item it cannot find', () => {
    const stream = ligatureStream(opsOf([['في']]), OPS);
    expect(fixItemLigatures('كتاب', stream, { at: 0 })).toBe(null);
  });
});

describe('brackets', () => {
  it('reads the Arabic ornate pair in logical order: ﴿ opens, ﴾ closes', () => {
    expect(mapForms('قال ﴿إن الله﴾ أو')).toBe('قال (إن الله) أو');
  });
  it('mirrors round brackets when a document returns them closing first', () => {
    let v;
    for (let i = 0; i < 6; i++) v = pairOrderVotes('كان مقوداً )لا ندري إلى أين( في عربة', v);
    const which = decidePairOrder(v);
    expect(which[3]).toBe(true);
    expect(mirrorPairs('كان مقوداً )لا ندري إلى أين( في عربة', which)).toBe('كان مقوداً (لا ندري إلى أين) في عربة');
  });
});

import { adaptiveSpaceGap } from '../src/stages/normalize.js';
describe('word-space gap from the document', () => {
  const line = gaps => {
    // items right to left; each 10 wide, size 10; gap in em before each next item
    const items = []; let x = 1000;
    for (const g of [0, ...gaps]) { x -= g * 10; items.push({ x: x - 10, w: 10, size: 10, s: 'ب' }); x -= 10; }
    return { base: 1, items };
  };
  it('cuts in the empty stretch below a 0.12-0.15 em word space', () => {
    const lines = [];
    for (let i = 0; i < 60; i++) lines.push(line([0, 0.13, 0, 0.15, 0.2]));
    expect(adaptiveSpaceGap([lines])).toBeCloseTo(0.0875, 3);
  });
  it('gives nothing without a clear valley or with too few gaps', () => {
    expect(adaptiveSpaceGap([[line([0, 0.13])]])).toBe(null);
    const lines = [];
    for (let i = 0; i < 60; i++) lines.push(line([0.05, 0.075, 0.1, 0.125, 0.2]));
    expect(adaptiveSpaceGap([lines])).toBe(null);
  });
});
