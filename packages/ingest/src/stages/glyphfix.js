// Stage 1b: glyph repair. Runs on the extracted items before reordering, using the document's
// glyph census (which Unicode each font's glyph codes produced). Never mutates `raws` (they may
// be cached across runs); returns repaired copies.
//
// Rules:
//  raw-ligatures   (extract) text is read with pdf.js normalization off. When off, pdf.js's
//                  behaviour is reproduced: ligature characters are expanded before its
//                  right-to-left reversal, so their letters come out reversed.
//  reversed-multi  a glyph whose ToUnicode entry is several Arabic letters is emitted by pdf.js
//                  inside a right-to-left chunk that it reverses character by character, so the
//                  letters come out reversed. Per font, when document evidence shows it (known
//                  words become far more frequent when the letters are put back), those
//                  letter sequences are restored in that font's right-to-left items.
//  glyph-names     a glyph with no usable Unicode gets text from its glyph name in the embedded
//                  font (or the font's /Differences), for standard names (uniXXXX, lam_alefmaksura…).
//  ligature-solver remaining unknown glyphs are solved per (font, glyph code) over a fixed list
//                  of ligatures; below the confidence threshold they stay unresolved and their
//                  pages are routed to vision.
import { on } from '../rules.js';
import { classifyCensus, glyphNameToText } from '../glyphs.js';
import { solveLigatures, SOLVER } from '../ligsolver.js';
import { FUNCTION_WORDS, matchForm, tokens as tokenize, RE_MARKS_G } from '../text.js';
import { TrigramModel } from '../score.js';

// Characters pdf.js normalizes (NFKC) per glyph in getTextContent, from pdf.js 5.x normalizeUnicode.
const PDFJS_NORM = /[ µ;ຳ -  Ωﬀ-ﬄﬆﬠ-זּטּ-לּמּנּ-סּףּ-פּצּ-ﮡﮤ-ﮩﮮ-ﮱﯓ-ﯜﯞ-ﯧﯪ-ﯸﯼ-ﯽﰀ-ﱝﱤ-ﳱﳵ-ﴽﶈﷴﷺ-ﷻﹱﹷﹹﹻﹽ]/g;
const rev = s => [...s].reverse().join('');
const nfkcForms = s => s.replace(/[ﭐ-﷿ﹰ-ﻼ]/g, c => c.normalize('NFKC')).replace(RE_MARKS_G, '').replace(/ـ/g, '');

/** What pdf.js returns with normalization on, given the raw (normalization-off) item text. */
export function pdfjsNormalized(s, dir) {
  return s.replace(PDFJS_NORM, c => { const n = c.normalize('NFKC'); return dir === 'rtl' ? rev(n) : n; });
}

/** Replace every occurrence of each key of `map` in s (keys are literal strings). */
function replaceAll(s, map) {
  if (!map.size) return s;
  let out = s;
  for (const [from, to] of map) if (out.includes(from)) out = out.split(from).join(to);
  return out;
}

const isKnown = (t, lexicon) => FUNCTION_WORDS.has(matchForm(t)) || (lexicon ? lexicon.has(t) : false);

/**
 * Evidence for restoring reversed multi-letter mappings in a set of items: count known words
 * among the tokens that the swap changes, before and after.
 */
export function multiEvidence(items, swaps, lexicon) {
  let before = 0, after = 0, changed = 0;
  for (const it of items) {
    const s2 = replaceAll(it.s, swaps);
    if (s2 === it.s) continue;
    const a = tokenize(nfkcForms(it.s)), b = tokenize(nfkcForms(s2));
    if (a.length !== b.length) continue;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      changed++;
      if (isKnown(a[i], lexicon)) before++;
      if (isKnown(b[i], lexicon)) after++;
    }
  }
  return { before, after, changed };
}
const evidenceSays = e => e.after >= 5 && e.after >= 3 * e.before;

/**
 * @param {Array} raws     extracted pages (not mutated)
 * @param {Map} census     glyph census (glyphs.js)
 * @param {object} ctx     { names: Map<fontName, Map<code, glyphName>> | null, lexicon | null }
 * @param {object} opts
 * @returns {{ raws: Array, report: object, unresolvedByPage: Map<number, number> }}
 */
export function repairGlyphs(raws, census, ctx = {}, opts = {}) {
  classifyCensus(census);
  const lexicon = ctx.lexicon || null;
  const rep = { codes: 0, occ: 0, missingCodes: 0, puaCodes: 0, unknownOcc: 0, multiCodes: 0, multiOcc: 0,
    multiFontsReversed: 0, multiReplaced: 0, namesResolved: 0, solverResolved: 0, solverTried: 0,
    unresolvedCodes: 0, unresolvedOcc: 0, unresolvedShare: 0, lexicon: !!lexicon };

  // Items, with the pdf.js normalization emulated when raw-ligatures is off.
  const rawLig = on(opts, 'raw-ligatures');
  let pages = raws.map(r => Object.assign({}, r, { items: r.items.map(it => rawLig ? it : Object.assign({}, it, { s: pdfjsNormalized(it.s, it.dir) })) }));

  const itemsByFid = new Map();
  for (const p of pages) for (const it of p.items) { if (!itemsByFid.has(it.fid)) itemsByFid.set(it.fid, []); itemsByFid.get(it.fid).push(it); }

  // --- reversed-multi ---
  const multiSwaps = new Map(); // fid -> Map(reversed -> logical)
  for (const [fid, F] of census) {
    const m = new Map();
    for (const e of F.codes.values()) {
      rep.codes++; rep.occ += e.n;
      if (e.kind === 'missing') rep.missingCodes++;
      if (e.kind === 'pua') rep.puaCodes++;
      if (e.kind === 'missing' || e.kind === 'pua') rep.unknownOcc += e.n;
      if (e.kind !== 'multi') continue;
      rep.multiCodes++; rep.multiOcc += e.n;
      const letters = e.u.replace(RE_MARKS_G, '');
      if ([...letters].length >= 2 && letters === e.u && rev(e.u) !== e.u) m.set(rev(e.u), e.u);
    }
    if (m.size) multiSwaps.set(fid, m);
  }
  const rtlOf = fid => (itemsByFid.get(fid) || []).filter(it => it.dir === 'rtl');
  const perFont = new Map();
  const pooled = { before: 0, after: 0, changed: 0 };
  for (const [fid, m] of multiSwaps) {
    const e = multiEvidence(rtlOf(fid), m, lexicon);
    perFont.set(fid, e);
    pooled.before += e.before; pooled.after += e.after; pooled.changed += e.changed;
  }
  const docSays = evidenceSays(pooled);
  rep.multiEvidence = pooled;
  const applyMulti = new Map();
  if (on(opts, 'reversed-multi')) for (const [fid, m] of multiSwaps) {
    const e = perFont.get(fid);
    // Enough evidence in this font: its own verdict. Too few changed tokens: the document's,
    // unless this font's own counts point the other way.
    const yes = e.changed >= 5 ? evidenceSays(e) : docSays && e.after >= e.before;
    if (yes) { applyMulti.set(fid, m); rep.multiFontsReversed++; }
  }

  // --- unknown glyphs: locatable emitted character per (font, code) ---
  const unknown = []; // { fid, code, e, ch }
  for (const [fid, F] of census) {
    const okChars = new Set([...F.codes.values()].filter(e => e.kind !== 'missing' && e.kind !== 'pua').map(e => e.u));
    for (const [code, e] of F.codes) {
      if (e.kind !== 'missing' && e.kind !== 'pua') continue;
      const cps = [...e.u];
      const ch = cps.length === 1 && !okChars.has(e.u) && !/\s/.test(e.u) ? e.u : null;
      unknown.push({ fid, F, code, e, ch });
    }
  }
  // Emitted characters shared by several unknown codes of one font cannot be told apart.
  const seen = new Map();
  for (const u of unknown) if (u.ch) { const k = u.fid + '\u0000' + u.ch; seen.set(k, (seen.get(k) || 0) + 1); }
  for (const u of unknown) if (u.ch && seen.get(u.fid + '\u0000' + u.ch) > 1) u.ch = null;

  const fix = new Map(); // fid -> Map(char -> text)
  const setFix = (fid, ch, text) => { if (!fix.has(fid)) fix.set(fid, new Map()); fix.get(fid).set(ch, text); };
  // --- glyph-names ---
  if (on(opts, 'glyph-names')) for (const u of unknown) {
    if (!u.ch) continue;
    const emb = ctx.names ? ctx.names.get(u.F.name) : null;
    const name = (emb && emb.get(u.code)) || (Array.isArray(u.F.differences) && u.F.differences[u.code]) || (Array.isArray(u.F.defaultEncoding) && u.F.defaultEncoding[u.code]) || null;
    const text = glyphNameToText(name);
    if (text) { setFix(u.fid, u.ch, text); u.resolved = 'name'; rep.namesResolved++; }
  }

  // Apply multi swaps and name fixes before the solver sees the text.
  const applyItem = it => {
    let s = it.s;
    if (it.dir === 'rtl' && applyMulti.has(it.fid)) { const s2 = replaceAll(s, applyMulti.get(it.fid)); if (s2 !== s) { rep.multiReplaced += countDiff(s, applyMulti.get(it.fid)); s = s2; } }
    if (fix.has(it.fid)) s = replaceAll(s, fix.get(it.fid));
    return s === it.s ? it : Object.assign({}, it, { s });
  };
  pages = pages.map(p => Object.assign({}, p, { items: p.items.map(applyItem) }));

  // --- ligature-solver ---
  const open = unknown.filter(u => u.ch && !u.resolved);
  if (on(opts, 'ligature-solver') && lexicon && open.length) {
    rep.solverTried = open.length;
    const ph = new Map(); // fid\0ch -> placeholder
    open.forEach((u, i) => ph.set(u.fid + '\u0000' + u.ch, String.fromCharCode(0xE000 + i)));
    const toks = new Map(), lm = new TrigramModel();
    const unknownChars = new Set(unknown.map(u => u.ch).filter(Boolean));
    for (const p of pages) for (const it of p.items) {
      let s = '';
      for (const c of it.s) { const k = ph.get(it.fid + '\u0000' + c); s += k || (unknownChars.has(c) ? ' ' : c); }
      const clean = nfkcForms(s);
      const words = clean.match(/[ء-ي-]+/g) || [];
      for (const w of words) {
        if (/[-]/.test(w)) toks.set(w, (toks.get(w) || 0) + 1);
        else lm.train(w);
      }
    }
    const sol = solveLigatures(toks, [...ph.values()], { lexicon, lm });
    rep.solver = [];
    for (const u of open) {
      const r = sol.get(ph.get(u.fid + '\u0000' + u.ch));
      if (!r) continue;
      rep.solver.push({ font: u.F.name.replace(/^[A-Z]{6}\+/, ''), code: u.code, occ: u.e.n, confidence: r.confidence, coverage: r.coverage });
      if (r.confidence >= SOLVER.threshold) { setFix(u.fid, u.ch, r.text); u.resolved = 'solver'; rep.solverResolved++; }
    }
    pages = pages.map(p => Object.assign({}, p, { items: p.items.map(it => fix.has(it.fid) ? Object.assign({}, it, { s: replaceAll(it.s, fix.get(it.fid)) }) : it) }));
  }

  // --- unresolved: pages that still carry an unknown glyph go to vision ---
  const unresolvedByPage = new Map();
  for (const u of unknown) {
    if (u.resolved) continue;
    rep.unresolvedCodes++; rep.unresolvedOcc += u.e.n;
    const per = u.e.n / Math.max(1, u.e.pages.size);
    for (const pg of u.e.pages) unresolvedByPage.set(pg, (unresolvedByPage.get(pg) || 0) + per);
  }
  rep.unresolvedShare = rep.occ ? Math.round(rep.unresolvedOcc / rep.occ * 1e5) / 1e5 : 0;
  rep.unresolvedPages = unresolvedByPage.size;
  return { raws: pages, report: rep, unresolvedByPage };
}

function countDiff(s, map) {
  let n = 0;
  for (const k of map.keys()) n += s.split(k).length - 1;
  return n;
}
