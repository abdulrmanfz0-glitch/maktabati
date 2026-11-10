import { describe, it, expect } from 'vitest';
import { detectFootnotes, detectHeadings, detectChapters, findToc } from '../src/stages/structure.js';
import { assemble } from '../src/stages/assemble.js';
import { MARK_OPEN, MARK_CLOSE } from '../src/stages/normalize.js';

const M = n => MARK_OPEN + n + MARK_CLOSE;
const stats = { bodySize: 13, leading: 18, frameLeft: 50, frameRight: 400, rtl: true };
const L = (text, y, extra = {}) => Object.assign({ text, y, x0: 50, x1: 400, base: 1, size: 13, bold: 0, italic: 0, fonts: ['F'], markers: 0, parStart: false, endsShort: false, zone: null }, extra);
const WORDS = ['كتاب', 'قلم', 'بيت', 'شجرة', 'نهر', 'جبل', 'مدينة', 'طريق', 'سماء', 'بحر'];
const para = (y, i) => L(WORDS[i % 10] + ' ' + WORDS[(i * 3) % 10] + ' ' + WORDS[(i * 7) % 10] + '.', y, { parStart: true, endsShort: true });

describe('footnotes', () => {
  it('finds a small-font block at the bottom, split at markers', () => {
    const page = { height: 600, lines: [
      L('نص فيه إشارة' + M(1) + ' ونص آخر' + M(2), 500, { parStart: true }),
      L('سطر ثان من المتن.', 482),
      L(M(1) + 'الحاشية الأولى', 80, { size: 10 }),
      L('تكملة الحاشية الأولى', 68, { size: 10 }),
      L('(2) الحاشية الثانية', 56, { size: 10 })
    ] };
    const notes = detectFootnotes(page, stats, {});
    expect(notes.map(n => n.n)).toEqual(['1', '2']);
    expect(notes[0].text).toBe('الحاشية الأولى تكملة الحاشية الأولى');
    expect(page.lines.filter(l => l.role === 'note').length).toBe(3);
  });
  it('ignores small text that is not at the bottom', () => {
    const page = { height: 600, lines: [L('سطر صغير', 500, { size: 10 }), L('متن', 480)] };
    expect(detectFootnotes(page, stats, {})).toEqual([]);
  });
  it('marks a note without a leading number as a continuation', () => {
    const page = { height: 600, lines: [L('متن', 500), L('تكملة من الصفحة السابقة', 60, { size: 10 })] };
    const notes = detectFootnotes(page, stats, {});
    expect(notes[0].cont).toBe(true);
  });
});

function book() {
  // page 0: title page; page 1: TOC; pages 2-5: two chapters with a section each
  const pages = [];
  pages.push({ index: 1, height: 600, lines: [L('عنوان الكتاب الكبير', 400, { size: 24, parStart: true })] });
  pages.push({ index: 2, height: 600, lines: [L('المحتويات', 520, { size: 18, parStart: true }), L('مقدمة الكتاب', 480), L('الطريق إلى البحر', 460), L('المدينة والجبل', 440)] });
  const ch = (idx, title, sec) => ({ index: idx, height: 600, lines: [L(title, 480, { size: 20, parStart: true }), para(440, idx), para(422, idx + 1), L(sec, 390, { size: 15, parStart: true }), para(360, idx + 2)] });
  pages.push(ch(3, 'مقدمة الكتاب', 'قسم أول'));
  pages.push({ index: 4, height: 600, lines: [para(540, 1), L('يستمر هذا', 500, { parStart: false })] });
  pages.push(ch(5, 'الطريق إلى البحر', 'قسم ثان'));
  pages.push(ch(6, 'المدينة والجبل', 'قسم ثالث'));
  return pages;
}

describe('headings and chapters', () => {
  it('detects headings with levels by size', () => {
    const pages = book();
    const g = detectHeadings(pages, stats, {});
    const lv = Object.fromEntries(g.map(x => [x.text, x.level]));
    expect(lv['عنوان الكتاب الكبير']).toBe(1);
    expect(lv['مقدمة الكتاب']).toBeLessThan(lv['قسم أول']);
  });
  it('merges consecutive heading lines (label + title)', () => {
    const pages = [{ index: 1, height: 600, lines: [L('الفصل الأول', 500, { size: 20, parStart: true }), L('رحلة طويلة', 476, { size: 20, parStart: true }), para(430, 1)] }];
    const g = detectHeadings(pages, stats, {});
    expect(g.length).toBe(1);
    expect(g[0].text).toBe('الفصل الأول: رحلة طويلة');
  });
  it('finds the TOC page and uses it for chapters', () => {
    const pages = book();
    const g = detectHeadings(pages, stats, {});
    const toc = findToc(pages, g, {});
    expect(toc.pages).toEqual([1]);
    const ch = detectChapters(pages, g, {}, {});
    expect(ch.method).toBe('toc');
    expect(ch.chapters.map(c => c.title)).toEqual(['مقدمة الكتاب', 'الطريق إلى البحر', 'المدينة والجبل']);
  });
  it('falls back to headings when there is no TOC', () => {
    const pages = book().filter((_, i) => i !== 1);
    const g = detectHeadings(pages, stats, {});
    const ch = detectChapters(pages, g, {}, {});
    expect(ch.method).toBe('headings');
    expect(ch.chapters.length).toBeGreaterThanOrEqual(3);
  });
  it('prefers the outline when present', () => {
    const pages = book();
    const g = detectHeadings(pages, stats, {});
    const ch = detectChapters(pages, g, { outline: [{ title: 'مقدمة الكتاب', page: 3 }, { title: 'الطريق إلى البحر', page: 5 }] }, {});
    expect(ch.method).toBe('outline');
    expect(ch.chapters.map(c => c.page)).toEqual([2, 4]);
  });
  it('reports none when nothing is found', () => {
    const pages = [{ index: 1, height: 600, lines: [para(500, 1)] }];
    expect(detectChapters(pages, detectHeadings(pages, stats, {}), {}, {}).method).toBe('none');
  });
});

describe('assemble', () => {
  it('builds chapters and sections, drops front matter, continues paragraphs across pages', () => {
    const pages = book();
    const g = detectHeadings(pages, stats, {});
    const ch = detectChapters(pages, g, {}, {});
    const { book: b, metrics } = assemble(pages, stats, ch, g, { title: 'ت' }, {});
    expect(b.chapters.length).toBe(3);
    expect(b.chapters[0].sections.map(s => s.title)).toEqual(['', 'قسم أول']);
    expect(metrics.frontMatterPages).toBe(2);
    // the paragraph on page 4 without parStart continues the previous one
    const texts = b.chapters[0].sections[1].blocks.map(x => x.text);
    expect(texts.some(t => t.endsWith('يستمر هذا'))).toBe(true);
  });

  it('links markers to notes with per-chapter ids', () => {
    const mk = (idx, title) => ({ index: idx, height: 600, lines: [L(title, 480, { size: 20, parStart: true }), L('جملة' + M(1) + ' وجملة' + M(2) + '.', 440, { parStart: true })], notes: [{ n: '1', text: 'أولى', cont: false }, { n: '2', text: 'ثانية', cont: false }] });
    const pages = [mk(1, 'فصل أ'), mk(2, 'فصل ب')];
    const g = detectHeadings(pages, stats, {});
    const ch = detectChapters(pages, g, {}, { params: { chapterStartsPage: false } });
    const { book: b } = assemble(pages, stats, ch, g, {}, {});
    expect(b.chapters.length).toBe(2);
    for (const c of b.chapters) {
      expect(c.notes.map(n => n.id)).toEqual(['1', '2']);
      expect(c.sections[0].blocks[0].text).toBe('جملة[^1] وجملة[^2].');
    }
  });

  it('turns an unmatched marker back into its digits', () => {
    const pages = [{ index: 1, height: 600, lines: [L('سنة' + M(3) + ' هنا', 440, { parStart: true })] }];
    const { book: b, metrics } = assemble(pages, stats, { chapters: [], method: 'none', toc: null }, [], {}, {});
    expect(b.chapters[0].sections[0].blocks[0].text).toBe('سنة3 هنا');
    expect(metrics.unlinkedMarkers).toBe(1);
  });

  it('places a figure with its caption', () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const pages = [{ index: 7, height: 600, lines: [para(540, 1), L('شكل 1: رسم توضيحي', 280, { size: 11, parStart: true }), para(240, 2)], images: [{ x: 100, y: 300, w: 250, h: 200, key: 'k', png }] }];
    const { book: b, assets, metrics } = assemble(pages, stats, { chapters: [], method: 'none', toc: null }, [], {}, {});
    const blocks = b.chapters[0].sections[0].blocks;
    expect(blocks.map(x => x.type)).toEqual(['p', 'figure', 'p']);
    expect(blocks[1].caption).toBe('شكل 1: رسم توضيحي');
    expect(blocks[1].src).toBe('img/p7-1.png');
    expect(assets[0].bytes).toBe(png);
    expect(metrics.captions).toBe(1);
  });

  it('skips images repeated at the same place on 3+ pages (decoration)', () => {
    const png = new Uint8Array([1]);
    const pages = [1, 2, 3].map(i => ({ index: i, height: 600, lines: [para(400, i)], images: [{ x: 10, y: 560, w: 60, h: 30, key: 'logo', png }] }));
    const { metrics } = assemble(pages, stats, { chapters: [], method: 'none', toc: null }, [], {}, {});
    expect(metrics.figures).toBe(0);
  });
});
