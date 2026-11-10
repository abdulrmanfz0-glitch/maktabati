// Glyph-level view of the text layer: which Unicode each (font, charcode) produced, and what
// kind of mapping that is. Built from the pdf.js operator list (already fetched by extract).
// Pure apart from reading the pdf.js page objects handed in.
//
// pdf.js facts this relies on (pdf.js 5.x, checked in its source):
//  - a glyph without a ToUnicode entry gets unicode = String.fromCharCode(charcode)
//  - getTextContent emits each glyph's unicode, then reverses right-to-left chunks
//    character by character (it assumes visual order)

const RE_PUA = /[-]|[\u{F0000}-\u{10FFFD}]/u;
const RE_CTRL = /^[\u0000-\u001F\u007F-\u009F�□]+$/;
const RE_AR = /[ء-يٱ-ۓ]/g;

/**
 * Kind of a glyph's mapping:
 *  'missing'  no usable Unicode: empty, control/replacement characters, or the raw charcode
 *             leaking through because the font's ToUnicode has no entry for it
 *  'pua'      Private Use Area code point
 *  'multi'    two or more Arabic letters from one glyph (a ligature's ToUnicode entry)
 *  'ok'       anything else
 *  'empty'    (set by classifyCensus) no usable Unicode, but the glyph is absent from the font
 *             program, so nothing is drawn
 * @param {string} u            unicode pdf.js assigned
 * @param {number} code         original charcode
 * @param {boolean|null} inMap  whether the font's ToUnicode has an entry for code (null = unknown)
 */
export function glyphKind(u, code, inMap = null) {
  if (!u || RE_CTRL.test(u)) return 'missing';
  if (inMap === false && u === String.fromCharCode(code)) return 'missing';
  if (RE_PUA.test(u)) return 'pua';
  if ((u.match(RE_AR) || []).length >= 2) return 'multi';
  return 'ok';
}

/** Fold one page's operator list into `census`: fid -> { name, codes: Map<code, {u, n, pages}>, toUnicodeKeys, ... } */
export function censusPage(page, ops, OPS, census) {
  let cur = null;
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    if (fn === OPS.setFont) { cur = ops.argsArray[i][0]; continue; }
    if (fn !== OPS.showText && fn !== OPS.showSpacedText) continue;
    const glyphs = ops.argsArray[i][0];
    if (!Array.isArray(glyphs) || cur === null) continue;
    let F = census.get(cur);
    if (!F) {
      let f = null;
      try { f = page.commonObjs.get(cur); } catch (e) { /* not resolved */ }
      const tu = f && f.toUnicode;
      const keys = tu && tu._map ? new Set(Object.keys(tu._map).map(Number)) : null;
      F = { name: String((f && f.name) || cur), codes: new Map(), toUnicodeKeys: keys, identity: !!(tu && 'firstChar' in tu), differences: f && f.differences, defaultEncoding: f && f.defaultEncoding };
      census.set(cur, F);
    }
    for (const g of glyphs) {
      if (!g || typeof g !== 'object') continue;
      const code = g.originalCharCode;
      let e = F.codes.get(code);
      if (e) e.n++;
      else F.codes.set(code, e = { u: g.unicode || '', n: 1, pages: new Set(), inFont: g.isInFont !== false });
      if (page.pageNumber !== undefined) e.pages.add(page.pageNumber);
    }
  }
}

/** Finalize: add `kind` to every code. */
export function classifyCensus(census) {
  for (const F of census.values()) {
    for (const [code, e] of F.codes) {
      const inMap = F.identity ? true : F.toUnicodeKeys ? F.toUnicodeKeys.has(code) : null;
      e.kind = glyphKind(e.u, code, inMap);
      // A glyph the font program does not contain draws nothing: no text is lost.
      if ((e.kind === 'missing' || e.kind === 'pua') && e.inFont === false) e.kind = 'empty';
    }
  }
  return census;
}

/** Counts only (for reports and inspect). */
export function censusSummary(census) {
  const fonts = [];
  const tot = { codes: 0, occ: 0, missingCodes: 0, missingOcc: 0, puaCodes: 0, puaOcc: 0, multiCodes: 0, multiOcc: 0 };
  for (const [fid, F] of census) {
    const r = { fid, name: F.name.replace(/^[A-Z]{6}\+/, ''), codes: F.codes.size, occ: 0, missingCodes: 0, missingOcc: 0, puaCodes: 0, puaOcc: 0, multiCodes: 0, multiOcc: 0 };
    for (const e of F.codes.values()) {
      r.occ += e.n;
      if (e.kind === 'missing') { r.missingCodes++; r.missingOcc += e.n; }
      if (e.kind === 'pua') { r.puaCodes++; r.puaOcc += e.n; }
      if (e.kind === 'multi') { r.multiCodes++; r.multiOcc += e.n; }
    }
    for (const k in tot) tot[k] += r[k];
    fonts.push(r);
  }
  return { fonts, total: tot };
}

// --- glyph names -> text -------------------------------------------------------------------

// Arabic letter names used by the Adobe Glyph List, Glyphs.app ("-ar" suffix) and FontForge.
const LETTER = {
  hamza: 'ء', alefmadda: 'آ', alefmaddaabove: 'آ', alefhamzaabove: 'أ', wawhamzaabove: 'ؤ', wawhamza: 'ؤ',
  alefhamzabelow: 'إ', yehhamzaabove: 'ئ', yehhamza: 'ئ', alef: 'ا', beh: 'ب', tehmarbuta: 'ة', teh: 'ت',
  theh: 'ث', jeem: 'ج', hah: 'ح', khah: 'خ', dal: 'د', thal: 'ذ', reh: 'ر', zain: 'ز', seen: 'س',
  sheen: 'ش', sad: 'ص', dad: 'ض', tah: 'ط', zah: 'ظ', ain: 'ع', ghain: 'غ', tatweel: 'ـ', kashida: 'ـ',
  feh: 'ف', qaf: 'ق', kaf: 'ك', lam: 'ل', meem: 'م', noon: 'ن', heh: 'ه', waw: 'و', alefmaksura: 'ى',
  yeh: 'ي', alefwasla: 'ٱ', peh: 'پ', tcheh: 'چ', jeh: 'ژ', veh: 'ڤ', keheh: 'ک', gaf: 'گ', farsiyeh: 'ی',
  allah: 'الله', lamalef: 'لا'
};
// AGL afii names for the Arabic block.
const AFII = { 57388: '،', 57403: '؛', 57407: '؟', 57440: 'ـ', 57470: 'ه', 57448: 'و', 57449: 'ى', 57450: 'ي' };
for (let k = 0; k <= 25; k++) AFII[57409 + k] = String.fromCharCode(0x0621 + k);
for (let k = 0; k <= 6; k++) AFII[57440 + k] = String.fromCharCode(0x0640 + k);
for (let k = 0; k <= 9; k++) AFII[57392 + k] = String.fromCharCode(0x0660 + k);

const fromHex = h => { const c = parseInt(h, 16); return c >= 0 && c <= 0x10FFFF && !(c >= 0xD800 && c <= 0xDFFF) ? String.fromCodePoint(c) : null; };
const baseForm = s => s.replace(/[ﭐ-﷿ﹰ-ﻼ]/g, c => c.normalize('NFKC'));

/** One component (no underscore) to text, or null. */
function component(c) {
  let m;
  if ((m = /^uni((?:[0-9A-F]{4})+)$/i.exec(c))) {
    const parts = m[1].match(/.{4}/g).map(fromHex);
    return parts.every(Boolean) ? parts.join('') : null;
  }
  if ((m = /^u([0-9A-F]{4,6})$/i.exec(c))) return fromHex(m[1]);
  if ((m = /^afii(\d{5})$/i.exec(c))) return AFII[+m[1]] || null;
  const k = c.toLowerCase().replace(/-ar$/, '').replace(/[^a-z]/g, '');
  return LETTER[k] || null;
}

/**
 * Standard glyph name -> Arabic text in logical order (base letters), or null when unknown.
 * Handles uniXXXX / uniXXXXYYYY / uXXXXX / afiiNNNNN, AGL-style letter names, "-ar" suffixes,
 * ligatures joined with "_" (lam_alefmaksura, uniFEDF_uniFEE0) and variant suffixes (.init, .fina, .liga, .001).
 */
export function glyphNameToText(name) {
  if (!name || typeof name !== 'string') return null;
  const stem = name.split('.')[0];
  if (!stem || stem === 'notdef' || stem === 'space') return null;
  const parts = stem.split('_').map(component);
  if (!parts.length || parts.some(p => p === null)) return null;
  const out = baseForm(parts.join(''));
  return /[؀-ۿ]/.test(out) ? out : null;
}

/** True when some drawn glyph has no usable mapping (after classification). */
export function censusHasUnknown(census) {
  classifyCensus(census);
  for (const F of census.values()) for (const e of F.codes.values()) if (e.kind === 'missing' || e.kind === 'pua') return true;
  return false;
}
