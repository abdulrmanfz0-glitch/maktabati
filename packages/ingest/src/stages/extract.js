// Stage 1: extract. Reads one pdf.js page into plain data. It uses only the pdf.js page
// API passed in (no DOM, no fs), so it runs the same in a worker and in Node.
//
// PageRaw {
//   index, width, height,
//   items:  [{ s, x, y, w, size, font, fid, bold, italic, dir }]   x = left edge, y = baseline (PDF units, y up)
//           fid = pdf.js font id (matches the glyph census)
//   images: [{ x, y, w, h, pw, ph, key, png? }]                placement box in PDF units; pixels as PNG
// }
import { encodePng, imageToChannels } from '../png.js';
import { censusPage } from '../glyphs.js';

const IDENT = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];

function objGet(objs, id) {
  return new Promise(resolve => {
    try { objs.get(id, resolve); } catch (e) { resolve(null); }
  });
}

/**
 * @param {object} page   pdf.js PDFPageProxy
 * @param {object} OPS    pdf.js OPS table
 * @param {object} [opt]  { images: boolean, maxImagePixels: number, census: Map }
 *
 * Text is read with pdf.js normalization off: pdf.js otherwise expands ligature glyphs
 * (U+FC00-FD3D, for example U+FC32 "fi" = FEH+YEH) into separate letters *before* it reverses
 * right-to-left chunks, which puts the letters of every such ligature in reverse order.
 * The normalize stage maps presentation forms after reordering instead.
 */
export async function extractPage(page, OPS, opt = {}) {
  const [x0, y0, x1, y1] = page.view;
  const width = x1 - x0, height = y1 - y0;
  const tc = await page.getTextContent({ disableNormalization: true });
  const ops = await page.getOperatorList();
  if (opt.census && OPS.showText !== undefined) censusPage(page, ops, OPS, opt.census);

  const fontInfo = new Map();
  const infoOf = id => {
    if (fontInfo.has(id)) return fontInfo.get(id);
    let name = id, bold = false, italic = false;
    try {
      const f = page.commonObjs.get(id);
      name = String(f.name || id);
      bold = !!(f.bold || f.black) || /bold|black|heavy|demi/i.test(name);
      italic = !!f.italic || /italic|oblique/i.test(name);
    } catch (e) { /* font not resolved: keep the internal id */ }
    const info = { font: name.replace(/^[A-Z]{6}\+/, ''), bold, italic };
    fontInfo.set(id, info);
    return info;
  };

  const items = [];
  for (const it of tc.items) {
    if (!('str' in it) || !it.str || !it.str.trim()) continue;
    const t = it.transform;
    const f = infoOf(it.fontName);
    items.push({ s: it.str, x: t[4] - x0, y: t[5] - y0, w: it.width, size: Math.hypot(t[2], t[3]) || Math.abs(t[3]) || 1, font: f.font, fid: it.fontName, bold: f.bold, italic: f.italic, dir: it.dir });
  }

  const lig = OPS.showText !== undefined ? ligatureStream(ops, OPS) : null;

  const images = [];
  let ctm = IDENT.slice();
  const stack = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || IDENT.slice();
    else if (fn === OPS.transform) ctm = mul(args, ctm);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
      // The image is drawn into the unit square mapped by the CTM.
      const xs = [ctm[4], ctm[4] + ctm[0], ctm[4] + ctm[2], ctm[4] + ctm[0] + ctm[2]];
      const ys = [ctm[5], ctm[5] + ctm[1], ctm[5] + ctm[3], ctm[5] + ctm[1] + ctm[3]];
      const bx = Math.min(...xs) - x0, by = Math.min(...ys) - y0, bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
      const id = fn === OPS.paintInlineImageXObject ? null : args[0];
      images.push({ x: bx, y: by, w: bw, h: bh, id, mask: fn === OPS.paintImageMaskXObject, key: Math.round(bw) + 'x' + Math.round(bh) + '@' + Math.round(bx) + ',' + Math.round(by) });
    }
  }

  if (opt.images !== false) {
    const minArea = (opt.minImageArea ?? 0.015) * width * height;
    for (const im of images) {
      if (im.mask || !im.id || im.w * im.h < minArea || im.w < 40 || im.h < 30) continue;
      const obj = await objGet(im.id.startsWith('g_') ? page.commonObjs : page.objs, im.id);
      if (!obj || !obj.data || !obj.width || obj.width * obj.height > (opt.maxImagePixels ?? 16e6)) continue;
      const ch = imageToChannels(obj);
      if (!ch) continue;
      im.pw = obj.width; im.ph = obj.height;
      im.png = await encodePng(obj.width, obj.height, ch.data, ch.channels);
    }
  }
  for (const im of images) delete im.id;

  return { index: page.pageNumber, width, height, items, images, lig };
}

/** Share of the page covered by the largest image (used to spot scanned pages). */
export const imageCoverage = p => p.images.reduce((m, im) => Math.max(m, (im.w * im.h) / (p.width * p.height)), 0);

/** Union (capped sum) of all image areas: catches scans split into strips or tiles. */
export const imageUnionCoverage = p => {
  const pageArea = p.width * p.height;
  if (!pageArea || !p.images.length) return 0;
  const rects = p.images.map(im => ({ x0: im.x, y0: im.y, x1: im.x + im.w, y1: im.y + im.h }));
  // Sweep line over x boundaries; within each slab merge overlapping y-intervals,
  // so fully overlapping images count once (no dependency, n is small).
  const xs = [...new Set(rects.flatMap(r => [r.x0, r.x1]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1];
    if (x1 - x0 <= 0) continue;
    const ys = rects.filter(r => r.x0 <= x0 + 1e-9 && r.x1 >= x1 - 1e-9).map(r => [r.y0, r.y1]).sort((a, b) => a[0] - b[0]);
    let covered = 0, c0 = 0, c1 = 0;
    for (const [y0, y1] of ys) {
      if (y0 > c1) { covered += c1 - c0; c0 = y0; c1 = y1; }
      else if (y1 > c1) c1 = y1;
    }
    covered += c1 - c0;
    area += (x1 - x0) * covered;
  }
  return Math.min(1, area / pageArea);
};

// One Arabic word: letters, tatweel and marks.
export const RE_AR_WORD = /[\u0621-\u063A\u0640-\u065F\u066E-\u06D3\u06D5\u0670]+/g;
const RE_AR_LETTER = /[\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06D5]/g;

const RE_AR_CHAR = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

/**
 * Ligature glyphs, read from the glyph stream itself. A glyph whose ToUnicode entry holds two or
 * more Arabic characters ('في' 'لى' 'لا') is drawn in visual order like every other glyph; pdf.js
 * reverses right-to-left text character by character, so that glyph's characters come out
 * reversed ('يف' 'ىل'). The stream keeps the truth: here the page's Arabic characters are listed
 * in stream order, each with the id of the multi-character glyph it came from (-1 for a glyph of
 * one character). The glyphs stage finds each item in this stream and turns those runs back.
 * No word list is involved. Returns null when the page has no such glyph.
 */
export function ligatureStream(ops, OPS) {
  let chars = '';
  const unit = [];
  let id = 0, any = false;
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    if (fn !== OPS.showText && fn !== OPS.showSpacedText) continue;
    const gl = ops.argsArray[i][0];
    if (!Array.isArray(gl)) continue;
    for (const g of gl) {
      if (!g || typeof g !== 'object') continue;
      const ar = [...(g.unicode || '')].filter(c => RE_AR_CHAR.test(c));
      if (!ar.length) continue;
      const multi = ar.length >= 2;
      if (multi) any = true;
      const gid = multi ? id++ : -1;
      for (const c of ar) { chars += c; unit.push(gid); }
    }
  }
  return any ? { s: chars, u: Int32Array.from(unit) } : null;
}

/**
 * Turn reversed multi-character glyphs in one right-to-left item back, using the page stream.
 * `cursor` = { at } is where the previous item matched, so repeated lines resolve in order.
 * Returns the fixed string, or null when the item could not be located in the stream.
 */
export function fixItemLigatures(str, stream, cursor) {
  const cs = [...str];
  const pos = []; // indexes in cs of the Arabic characters, in visual (stream) order
  for (let k = cs.length - 1; k >= 0; k--) if (RE_AR_CHAR.test(cs[k])) pos.push(k);
  if (pos.length < 2) return str;
  const target = pos.map(k => cs[k]).join('');
  let at = stream.s.indexOf(target, cursor.at);
  if (at < 0) at = stream.s.indexOf(target);
  if (at < 0) return null;
  cursor.at = at + target.length;
  // Group the item's characters by stream glyph; reverse each multi-character glyph's run.
  let changed = false;
  for (let j = 0; j < pos.length;) {
    const gid = stream.u[at + j];
    let e = j + 1;
    while (gid >= 0 && e < pos.length && stream.u[at + e] === gid) e++;
    if (gid >= 0 && e - j >= 2) {
      // pos[j..e-1] are descending indexes in cs: the run sits at cs[pos[e-1]..pos[j]].
      const lo = pos[e - 1], hi = pos[j];
      if (hi - lo === e - j - 1) {
        const run = cs.slice(lo, hi + 1).reverse();
        for (let k = 0; k < run.length; k++) cs[lo + k] = run[k];
        changed = true;
      }
    }
    j = e;
  }
  return changed ? cs.join('') : str;
}
