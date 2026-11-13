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

  return { index: page.pageNumber, width, height, items, images };
}

/** Share of the page covered by the largest image (used to spot scanned pages). */
export const imageCoverage = p => p.images.reduce((m, im) => Math.max(m, (im.w * im.h) / (p.width * p.height)), 0);

/** Union (capped sum) of all image areas: catches scans split into strips or tiles. */
export const imageUnionCoverage = p => Math.min(1, p.images.reduce((s, im) => s + (im.w * im.h) / (p.width * p.height), 0));
