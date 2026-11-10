import { describe, it, expect } from 'vitest';
import { toMarkdown } from '../src/render.js';
import { makeBook, makeChapter, makeSection, finalizeBook, minutesOf } from '../src/model.js';
import { mdToItem, mdParse } from '../../../tests/helpers/app-markdown.mjs';

// Synthetic book, invented for tests.
function sample() {
  const b = makeBook({ title: 'كتاب تجريبي', author: 'مؤلف' });
  const c1 = makeChapter('الفصل الأول');
  const s1 = makeSection('');
  s1.blocks.push({ type: 'p', text: 'فقرة أولى فيها حاشية[^1].' });
  s1.blocks.push({ type: 'box', kind: 'key', text: 'فكرة أساسية قصيرة.' });
  c1.sections.push(s1);
  const s2 = makeSection('قسم فرعي');
  s2.blocks.push({ type: 'p', text: 'فقرة ثانية.' });
  s2.blocks.push({ type: 'list', items: ['بند', 'بند آخر'] });
  s2.blocks.push({ type: 'figure', src: 'img/p3-1.png', alt: '', caption: 'شكل ١: رسم' });
  c1.sections.push(s2);
  c1.notes.push({ id: '1', text: 'نص الحاشية.' });
  const c2 = makeChapter('الفصل الثاني');
  const s3 = makeSection('');
  s3.blocks.push({ type: 'p', text: 'فقرة.' });
  c2.sections.push(s3);
  b.chapters.push(c1, c2);
  return finalizeBook(b);
}

describe('toMarkdown', () => {
  it('uses the dialect markers', () => {
    const md = toMarkdown(sample());
    expect(md.startsWith('# كتاب تجريبي\n')).toBe(true);
    expect(md).toContain('\n## الفصل الأول\n');
    expect(md).toContain('\n### قسم فرعي\n');
    expect(md).toContain('> [!KEY]\n> فكرة أساسية قصيرة.');
    expect(md).toContain('[^1]: نص الحاشية.');
    expect(md).toContain('![شكل ١: رسم](img/p3-1.png)');
    expect(md).toContain('- بند\n- بند آخر');
  });

  it('accepts a result object', () => {
    const book = sample();
    expect(toMarkdown({ book, report: {} })).toBe(toMarkdown(book));
  });

  it('round-trips through the app importer (chapters, sections, boxes)', () => {
    const book = sample();
    const it = mdToItem(toMarkdown(book), 'book', '');
    expect(it.title).toBe(book.title);
    expect(it.chapters.map(c => c.title)).toEqual(book.chapters.map(c => c.title));
    expect(it.chapters[0].sections.map(s => s.title)).toEqual(['', 'قسم فرعي']);
    const kinds = it.chapters[0].sections[0].blocks.map(b => b.type);
    expect(kinds).toEqual(['html', 'box']);
    expect(it.chapters[0].sections[0].blocks[0].html).toContain('[^1]');
  });

  it('keeps chapters when there are no section titles', () => {
    const b = makeBook({ title: 'ع' });
    for (const t of ['أ', 'ب', 'ج']) { const c = makeChapter(t); const s = makeSection(''); s.blocks.push({ type: 'p', text: 'نص.' }); c.sections.push(s); b.chapters.push(c); }
    const it = mdToItem(toMarkdown(finalizeBook(b)), 'book', '');
    expect(it.chapters.length).toBe(3);
  });

  it('flattens newlines inside a paragraph', () => {
    const b = makeBook({ title: 'ع' });
    const c = makeChapter('ف'); const s = makeSection(''); s.blocks.push({ type: 'p', text: 'سطر\nسطر' }); c.sections.push(s); b.chapters.push(c);
    const blocks = mdParse(toMarkdown(b));
    expect(blocks.filter(x => x.html && x.html.startsWith('<p>')).length).toBe(1);
  });
});

describe('model', () => {
  it('computes minutes at 200 words per minute', () => {
    const c = makeChapter('x'); const s = makeSection('');
    s.blocks.push({ type: 'p', text: Array(450).fill('كلمة').join(' ') });
    c.sections.push(s);
    expect(minutesOf(c)).toBe(2);
  });
  it('finalize drops empty notes and sections', () => {
    const b = makeBook(); const c = makeChapter('x'); c.sections.push(makeSection('')); b.chapters.push(c);
    finalizeBook(b);
    expect(b.chapters[0].notes).toBeUndefined();
    expect(b.chapters[0].sections.length).toBe(0);
  });
});
