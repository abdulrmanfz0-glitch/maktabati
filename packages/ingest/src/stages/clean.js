// Stage 5: clean. Removes running headers, footers and page numbers by repetition across
// pages. Only zone lines (first/last line of a page, set by layout) are candidates, keys are
// compared after digit normalization, and nothing that repeats on fewer than
// max(minRepeatCount, minRepeatShare * pages) pages is ever removed.
import { on } from '../rules.js';
import { matchForm } from '../text.js';
import { MARK_OPEN, MARK_CLOSE } from './normalize.js';

const RE_MARKER = new RegExp(MARK_OPEN + '\\d+' + MARK_CLOSE, 'g');

/** Comparison key: letters only, digits collapsed to '#'. */
export function lineKey(text) {
  return matchForm(String(text).replace(RE_MARKER, ''))
    .replace(/[0-9٠-٩۰-۹]+/g, '#')
    .replace(/[^\p{L}#]+/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}

const isPageNumber = text => /^[\s\-–—.|•·()[\]]*[0-9٠-٩۰-۹]{1,4}[\s\-–—.|•·()[\]]*$/.test(String(text).replace(RE_MARKER, ''));

/**
 * @param {Array} pages   [{ lines }] with zone annotations from layout
 * @param {object} stats  docStats
 * @returns {{ pageNumbers: number, headers: number, threshold: number }}
 */
export function cleanPages(pages, stats, opts = {}) {
  const P = opts.params || {};
  const minShare = P.minRepeatShare ?? 0.01, minCount = P.minRepeatCount ?? 3;
  const threshold = Math.max(minCount, Math.ceil(minShare * pages.length));
  const counts = new Map();
  for (const p of pages) {
    const seen = new Set();
    for (const l of p.lines) if (l.zone) { const k = lineKey(l.text); if (k && !seen.has(k)) { seen.add(k); counts.set(k, (counts.get(k) || 0) + 1); } }
  }
  let pageNumbers = 0, headers = 0;
  // Title echo: a running header usually repeats the current chapter/section title. Keys of
  // large (heading-size) lines seen so far; a small zone line equal to one of them and
  // repeating on at least 2 pages is a header even below the general threshold.
  const titles = new Set();
  const echo = on(opts, 'title-echo-headers');
  for (const p of pages) {
    for (const l of p.lines) {
      if (!l.zone) continue;
      if (on(opts, 'page-numbers') && isPageNumber(l.text)) { l.removed = 'page-number'; pageNumbers++; continue; }
      if (!on(opts, 'running-headers')) continue;
      const k = lineKey(l.text);
      const small = l.size <= stats.bodySize * 1.15;
      if (k && small && ((counts.get(k) || 0) >= threshold || (echo && titles.has(k) && (counts.get(k) || 0) >= 2))) { l.removed = 'header'; headers++; }
    }
    for (const l of p.lines) if (!l.removed && l.size >= stats.bodySize * 1.15) titles.add(lineKey(l.text));
  }
  const diagramLabels = on(opts, 'diagram-labels') ? removeDiagramLabels(pages, stats) : 0;
  return { pageNumbers, headers, threshold, diagramLabels };
}

/**
 * Text labels inside vector diagrams. Body lines touch the start edge of the text frame,
 * headings, verse and captions are centered; a diagram label is a short line that touches
 * neither edge (by at least 15% of the frame width) and is off-center. Only pages with at
 * least two such lines, not all sharing one start edge, are affected.
 * The diagram itself is vector art that is not extracted, so its labels alone are noise in
 * the reading flow; they are removed and counted (report.metrics.diagramLabels).
 */
export function removeDiagramLabels(pages, stats) {
  const fw = stats.frameRight - stats.frameLeft, mid = (stats.frameLeft + stats.frameRight) / 2;
  if (!(fw > 0)) return 0;
  const edge = Math.max(1.5 * stats.bodySize, 0.15 * fw);
  let n = 0;
  for (const p of pages) {
    if (p.columns === 2) continue;
    // A line just below an image may be its caption: never a label.
    const underImage = l => (p.images || []).some(im => im.y - l.y > 0 && im.y - l.y < 2.4 * stats.leading && l.x1 > im.x && l.x0 < im.x + im.w);
    const labels = p.lines.filter(l => !l.removed && !l.zone
      && l.x1 - l.x0 < 0.4 * fw && l.x0 > stats.frameLeft + edge && l.x1 < stats.frameRight - edge
      && Math.abs((l.x0 + l.x1) / 2 - mid) > 0.08 * fw && l.text.trim().split(/\s+/).length <= 8
      && !underImage(l));
    if (labels.length < 2) continue;
    // Lines that all share one start edge are an aligned text block (an inset, a colophon).
    const start = labels.map(l => (stats.rtl ? l.x1 : l.x0));
    if (Math.max(...start) - Math.min(...start) <= 2) continue;
    for (const l of labels) { l.removed = 'diagram-label'; n++; }
  }
  return n;
}

/** Residual repetition after cleaning (a metric): zone-position lines still repeating on >= 3 pages. */
export function residualRepeats(pages) {
  const counts = new Map();
  for (const p of pages) {
    const kept = p.lines.filter(l => !l.removed);
    for (const l of [kept[0], kept[kept.length - 1]]) { if (!l) continue; const k = lineKey(l.text); if (k.replace(/#/g, '').trim()) counts.set(k, (counts.get(k) || 0) + 1); }
  }
  let n = 0; for (const c of counts.values()) if (c >= 3) n += c;
  return n;
}
