// Failure-type audit of converted text. Counts only: never returns text. The fixed example
// words from the failure report are used as labels.
import { tokens, plainForm, functionWordCheck, TOP_FUNCTION_WORDS, LIGATURES } from '../../packages/ingest/src/text.js';

// Example words from the failure report: [correct form, broken form].
export const EXAMPLES = {
  reversedPairs: [['بين', 'بني'], ['في', 'يف'], ['الحرية', 'احلرية'], ['المعتقدات', 'املعتقدات'], ['وغير', 'وغري'], ['على', 'عىل'], ['إلى', 'إىل']],
  lossy: [['على', 'عل'], ['إلى', 'إل']]
};

/** All text strings of a book JSON (chapter text, notes, titles), joined by newlines. */
export function bookText(book) {
  const parts = [];
  const skip = new Set(['png', 'path', 'id', 'mime', 'kind', 'type', 'role', 'method']);
  (function walk(x, k) {
    if (typeof x === 'string') { if (!skip.has(k)) parts.push(x); }
    else if (Array.isArray(x)) x.forEach(v => walk(v, k));
    else if (x && typeof x === 'object') for (const kk in x) walk(x[kk], kk);
  })(book, '');
  return parts.join('\n');
}

// Forms of the top function words with one ى or ا missing (not themselves words: كم, كن, إذ are).
const REAL_WORDS = new Set(['كم', 'كن', 'إذ']);
const LOSSY_FORMS = new Set();
for (const w of TOP_FUNCTION_WORDS) {
  const ch = [...w];
  ch.forEach((x, i) => {
    if (x !== 'ى' && x !== 'ا') return;
    const v = ch.slice(0, i).concat(ch.slice(i + 1)).join('');
    if (v.length >= 2 && !TOP_FUNCTION_WORDS.includes(v) && !REAL_WORDS.has(v)) LOSSY_FORMS.add(v);
  });
}

/**
 * @param {string} text
 * @param {{ has(w: string): boolean } | null} lexicon  optional word list (enables the general counts)
 */
export function audit(text, lexicon = null) {
  const toks = tokens(plainForm(text));
  const tc = new Map();
  for (const t of toks) tc.set(t, (tc.get(t) || 0) + 1);
  const c = w => tc.get(w) || 0;
  const fw = functionWordCheck(text);
  let lossy = 0;
  for (const v of LOSSY_FORMS) lossy += c(v);
  const cnt = re => (text.match(re) || []).length;
  let gGood = 0, gBad = 0, qGood = 0, qBad = 0;
  for (const l of text.split('\n')) {
    const o = l.indexOf('«'), cl = l.indexOf('»');
    if (o >= 0 && cl >= 0) { if (o < cl) gGood++; else gBad++; }
    const qo = l.indexOf('“'), qc = l.indexOf('”');
    if (qo >= 0 && qc >= 0) { if (qo < qc) qGood++; else qBad++; }
  }
  const out = {
    arabicTokens: toks.filter(t => /[ء-ي]/.test(t)).length,
    reversedPairs: { functionWords: fw.swapped, functionWordsCorrect: fw.correct, correctShare: +fw.share.toFixed(4) },
    unmapped: { pua: cnt(/[-]/g), replacement: cnt(/�/g), box: cnt(/□/g), controls: cnt(/[\u0000-\u0008\u000B-\u001F]/g) },
    lossy: { functionWords: lossy },
    guillemets: { good: gGood, reversed: gBad },
    quotes: { good: qGood, reversed: qBad },
    examples: Object.fromEntries(Object.entries(EXAMPLES).map(([k, list]) => [k, list.map(([ok, bad]) => ({ ok, correct: c(ok), broken: c(bad) }))]))
  };
  if (lexicon) {
    // General counts: a token that is not a known word but becomes a very common one when one
    // candidate ligature pair is put back in order (reversed pair), or when one ى/ا is inserted (lossy).
    // Targets must be very common words (rank <= 2000, the lossy-repair bar).
    const common = w => (lexicon.rank ? lexicon.rank(w) <= 2000 : lexicon.has(w));
    let rev = 0, los = 0, known = 0, ar = 0;
    for (const [t, n] of tc) {
      if (!/^[ء-ي]+$/.test(t)) continue;
      ar += n;
      if (lexicon.has(t)) { known += n; continue; }
      const ch = [...t];
      let hit = false;
      for (let i = 0; i + 1 < ch.length && !hit; i++) {
        if (ch[i] === ch[i + 1] || !LIGATURES.includes(ch[i + 1] + ch[i])) continue;
        const v = ch.slice(); v[i] = ch[i + 1]; v[i + 1] = ch[i];
        hit = common(v.join(''));
      }
      if (hit) { rev += n; continue; }
      for (let i = 0; i <= ch.length && !hit; i++) for (const x of ['ى', 'ا']) if (common(ch.slice(0, i).join('') + x + ch.slice(i).join(''))) { hit = true; break; }
      if (hit) los += n;
    }
    out.lexicon = { coverage: ar ? +(known / ar).toFixed(4) : 0, reversedPairTokens: rev, lossyTokens: los };
  }
  return out;
}
