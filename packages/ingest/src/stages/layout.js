// Stage 4: layout. Works on normalized lines of all pages.
//  - document statistics: body font size, line leading, text frame (left/right edges)
//  - column detection per page and reading order across columns (right column first for RTL)
//  - zones: first/last lines that sit apart from the text block (header/footer candidates)
//  - paragraph starts by gap analysis: extra vertical gap, first-line indent, short previous line
import { on } from '../rules.js';

const quant = (a, q) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };

function mode(values, weights, step = 0.5) {
  const m = new Map();
  values.forEach((v, i) => { const k = Math.round(v / step) * step; m.set(k, (m.get(k) || 0) + (weights ? weights[i] : 1)); });
  let best = 0, bw = -1;
  for (const [k, w] of m) if (w > bw) { bw = w; best = k; }
  return best;
}

/** Document statistics from all pages' lines. */
export function docStats(pages) {
  const all = pages.flatMap(p => p.lines);
  const bodySize = all.length ? mode(all.map(l => l.size), all.map(l => l.text.length)) : 12;
  const body = all.filter(l => Math.abs(l.size - bodySize) <= 0.6);
  const gaps = [];
  for (const p of pages) {
    const b = p.lines.filter(l => Math.abs(l.size - bodySize) <= 0.6);
    for (let i = 1; i < b.length; i++) { const g = b[i - 1].y - b[i].y; if (g > 0.9 * bodySize && g < 2.5 * bodySize) gaps.push(g); }
  }
  const leading = gaps.length ? mode(gaps, null, 0.25) : bodySize * 1.4;
  const rtl = body.filter(l => l.base === 1).length >= body.length / 2;
  const frameRight = quant(body.map(l => l.x1), 0.9);
  const frameLeft = quant(body.map(l => l.x0), 0.1);
  // Justified text: most body lines reach the line-end edge (left for RTL, right for LTR).
  // Only then is "the previous line ends short" a paragraph signal.
  // Measured on lines that start at the text edge, so centered verse, quotations and
  // indented first lines do not dilute it.
  const starts = body.filter(l => (l.base === 1 ? l.x1 >= frameRight - bodySize : l.x0 <= frameLeft + bodySize));
  const reach = starts.filter(l => (l.base === 1 ? l.x0 <= frameLeft + bodySize : l.x1 >= frameRight - bodySize)).length;
  const justified = starts.length ? reach / starts.length >= 0.6 : true;
  return { bodySize, leading, frameRight, frameLeft, rtl, justified };
}

/**
 * Detect columns on one page. Returns { columns: 1|2, unresolved: boolean, mid }.
 */
export function detectColumns(lines, width, stats) {
  const mid = (stats.frameLeft + stats.frameRight) / 2 || width / 2;
  const margin = 0.03 * width;
  const body = lines.filter(l => Math.abs(l.size - stats.bodySize) <= 1.0);
  if (body.length < 8) return { columns: 1, unresolved: false, mid };
  let right = 0, left = 0, cross = 0;
  for (const l of body) {
    if (l.x0 > mid - margin) right++;
    else if (l.x1 < mid + margin) left++;
    else cross++;
  }
  const n = body.length;
  if (right >= 4 && left >= 4 && cross / n <= 0.2) return { columns: 2, unresolved: false, mid };
  if (right >= 4 && left >= 4 && cross / n < 0.5) return { columns: 1, unresolved: true, mid };
  return { columns: 1, unresolved: false, mid };
}

/** Reading order for a two-column page: bands split at spanning lines; right column first (RTL). */
function orderColumns(lines, mid, rtl) {
  const out = [];
  let band = [];
  const flush = () => {
    const r = band.filter(l => l.x0 >= mid - 1), lft = band.filter(l => l.x0 < mid - 1);
    const first = rtl ? r : lft, second = rtl ? lft : r;
    first.forEach(l => { l.col = 0; }); second.forEach(l => { l.col = 1; });
    out.push(...first, ...second); band = [];
  };
  for (const l of lines) {
    const spans = l.x0 < mid - 5 && l.x1 > mid + 5;
    if (spans) { flush(); l.col = -1; out.push(l); } else band.push(l);
  }
  flush();
  return out;
}

/**
 * Annotate one page's lines in place: col, zone ('top'|'bottom'|null), parStart, endsShort.
 */
export function layoutPage(page, stats, opts = {}) {
  const lines = page.lines;
  const res = { columns: 1, unresolved: false };
  if (!lines.length) return res;
  if (on(opts, 'columns')) {
    const c = detectColumns(lines, page.width, stats);
    res.columns = c.columns; res.unresolved = c.unresolved;
    if (c.columns === 2) page.lines = orderColumns(lines, c.mid, stats.rtl);
  }
  const L = page.lines;
  const lead = stats.leading;
  // Zones: the first/last line when it sits apart from the text block or in the outer band.
  const topBand = page.height * 0.9, botBand = page.height * 0.1;
  for (const l of L) l.zone = null;
  const byY = L.slice().sort((a, b) => b.y - a.y);
  if (byY.length) {
    const t = byY[0], t2 = byY[1];
    if (t.y > topBand || (t2 && t.y - t2.y > 1.6 * lead)) t.zone = 'top';
    const b = byY[byY.length - 1], b2 = byY[byY.length - 2];
    if (b !== t && (b.y < botBand || (b2 && b2.y - b.y > 1.6 * lead))) b.zone = 'bottom';
  }
  // Paragraph starts.
  const frameR = res.columns === 2 ? null : stats.frameRight, frameL = res.columns === 2 ? null : stats.frameLeft;
  let prev = null;
  const flow = L.filter(x => !x.zone);
  for (const l of L) {
    if (l.zone) { l.parStart = true; l.endsShort = true; continue; }
    const right = frameR ?? Math.max(...L.filter(x => x.col === l.col).map(x => x.x1));
    const left = frameL ?? Math.min(...L.filter(x => x.col === l.col).map(x => x.x0));
    const s = l.size;
    const rtl = l.base === 1;
    let indented = rtl ? l.x1 < right - 0.9 * s : l.x0 > left + 0.9 * s;
    if (indented && on(opts, 'relative-indent')) {
      // A first-line indent is relative to the neighbouring lines: inside a uniformly indented
      // block (quotation, list) only the first line is a start.
      const k = flow.indexOf(l), p = flow[k - 1], n = flow[k + 1];
      const same = x => x && x.col === l.col && Math.abs(x.size - l.size) <= 0.6;
      const ref = rtl ? Math.max(same(p) ? p.x1 : -Infinity, same(n) ? n.x1 : -Infinity) : Math.min(same(p) ? p.x0 : Infinity, same(n) ? n.x0 : Infinity);
      if (isFinite(ref)) indented = rtl ? l.x1 < ref - 0.9 * s : l.x0 > ref + 0.9 * s;
    }
    l.endsShort = stats.justified !== false && (rtl ? l.x0 > left + 2.5 * s : l.x1 < right - 2.5 * s);
    l.indented = indented;
    if (!on(opts, 'paragraphs')) { l.parStart = true; prev = l; continue; }
    let start = indented, why = indented ? 'indent' : '';
    if (prev && prev.col === l.col) {
      if (prev.y - l.y > 1.45 * lead) { start = true; why = why || 'gap'; }
      if (prev.endsShort) { start = true; why = why || 'prevShort'; }
      if (Math.abs(prev.size - l.size) > 0.6) { start = true; why = why || 'size'; }
    }
    l.startWhy = why;
    l.parStart = start;
    prev = l;
  }
  // Verse: runs of 2+ consecutive centered lines (both margins clearly indented, roughly equal).
  if (on(opts, 'verse')) {
    const body = L.filter(l => !l.zone);
    const centered = l => {
      const right = frameR ?? Math.max(...L.filter(x => x.col === l.col).map(x => x.x1));
      const left = frameL ?? Math.min(...L.filter(x => x.col === l.col).map(x => x.x0));
      const gl = l.x0 - left, gr = right - l.x1;
      return gl > 1.2 * l.size && gr > 1.2 * l.size && Math.abs(gl - gr) < Math.max(2 * l.size, 0.3 * (gl + gr)) && Math.abs(l.size - stats.bodySize) <= 0.6;
    };
    for (let i = 0; i < body.length;) {
      let j = i;
      while (j < body.length && centered(body[j]) && (j === i || body[j - 1].y - body[j].y <= 1.8 * lead)) j++;
      if (j - i >= 2) for (let k = i; k < j; k++) { body[k].verse = true; body[k].parStart = k === i; }
      i = Math.max(j, i + 1);
    }
  }
  return res;
}
