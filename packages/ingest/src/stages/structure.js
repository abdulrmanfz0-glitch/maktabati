// Stage 6: structure. Labels lines and finds the book's skeleton.
//  - footnotes: a block of smaller-font lines at the page bottom, split at leading markers,
//    linked to raised-digit markers in the body of the same page
//  - headings: lines clearly larger than the body median, or short bold standalone lines;
//    consecutive heading lines are merged into one group; levels by size
//  - chapters: PDF outline first, then table-of-contents pages, then heading heuristics.
//    Each chapter records the method that found it.
import { on } from '../rules.js';
import { lineKey } from './clean.js';
import { MARK_OPEN, MARK_CLOSE, toAsciiDigits } from './normalize.js';

const RE_LEAD_NUM = /^\s*[(\[]?([0-9٠-٩۰-۹]{1,3})[)\]]?[\s.\-–:]+/;
const RE_LEAD_MARK = new RegExp('^\\s*' + MARK_OPEN + '(\\d+)' + MARK_CLOSE + '\\s*');

const kept = l => !l.removed;

/** Footnotes on one page. Marks note lines (role 'note') and returns [{ n, text, cont }]. */
export function detectFootnotes(page, stats, opts = {}) {
  if (!on(opts, 'footnotes')) return [];
  const ratio = opts.params?.footnoteSizeRatio ?? 0.92;
  const lines = page.lines.filter(kept);
  const byY = lines.slice().sort((a, b) => a.y - b.y);
  const block = [];
  for (const l of byY) {
    if (l.size <= ratio * stats.bodySize && l.size >= 0.5 * stats.bodySize) block.push(l);
    else break;
  }
  if (!block.length) return [];
  if (Math.max(...block.map(l => l.y)) > page.height * 0.6) return [];
  if (lines.length - block.length < 1) return [];
  // reading order (top to bottom) inside the block
  block.sort((a, b) => b.y - a.y);
  const notes = [];
  for (const l of block) {
    l.role = 'note';
    let m = RE_LEAD_MARK.exec(l.text), n = null, text = l.text;
    if (m) { n = m[1]; text = l.text.slice(m[0].length); }
    else if ((m = RE_LEAD_NUM.exec(l.text))) { n = toAsciiDigits(m[1]); text = l.text.slice(m[0].length); }
    text = text.replace(new RegExp(MARK_OPEN + '(\\d+)' + MARK_CLOSE, 'g'), '$1');
    if (n !== null) notes.push({ n, text: text.trim(), cont: false });
    else if (notes.length) notes[notes.length - 1].text += ' ' + text.trim();
    else notes.push({ n: null, text: text.trim(), cont: true });
  }
  return notes;
}

/**
 * Endnotes: pages where most kept lines are in the note font form a notes section. Their
 * entries (leading number markers) are split into sequences wherever numbering restarts,
 * typically one sequence per chapter. Marks those lines role 'endnote'.
 * Assemble fills `used` with the 'sequenceIndex:n' keys it linked; the rest are kept unlinked.
 * @returns {{ pages: number[], sequences: Array<Map<string,string>>, entries: number, used: Set }}
 */
export function detectEndnotes(pages, stats, opts = {}) {
  const out = { pages: [], sequences: [], entries: 0, used: new Set() };
  if (!on(opts, 'endnotes') || !on(opts, 'footnotes')) return out;
  const ratio = opts.params?.footnoteSizeRatio ?? 0.92;
  const small = l => l.size <= ratio * stats.bodySize && l.size >= 0.5 * stats.bodySize;
  const continuity = on(opts, 'endnote-continuity');
  let seq = null, last = Infinity, cur = null;
  pages.forEach((p, pi) => {
    const lines = p.lines.filter(l => !l.removed && !l.zone);
    const sm = lines.filter(small);
    if (lines.length < 4 || sm.length / lines.length < 0.6) return;
    const starts = sm.filter(l => RE_LEAD_MARK.test(l.text) || RE_LEAD_NUM.test(l.text)).length;
    if (starts < 2) return;
    out.pages.push(pi);
    for (const l of lines) {
      if (!small(l)) continue;
      l.role = 'endnote';
      let m = RE_LEAD_MARK.exec(l.text), n = null, text = l.text;
      if (m) { n = m[1]; text = l.text.slice(m[0].length); }
      else if ((m = RE_LEAD_NUM.exec(l.text))) { n = toAsciiDigits(m[1]); text = l.text.slice(m[0].length); }
      text = text.replace(new RegExp(MARK_OPEN + '(\\d+)' + MARK_CLOSE, 'g'), '$1').trim();
      // Continuity: a leading number starts an entry only when it continues the numbering
      // (last+1..last+3) or restarts it at 1. Otherwise (a page range, a year, a volume
      // number at the start of a wrapped citation) the line continues the current entry.
      if (n !== null && seq && cur !== null && continuity && !(+n === 1 || (+n > last && +n <= last + 3))) { n = null; text = l.text.trim(); }
      if (n !== null) {
        if (+n <= last) { seq = new Map(); out.sequences.push(seq); }
        last = +n; cur = n; seq.set(n, text); out.entries++;
      } else if (seq && cur !== null) seq.set(cur, (seq.get(cur) + ' ' + text).trim());
    }
  });
  return out;
}

/**
 * Align body-marker sequences to endnote sequences (both split where numbering restarts).
 * Dynamic programming with gaps: a pair scores the number of its markers present in the note
 * sequence, and only pairs covering at least half of the markers may match. A stray marker
 * sequence (or a note sequence without markers) costs nothing but itself.
 * @param {number[][]} markerSeqs
 * @param {Array<Map<string,string>>} noteSeqs
 * @returns {Map<number, number>} marker sequence index -> note sequence index
 */
export function alignSequences(markerSeqs, noteSeqs) {
  const A = markerSeqs.length, B = noteSeqs.length;
  const score = (i, j) => {
    const ms = markerSeqs[i], ns = noteSeqs[j];
    const hit = ms.filter(n => ns.has(String(n))).length;
    return hit && hit >= ms.length / 2 ? hit - 0.01 * Math.abs(ms.length - ns.size) : -Infinity;
  };
  const dp = Array.from({ length: A + 1 }, () => new Float64Array(B + 1));
  for (let i = 1; i <= A; i++) for (let j = 1; j <= B; j++) {
    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1] + Math.max(score(i - 1, j - 1), -1e9));
  }
  const map = new Map();
  for (let i = A, j = B; i > 0 && j > 0;) {
    const s = score(i - 1, j - 1);
    if (s > -Infinity && Math.abs(dp[i][j] - (dp[i - 1][j - 1] + s)) < 1e-9) { map.set(i - 1, j - 1); i--; j--; }
    else if (dp[i][j] === dp[i - 1][j]) i--;
    else j--;
  }
  return map;
}

/** Heading candidates grouped. Returns groups in document order. */
export function detectHeadings(pages, stats, opts = {}) {
  if (!on(opts, 'headings')) return [];
  const ratio = opts.params?.headingSizeRatio ?? 1.15;
  const groups = [];
  pages.forEach((p, pi) => {
    const L = p.lines;
    let cur = null;
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      if (l.removed || l.role === 'note') { continue; }
      const big = l.size >= ratio * stats.bodySize;
      const next = L.slice(i + 1).find(x => !x.removed && x.role !== 'note');
      const boldAlone = l.bold >= 0.6 && l.text.length <= 90 && !/[.!؟?:،,]$/.test(l.text) && (!next || next.parStart || next.size !== l.size || next.bold >= 0.6) && l.parStart;
      const isHead = (big || boldAlone) && l.text.length <= 160 && /\p{L}/u.test(l.text);
      if (isHead) {
        l.role = 'heading';
        const joinable = cur && on(opts, 'merge-heading-lines') && cur.end === i - 1 && (L[cur.end].y - l.y) <= 3.2 * Math.max(l.size, stats.leading);
        if (joinable) { cur.lines.push(l); cur.end = i; cur.size = Math.max(cur.size, l.size); }
        else { cur = { page: pi, start: i, end: i, lines: [l], size: l.size, bold: l.bold }; groups.push(cur); }
      } else cur = null;
    }
  });
  for (const g of groups) {
    const parts = g.lines.map(l => l.text.replace(new RegExp(MARK_OPEN + '\\d+' + MARK_CLOSE, 'g'), '').trim()).filter(Boolean);
    g.text = parts.length > 1 && parts[0].split(/\s+/).length <= 3 && parts[0].length < 25 ? parts[0] + ': ' + parts.slice(1).join(' ') : parts.join(' ');
    g.key = lineKey(g.text).replace(/#/g, '').replace(/\s+/g, ' ').trim();
    const p = pages[g.page];
    const firstKept = p.lines.findIndex(x => !x.removed);
    g.top = g.start === firstKept || g.lines[0].y > p.height * 0.55;
  }
  // levels by size (larger first); bold body-size headings come last
  const sizes = [...new Set(groups.map(g => Math.round(g.size * 2) / 2))].sort((a, b) => b - a);
  for (const g of groups) g.level = sizes.indexOf(Math.round(g.size * 2) / 2) + 1;
  return groups;
}

let SPACELESS = true, ANAGRAM = true;
const sortWord = w => [...w].sort().join('');
/** Same words up to in-word letter order (a two-letter ligature can come out swapped). */
const anagramWords = (a, b) => { const x = a.split(' '), y = b.split(' '); return x.length === y.length && x.every((w, i) => w.length === y[i].length && sortWord(w) === sortWord(y[i])); };
const keyMatch = (a, b) => {
  if (!a || !b) return false;
  if (ANAGRAM && a.length >= 4 && anagramWords(a, b)) return true;
  // Spacing differs between a TOC line and its heading when text arrives in fragments.
  if (SPACELESS) { a = a.replace(/ /g, ''); b = b.replace(/ /g, ''); }
  if (a === b) return true;
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  return s.length >= 6 && l.includes(s) && s.length / l.length >= 0.5;
};

/** Chapters from the outline: [{ title, page }] (page is 1-based) mapped to page indexes. */
function fromOutline(outline, pages, groups) {
  const byPage = new Map(pages.map((p, i) => [p.index, i]));
  const out = [];
  for (const o of outline || []) {
    const pi = byPage.get(o.page);
    if (pi === undefined) continue;
    const g = groups.find(x => x.page === pi && keyMatch(x.key, lineKey(o.title).replace(/#/g, '').trim())) || groups.find(x => x.page === pi && x.top);
    out.push({ page: pi, line: g ? g.start : 0, group: g || null, title: o.title, method: 'outline' });
  }
  return out;
}

/** Table-of-contents pages: early pages whose lines match heading groups found later. */
export function findToc(pages, groups, opts = {}) {
  SPACELESS = on(opts, 'spaceless-keys'); ANAGRAM = on(opts, 'toc-anagram');
  const limit = Math.max(3, Math.ceil(pages.length * 0.3));
  const cand = [];
  for (let pi = 0; pi < Math.min(pages.length, limit); pi++) {
    // Only lines with letters: TOC page numbers often sit on their own line segments.
    const lines = pages[pi].lines.filter(l => !l.removed && l.role !== 'note' && /\p{L}/u.test(l.text));
    if (lines.length < 3) continue;
    const later = groups.filter(g => g.page > pi);
    let hits = 0;
    const entries = [];
    for (const l of lines) {
      const k = lineKey(l.text).replace(/#/g, '').replace(/\s+/g, ' ').trim();
      if (!k) continue;
      const g = later.find(x => keyMatch(x.key, k));
      if (g) { hits++; entries.push({ key: k, page: pi, text: l.text }); }
    }
    if (hits >= 3 && hits / lines.length >= 0.4) cand.push({ page: pi, entries });
  }
  if (!cand.length) return null;
  // Keep the first run of consecutive TOC pages.
  const run = [cand[0]];
  for (let k = 1; k < cand.length && cand[k].page === run[run.length - 1].page + 1; k++) run.push(cand[k]);
  return { pages: run.map(c => c.page), entries: run.flatMap(c => c.entries) };
}

/**
 * Find chapter starts.
 * @returns {{ chapters: [{ page, line, title, method, group }], method, toc }}
 */
export function detectChapters(pages, groups, ctx = {}, opts = {}) {
  SPACELESS = on(opts, 'spaceless-keys'); ANAGRAM = on(opts, 'toc-anagram');
  if (on(opts, 'outline-chapters') && ctx.outline && ctx.outline.length >= 2) {
    const ch = fromOutline(ctx.outline, pages, groups);
    if (ch.length >= 2) return { chapters: ch, method: 'outline', toc: null };
  }
  let toc = null;
  if (on(opts, 'toc-chapters') && groups.length) {
    toc = findToc(pages, groups, opts);
    if (toc) {
      const after = Math.max(...toc.pages);
      const ch = [];
      let from = 0;
      const exclude = new Set(ctx.exclude || []);
      const cands = groups.filter(g => g.page > after && !exclude.has(g.page));
      for (const e of toc.entries) {
        const k = cands.findIndex((g, i) => i >= from && keyMatch(g.key, e.key));
        if (k < 0) continue;
        from = k + 1;
        const g = cands[k];
        // The TOC line is body-font text; heading runs can carry glyph-order damage.
        const tocTitle = String(e.text || '').replace(new RegExp(MARK_OPEN + '\\d+' + MARK_CLOSE, 'g'), '').replace(/[\s.·…\-–—]*[0-9٠-٩]+\s*$/, '').trim();
        ch.push({ page: g.page, line: g.start, group: g, title: on(opts, 'toc-titles') && tocTitle ? tocTitle : g.text, method: 'toc' });
      }
      if (ch.length >= 2) return { chapters: ch, method: 'toc', toc };
    }
  }
  if (on(opts, 'heading-chapters') && groups.length) {
    const startsPage = opts.params?.chapterStartsPage ?? true;
    const tocPages = new Set(toc ? toc.pages : []);
    const pool = groups.filter(g => !tocPages.has(g.page) && (!startsPage || g.top));
    const levels = [...new Set(pool.map(g => g.level))].sort((a, b) => a - b);
    for (const lv of levels) {
      const at = pool.filter(g => g.level === lv);
      if (at.length >= 2 && at.length <= Math.max(4, pages.length / 2)) {
        return { chapters: at.map(g => ({ page: g.page, line: g.start, group: g, title: g.text, method: 'headings' })), method: 'headings', toc };
      }
    }
  }
  return { chapters: [], method: 'none', toc };
}
