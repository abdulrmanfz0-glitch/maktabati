// Stage 2: reorder. Groups a page's items into lines by baseline and puts the items of each
// line into logical reading order.
//
// Measured on the fixtures (docs/ingest-findings.md): pdf.js already runs its own bidi pass
// on each text chunk, so an item's string is in logical order, but (a) it does not mirror
// brackets and (b) when a line arrives as many small chunks their stream order runs left to
// right. We therefore order chunks with an item-level UAX #9 pass (RTL base), keeping Latin
// and number runs left to right, and mirror brackets inside chunks pdf.js reversed.
import { orderLineItems, mirrorRtlBrackets, bidiClass } from '../bidi.js';
import { on } from '../rules.js';

const ext = it => [it.y - 0.25 * it.size, it.y + 0.75 * it.size];

/** Base direction of a set of items: 1 (RTL) when right-to-left strong characters dominate. */
export function lineBase(items) {
  let r = 0, l = 0;
  for (const it of items) for (const ch of it.s) { const c = bidiClass(ch); if (c === 'AL' || c === 'R') r++; else if (c === 'L') l++; }
  return l > r ? 0 : 1;
}

/**
 * Group items into lines. Items whose vertical extents overlap by at least half of the smaller
 * one share a line; a horizontal gap wider than `splitGapEm` font sizes splits a line into
 * separate segments (column gutters, marginal numbers).
 */
export function groupLines(items, opt = {}) {
  const splitGapEm = opt.splitGapEm ?? 2.5;
  const sorted = items.map((it, i) => Object.assign({ order: i }, it)).sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const it of sorted) {
    const [lo, hi] = ext(it);
    let best = null, bestOv = 0;
    for (let k = rows.length - 1; k >= 0 && k >= rows.length - 4; k--) {
      const r = rows[k];
      const ov = Math.min(hi, r.hi) - Math.max(lo, r.lo);
      const need = 0.5 * Math.min(hi - lo, r.hi - r.lo);
      if (ov >= need && ov > bestOv) { best = r; bestOv = ov; }
    }
    if (best) { best.items.push(it); best.lo = Math.min(best.lo, lo); best.hi = Math.max(best.hi, hi); }
    else rows.push({ items: [it], lo, hi });
  }
  const lines = [];
  for (const r of rows) {
    const byX = r.items.slice().sort((a, b) => a.x - b.x);
    let seg = [byX[0]];
    const flush = () => { lines.push(seg); };
    for (let k = 1; k < byX.length; k++) {
      const prev = seg[seg.length - 1], it = byX[k];
      const gap = it.x - Math.max(...seg.map(s => s.x + s.w));
      if (gap > splitGapEm * Math.max(prev.size, it.size)) { flush(); seg = [it]; } else seg.push(it);
    }
    flush();
  }
  return lines.map(makeLine);
}

function makeLine(items) {
  // Baseline: the baseline carrying most characters (raised markers do not move it).
  const w = new Map();
  for (const it of items) { const k = Math.round(it.y * 2) / 2; w.set(k, (w.get(k) || 0) + it.s.length); }
  const y = [...w.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const x0 = Math.min(...items.map(i => i.x)), x1 = Math.max(...items.map(i => i.x + i.w));
  return { items, y, x0, x1 };
}

/**
 * Reorder one page. Returns lines with `items` in logical order and `base` direction.
 */
export function reorderPage(page, opts = {}) {
  const lines = groupLines(page.items, opts);
  for (const ln of lines) {
    ln.base = lineBase(ln.items);
    // Brackets are mirrored per whole line in normalize (fragments lack the line's context).
    if (on(opts, 'mirror-brackets') && opts.params?.mirrorLevel === 'item') for (const it of ln.items) if (/[֐-ࣿיִ-ﻼ]/.test(it.s)) it.s = mirrorRtlBrackets(it.s, it.dir === 'rtl' ? 1 : 0);
    ln.items = on(opts, 'order-items') ? orderLineItems(ln.items, ln.base) : ln.items.slice().sort((a, b) => a.order - b.order);
  }
  lines.sort((a, b) => b.y - a.y || (a.base ? b.x1 - a.x1 : a.x0 - b.x0));
  return lines;
}
