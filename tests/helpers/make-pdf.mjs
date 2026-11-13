// Tiny PDF writer for robustness tests. Standard 14 fonts only (Latin text), so no book text
// and no embedded fonts are involved. Supports: TOC page, chapter headings, running header,
// page numbers, paragraphs with first-line indent, raised-digit note markers with footnotes,
// and the standard security handler (RC4 40-bit, revision 2) for a password-protected file.
import crypto from 'node:crypto';

const esc = s => String(s).replace(/[\\()]/g, c => '\\' + c);
const WORDS = 'alpha beta gamma delta epsilon zeta theta iota kappa lambda sigma omega river stone light window garden letter morning quiet paper story road city north'.split(' ');

function words(seed, n) {
  let s = seed >>> 0; const out = [];
  for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; out.push(WORDS[s % WORDS.length]); }
  return out;
}

/**
 * Build the page contents of a synthetic book.
 * @returns {string[]} content streams, one per page
 */
export function bookPages({ pages = 10, chapters = 3, toc = true, notes = true } = {}) {
  const out = [];
  const first = toc ? 3 : 2;
  const chStart = new Set(Array.from({ length: chapters }, (_, i) => first + Math.floor(i * (pages - first + 1) / chapters)));
  const titles = Array.from({ length: chapters }, (_, i) => 'Chapter ' + (i + 1) + ' ' + words(i + 99, 2).join(' '));
  let ch = 0;
  for (let p = 1; p <= pages; p++) {
    const c = [];
    const txt = (font, size, x, y, s) => c.push('BT /' + font + ' ' + size + ' Tf ' + x + ' ' + y + ' Td (' + esc(s) + ') Tj ET');
    if (p === 1) { txt('F2', 24, 80, 400, 'A Synthetic Book'); out.push(c.join('\n')); continue; }
    if (toc && p === 2) {
      txt('F2', 16, 50, 520, 'Contents');
      titles.forEach((t, i) => txt('F1', 11, 50, 480 - i * 18, t));
      out.push(c.join('\n')); continue;
    }
    txt('F1', 9, 180, 570, 'A Synthetic Book');
    let y = 530;
    if (chStart.has(p)) { txt('F2', 20, 50, 500, titles[ch++]); y = 460; }
    let n = 0;
    for (let para = 0; para < 4 && y > 140; para++) {
      for (let ln = 0; ln < 5 && y > 140; ln++) {
        const last = ln === 4;
        const w = words(p * 131 + para * 17 + ln, last ? 4 : 9).join(' ') + (last ? '.' : '');
        const x = ln === 0 ? 65 : 50;
        if (notes && para === 1 && ln === 1 && n === 0) {
          c.push('BT /F1 11 Tf ' + x + ' ' + y + ' Td (' + esc(w) + ') Tj /F1 7 Tf 4 Ts (1) Tj 0 Ts ET'); n++;
        } else txt('F1', 11, x, y, w);
        y -= 15;
      }
      y -= 4;
    }
    if (notes && n) txt('F1', 8, 50, 70, '1 A short note about ' + words(p, 3).join(' ') + '.');
    txt('F1', 9, 220, 30, String(p));
    out.push(c.join('\n'));
  }
  return out;
}

const PAD = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');
function rc4(key, data) {
  const S = Array.from({ length: 256 }, (_, i) => i); let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + S[i] + key[i % key.length]) & 255; [S[i], S[j]] = [S[j], S[i]]; }
  const out = Buffer.alloc(data.length); let i = 0; j = 0;
  for (let k = 0; k < data.length; k++) { i = (i + 1) & 255; j = (j + S[i]) & 255; [S[i], S[j]] = [S[j], S[i]]; out[k] = data[k] ^ S[(S[i] + S[j]) & 255]; }
  return out;
}
const pad = pw => Buffer.concat([Buffer.from(pw, 'latin1'), PAD]).subarray(0, 32);
const md5 = b => crypto.createHash('md5').update(b).digest();

/**
 * Serialize pages into a PDF.
 * @param {string[]} contents  content streams
 * @param {{ userPassword?: string }} [opt]
 */
export function makePdf(contents, opt = {}) {
  const objs = [];
  const add = s => { objs.push(s); return objs.length; };
  const catalog = add(null), pagesId = add(null);
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const kids = [];
  for (const c of contents) {
    const cs = add('<< /Length ' + Buffer.byteLength(c, 'latin1') + ' >>\nstream\n' + c + '\nendstream');
    kids.push(add('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 450 600] /Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R >> >> /Contents ' + cs + ' 0 R >>'));
  }
  objs[catalog - 1] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>';
  objs[pagesId - 1] = '<< /Type /Pages /Kids [' + kids.map(k => k + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>';
  const id = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
  let encryptRef = '';
  if (opt.userPassword) {
    const O = rc4(md5(pad(opt.ownerPassword || opt.userPassword)).subarray(0, 5), pad(opt.userPassword));
    const P = -44;
    const pb = Buffer.alloc(4); pb.writeInt32LE(P);
    const key = md5(Buffer.concat([pad(opt.userPassword), O, pb, id])).subarray(0, 5);
    const U = rc4(key, PAD);
    const enc = add('<< /Filter /Standard /V 1 /R 2 /O <' + O.toString('hex') + '> /U <' + U.toString('hex') + '> /P ' + P + ' >>');
    encryptRef = ' /Encrypt ' + enc + ' 0 R';
  }
  let out = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R' + encryptRef + ' /ID [<' + id.toString('hex') + '> <' + id.toString('hex') + '>] >>\nstartxref\n' + xref + '\n%%EOF\n';
  return new Uint8Array(Buffer.from(out, 'latin1'));
}

// A valid 1x1 white JPEG (any decodable bitmap works; only the placement box matters for coverage).
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==',
  'base64');

/**
 * Synthetic scanned PDF: pages with no text layer, only image XObjects.
 * Each page is a list of placement rects [x, y, w, h] (PDF units, 450x600 MediaBox)
 * that draw the same tiny bitmap — full-page covers, strips, or tiles.
 */
export function scannedPdf(rectsByPage) {
  const objs = [];
  const add = s => { objs.push(s); return objs.length; };
  const catalog = add(null), pagesId = add(null);
  const img = add('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + TINY_JPEG.length + ' >>\nstream\n' + TINY_JPEG.toString('latin1') + '\nendstream');
  const kids = [];
  for (const rects of rectsByPage) {
    const c = rects.map(([x, y, w, h]) => 'q ' + w + ' 0 0 ' + h + ' ' + x + ' ' + y + ' cm /Im0 Do Q').join('\n');
    const cs = add('<< /Length ' + Buffer.byteLength(c, 'latin1') + ' >>\nstream\n' + c + '\nendstream');
    kids.push(add('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 450 600] /Resources << /XObject << /Im0 ' + img + ' 0 R >> >> /Contents ' + cs + ' 0 R >>'));
  }
  objs[catalog - 1] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>';
  objs[pagesId - 1] = '<< /Type /Pages /Kids [' + kids.map(k => k + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>';
  const id = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
  let out = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R /ID [<' + id.toString('hex') + '> <' + id.toString('hex') + '>] >>\nstartxref\n' + xref + '\n%%EOF\n';
  return new Uint8Array(Buffer.from(out, 'latin1'));
}
