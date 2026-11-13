import { describe, it, expect } from 'vitest';
import { buildInlineCitations, byteIndexToCodePoint } from '../../apps/web/src/core/citations.js';

const cpEnd = (text, sub) => {
  const i = text.indexOf(sub);
  return i < 0 ? text.length : [...text.slice(0, i + sub.length)].length;
};
const cpStart = (text, sub) => {
  const i = text.indexOf(sub);
  return i < 0 ? 0 : [...text.slice(0, i)].length;
};
const deepseek = (url, start, end, title = '') => ({ kind:'deepseek', items:[{ url_citation:{ url, title, start_index:start, end_index:end } }] });
const gemini = (url, byteEnd, title = '') => ({ kind:'gemini', items:[{ url, title, startIndex:0, endIndex:byteEnd }] });

describe('byte vs code-point indices', () => {
  it('converts UTF-8 byte offsets to code points for Arabic, CJK, and emoji', () => {
    expect(byteIndexToCodePoint('سلام', 4)).toBe(2);
    expect(byteIndexToCodePoint('中文', 6)).toBe(2);
    expect(byteIndexToCodePoint('😀a', 4)).toBe(1);
  });

  it('builds Gemini markers from a byte offset correctly', () => {
    const text = 'الناشر Penguin .';
    const endCp = cpEnd(text, 'Penguin');
    const endByte = new TextEncoder().encode(text.slice(0, endCp)).length;
    const out = buildInlineCitations(text, gemini('https://example.com/a', endByte, 'Penguin'));
    expect(out.text).toContain('Penguin.[[cite:1]]');
    expect(out.plain).toContain('Penguin.');
  });
});

describe('marker placement', () => {
  it('removes the space before punctuation and places the marker after it', () => {
    const text = 'نشرت الكتاب عند Pantheon Books ، وصدر عام 2024 .';
    const out = buildInlineCitations(text, { kind:'deepseek', items:[
      { url_citation:{ url:'https://example.com/a', title:'A', start_index:0, end_index:cpEnd(text, 'Books') } },
      { url_citation:{ url:'https://example.com/b', title:'B', start_index:0, end_index:cpEnd(text, '2024') } }
    ] });
    expect(out.text).toContain('Pantheon Books،[[cite:1]]');
    expect(out.text).toContain('2024.[[cite:2]]');
    expect(out.text).not.toContain('Books ،');
    expect(out.text).not.toContain('2024 .');
  });

  it('does not touch a space before punctuation that has no citation', () => {
    const text = 'أول . وثاني .';
    const out = buildInlineCitations(text, deepseek('https://example.com/a', 0, cpEnd(text, 'أول')));
    expect(out.text).toContain('أول.[[cite:1]]');
    expect(out.text).toContain('وثاني .');
  });

  it('moves the marker out of a Markdown link and code span', () => {
    const link = 'راجع [الموقع الرسمي](https://example.com) لتفاصيل';
    const outLink = buildInlineCitations(link, deepseek('https://example.com/a', 0, cpStart(link, 'الموقع')));
    expect(outLink.text.indexOf('[[cite:1]]')).toBeGreaterThan(outLink.text.indexOf('(https://example.com)'));

    const code = 'الأداة `deepseek_web_search` تعمل';
    const outCode = buildInlineCitations(code, deepseek('https://example.com/a', 0, cpStart(code, 'deepseek_web_search')));
    expect(outCode.text.indexOf('[[cite:1]]')).toBeGreaterThan(outCode.text.lastIndexOf('`'));
  });
});

describe('numbering and copy', () => {
  it('dedupes by URL and reuses the first number', () => {
    const text = 'معلومة أولى. معلومة ثانية.';
    const out = buildInlineCitations(text, { kind:'deepseek', items:[
      { url_citation:{ url:'https://example.com/a', title:'A', start_index:0, end_index:cpEnd(text, 'أولى') } },
      { url_citation:{ url:'https://example.com/a', title:'A', start_index:0, end_index:cpEnd(text, 'ثانية') } },
      { url_citation:{ url:'https://example.com/b', title:'B', start_index:0, end_index:cpEnd(text, 'ثانية') } }
    ] });
    expect(out.sources.map(s => s.url)).toEqual(['https://example.com/a', 'https://example.com/b']);
    expect((out.text.match(/\[\[cite:1\]\]/g) || []).length).toBe(2);
    expect(out.text).toContain('[[cite:2]]');
  });

  it('produces plain copy without markers and with a numbered source list', () => {
    const text = 'الناشر Penguin .';
    const out = buildInlineCitations(text, deepseek('https://example.com/a', 0, cpEnd(text, 'Penguin'), 'Penguin'));
    expect(out.plain).not.toContain('[[cite:');
    expect(out.plain).toContain('Penguin.');
    expect(out.plain).toContain('1. https://example.com/a');
  });
});
