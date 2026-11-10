// Ligature solver. Glyphs whose Unicode is unknown are variables; each takes one value from a
// fixed candidate list of common Arabic ligatures. The assignment is chosen for the whole
// document (never per word): for every variable, each candidate is scored over all the tokens
// that contain it by dictionary coverage and by a character trigram model of the document's
// clean text. Variables are revisited (coordinate ascent) so tokens with two unknown glyphs are
// scored once their other glyph has a value. Pure.
//
// Score of a candidate: dictionary coverage (spelling-folded) + small terms for the character
// model, exact spelling and word frequency. Candidates that differ only in folded spelling
// (لى / لي) are the same glyph reading: confidence is the margin to the best candidate with a
// different folded form, and the small terms pick the spelling.
import { LIGATURES } from './text.js';
import { lexKey } from './lexicon.js';

export const SOLVER = { threshold: 0.6, passes: 3, lmWeight: 0.1, margin: 0.2, minTokens: 5 };
const clamp = x => Math.max(0, Math.min(1, x));

/**
 * @param {Map<string, number>} tokens  token -> count; tokens use one placeholder character per variable
 * @param {string[]} vars               placeholder characters
 * @param {object} ctx                  { lexicon: {has}, lm?: {score(text)}, candidates?: string[] }
 * @returns {Map<string, {text: string, confidence: number, coverage: number, weight: number}>}
 */
export function solveLigatures(tokens, vars, ctx) {
  const cands = ctx.candidates || LIGATURES;
  const P = Object.assign({}, SOLVER, ctx.params);
  const varSet = new Set(vars);
  const byVar = new Map(vars.map(v => [v, []]));
  for (const [t, n] of tokens) for (const v of new Set([...t].filter(c => varSet.has(c)))) byVar.get(v).push([t, n]);
  const weightOf = v => byVar.get(v).reduce((s, [, n]) => s + n, 0);
  const order = vars.slice().sort((a, b) => weightOf(b) - weightOf(a));
  const assign = new Map();
  const result = new Map();

  for (let pass = 0; pass < P.passes; pass++) {
    let changed = false;
    for (const v of order) {
      const scores = [];
      for (const c of cands) {
        let w = 0, hit = 0, lp = 0, ex = 0, fq = 0;
        for (const [t, n] of byVar.get(v)) {
          let ok = true;
          const word = [...t].map(ch => {
            if (ch === v) return c;
            if (!varSet.has(ch)) return ch;
            if (assign.has(ch)) return assign.get(ch);
            ok = false; return ch;
          }).join('');
          if (!ok) continue;
          w += n;
          if (ctx.lexicon.has(word)) {
            hit += n;
            const er = ctx.lexicon.exactRank ? ctx.lexicon.exactRank(word) : Infinity;
            if (er < Infinity) ex += n;
            const rk = Math.min(er, ctx.lexicon.rank(word));
            if (rk < Infinity) fq += n * (1 - Math.log(rk) / Math.log((ctx.lexicon.size || 1) + 1));
          }
          if (ctx.lm) lp += n * ctx.lm.score(word);
        }
        if (w) scores.push({ c, cov: hit / w, lp: ctx.lm ? lp / w : 0, ex: ex / w, fq: fq / w, w });
      }
      if (!scores.length) continue;
      const lo = Math.min(...scores.map(s => s.lp)), hi = Math.max(...scores.map(s => s.lp));
      for (const s of scores) s.S = s.cov + P.lmWeight * (hi > lo ? (s.lp - lo) / (hi - lo) : 0) + 0.05 * s.ex + 0.05 * s.fq;
      scores.sort((a, b) => b.S - a.S);
      const b1 = scores[0], b2 = scores.find(s => lexKey(s.c) !== lexKey(b1.c));
      const confidence = clamp((b1.S - (b2 ? b2.S : 0)) / P.margin) * clamp(b1.w / P.minTokens) * clamp(b1.cov / 0.5);
      if (assign.get(v) !== b1.c) changed = true;
      assign.set(v, b1.c);
      result.set(v, { text: b1.c, confidence: Math.round(confidence * 1000) / 1000, coverage: Math.round(b1.cov * 1000) / 1000, weight: b1.w });
    }
    if (!changed && pass > 0) break;
  }
  return result;
}
