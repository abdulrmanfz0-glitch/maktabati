// Stage 3: normalize. Turns ordered line items into clean logical text.
//  - separated diacritic items are attached to the item they overlap (x-overlap)
//  - raised small digits become footnote-marker tokens
//  - items are joined with a space only when the geometric gap is word-sized
//  - a page whose words look reversed (statistics) is reversed at character level,
//    while lam-alef ligatures are still single code points (so they cannot flip)
//  - Arabic presentation forms map to base letters (NFKC, lam-alef expanded explicitly)
//  - tatweel is removed; diacritics are kept unless options.stripMarks
//  - lossy-repair helpers: lost ى/ا restored in tokens, gated by document evidence (in pdf.js)
//  - pair-order: in a right-to-left line whose guillemets or double quotes close before they
//    open, the pair is mirrored
import { on } from '../rules.js';
import { visualToLogical, mirrorRtlBrackets } from '../bidi.js';
import { RE_MARK, RE_MARKS_G, matchForm, TOP_FUNCTION_WORDS, tokens } from '../text.js';

export const MARK_OPEN = '', MARK_CLOSE = '';
const LAM_ALEF = { 'ﻵ': 'لآ', 'ﻶ': 'لآ', 'ﻷ': 'لأ', 'ﻸ': 'لأ', 'ﻹ': 'لإ', 'ﻺ': 'لإ', 'ﻻ': 'لا', 'ﻼ': 'لا' };
const RE_FORMS = /[ﬀ-ﬆﭐ-﷿ﹰ-ﻼ]/g; // Latin ligatures (fi, fl…) and Arabic presentation forms
const RE_CONTROLS = /[\u0000-\u0008\u000B-\u001F\u007F]/g;
const RE_DIGITS_ONLY = /^\s*[(\[]?\s*([0-9٠-٩۰-۹]{1,3})\s*[)\]]?\s*$/;

export const stripControls = s => s.replace(RE_CONTROLS, '');

/** Presentation forms to base letters. Lam-alef ligatures are expanded explicitly. */
export function mapForms(s) {
  return s.replace(RE_FORMS, c => {
    if (LAM_ALEF[c]) return LAM_ALEF[c];
    const n = c.normalize('NFKC');
    // FE70-FE7F are mark forms: NFKC yields "space + mark" (isolated) or "tatweel + mark"
    // (medial); keep only the mark so it stays on the preceding letter.
    return c >= 'ﹰ' && c <= 'ﹿ' ? n.replace(/^[ ـ]/, '') : n;
  });
}

export const stripTatweel = s => s.replace(/ـ/g, '');
export const stripMarks = s => s.replace(RE_MARKS_G, '');

// Built from RE_MARK so Quranic signs that are not combining (U+06DE ۞,
// U+06E9 ۩, U+06E5/U+06E6) keep the space before them.
const RE_SPACE_BEFORE_MARK = new RegExp('[ \\t\\u00A0]+(?=' + RE_MARK.source + ')', 'g');

/**
 * Repair marks that pdf.js left separated from their base letter.
 * A combining mark never starts a word, so whitespace before one is always
 * spurious. Whitespace after a mark is handled at item boundaries in
 * joinItems, where the item geometry can prove the two touch.
 */
export function repairSplitMarks(s) {
  return String(s).replace(RE_SPACE_BEFORE_MARK, '').normalize('NFC');
}

/** Match form of a string that may still contain presentation forms (for statistics). */
const statForm = s => matchForm(mapForms(s));

/**
 * Words look reversed when "al-" word starts are rare and "-la" word ends are common:
 * logical Arabic text has many words beginning with ال, reversed text shows them as لا at the end.
 */
export function reversalStats(text) {
  let al = 0, la = 0;
  for (const w of statForm(text).split(/[^ء-ي]+/)) {
    if (w.length < 4) continue;
    if (w.startsWith('ال')) al++;
    if (w.endsWith('لا')) la++;
  }
  return { al, la, reversed: la >= 8 && la > 2 * al };
}

const isMarkOnly = s => { const t = s.trim(); return t.length > 0 && [...t].every(c => RE_MARK.test(c)); };

/** Attach mark-only items to the item they overlap most; insert at the proportional position. */
export function attachMarks(items) {
  const marks = items.filter(it => isMarkOnly(it.s));
  if (!marks.length) return items;
  const rest = items.filter(it => !isMarkOnly(it.s));
  for (const m of marks) {
    const mc = m.x + m.w / 2;
    let best = null, bestOv = -Infinity;
    for (const it of rest) {
      const ov = Math.min(m.x + Math.max(m.w, 0.1), it.x + it.w) - Math.max(m.x, it.x);
      const d = ov > 0 ? ov : -Math.min(Math.abs(mc - it.x), Math.abs(mc - it.x - it.w));
      if (d > bestOv) { bestOv = d; best = it; }
    }
    if (!best || bestOv < -m.size) continue;
    const chars = [...best.s];
    const rtl = /[؀-ۿﭐ-ﻼ]/.test(best.s);
    const frac = best.w > 0 ? (rtl ? (best.x + best.w - mc) / best.w : (mc - best.x) / best.w) : 1;
    let idx = Math.max(1, Math.min(chars.length, Math.ceil(frac * chars.length)));
    while (idx < chars.length && RE_MARK.test(chars[idx])) idx++;
    chars.splice(idx, 0, m.s.trim());
    best.s = chars.join('');
    best._markJoined = true;
  }
  return rest;
}

const sizeOf = items => {
  const w = new Map();
  for (const it of items) { const k = Math.round(it.size * 2) / 2; w.set(k, (w.get(k) || 0) + it.s.length); }
  return [...w.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

/** Join ordered items into one string. Gaps are measured on the page, in font sizes. */
export function joinItems(items, base, opts = {}) {
  const useGap = on(opts, 'gap-space');
  const gapEm = opts.params?.spaceGapEm ?? 0.15;
  let out = '';
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    let s = it.markerText ?? it.s;
    if (k > 0) {
      const prev = items[k - 1];
      let space, gap = Infinity;
      if (!useGap) space = true;
      else {
        const rtlPair = base === 1 && !(it.dirL && prev.dirL);
        gap = rtlPair ? prev.x - (it.x + it.w) : it.x - (prev.x + prev.w);
        space = gap > gapEm * Math.max(it.size, prev.size);
      }
      const startsMark = RE_MARK.test(([...s.replace(/^\s+/, '')][0] || ''));
      const prevEndsMark = RE_MARK.test(([...prev.s.replace(/\s+$/, '')].at(-1) || ''));
      // A mark belongs to the preceding base letter. Never put a space in
      // front of one, even when the next item starts with it.
      if (space && !startsMark && !/\s$/.test(out) && !/^\s/.test(s)) out += ' ';
      // Only a mark that was a separate pdf.js item and was attached here can
      // own the leading space of the next item. A mark that is already inside
      // the previous item's text may be a real word-ending mark; keep its
      // word space even when the item boxes touch.
      if (prevEndsMark && prev._markJoined && !space) s = s.replace(/^\s+/, '');
    }
    out += s;
  }
  return out;
}

/**
 * Normalize one page. `lines` come from reorderPage. Returns lines with `text`, `size`, `bold`.
 */
export function normalizePage(lines, opts = {}) {
  const out = [];
  for (const ln of lines) {
    let items = ln.items.map(it => Object.assign({}, it));
    if (on(opts, 'strip-controls')) for (const it of items) it.s = stripControls(it.s);
    items = items.filter(it => it.s.trim());
    if (!items.length) continue;
    if (on(opts, 'attach-marks')) items = attachMarks(items);
    const size = sizeOf(items);
    for (const it of items) it.dirL = !/[֐-ࣿיִ-ﻼ]/.test(it.s) && /\p{L}/u.test(it.s);
    let markers = 0;
    if (on(opts, 'sup-markers')) {
      for (const it of items) {
        const m = RE_DIGITS_ONLY.exec(it.s);
        if (m && it.size < 0.85 * size && it.y - ln.y > 0.12 * size) { it.markerText = MARK_OPEN + toAsciiDigits(m[1]) + MARK_CLOSE; markers++; }
      }
    }
    const text = joinItems(items, ln.base, opts);
    const chars = items.reduce((n, it) => n + it.s.length, 0) || 1;
    out.push({
      text, y: ln.y, x0: ln.x0, x1: ln.x1, base: ln.base, size,
      bold: items.reduce((n, it) => n + (it.bold ? it.s.length : 0), 0) / chars,
      italic: items.reduce((n, it) => n + (it.italic ? it.s.length : 0), 0) / chars,
      fonts: [...new Set(items.map(it => it.font))],
      markers,
      leadMarker: !!(items[0] && items[0].markerText) || RE_DIGITS_ONLY.test(items[0]?.s || '') && items.length > 1
    });
  }
  // Statistical direction check on the whole page, before lam-alef is expanded.
  const stats = reversalStats(out.map(l => l.text).join('\n'));
  const reversed = on(opts, 'stat-reverse') && stats.reversed;
  const lineMirror = on(opts, 'mirror-brackets') && opts.params?.mirrorLevel !== 'item';
  for (const l of out) {
    if (reversed) l.text = visualToLogical(l.text, l.base);
    else if (lineMirror && /[֐-ࣿיִ-ﻼ]/.test(l.text)) l.text = mirrorRtlBrackets(l.text, l.base);
    if (on(opts, 'nfkc-forms')) l.text = mapForms(l.text);
    if (on(opts, 'strip-tatweel')) l.text = stripTatweel(l.text);
    if (opts.stripMarks) l.text = stripMarks(l.text);
    l.text = repairSplitMarks(l.text).replace(/[ \t ]+/g, ' ').trim();
  }
  return { lines: out.filter(l => l.text), reversed, stats };
}

export const LOSSY = { veryCommon: 2000, minForms: 10, minShare: 0.05 };

// Lossy forms of the top function words: one ى or ا missing (على -> عل, إلى -> إل, حتى -> حت),
// excluding forms that are themselves ordinary words.
const LOSSY_FORMS = new Map();
for (const w of TOP_FUNCTION_WORDS) {
  const ch = [...w];
  ch.forEach((x, i) => {
    if (x !== 'ى' && x !== 'ا') return;
    const v = ch.slice(0, i).concat(ch.slice(i + 1)).join('');
    if (v.length >= 2 && !TOP_FUNCTION_WORDS.includes(v) && !['كم', 'كن', 'إذ'].includes(v)) LOSSY_FORMS.set(v, w);
  });
}

/**
 * Document evidence for lossy mappings: lossy forms of the top function words are frequent
 * (at least LOSSY.minForms, and LOSSY.minShare of those words' occurrences). Without it the
 * repair is not applied: a general word list misses many correct rare words that happen to be
 * one letter away from a common one.
 */
export function lossyEvidence(text) {
  let lossy = 0, correct = 0;
  const targets = new Set(LOSSY_FORMS.values());
  for (const t of tokens(stripMarks(text))) {
    if (LOSSY_FORMS.has(t)) lossy++;
    else if (targets.has(t)) correct++;
  }
  return { lossy, correct, damaged: lossy >= LOSSY.minForms && lossy >= LOSSY.minShare * (lossy + correct) };
}

/**
 * Lossy mappings: a ligature glyph mapped to only some of its letters (على read as عل).
 * A whole token (diacritics included) is repaired only when it is not a known word and exactly
 * one insertion of ى or ا yields a very common word (frequency rank <= LOSSY.veryCommon).
 */
export function repairLossy(text, lexicon, veryCommon = LOSSY.veryCommon) {
  let n = 0;
  const out = text.replace(/[ء-يً-ٰٟ]+/g, tok => {
    const t = stripMarks(tok);
    if ([...t].length < 2 || lexicon.has(t)) return tok;
    const ch = [...t], found = new Set();
    for (let i = 0; i <= ch.length; i++) for (const x of ['ى', 'ا']) {
      const w = ch.slice(0, i).join('') + x + ch.slice(i).join('');
      if (lexicon.rank(w) <= veryCommon) found.add(w);
    }
    if (found.size !== 1) return tok;
    n++;
    return [...found][0];
  });
  return { text: out, n };
}

export const PAIRS = [['«', '»'], ['“', '”']];

/**
 * Votes for one line: for each pair type with balanced counts, whether it opens first (good)
 * or closes first (bad). A single line cannot be judged alone: a line may close one quote and
 * open the next. The decision is taken for the whole document (see decidePairOrder).
 */
export function pairOrderVotes(s, votes = PAIRS.map(() => ({ good: 0, bad: 0 }))) {
  PAIRS.forEach(([o, c], k) => {
    const no = s.split(o).length - 1, nc = s.split(c).length - 1;
    if (!no || no !== nc) return;
    if (s.indexOf(c) < s.indexOf(o)) votes[k].bad++; else votes[k].good++;
  });
  return votes;
}

/** Pair types to mirror in right-to-left lines: closing-first lines dominate the document. */
export const decidePairOrder = votes => PAIRS.map((_, k) => votes[k].bad >= 5 && votes[k].bad > 2 * votes[k].good);

/** Mirror the chosen pair types in s. */
export function mirrorPairs(s, which) {
  let out = s;
  PAIRS.forEach(([o, c], k) => { if (which[k] && (out.includes(o) || out.includes(c))) out = [...out].map(ch => (ch === o ? c : ch === c ? o : ch)).join(''); });
  return out;
}

export const toAsciiDigits = s => String(s).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
