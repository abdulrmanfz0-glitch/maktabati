#!/usr/bin/env node
// Phase A reconnaissance over tests/fixtures/pdf. Prints metrics only, never book text or titles.
// Files are identified by the first 8 hex digits of their SHA-1.
// Usage: node tools/inspect-pdf.mjs [--json]
import { listFixtures, table } from './lib/fixtures.mjs';
import { openPdf, loadPdfjs, inflate } from '../packages/ingest/src/adapters/pdfjs-node.js';
import { censusPage, classifyCensus, censusSummary } from '../packages/ingest/src/glyphs.js';
import { embeddedGlyphNames } from '../packages/ingest/src/fontfile.js';
import { textMetrics, reverseChars, RE_MARK, RE_MARKS_G } from '../packages/ingest/src/text.js';

const asJson = process.argv.includes('--json');
const SAMPLE = 12;
const pct = x => (x * 100).toFixed(1) + '%';
const LIG = /[ﻵ-ﻼ]/g;
// NFKC restricted to Arabic presentation forms, lam-alef kept as a unit (placeholder U+E000).
const nfkc = t => t.replace(LIG, '').replace(/[ﭐ-﷿ﹰ-﻿]/g, c => c.normalize('NFKC')).replace(//g, 'لا');
const keyOf = t => nfkc(t).replace(RE_MARKS_G, '').replace(/[0-9٠-٩۰-۹]+/g, '#').replace(/\s+/g, ' ').trim();
const sumObj = ms => { const o = {}; for (const m of ms) for (const k in m) o[k] = (o[k] || 0) + m[k]; return o; };
const quant = (a, q) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

function mulCtm(m, n) {
  return [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
}

async function inspect(fx) {
  const t0 = Date.now();
  const out = { id: fx.id, sizeMB: (fx.size / 1048576).toFixed(1) };
  let doc;
  try { doc = await openPdf(fx.bytes()); }
  catch (e) { out.error = e && e.name === 'PasswordException' ? 'encrypted' : 'open-failed'; return out; }
  const { OPS } = await loadPdfjs();
  const meta = await doc.getMetadata().catch(() => ({ info: {} }));
  const outline = await doc.getOutline().catch(() => null);
  out.pages = doc.numPages;
  out.producer = String(meta.info.Producer || '').replace(/\(c\).*/, '').trim() || '-';
  out.encrypted = !!meta.info.EncryptFilterName;
  out.outline = outline ? outline.length : 0;

  const sample = new Set();
  for (let k = 0; k < SAMPLE; k++) sample.add(1 + Math.floor((k + 0.5) * doc.numPages / SAMPLE));

  let items = 0, glyphItems = 0, spaceItems = 0, markItems = 0, itemChars = 0, pairs = 0, pairsDec = 0;
  let noItemPages = 0, fewArabicPages = 0, images = 0, bigImagePages = 0;
  let brOpenFirst = 0, brCloseFirst = 0, smallDigitRaised = 0, bottomSmallPages = 0, bottomDigitOnly = 0;
  const dirs = {}, sizes = new Map(), fontChars = new Map(), pageSizes = new Set();
  const topKeys = new Map(), botKeys = new Map(), gaps = [];
  const raw = [], rawRev = [], nf = [], nfRev = [], joinStream = [], joinXDesc = [];
  let nulChars = 0;
  const pagesData = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const [, , W, H] = page.view;
    pageSizes.add(Math.round(W) + 'x' + Math.round(H));
    const tc = await page.getTextContent();
    const its = tc.items.filter(it => 'str' in it && it.str && it.str.trim()).map(it => ({
      s: it.str, x: it.transform[4], y: it.transform[5], w: it.width,
      size: Math.hypot(it.transform[2], it.transform[3]), dir: it.dir, font: it.fontName
    }));
    pagesData.push(its);
    if (!its.length) noItemPages++;
    const NUL = new RegExp(String.fromCharCode(0), 'g'), NL = String.fromCharCode(10);
    for (const i of its) nulChars += (i.s.match(NUL) || []).length;
    { // line-join strategies: stream order vs right-to-left by x, no separator, NUL removed
      const L = new Map();
      for (const i of its) { const k = Math.round(i.y); if (!L.has(k)) L.set(k, []); L.get(k).push(i); }
      let a = '', b = '';
      for (const l of L.values()) { a += l.map(i => i.s).join('') + NL; b += [...l].sort((u, v) => v.x - u.x).map(i => i.s).join('') + NL; }
      joinStream.push(textMetrics(nfkc(a.replace(NUL, '')))); joinXDesc.push(textMetrics(nfkc(b.replace(NUL, ''))));
    }
    let pageText = '', pageRev = '';
    let prev = null;
    for (const it of tc.items) {
      if (!('str' in it) || !it.str || !it.str.trim()) { prev = null; continue; }
      const s = it.str;
      items++; itemChars += s.length;
      dirs[it.dir] = (dirs[it.dir] || 0) + 1;
      if ([...s.trim()].length === 1) glyphItems++;
      if (/\s/.test(s.trim())) spaceItems++;
      if ([...s.trim()].every(c => RE_MARK.test(c))) markItems++;
      const size = Math.round(Math.hypot(it.transform[2], it.transform[3]) * 10) / 10;
      sizes.set(size, (sizes.get(size) || 0) + s.length);
      if (prev && Math.abs(prev.transform[5] - it.transform[5]) < 1) { pairs++; if (it.transform[4] < prev.transform[4]) pairsDec++; }
      prev = it;
      pageText += s + '\n'; pageRev += reverseChars(s) + '\n';
      const n = nfkc(s), o = n.indexOf('('), c = n.indexOf(')');
      if (o >= 0 || c >= 0) { if (c >= 0 && (o < 0 || c < o)) brCloseFirst++; else brOpenFirst++; }
    }
    const m = textMetrics(pageText);
    if (its.length && m.arLetters < 20) fewArabicPages++;
    raw.push(m); rawRev.push(textMetrics(pageRev));
    nf.push(textMetrics(nfkc(pageText))); nfRev.push(textMetrics(nfkc(pageRev)));
    if (sample.has(p)) {
      const ops = await page.getOperatorList();
      let ctm = [1, 0, 0, 1, 0, 0]; const stack = []; let maxArea = 0;
      for (let i = 0; i < ops.fnArray.length; i++) {
        const f = ops.fnArray[i], a = ops.argsArray[i];
        if (f === OPS.save) stack.push(ctm);
        else if (f === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        else if (f === OPS.transform) ctm = mulCtm(a, ctm);
        else if (f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject || f === OPS.paintImageMaskXObject) {
          images++; maxArea = Math.max(maxArea, Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]) / (W * H));
        }
      }
      if (maxArea > 0.6) bigImagePages++;
      for (const it of tc.items) {
        if (!it.str) continue;
        let name = it.fontName;
        try { name = page.commonObjs.get(it.fontName).name || name; } catch (e) { /* not loaded */ }
        name = String(name).replace(/^[A-Z]{6}\+/, '');
        fontChars.set(name, (fontChars.get(name) || 0) + it.str.length);
      }
    }
    page.cleanup();
  }

  // Document-level: body size, then per-page measurements relative to it.
  const body = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0];
  const bodySize = body ? body[0] : 0;
  for (const its of pagesData) {
    if (!its.length) continue;
    const ys = [...new Set(its.map(i => Math.round(i.y)))].sort((a, b) => b - a);
    const lineText = y => its.filter(i => Math.abs(i.y - y) < 2).sort((a, b) => b.x - a.x).map(i => i.s).join(' ');
    const top = keyOf(lineText(ys[0])), bot = keyOf(lineText(ys[ys.length - 1]));
    topKeys.set(top, (topKeys.get(top) || 0) + 1); botKeys.set(bot, (botKeys.get(bot) || 0) + 1);
    if (/^[#\s\-–—.|()]*$/.test(bot)) bottomDigitOnly++;
    for (const i of its) if (/^[\s0-9٠-٩۰-۹()]+$/.test(i.s) && i.size < bodySize * 0.85) {
      const line = its.filter(j => j !== i && Math.abs(j.y - i.y) < i.size && j.size >= bodySize * 0.95);
      if (line.length && line.some(j => i.y - j.y > 1)) smallDigitRaised++;
    }
    const lower = its.filter(i => i.size < bodySize * 0.92 && i.size > bodySize * 0.5 && i.y < ys[0] * 0.45 && /[؀-ۿ]/.test(i.s));
    if (lower.length >= 2) bottomSmallPages++;
    // intra-line gaps between consecutive items ordered by x, normalised by size
    const byLine = new Map();
    for (const i of its) { const k = Math.round(i.y); if (!byLine.has(k)) byLine.set(k, []); byLine.get(k).push(i); }
    for (const ln of byLine.values()) {
      ln.sort((a, b) => a.x - b.x);
      for (let k = 1; k < ln.length; k++) gaps.push((ln[k].x - (ln[k - 1].x + ln[k - 1].w)) / Math.max(1, ln[k].size));
    }
  }
  const repShare = map => { let r = 0, n = 0; for (const [, c] of map) { n += c; if (c >= 3) r += c; } return n ? r / n : 0; };

  const A = sumObj(raw), R = sumObj(rawRev), N = sumObj(nf), NR = sumObj(nfRev), JS = sumObj(joinStream), JX = sumObj(joinXDesc);
  const fontTotal = [...fontChars.values()].reduce((a, b) => a + b, 0) || 1;
  const sizeTotal = [...sizes.values()].reduce((a, b) => a + b, 0) || 1;
  const per1000 = M => (M.fw / Math.max(1, M.arTokens) * 1000).toFixed(0);
  Object.assign(out, {
    fonts: [...fontChars.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => n + ' ' + pct(c / fontTotal)).join(', '),
    pageSize: [...pageSizes].join(' | '),
    noItemPages, fewArabicPages, bigImagePages: bigImagePages + '/' + sample.size,
    imagesInSample: images,
    items, charsPerItem: items ? (itemChars / items).toFixed(1) : '0',
    glyphItems: items ? pct(glyphItems / items) : '-', lineItems: items ? pct(spaceItems / items) : '-',
    markItems, dirs: Object.entries(dirs).map(([k, v]) => k + ':' + pct(v / items)).join(' '),
    sameLinePairs: pairs, orderRtl: pairs ? pct(pairsDec / pairs) : '-',
    gapP10: quant(gaps, 0.1).toFixed(2), gapP50: quant(gaps, 0.5).toFixed(2), gapP90: quant(gaps, 0.9).toFixed(2), gapN: gaps.length,
    presRaw: pct(A.pres / Math.max(1, A.pres + A.arLetters)), isolatedRaw: pct(A.isolated / Math.max(1, A.arTokens)),
    fwRaw: per1000(A), fwRawRev: per1000(R),
    presNfkc: pct(N.pres / Math.max(1, N.pres + N.arLetters)), isolatedNfkc: pct(N.isolated / Math.max(1, N.arTokens)),
    fwNfkc: per1000(N), fwNfkcRev: per1000(NR), alStart: N.alPrefix, laEnd: N.laSuffix, alStartRev: NR.alPrefix, laEndRev: NR.laSuffix,
    brOpenFirst, brCloseFirst,
    nul: pct(nulChars / Math.max(1, itemChars)),
    fwJoinStream: per1000(JS), isoJoinStream: pct(JS.isolated / Math.max(1, JS.arTokens)),
    fwJoinXDesc: per1000(JX), isoJoinXDesc: pct(JX.isolated / Math.max(1, JX.arTokens)),
    bodySize, bodyShare: pct((body ? body[1] : 0) / sizeTotal), distinctSizes: sizes.size,
    topRepeat: pct(repShare(topKeys)), bottomRepeat: pct(repShare(botKeys)), bottomDigitOnly,
    bottomSmallPages, smallDigitRaised,
    ms: Date.now() - t0
  });
  await doc.destroy();
  Object.assign(out, await glyphInspect(fx, OPS));
  return out;
}

// Glyph mappings over every page (operator list), and glyph names in the embedded fonts.
async function glyphInspect(fx, OPS) {
  const doc = await openPdf(fx.bytes(), { fontExtraProperties: true });
  const census = new Map();
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    censusPage(page, await page.getOperatorList(), OPS, census);
    page.cleanup();
  }
  await doc.destroy();
  const s = censusSummary(classifyCensus(census)).total;
  const names = await embeddedGlyphNames(fx.bytes(), inflate);
  const emb = [...names.values()];
  const simpleNamed = [...census.values()].filter(F => Array.isArray(F.differences) && F.differences.some(Boolean)).length;
  const fmt = {}; for (const e of emb) fmt[e.format] = (fmt[e.format] || 0) + 1;
  return {
    fontObjs: census.size, glyphCodes: s.codes, glyphOcc: s.occ,
    missingCodes: s.missingCodes, missingOcc: s.missingOcc, puaCodes: s.puaCodes, puaOcc: s.puaOcc,
    multiArCodes: s.multiCodes, multiArOcc: s.multiOcc,
    embeddedFonts: emb.length, fontFormats: Object.entries(fmt).map(([k, v]) => k + ':' + v).join(' '),
    fontsWithNames: emb.filter(e => e.names.size).length, glyphNames: emb.reduce((n, e) => n + e.names.size, 0),
    differencesFonts: simpleNamed
  };
}

const fixtures = listFixtures();
if (!fixtures.length) { console.error('No PDFs in tests/fixtures/pdf'); process.exit(1); }
const rows = [];
for (const fx of fixtures) rows.push(await inspect(fx));
if (asJson) console.log(JSON.stringify(rows, null, 2));
else {
  const sections = [
    ['File', ['id', 'pages', 'sizeMB', 'producer', 'encrypted', 'outline', 'pageSize', 'noItemPages', 'fewArabicPages', 'bigImagePages', 'imagesInSample', 'ms']],
    ['Item granularity and order', ['id', 'items', 'charsPerItem', 'glyphItems', 'lineItems', 'markItems', 'dirs', 'sameLinePairs', 'orderRtl', 'gapP10', 'gapP50', 'gapP90']],
    ['Encoding (raw pdf.js text vs after presentation-form NFKC)', ['id', 'presRaw', 'isolatedRaw', 'fwRaw', 'fwRawRev', 'presNfkc', 'isolatedNfkc', 'fwNfkc', 'fwNfkcRev', 'alStart', 'laEnd', 'alStartRev', 'laEndRev', 'brOpenFirst', 'brCloseFirst']],
    ['Line join (NFKC, NUL removed): stream order vs right-to-left by x, no separator', ['id', 'nul', 'fwJoinStream', 'isoJoinStream', 'fwJoinXDesc', 'isoJoinXDesc']],
    ['Glyph mappings (all pages) and embedded glyph names', ['id', 'fontObjs', 'glyphCodes', 'glyphOcc', 'missingCodes', 'missingOcc', 'puaCodes', 'puaOcc', 'multiArCodes', 'multiArOcc', 'embeddedFonts', 'fontFormats', 'fontsWithNames', 'glyphNames', 'differencesFonts']],
    ['Typography and page furniture', ['id', 'bodySize', 'bodyShare', 'distinctSizes', 'topRepeat', 'bottomRepeat', 'bottomDigitOnly', 'bottomSmallPages', 'smallDigitRaised']]
  ];
  for (const [title, cols] of sections) { console.log('## ' + title); console.log(table(rows, cols)); console.log(); }
  console.log('## Fonts (sampled pages, share of characters)');
  for (const r of rows) console.log(r.id + '  ' + r.fonts);
}
