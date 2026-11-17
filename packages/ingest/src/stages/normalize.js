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
    // Ornate parentheses have no compatibility mapping; they read as ordinary ones. They are not
    // bidi-mirrored: Arabic text opens a verse with U+FD3F '﴿' and closes it with U+FD3E '﴾'
    // in logical order, so FD3F is the opening bracket. (Mapping FD3E to '(' turned every
    // correctly extracted Quran quotation into ')…('.) A document whose brackets come out
    // reversed is caught later by the pair-order vote on '(' ')'.
    if (c === '\uFD3F') return '(';
    if (c === '\uFD3E') return ')';
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
const RE_MARK_GAP = new RegExp('(' + RE_MARK.source + ')[ \\t\\u00A0]+(?=' + RE_MARK.source + ')', 'g');
// "word + space + mark-run + rest". The space may be spurious (the mark belongs to the word
// before it) or the real word gap (the mark is the last thing in the word before it).
const RE_STRAY_MARK_GAP = new RegExp('([^\\s\\u00A0]+)([ \\t\\u00A0]+)(' + RE_MARK.source + '+)([^\\s\\u00A0]*)', 'g');
const AR_LETTERS = '\\u0621-\\u063A\\u0641-\\u064A\\u066E-\\u06D3\\u06FA-\\u06FF';
const AR_FORMS = '\\uFB50-\\uFDFF\\uFE70-\\uFEFF';
// A tanween (and the alif that may follow it) always ends a word, so a letter right after one is
// a word that lost its space in the text layer ("كثيرٍعلى"). The letters after it must be a word.
const RE_TANWEEN_GLUED = new RegExp('(' + RE_MARK.source + '*[\u064B-\u064D])([\u0627\u0649]?)(?=[' + AR_LETTERS + '])', 'g');
// A word after the marks carries its own diacritics; they are stripped before the word list look-up.
const RE_LEAD_WORD = new RegExp('^[' + AR_LETTERS + AR_FORMS + RE_MARK.source.slice(1, -1) + ']+');
const RE_TAIL_WORD = new RegExp('[' + AR_LETTERS + AR_FORMS + RE_MARK.source.slice(1, -1) + ']+$');
// One word of letters and marks only (a punctuation mark means the pair is not a split word).
const RE_WORD_ONLY = new RegExp('^[' + AR_LETTERS + RE_MARK.source.slice(1, -1) + ']+$');
const RE_TANWEEN = /[\u064B-\u064D]/;
// A shadda doubles the letter it sits on; at a word end it is rare, in the middle of a word it is
// not. When the letter shapes give no answer, a shadda keeps the mark on the previous word.
const RE_SHADDA = /\u0651/;
// A short fragment that happens to be in the word list must not outvote a whole word; the
// letters after the marks are only taken as a new word when they are a common one.
const NEXT_WORD_RANK = 50000;
// A word ending in a shadda is rarer than one with a medial shadda, but the word before it must be
// a common word for that reading to win ("كلّ شيء" vs "خِلِّكان").
const SHADDA_PREV_RANK = 10000;

/**
 * Shape of the Arabic presentation forms: isolated (0), final (1), initial (2), medial (3).
 * A final/isolated letter ends its word, so a space after it is a real word gap; an initial or
 * medial letter continues into the next letter, so the space is spurious. Only four-shape letters
 * are conclusive: non-joining letters (ا د ذ ر ز و) look final even in the middle of a word.
 */
const FORM_INFO = (() => {
  const out = new Map();
  for (let cp = 0xFE80; cp <= 0xFEFC; cp++) {
    const base = String.fromCodePoint(cp).normalize('NFKC');
    if (!/^[\u0621-\u064A]$/.test(base)) continue;
    let len = 1;
    while (cp + len <= 0xFEFC && String.fromCodePoint(cp + len).normalize('NFKC') === base) len++;
    if (len === 2 || len === 4) for (let k = 0; k < len; k++) out.set(cp + k, { shape: k, forms: len });
    cp += len - 1;
  }
  return out;
})();

/** Shape evidence for the last letter of `s`: true = the word ends there, null = no evidence. */
function endsWord(s) {
  const chars = [...s];
  for (let i = chars.length - 1; i >= 0; i--) {
    const info = FORM_INFO.get(chars[i].codePointAt(0));
    if (info) return info.forms === 4 ? info.shape <= 1 : null;
    if (!RE_MARK.test(chars[i])) return null;   // a plain letter carries no shape
  }
  return null;
}

/**
 * Repair marks that pdf.js left separated from their base letter.
 * A combining mark never starts a word, so a space in front of one is always in the wrong place,
 * but there are two different wrong places:
 *   - the mark belongs to the word before the space and the space is spurious ("ل ُغة" -> "لُغة");
 *   - the space is the real word gap and pdf.js moved it in front of the final mark
 *     ("رجلا ًمن" -> "رجلًا من"), which used to lose the space and glue the two words.
 * The evidence decides:
 *   - nothing but punctuation follows the marks: the mark ends the token, attach it;
 *   - tanween (ً ٌ ٍ) only ever ends a word, so letters after it start a new word — except the
 *     alif that is written after the mark in "كتابًا";
 *   - otherwise the word list decides: the letters after the marks must be a whole word on their
 *     own and the joined form must not be one. Without a word list the old behaviour (attach) is
 *     kept, so the repair can never invent a word break.
 * @param {string} s
 * @param {{ has(w: string): boolean } | null} [lexicon]
 * @param {boolean} [wordGap] false = the pre-2026-11 behaviour (delete the space in front of the
 *   mark); the 'mark-word-gap' rule turns it off for ablation.
 */
export function repairSplitMarks(s, lexicon = null, wordGap = true) {
  const str = String(s);
  if (!RE_MARK.test(str)) return str.normalize('NFC');
  // A corrupt line can be page-sized. The repairs are local to words, so cut it at a space first
  // and never let one regex scan a whole page.
  if (str.length > 4000) {
    const parts = [];
    for (let i = 0; i < str.length;) {
      let end = Math.min(str.length, i + 4000);
      if (end < str.length) { const sp = str.lastIndexOf(' ', end); if (sp > i) end = sp; }
      parts.push(repairSplitMarks(str.slice(i, end), lexicon, wordGap));
      i = end;
    }
    return parts.join('');
  }
  let out = str;
  /* Two gaps can sit next to each other ("كتب َمحمد ُرسالة"): the word between them is consumed by
     the first match, so the pass runs again on its own output until nothing changes. */
  const decide = (m, prev, gap, marks, after) => {
    if (!after) return prev + marks;                       // the mark ends the token
    const rawNext = (after.match(RE_LEAD_WORD) || [''])[0];
    const next = mapForms(stripMarks(rawNext));
    if (!next) return prev + marks + after;                // punctuation follows: it ends the token
    // The letter forms in the text layer say whether the word before the space ended there.
    const shape = endsWord(prev);
    // "كتابًا": the alif of the tanween is a word of its own only when it is the whole run; an alef
    // that is followed by more letters starts the next word ("رجلٌ اسمه").
    const tanweenAlif = RE_TANWEEN.test(marks) && (next[0] === 'ا' || next[0] === 'ى') && next.length === 1;
    const shadda = RE_SHADDA.test(marks);
    const prevWord = mapForms(stripMarks((prev.match(RE_TAIL_WORD) || [''])[0]));
    const prevCommon = !!prevWord && (!!lexicon && (lexicon.rank ? lexicon.rank(prevWord) <= SHADDA_PREV_RANK : lexicon.has(prevWord)));
    const keepGap = wordGap && !tanweenAlif && (
      shape === true ||
      (shape === null && (RE_TANWEEN.test(marks) || (
        // A shadda is far more often medial than final, so it needs the word before it to be a
        // common word before it may end one ("كلّ شيء", not "خِلِّكان").
        (!shadda || prevCommon) && !!lexicon && next.length > 1 &&
        (lexicon.rank ? lexicon.rank(next) <= NEXT_WORD_RANK : lexicon.has(next)) &&
        !lexicon.has(mapForms(stripMarks(prev + marks + next)))
      )))
    );
    return keepGap ? prev + marks + ' ' + after : prev + marks + after;
  };
  for (let pass = 0; pass < 3; pass++) {
    const before = out;
    // The marks of one letter never have a space between them.
    out = out.replace(RE_MARK_GAP, '$1');
    out = out.replace(RE_STRAY_MARK_GAP, decide);
    if (out === before) break;
  }
  // A word that starts right after a tanween lost its space entirely ("كثيرٍعلى"): put it back.
  // When an alef follows the tanween the reading is ambiguous (the tanween alif of this word or
  // the first letter of the next one), so that shape is left alone.
  if (wordGap && lexicon) out = out.replace(RE_TANWEEN_GLUED, (m, marksRun, alif, offset, whole) => {
    const beforeRaw = whole.slice(0, offset);
    if (alif || !beforeRaw || /\s$/.test(beforeRaw)) return m;  // no word before the marks: nothing to split
    const after = whole.slice(offset + m.length);
    const next = mapForms(stripMarks((after.match(RE_LEAD_WORD) || [''])[0]));
    if (next.length < 2) return m;
    const rank = w => (lexicon.rank ? lexicon.rank(w) <= NEXT_WORD_RANK : lexicon.has(w));
    const before = mapForms(stripMarks((whole.slice(0, offset).match(RE_TAIL_WORD) || [''])[0]));
    const cut = rank(next) || (next.length >= 3 && !!before && rank(before));
    return cut ? marksRun + ' ' : m;
  });
  // Nothing may be left in front of a mark (a mark at the start of a string has no word before it).
  out = out.replace(RE_SPACE_BEFORE_MARK, '');
  return out.normalize('NFC');
}

/**
 * Join words that the text layer split in two with a space ("الص وت" for "الصوت").
 * The gap comes from glyph geometry (a zero-width ligature component, a kern, or a justification
 * gap that crossed the word-gap threshold), not from a word boundary. The word list decides:
 * two adjacent letter runs are joined when the joined form is a common word and at least one of
 * the halves is not a word on its own. Both halves being words keeps the space ("من ها" is
 * "منها" only when "ها" is not a word... it is, so that pair is left alone).
 * @param {string} s
 * @param {{ has(w: string): boolean, rank?(w: string): number } | null} lexicon
 */
export function joinSplitWords(s, lexicon) {
  if (!lexicon) return s;
  const str = String(s);
  if (str.length > 20000 || str.indexOf(' ') < 0) return str;
  const known = w => (lexicon.rank ? lexicon.rank(w) <= NEXT_WORD_RANK : lexicon.has(w));
  const canJoin = (a, b) => {
    if (!RE_WORD_ONLY.test(a) || !RE_WORD_ONLY.test(b)) return false;
    if (a.length + b.length > 22 || Math.min(a.length, b.length) > 3) return false;
    const A = mapForms(stripMarks(a)), B = mapForms(stripMarks(b));
    if (!A || !B) return false;
    if (!known(A + B)) return false;
    return !(known(A) && known(B));
  };
  // Words and their separators, so a pair that cannot join is retried one word later
  // ("سمعت الص وت": the first pair is "سمعت الص", the word that needs joining starts at "الص").
  const parts = str.split(/([ \t]+)/);
  const out = [parts[0] || ''];
  for (let i = 1; i < parts.length; i += 2) {
    const sep = parts[i], word = parts[i + 1] ?? '';
    const prev = out[out.length - 1];
    if (sep.length === 1 && word && prev && canJoin(prev, word)) { out[out.length - 1] = prev + word; continue; }
    out.push(sep, word);
  }
  return out.join('');
}

/**
 * Last pass over a finished book: no space may sit in front of a combining mark anywhere, and no
 * word may be split by a stray space. Paragraphs, captions, notes, headings and titles are built
 * by different code paths (some of them join lines with a space after the per-line repair), so
 * the guarantee is enforced once, on every string of the book, instead of in each builder.
 * @param {object} book
 * @param {object} [opts] ingest options ({ lexicon, rules })
 */
export function repairBookMarks(book, opts = {}) {
  const lexicon = opts.lexicon || null, wordGap = on(opts, 'mark-word-gap');
  const joinSplit = on(opts, 'join-split-words') && !!lexicon;
  const walk = x => {
    if (typeof x === 'string') {
      let out = repairSplitMarks(x, lexicon, wordGap);
      if (joinSplit) out = joinSplitWords(out, lexicon);
      return out;
    }
    if (Array.isArray(x)) { for (let i = 0; i < x.length; i++) x[i] = walk(x[i]); return x; }
    if (x && typeof x === 'object') { for (const k in x) x[k] = walk(x[k]); return x; }
    return x;
  };
  return walk(book);
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
      // A word never runs from one script into another ("لماذاDeepSeek"): at an Arabic/Latin
      // boundary the space is always real, whatever the glyph gap says.
      const lastCh = [...prev.s.replace(/\s+$/, '')].pop() || '';
      const firstCh = [...s.replace(/^\s+/, '')][0] || '';
      const arLast = /[\u0621-\u064A]/.test(lastCh), arFirst = /[\u0621-\u064A]/.test(firstCh);
      const latLast = /[A-Za-z]/.test(lastCh), latFirst = /[A-Za-z]/.test(firstCh);
      if ((arLast && latFirst) || (latLast && arFirst)) space = true;
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
    // Before the presentation forms are mapped, the letter shapes can say whether the word before
    // a space ended there — the strongest evidence for a mark that pdf.js left after a space.
    if (on(opts, 'mark-word-gap')) l.text = repairSplitMarks(l.text, opts.lexicon, true);
    if (on(opts, 'nfkc-forms')) l.text = mapForms(l.text);
    if (on(opts, 'strip-tatweel')) l.text = stripTatweel(l.text);
    if (opts.stripMarks) l.text = stripMarks(l.text);
    // A space just before a closing punctuation mark is never part of the text.
    l.text = l.text.replace(/[ \t\u00A0]+(?=[\u060C\u061B:!\u061F])/g, '');
    l.text = repairSplitMarks(l.text, opts.lexicon, on(opts, 'mark-word-gap')).replace(/[ \t ]+/g, ' ').trim();
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

// Ornate parentheses (U+FD3E/U+FD3F) are a pair too, and pdf.js reverses them like the guillemets.
// Round and square brackets too: some producers (Acrobat, Lotus fonts) draw them by shape, so
// pdf.js returns ')نص(' in every right-to-left line and the reorder stage leaves them.
export const PAIRS = [['«', '»'], ['“', '”'], ['\uFD3F', '\uFD3E'], ['(', ')'], ['[', ']']];

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

/**
 * The word-space threshold for this document, from its own gaps. Gaps between neighbouring
 * right-to-left items of a line fall in two groups: about zero (one word broken into several
 * items) and the word spaces. A fixed 0.15 em cut the word-space group of some books in half
 * (Acrobat with Lotus: spaces of 0.12-0.15 em), gluing words: 'خرجتحتى'. The cut goes in the
 * emptiest stretch between 0.05 and 0.15 em; it is never raised above the profile value.
 * Returns null when the document gives no clear valley.
 */
export function adaptiveSpaceGap(lineSets, cap = 0.15) {
  const bins = new Array(9).fill(0); // 0, 0.025 .. 0.2
  let n = 0, word = 0;
  for (const lines of lineSets) for (const ln of lines) {
    if (ln.base !== 1) continue;
    const its = ln.items || [];
    for (let k = 1; k < its.length; k++) {
      const a = its[k - 1], b = its[k];
      const size = Math.max(a.size, b.size) || 1;
      const e = (a.x - (b.x + b.w)) / size;
      if (e < -0.02 || e > 0.6) continue;
      n++;
      if (e >= 0.075) word++;
      const i = Math.round(e / 0.025);
      if (i < bins.length) bins[i]++;
    }
  }
  if (n < 200 || word < 0.1 * n) return null;
  // The emptiest bin from 0.05 to 0.125 em; it must be nearly empty to count as a valley.
  let best = -1;
  for (let i = 2; i <= 5; i++) if (best < 0 || bins[i] < bins[best]) best = i;
  if (bins[best] > 0.01 * n) return null;
  // The middle of the empty run that holds it.
  let last = best;
  while (last + 1 <= 5 && bins[last + 1] === bins[best]) last++;
  const cut = ((best + last) / 2 + 0.5) * 0.025;
  return cut < cap ? cut : null;
}
