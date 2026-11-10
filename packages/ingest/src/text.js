// Character classes and text metrics for Arabic. Pure: no DOM, no I/O.

export const RE_AR_LETTER = /[ء-غف-يٱ-ۓۺ-ۼ]/;
export const RE_AR_LETTERS_G = /[ء-غف-يٱ-ۓۺ-ۼ]/g;
export const RE_MARK = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]/;
export const RE_MARKS_G = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]/g;
export const RE_PRES = /[ﭐ-﷿ﹰ-﻿]/;
export const RE_PRES_G = /[ﭐ-﷿ﹰ-ﻼ]/g;
export const TATWEEL = 'ـ';
export const isArabicChar = c => RE_AR_LETTER.test(c) || RE_MARK.test(c) || RE_PRES.test(c) || c === TATWEEL;

/** Loose form used only for matching and scoring, never for output. */
export function matchForm(s) {
  return String(s)
    .replace(RE_MARKS_G, '')
    .replace(/ـ/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي');
}

/** Tokens: maximal runs of letters/marks/digits (any script). */
export function tokens(s) {
  return String(s).match(/[\p{L}\p{M}\p{Nd}ـ]+/gu) || [];
}

// About 50 of the most frequent Arabic function words, in match form.
export const FUNCTION_WORDS = new Set([
  'في', 'من', 'علي', 'ان', 'الي', 'عن', 'هذا', 'هذه', 'التي', 'الذي', 'الذين', 'ما', 'لا', 'لم', 'لن',
  'قد', 'كان', 'كانت', 'هو', 'هي', 'هم', 'ثم', 'او', 'مع', 'بين', 'كل', 'بعض', 'عند', 'اذا', 'لقد',
  'حتي', 'منذ', 'بل', 'لكن', 'ذلك', 'تلك', 'غير', 'كما', 'ليس', 'انه', 'انها', 'الا', 'فقد', 'وقد',
  'وهو', 'وهي', 'ولا', 'وفي', 'ومن', 'بعد', 'قبل', 'عليه', 'فيه', 'منه', 'له', 'لها', 'هذه', 'وان'
].map(matchForm));

// Letters that legitimately stand alone as words.
const SOLO_OK = new Set(['و']);

/**
 * Metrics used by inspect, scoring and ablation. Counts only; never returns text.
 */
export function textMetrics(s) {
  s = String(s || '');
  const arLetters = (s.match(RE_AR_LETTERS_G) || []).length;
  const pres = (s.match(RE_PRES_G) || []).length;
  const toks = tokens(s);
  let arTok = 0, isolated = 0, fw = 0, alPrefix = 0, laSuffix = 0;
  for (const t of toks) {
    if (!RE_AR_LETTER.test(t) && !RE_PRES.test(t)) continue;
    arTok++;
    const m = matchForm(t);
    const letters = m.replace(/[^ء-يٱ-ۓ]/g, '');
    if (letters.length === 1 && !SOLO_OK.has(letters)) isolated++;
    if (FUNCTION_WORDS.has(m)) fw++;
    if (m.length > 3 && m.startsWith('ال')) alPrefix++;
    if (m.length > 3 && m.endsWith('لا')) laSuffix++;
  }
  return {
    chars: s.length,
    arLetters,
    pres,
    presRatio: arLetters + pres ? pres / (arLetters + pres) : 0,
    tokens: toks.length,
    arTokens: arTok,
    isolated,
    isolatedRatio: arTok ? isolated / arTok : 0,
    fw,
    fwPer1000: arTok ? (fw / arTok) * 1000 : 0,
    alPrefix,
    laSuffix
  };
}

export const reverseChars = s => [...String(s)].reverse().join('');

// Top function words (logical, with hamza) used by the correct-form check and the audits.
export const TOP_FUNCTION_WORDS = ['في', 'من', 'على', 'إلى', 'عن', 'أن', 'إن', 'بين', 'التي', 'الذي', 'الذين', 'هذا', 'هذه',
  'لم', 'لا', 'ما', 'كان', 'غير', 'ذلك', 'مع', 'حتى', 'كل', 'قد', 'هو', 'هي', 'كما', 'عند', 'ثم', 'أو', 'ليس', 'بعد', 'قبل', 'منذ', 'لكن', 'إذا'];

// Fixed candidate list of common Arabic ligatures (letter pairs in logical order, plus a few
// triples). Used by the ligature solver and by the reversed-pair checks.
export const LIGATURES = [
  'في', 'لى', 'على', 'ين', 'ير', 'يز', 'بن', 'بر', 'بز', 'تن', 'تر', 'نن', 'نر', 'ئن', 'ئر',
  'لم', 'لح', 'لج', 'لخ', 'لي', 'لا', 'مح', 'مج', 'مخ', 'مم', 'نج', 'نح', 'نخ', 'نم', 'نى', 'ني',
  'بح', 'بج', 'بخ', 'بم', 'بى', 'بي', 'تح', 'تج', 'تخ', 'تم', 'تى', 'تي', 'ثم', 'يح', 'يج', 'يخ', 'يم', 'يى',
  'سح', 'سج', 'سم', 'شم', 'صح', 'صم', 'ضم', 'عج', 'عم', 'غم', 'فح', 'فج', 'فم', 'فى', 'قم', 'كم', 'كل', 'كا', 'لله'
];

/** Plain form for counting: diacritics and tatweel removed, letters (including hamza forms and ى) kept. */
export const plainForm = s => String(s).replace(RE_MARKS_G, '').replace(/ـ/g, '');

/**
 * Forms of `w` with exactly one adjacent candidate pair reversed (for example في -> يف,
 * على -> عىل), excluding forms that are themselves top function words.
 */
export function pairSwaps(w, pairs = LIGATURES) {
  const out = new Set();
  const chars = [...w];
  for (let i = 0; i + 1 < chars.length; i++) {
    if (chars[i] === chars[i + 1] || !pairs.includes(chars[i] + chars[i + 1])) continue;
    const v = chars.slice(); v[i] = chars[i + 1]; v[i + 1] = chars[i];
    out.add(v.join(''));
  }
  for (const f of TOP_FUNCTION_WORDS) out.delete(f);
  return [...out];
}

/**
 * Correct-form check for the top function words: how often each appears correctly vs with a
 * reversed ligature pair. Counts only. share = correct / (correct + swapped), 1 when neither occurs.
 */
export function functionWordCheck(text) {
  const counts = new Map();
  for (const t of tokens(plainForm(text))) counts.set(t, (counts.get(t) || 0) + 1);
  let correct = 0, swapped = 0;
  for (const w of TOP_FUNCTION_WORDS) {
    correct += counts.get(w) || 0;
    swapped += pairSwaps(w).reduce((n, v) => n + (counts.get(v) || 0), 0);
  }
  return { correct, swapped, share: correct + swapped ? correct / (correct + swapped) : 1 };
}
