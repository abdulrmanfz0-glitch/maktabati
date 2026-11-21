// Text-line segmentation for scanned pages (pure, no DOM).
//
// Why: Tesseract's own page layout (PSM 6) silently drops whole lines on
// scanned Arabic pages: lines with heavy tashkeel get split into a diacritic
// "line" (garbage) and a base line that is lost, and some clean lines of large
// type come back empty. Cutting the page into lines ourselves and reading each
// line on its own avoids both. Measured on the scanned-book benchmark.
//
// How: Arabic script puts most of its ink on the baseline row, so in the
// horizontal ink profile every text line is one sharp peak and the tashkeel
// rows between lines are much weaker. The line pitch comes from the profile's
// autocorrelation; baselines are the profile peaks (non-maximum suppression at
// about half a pitch); each line is cut at the emptiest row between two
// baselines, then trimmed horizontally to its ink.
//
// Returns null whenever the page does not look like regular lines of text
// (too little ink, no clear pitch, a slice much taller than a line); the
// caller then falls back to whole-page recognition, i.e. the old behaviour.

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

/** Ink rows: count of pixels darker than `threshold` per row (side margins ignored). */
export function inkProfile({ w, h, g }, threshold = 160) {
  const x0 = Math.floor(w * 0.02), x1 = Math.ceil(w * 0.98);
  const ink = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0; const r = y * w;
    for (let x = x0; x < x1; x++) if (g[r + x] < threshold) n++;
    ink[y] = n;
  }
  return ink;
}

/** Line pitch in pixels from the autocorrelation of the ink profile (0 when there is none). */
export function linePitch(ink, minAc = 0.15) {
  const h = ink.length;
  let total = 0; for (let y = 0; y < h; y++) total += ink[y];
  if (!h || total <= 0) return 0;
  const mean = total / h;
  const d = new Float64Array(h); for (let y = 0; y < h; y++) d[y] = ink[y] - mean;
  let ac0 = 0; for (let y = 0; y < h; y++) ac0 += d[y] * d[y];
  if (!ac0) return 0;
  const minL = Math.max(6, Math.floor(h / 80)), maxL = Math.min(Math.floor(h / 2), 600);
  const ac = new Float64Array(maxL + 2);
  for (let L = minL; L <= maxL + 1 && L < h; L++) { let s = 0; for (let y = 0; y + L < h; y++) s += d[y] * d[y + L]; ac[L] = s / ac0; }
  const maxima = [];
  for (let L = minL + 1; L <= maxL; L++) if (ac[L] > ac[L - 1] && ac[L] >= ac[L + 1]) maxima.push(L);
  let best = -Infinity; for (const L of maxima) if (ac[L] > best) best = ac[L];
  if (!(best >= minAc)) return 0;
  // multiples of the pitch are maxima too: take the first one that is nearly as strong
  return maxima.find(L => ac[L] >= best * 0.6) || 0;
}

/**
 * @param {{w:number,h:number,g:Uint8Array|Uint8ClampedArray}} img grayscale page (0 = black)
 * @returns {null | Array<{y0:number,y1:number,x0:number,x1:number,parBreak:boolean}>}
 */
export function segmentLines(img, o = {}) {
  const { w, h, g } = img;
  if (!w || !h || !g || g.length < w * h) return null;
  const thr = o.threshold ?? 160;
  const ink = inkProfile(img, thr);
  let total = 0; for (let y = 0; y < h; y++) total += ink[y];
  if (total < w) return null; // (almost) no ink
  const P = linePitch(ink, o.minAc ?? 0.15);
  if (!P || P < 6) return null;

  // smooth over a tenth of a pitch, then take baseline peaks
  const k = Math.max(1, Math.round(P / 10));
  const sm = new Float64Array(h);
  for (let y = 0; y < h; y++) { let s = 0, n = 0; for (let j = y - k; j <= y + k; j++) if (j >= 0 && j < h) { s += ink[j]; n++; } sm[y] = s / n; }
  const top = [...sm].sort((a, b) => b - a)[Math.floor(h * 0.02)] || 1;
  const localMax = frac => { const out = []; for (let y = 1; y < h - 1; y++) if (sm[y] >= sm[y - 1] && sm[y] > sm[y + 1] && sm[y] > top * frac) out.push(y); return out.sort((a, b) => sm[b] - sm[a]); };
  const peaks = [];
  for (const p of localMax(o.peakFrac ?? 0.3)) if (peaks.every(q => Math.abs(q - p) >= P * 0.55)) peaks.push(p);
  // short lines ('رواه مسلم .') make weak peaks: add them only well away from found lines
  for (const p of localMax(o.weakFrac ?? 0.06)) if (peaks.every(q => Math.abs(q - p) >= P * 0.75)) peaks.push(p);
  peaks.sort((a, b) => a - b);
  if (peaks.length < 2) return null;

  const cuts = [Math.max(0, peaks[0] - Math.round(P * 0.85))];
  for (let i = 1; i < peaks.length; i++) { let m = peaks[i - 1] + 1; for (let y = m; y < peaks[i]; y++) if (sm[y] < sm[m]) m = y; cuts.push(m); }
  cuts.push(Math.min(h, peaks[peaks.length - 1] + Math.round(P * 0.6)));
  // a slice far taller than a line means the profile did not separate lines (skew, art): give up
  for (let i = 0; i < peaks.length; i++) if (cuts[i + 1] - cuts[i] > P * 2.6) return null;

  const X0 = Math.floor(w * 0.02), X1 = Math.ceil(w * 0.98), pad = Math.round(P * 0.3);
  const lines = [];
  for (let i = 0; i < peaks.length; i++) {
    const y0 = cuts[i], y1 = cuts[i + 1];
    let x0 = w, x1 = -1;
    for (let y = y0; y < y1; y++) { const r = y * w; for (let x = X0; x < X1; x++) if (g[r + x] < thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; } }
    if (x1 < x0) continue;
    lines.push({ y0, y1, x0: Math.max(0, x0 - pad), x1: Math.min(w, x1 + 1 + pad), base: peaks[i], ink: [x0, x1] });
  }
  if (lines.length < 2) return null;

  // paragraph breaks: a clearly larger gap, or (right-to-left) the previous line
  // ending well short of the left margin / this line indented from the right
  const left = median(lines.map(l => l.ink[0])), right = median(lines.map(l => l.ink[1]));
  return lines.map((l, i) => {
    const prev = lines[i - 1];
    const parBreak = !!prev && ((l.base - prev.base) > P * 1.45 || prev.ink[0] > left + P * 2 || l.ink[1] < right - P * 0.8);
    return { y0: l.y0, y1: l.y1, x0: l.x0, x1: l.x1, parBreak };
  });
}

/** RGBA (canvas ImageData) to gray, Rec.601 luma. */
export function rgbaToGray(data, w, h) {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
  return g;
}
