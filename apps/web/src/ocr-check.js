// Dev-only OCR check page (unlinked from the app). Draws known Arabic text on a
// canvas with the bundled Amiri font, runs the local engine, prints text + ms + CER.
import './ui/styles/fonts.css';
import { ocrPage } from './core/ocr-local.js';

const FONT = '40px Amiri';
const fold = s => String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[\s\d.,:;!?؟«»"'()\-–—\[\]{}*#_/\\|]/g, '');
function lev(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) { cur[0] = i; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); [prev, cur] = [cur, prev]; }
  return prev[n];
}
export const cerOf = (ocr, ref) => { const b = fold(ref); return b ? lev(fold(ocr), b) / b.length : 1; };

async function draw(text, { width = 1240, height = 1754, font = FONT } = {}) {
  await document.fonts.load(font, text);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000'; ctx.font = font; ctx.direction = 'rtl'; ctx.textAlign = 'right';
  const lines = []; let line = '';
  for (const w of text.split(/\s+/)) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > width - 160) { lines.push(line); line = w; } else line = t;
  }
  lines.push(line);
  let y = 220;
  for (const l of lines) { ctx.fillText(l, width - 80, y); y += 120; }
  return canvas;
}

async function run(textOverride) {
  const out = document.getElementById('out');
  const text = String(textOverride == null ? document.getElementById('txt').value : textOverride).trim();
  if (!text) { out.textContent = 'نص فارغ.'; return null; }
  out.textContent = 'يحمّل العامل ويرسم ويقرأ…';
  const canvas = await draw(text);
  const r = await ocrPage(canvas, { onProgress: m => { if (m && m.status === 'recognizing text') out.textContent = 'يتعرّف… ' + Math.round((m.progress || 0) * 100) + '%'; } });
  const cer = cerOf(r.text, text);
  out.textContent = 'الزمن: ' + r.ms + ' ms\nالثقة: ' + r.confidence + '\nأبعاد الصورة: ' + canvas.width + '×' + canvas.height + '\nCER (مطوي): ' + (cer * 100).toFixed(1) + '%\n\nالنص المقروء:\n' + r.text;
  return Object.assign({}, r, { cer, px: canvas.width + 'x' + canvas.height });
}

document.getElementById('go').addEventListener('click', () => {
  run().catch(e => { document.getElementById('out').textContent = 'خطأ: ' + (e && e.code ? e.code + ': ' : '') + (e && e.message); });
});
window.__ocrCheck = { run, cerOf, makeScanPdfBase64 };

/** Build a synthetic scanned PDF in the browser: one full-page JPEG image per
 *  page (drawn from `text`), no text layer. Used by the OCR-run e2e. */
async function makeScanPdfBase64(text, pages = 5) {
  const canvas = await draw(String(text));
  const jpeg = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  const bin = atob(jpeg); // binary string
  const objs = [];
  const add = s => { objs.push(s); return objs.length; };
  const catalog = add(null), pagesId = add(null);
  const img = add('<< /Type /XObject /Subtype /Image /Width ' + canvas.width + ' /Height ' + canvas.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + bin.length + ' >>\nstream\n' + bin + '\nendstream');
  const kids = [];
  for (let i = 0; i < pages; i++) {
    const c = 'q ' + canvas.width + ' 0 0 ' + canvas.height + ' 0 0 cm /Im0 Do Q';
    const cs = add('<< /Length ' + c.length + ' >>\nstream\n' + c + '\nendstream');
    kids.push(add('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + canvas.width + ' ' + canvas.height + '] /Resources << /XObject << /Im0 ' + img + ' 0 R >> >> /Contents ' + cs + ' 0 R >>'));
  }
  objs[catalog - 1] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>';
  objs[pagesId - 1] = '<< /Type /Pages /Kids [' + kids.map(k => k + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>';
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return btoa(out);
}
