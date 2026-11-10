import { describe, it, expect } from 'vitest';
import { groupLines, reorderPage, lineBase } from '../src/stages/reorder.js';
import { normalizePage } from '../src/stages/normalize.js';
import { docStats, detectColumns, layoutPage } from '../src/stages/layout.js';
import { cleanPages, lineKey, residualRepeats, removeDiagramLabels } from '../src/stages/clean.js';

const item = (s, x, y, w, extra = {}) => Object.assign({ s, x, y, w, size: 13, font: 'F', bold: false, italic: false, dir: 'rtl' }, extra);

describe('reorder: groupLines', () => {
  it('groups items by baseline and splits wide gaps', () => {
    const items = [item('أ', 300, 500, 20), item('ب', 250, 500.4, 20), item('ج', 300, 480, 20), item('د', 30, 500, 20)];
    const lines = groupLines(items);
    // line at 500 splits into two segments (gap 200 > 2.5 em), plus the line at 480
    expect(lines.length).toBe(3);
  });
  it('keeps a raised small marker on its line', () => {
    const items = [item('نص', 300, 500, 20), item('1', 290, 504, 5, { size: 8 }), item('آخر', 240, 500, 40)];
    const lines = groupLines(items);
    expect(lines.length).toBe(1);
    expect(lines[0].y).toBe(500);
  });
});

describe('reorder: reorderPage', () => {
  it('orders items right to left and lines top to bottom', () => {
    const page = { items: [item('ثالث', 200, 480, 90), item('أول', 300, 500, 90), item('ثان', 200, 500, 90), item('رابع', 300, 480, 90)] };
    const lines = reorderPage(page, {});
    expect(lines.map(l => l.items.map(i => i.s).join(' '))).toEqual(['أول ثان', 'رابع ثالث']);
  });
  it('item-level mirroring is available behind a param (line level is the default)', () => {
    const page = { items: [item(')نعم(', 100, 500, 40)] };
    expect(reorderPage(page, { params: { mirrorLevel: 'item' } })[0].items[0].s).toBe('(نعم)');
    expect(reorderPage(page, {})[0].items[0].s).toBe(')نعم(');
  });
  it('mirrors brackets per whole line, across fragments (pdf.js does not mirror)', () => {
    // fragments as pdf.js returns them: each reversed on its own, brackets not mirrored
    const page = { items: [item('انظر', 300, 500, 40), item(')1', 270, 500, 14), item('(', 265, 500, 5), item('هنا', 220, 500, 38)] };
    const { lines } = normalizePage(reorderPage(page, {}), {});
    expect(lines[0].text).toBe('انظر (1) هنا');
    const off = normalizePage(reorderPage(page, { rules: { 'mirror-brackets': false } }), { rules: { 'mirror-brackets': false } });
    expect(off.lines[0].text).toBe('انظر )1( هنا');
  });
  it('rule off: keeps stream order', () => {
    const page = { items: [item('ب', 200, 500, 90), item('أ', 300, 500, 90)] };
    expect(reorderPage(page, { rules: { 'order-items': false } })[0].items.map(i => i.s)).toEqual(['ب', 'أ']);
  });
  it('lineBase', () => {
    expect(lineBase([item('English words', 0, 0, 10)])).toBe(0);
    expect(lineBase([item('كلمات عربية', 0, 0, 10)])).toBe(1);
  });
});

// Synthetic normalized lines: RTL, frame 50..400, leading 18, body 13.
const L = (text, y, x0 = 50, x1 = 400, extra = {}) => Object.assign({ text, y, x0, x1, base: 1, size: 13, bold: 0, italic: 0, fonts: ['F'], markers: 0 }, extra);

const WORDS = ['كتاب', 'قلم', 'بيت', 'شجرة', 'نهر', 'جبل', 'مدينة', 'طريق', 'سماء', 'بحر', 'زهرة', 'باب', 'نافذة'];
function bodyPage(n, extraTop, extraBottom) {
  const lines = [];
  if (extraTop) lines.push(L(extraTop, 570, 150, 300));
  for (let i = 0; i < 12; i++) lines.push(L(WORDS[(n * 7 + i) % WORDS.length] + ' ' + WORDS[(n * 3 + i * 5) % WORDS.length] + ' ' + WORDS[(n + i * 11) % WORDS.length] + '.', 530 - i * 18, i % 4 === 3 ? 200 : 50, i % 4 === 0 ? 385 : 400));
  if (extraBottom) lines.push(L(extraBottom, 30, 215, 235));
  return { index: n, width: 450, height: 600, lines };
}

describe('layout', () => {
  it('docStats finds body size, leading and frame', () => {
    const s = docStats([bodyPage(1), bodyPage(2)]);
    expect(s.bodySize).toBe(13);
    expect(s.leading).toBe(18);
    expect(s.frameRight).toBe(400);
    expect(s.frameLeft).toBe(50);
    expect(s.rtl).toBe(true);
  });
  it('marks paragraph starts by indent and short previous line', () => {
    const p = bodyPage(1);
    const s = docStats([p]);
    layoutPage(p, s, {});
    const flags = p.lines.map(l => l.parStart);
    // lines 0, 4, 8 are indented (x1 385); lines after a short line (3, 7) also start
    expect(flags[0]).toBe(true);
    expect(flags[1]).toBe(false);
    expect(flags[4]).toBe(true);
    expect(p.lines[3].endsShort).toBe(true);
  });
  it('marks top and bottom zone lines', () => {
    const p = bodyPage(1, 'ترويسة', '12');
    const s = docStats([p]);
    layoutPage(p, s, {});
    expect(p.lines[0].zone).toBe('top');
    expect(p.lines[p.lines.length - 1].zone).toBe('bottom');
  });
  it('detects two columns and orders the right column first', () => {
    const lines = [];
    for (let i = 0; i < 8; i++) { lines.push(L('يمين ' + i, 500 - i * 18, 240, 400)); lines.push(L('يسار ' + i, 500 - i * 18, 50, 210)); }
    const stats = { bodySize: 13, leading: 18, frameLeft: 50, frameRight: 400, rtl: true };
    expect(detectColumns(lines, 450, stats).columns).toBe(2);
    const page = { width: 450, height: 600, lines: lines.slice() };
    layoutPage(page, stats, {});
    expect(page.lines.slice(0, 8).every(l => l.text.startsWith('يمين'))).toBe(true);
  });
  it('rule off: every line starts a paragraph', () => {
    const p = bodyPage(1);
    layoutPage(p, docStats([p]), { rules: { paragraphs: false } });
    expect(p.lines.every(l => l.parStart)).toBe(true);
  });
});

describe('clean', () => {
  it('lineKey normalizes digits and diacritics', () => {
    expect(lineKey('الفصلُ 12')).toBe(lineKey('الفصل 7'));
  });
  it('removes page numbers and repeated running headers, keeps rare lines', () => {
    const pages = [];
    for (let n = 1; n <= 10; n++) pages.push(bodyPage(n, n <= 2 ? 'سطر نادر' : 'عنوان الكتاب', String(n)));
    const stats = docStats(pages);
    for (const p of pages) layoutPage(p, stats, {});
    const r = cleanPages(pages, stats, {});
    expect(r.pageNumbers).toBe(10);
    expect(r.headers).toBe(8);
    expect(pages[0].lines[0].removed).toBeUndefined();
    expect(pages[5].lines[0].removed).toBe('header');
    expect(residualRepeats(pages)).toBe(0);
  });
  it('never removes a large heading even if repeated', () => {
    const pages = [];
    for (let n = 1; n <= 5; n++) { const p = bodyPage(n); p.lines.unshift(L('عنوان كبير', 570, 150, 300, { size: 20 })); pages.push(p); }
    const stats = docStats(pages);
    for (const p of pages) layoutPage(p, stats, {});
    cleanPages(pages, stats, {});
    expect(pages.every(p => !p.lines[0].removed)).toBe(true);
  });
  it('respects minRepeatShare', () => {
    const pages = [];
    for (let n = 1; n <= 20; n++) pages.push(bodyPage(n, n <= 4 ? 'ترويسة قصيرة' : null));
    const stats = docStats(pages);
    for (const p of pages) layoutPage(p, stats, {});
    const r = cleanPages(pages, stats, { params: { minRepeatShare: 0.5 } });
    expect(r.headers).toBe(0);
  });
});

describe('diagram labels', () => {
  const st = { bodySize: 13, leading: 17, frameLeft: 56, frameRight: 396, rtl: true };
  const Ln = (text, x0, x1, y) => ({ text, x0, x1, y, size: 13, zone: null, removed: false });
  it('removes short off-center lines far from both edges, keeps body lines', () => {
    const p = { lines: [Ln('تسمية أولى', 140, 190, 500), Ln('تسمية ثانية', 270, 300, 470), Ln('سطر عادي من المتن يمتد', 56, 396, 400)], images: [] };
    expect(removeDiagramLabels([p], st)).toBe(2);
    expect(p.lines[2].removed).toBe(false);
  });
  it('keeps an aligned block, a single line and a caption under an image', () => {
    const block = { lines: [Ln('أ ب', 240, 315, 300), Ln('ج د', 210, 315, 280)], images: [] };
    const single = { lines: [Ln('أ ب', 140, 190, 300)], images: [] };
    const cap = { lines: [Ln('أ ب', 140, 190, 300), Ln('ج د', 270, 300, 200)], images: [{ x: 100, y: 310, w: 150, h: 100 }] };
    expect(removeDiagramLabels([block, single, cap], st)).toBe(0);
  });
});
