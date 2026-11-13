// Quality scoring without any language model.
//  - absolute signals per page: presentation-form ratio, isolated single-letter tokens,
//    function words per 1000 Arabic tokens
//  - a character trigram model self-calibrated on the best pages of the same document
//  - a reversal test: the page and its character-reversed version are both scored
// Routing: 'ok' | 'review' | 'vision' with a confidence value.
import { textMetrics, matchForm, reverseChars, RE_MARKS_G } from './text.js';

export const THRESHOLDS = { page: 0.5, doc: 0.8, minTokens: 40, fwCorrect: 0.9, fwSwappedMin: 20, dictCoverage: 0.6 };

/**
 * Scanned-page detection thresholds, exported through the public entry point.
 * imageCoverage: minimum union image coverage for a page with no text layer to
 * count as a scanned page (>= comparison). visionShare: minimum share of eligible
 * pages routed to vision for the 'vision' recommendation (>= comparison).
 */
export const DETECTION_THRESHOLDS = Object.freeze({ imageCoverage: 0.5, visionShare: 0.5 });

/**
 * Pages routed to vision because they have no text layer, and their share of the
 * eligible (non-blank, non-cover) pages — the same denominator route() uses.
 * With no eligible pages the share is 0, never NaN.
 */
export function scannedSummary(rows) {
  const eligible = rows.filter(r => r.route !== 'blank' && r.route !== 'cover');
  const pages = rows.filter(r => (r.issues || []).includes('no-text-layer')).length;
  return { pages, share: eligible.length ? pages / eligible.length : 0 };
}
const clamp = x => Math.max(0, Math.min(1, x));

/** Character trigram model (add-k smoothing) over a reduced alphabet. */
export class TrigramModel {
  constructor(k = 0.1) { this.k = k; this.tri = new Map(); this.bi = new Map(); this.vocab = new Set(); }
  static prep(s) { return ' ' + matchForm(String(s).replace(RE_MARKS_G, '')).replace(/[^ء-ي\s]/g, '·').replace(/\s+/g, ' ').trim() + ' '; }
  train(text) {
    const s = TrigramModel.prep(text);
    for (let i = 2; i < s.length; i++) {
      const h = s.slice(i - 2, i), t = h + s[i];
      this.tri.set(t, (this.tri.get(t) || 0) + 1);
      this.bi.set(h, (this.bi.get(h) || 0) + 1);
      this.vocab.add(s[i]);
    }
  }
  /** Mean natural-log probability per character. */
  score(text) {
    const s = TrigramModel.prep(text);
    const V = Math.max(this.vocab.size, 30);
    let lp = 0, n = 0;
    for (let i = 2; i < s.length; i++) {
      const h = s.slice(i - 2, i);
      lp += Math.log(((this.tri.get(h + s[i]) || 0) + this.k) / ((this.bi.get(h) || 0) + this.k * V));
      n++;
    }
    return n ? lp / n : -Infinity;
  }
}

function baseScore(m) {
  const fw = clamp(m.fwPer1000 / 110);
  const iso = clamp(1 - (m.isolatedRatio - 0.03) / 0.12);
  const pres = clamp(1 - m.presRatio / 0.1);
  return 0.45 * fw + 0.3 * iso + 0.25 * pres;
}

const latinHeavy = s => { const l = (s.match(/[A-Za-z]/g) || []).length, a = (s.match(/[ء-ي]/g) || []).length; return l > a; };

/**
 * Score pages.
 * @param {Array<{page:number, text:string, noText?:boolean, image?:number, columnsUnresolved?:boolean}>} pages
 * @returns {{ pages: Array, score: number, issues: Array, lm: object }}
 */
export function scorePages(pages, opts = {}) {
  const T = Object.assign({}, THRESHOLDS, opts.thresholds);
  const rows = pages.map(p => {
    const m = textMetrics(p.text);
    const row = { page: p.page, tokens: m.arTokens, metrics: m, issues: [], scored: false, score: null, route: 'ok' };
    // A glyph that could not be read (no usable mapping, not solved) means text is missing.
    if (p.unresolvedGlyphs >= 1) { row.issues.push('unresolved-glyphs'); row.route = 'vision'; }
    if (p.noText) {
      // An image-only first or last page is a cover, not a page that needs vision.
      row.route = (p.image || 0) >= DETECTION_THRESHOLDS.imageCoverage ? (p.edge && opts.rules?.['cover-pages'] !== false ? 'cover' : 'vision') : 'blank';
      if (row.route === 'vision') row.issues.push('no-text-layer');
      return row;
    }
    if (p.columnsUnresolved) row.issues.push('columns-unresolved');
    if (latinHeavy(p.text) && p.text.trim().length > 200) row.latin = true;
    if (m.arTokens < T.minTokens || row.latin) { if (row.route !== 'vision') row.route = 'ok'; return row; }
    row.scored = true;
    row.base = baseScore(m);
    return row;
  });
  // Self-calibration: train on the best 30% of scored pages (at least 5 when available).
  const scored = rows.filter(r => r.scored);
  const train = scored.slice().sort((a, b) => b.base - a.base).slice(0, Math.max(5, Math.ceil(scored.length * 0.3)));
  const lm = new TrigramModel();
  const trainSet = new Set(train.map(r => r.page));
  for (const p of pages) if (trainSet.has(p.page)) lm.train(p.text);
  const trainLp = train.map(r => lm.score(pages.find(p => p.page === r.page).text)).sort((a, b) => a - b);
  const ref = trainLp.length ? trainLp[Math.floor(trainLp.length / 2)] : 0;
  for (const r of scored) {
    const text = pages.find(p => p.page === r.page).text;
    r.lp = lm.score(text);
    const lmS = clamp(1 + (r.lp - ref) / 0.8);
    r.score = 0.75 * r.base + 0.25 * lmS;
    // Reversal test: a clearly better reversed reading means the text is reversed.
    const rev = text.split('\n').map(reverseChars).join('\n');
    const mr = textMetrics(rev);
    const lpr = lm.score(rev);
    if (mr.fwPer1000 > 1.5 * r.metrics.fwPer1000 + 10 && lpr > r.lp + 0.3) r.issues.push('reversed');
    if (r.metrics.presRatio > 0.05) r.issues.push('broken-forms');
    if (r.metrics.isolatedRatio > 0.08) r.issues.push('isolated-letters');
    if (r.score < T.page) { r.issues.push('low-score'); r.route = 'vision'; }
  }
  let wsum = 0, tsum = 0;
  for (const r of scored) { wsum += r.score * r.tokens; tsum += r.tokens; }
  const score = tsum ? wsum / tsum : 0;
  return { pages: rows, score, lm: { trainPages: train.length, refLogProb: ref } };
}

/** Aggregate page issues into document issues; severity 'major' when >= 2% of non-blank pages. */
export function docIssues(rows, extra = []) {
  const nonBlank = rows.filter(r => r.route !== 'blank' && r.route !== 'cover').length || 1;
  const m = new Map();
  for (const r of rows) for (const i of r.issues) { if (!m.has(i)) m.set(i, []); m.get(i).push(r.page); }
  const out = [...m].map(([code, pages]) => ({ code, pages: pages.length, pageList: pages.slice(0, 50), severity: pages.length / nonBlank >= 0.02 ? 'major' : 'minor' }));
  const scored = rows.filter(r => r.scored);
  // A text layer that is mostly non-Arabic cannot be judged by these (Arabic) signals.
  if (!scored.length && rows.some(r => r.latin)) out.push({ code: 'not-arabic', pages: rows.filter(r => r.latin).length, severity: 'major' });
  const low = scored.filter(r => r.score < 0.6).length;
  if (scored.length && low / scored.length >= 0.05 && low / scored.length <= 0.6) out.push({ code: 'mixed-quality', pages: low, severity: 'major' });
  return out.concat(extra);
}

/**
 * Structural issues, measured without reading text. All are 'major' (unresolved):
 *  notes-unlinked      footnotes were found but fewer than 80% were linked to a body marker
 *  markers-unlinked    more than 20% of raised-digit markers found no note (at least 3)
 *  paragraphs-suspect  fewer than 80% of paragraphs end with terminal punctuation (at least 50)
 *  toc-partial         a TOC page was found but under 60% of its lines became chapters
 *  front-matter-large  more than max(12 pages, 10%) precede the first chapter (content may be dropped)
 */
export function structuralIssues(d) {
  const out = [];
  if (d.notesFound >= 3 && d.notesLinked / d.notesFound < 0.8) out.push({ code: 'notes-unlinked', pages: d.notesFound - d.notesLinked, severity: 'major' });
  if (d.unlinkedMarkers >= 3 && d.unlinkedMarkers / Math.max(1, d.markersTotal) > 0.2) out.push({ code: 'markers-unlinked', pages: d.unlinkedMarkers, severity: 'major' });
  if (d.paragraphs >= 50 && d.paraTerminalShare < 0.8) out.push({ code: 'paragraphs-suspect', pages: 0, severity: 'major' });
  if (d.method === 'toc' && d.tocLines >= 3 && d.chapters / d.tocLines < 0.6) out.push({ code: 'toc-partial', pages: d.tocLines - d.chapters, severity: 'major' });
  if (d.pages && d.frontMatterPages > Math.max(12, 0.1 * d.pages)) out.push({ code: 'front-matter-large', pages: d.frontMatterPages, severity: 'major' });
  return out;
}

/**
 * Text-layer issues (major), measured on the whole document:
 *  reversed-ligatures      the top function words appear with a reversed ligature pair (في as يف,
 *                          على as عىل) in more than 10% of their occurrences (at least 20)
 *  low-dictionary-coverage under THRESHOLDS.dictCoverage of the Arabic tokens are known words
 *                          (only with a word list)
 * @param {{fw: {correct, swapped, share}, dictCoverage: number|null}} d
 */
export function textLayerIssues(d, thresholds = {}) {
  const T = Object.assign({}, THRESHOLDS, thresholds);
  const out = [];
  if (d.fw && d.fw.swapped >= T.fwSwappedMin && d.fw.share < T.fwCorrect) out.push({ code: 'reversed-ligatures', pages: d.fw.swapped, severity: 'major' });
  if (d.dictCoverage !== null && d.dictCoverage !== undefined && d.dictCoverage < T.dictCoverage) out.push({ code: 'low-dictionary-coverage', pages: 0, severity: 'major' });
  return out;
}

/**
 * Page coverage invariant: every page must end up somewhere. Each page is assigned to
 * 'chapter' (content placed in a chapter, or endnotes that were linked), 'front' (table of
 * contents, title and other short pages before the first chapter), 'cover', 'blank' (nothing
 * but page numbers or headers), or 'dropped' with a reason:
 *   pre-chapter-text   a page before the first chapter with body-length text was not kept
 *   no-chapter-for-notes  a notes-section page in a book where no chapter was built
 *   no-text-layer      an image page with no text and no extracted figure
 *   unplaced           a page with kept text of which nothing reached the book
 * Adds the major issue 'coverage-low' when dropped pages exceed 5% of the document.
 * @param {Array<{kind:string, reason?:string, page:number}>} assigned  one entry per page
 */
export function coverage(assigned) {
  const n = assigned.length || 1;
  const count = k => assigned.filter(a => a.kind === k).length;
  const dropped = assigned.filter(a => a.kind === 'dropped');
  const reasons = {};
  for (const d of dropped) reasons[d.reason] = (reasons[d.reason] || 0) + 1;
  const out = {
    pages: assigned.length, chapter: count('chapter'), front: count('front'), cover: count('cover'), blank: count('blank'),
    dropped: dropped.length, droppedShare: Math.round(dropped.length / n * 1000) / 1000, droppedReasons: reasons,
    droppedPages: dropped.slice(0, 50).map(d => d.page),
    assignedShare: Math.round((assigned.length - dropped.length) / n * 1000) / 1000
  };
  const issue = dropped.length / n > 0.05 ? { code: 'coverage-low', pages: dropped.length, severity: 'major' } : null;
  return { coverage: out, issue };
}

/**
 * Routing decision.
 * @returns {{ recommendation: 'ok'|'review'|'vision', confidence: number, visionPages: number[] }}
 */
export function route(rows, score, issues, chaptersFound, opts = {}) {
  const T = Object.assign({}, THRESHOLDS, opts.thresholds);
  const nonBlank = rows.filter(r => r.route !== 'blank' && r.route !== 'cover');
  const visionPages = rows.filter(r => r.route === 'vision').map(r => r.page);
  const scored = rows.filter(r => r.scored).length;
  const vShare = nonBlank.length ? visionPages.length / nonBlank.length : 1;
  const coverage = nonBlank.length ? scored / nonBlank.length : 0;
  const major = issues.filter(i => i.severity === 'major');
  if (!scored && rows.some(r => r.latin) && vShare < DETECTION_THRESHOLDS.visionShare) return { recommendation: 'review', confidence: 0.3, visionPages };
  if (!scored || vShare >= DETECTION_THRESHOLDS.visionShare || score < T.page) {
    return { recommendation: 'vision', confidence: clamp(0.5 + Math.max(vShare - 0.5, T.page - score)), visionPages };
  }
  if (score < T.doc || major.length || chaptersFound < 2 || visionPages.length) {
    const margin = Math.min(Math.abs(score - T.doc), 0.2) / 0.2;
    return { recommendation: 'review', confidence: clamp(0.5 + 0.4 * margin * (major.length ? 1 : 0.6)), visionPages };
  }
  return { recommendation: 'ok', confidence: clamp((0.5 + (score - T.doc) * 2.5) * (0.5 + 0.5 * coverage)), visionPages };
}

/** Success definition used by the bench: score above threshold, chapters detected, no major issue. */
export const isSuccess = r => r.score >= THRESHOLDS.doc && r.chapters.count >= 2 && !r.issues.some(i => i.severity === 'major');
