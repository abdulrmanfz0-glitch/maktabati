import { describe, it, expect } from 'vitest';
import { detectEndnotes, alignSequences } from '../src/stages/structure.js';
import { MARK_OPEN, MARK_CLOSE } from '../src/stages/normalize.js';

const M = n => MARK_OPEN + n + MARK_CLOSE;
const stats = { bodySize: 13, leading: 18 };
const L = (text, y, extra = {}) => Object.assign({ text, y, size: 13, zone: null, removed: false }, extra);
const small = (text, y) => L(text, y, { size: 10 });
const body = y => L('نص عادي من متن الكتاب', y);

// A notes page: mostly small-font lines with leading numbers.
const notesPage = (nums, withCont = false) => ({ lines: nums.flatMap((n, i) => {
  const out = [small((i % 2 ? '(' + n + ') ' : M(n)) + 'تعليق رقم ' + n, 500 - i * 30)];
  if (withCont && i === 0) out.push(small('تكملة التعليق', 485));
  return out;
}) });

describe('detectEndnotes', () => {
  it('finds notes-section pages and splits sequences where numbering restarts', () => {
    const pages = [
      { lines: [body(500), body(480), body(460), body(440)] },
      notesPage(['1', '2', '3'], true),
      notesPage(['4', '5', '1', '2'])
    ];
    const r = detectEndnotes(pages, stats, {});
    expect(r.pages).toEqual([1, 2]);
    expect(r.sequences.length).toBe(2);
    expect([...r.sequences[0].keys()]).toEqual(['1', '2', '3', '4', '5']);
    expect([...r.sequences[1].keys()]).toEqual(['1', '2']);
    expect(r.sequences[0].get('1')).toBe('تعليق رقم 1 تكملة التعليق');
    expect(r.entries).toBe(7);
    expect(pages[1].lines.every(l => l.role === 'endnote')).toBe(true);
    expect(pages[0].lines.some(l => l.role)).toBe(false);
  });

  it('treats a leading number that breaks the numbering as a continuation (page range, year)', () => {
    const page = { lines: [small('(1) Author, Title 12, no. 3', 500), small('45–67.', 485), small('(2) Author, Book', 470), small('1998, 12.', 455), small('(3) Another source', 440)] };
    const r = detectEndnotes([page], stats, {});
    expect(r.sequences.length).toBe(1);
    expect([...r.sequences[0].keys()]).toEqual(['1', '2', '3']);
    expect(r.sequences[0].get('1')).toBe('Author, Title 12, no. 3 45–67.');
    const off = detectEndnotes([JSON.parse(JSON.stringify(page))], stats, { rules: { 'endnote-continuity': false } });
    expect(off.sequences.length).toBeGreaterThan(1);
  });

  it('ignores pages with body-size text or too few numbered entries', () => {
    const mixed = { lines: [body(500), body(480), small(M(1) + 'تعليق', 460), small(M(2) + 'تعليق', 440)] };
    const unnumbered = { lines: [small('أ', 500), small('ب', 480), small('ج', 460), small(M(1) + 'د', 440)] };
    expect(detectEndnotes([mixed, unnumbered], stats, {}).pages).toEqual([]);
  });

  it('is off when the rule or the footnotes rule is off', () => {
    const pages = [notesPage(['1', '2', '3', '4'])];
    expect(detectEndnotes(pages, stats, { rules: { endnotes: false } }).pages).toEqual([]);
    expect(detectEndnotes(pages, stats, { rules: { footnotes: false } }).pages).toEqual([]);
  });
});

describe('alignSequences', () => {
  const seq = nums => new Map(nums.map(n => [String(n), 't' + n]));

  it('pairs sequences in order when they correspond one to one', () => {
    const map = alignSequences([[1, 2, 3], [1, 2]], [seq([1, 2, 3]), seq([1, 2])]);
    expect([...map]).toEqual([[1, 1], [0, 0]]);
  });

  it('skips a note sequence that has no markers (a chapter without markers)', () => {
    const map = alignSequences([[1, 2, 3, 4, 5], [1, 2, 3]], [seq([1, 2, 3, 4, 5]), seq([1, 2, 3, 4, 5, 6, 7, 8]), seq([1, 2, 3])]);
    expect(map.get(0)).toBe(0);
    expect(map.get(1)).toBe(2);
  });

  it('leaves a stray marker sequence unmatched', () => {
    const map = alignSequences([[1, 2], [7, 8, 9], [1, 2, 3]], [seq([1, 2]), seq([1, 2, 3])]);
    expect(map.get(0)).toBe(0);
    expect(map.has(1)).toBe(false);
    expect(map.get(2)).toBe(1);
  });

  it('refuses pairs covering less than half of the markers', () => {
    const map = alignSequences([[1, 2, 3, 4, 5, 6]], [seq([1, 2])]);
    expect(map.size).toBe(0);
  });

  it('handles empty inputs', () => {
    expect(alignSequences([], [seq([1])]).size).toBe(0);
    expect(alignSequences([[1]], []).size).toBe(0);
  });
});
