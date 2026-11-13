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
window.__ocrCheck = { run, cerOf };
