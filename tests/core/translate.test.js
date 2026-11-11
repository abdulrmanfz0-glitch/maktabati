import { describe, it, expect } from 'vitest';
import {
  PROMPT_VERSION, SYSTEM_PROMPT, parseGlossary, glossaryHash, glossaryForText,
  extractChapterUnits, chunkUnits, buildMessages, parseTranslation, qaSegment,
  estimateChapter, priceFor, isPeak, fingerprint, chapterSourceHash, countWords,
  bookPlan, runConcurrent, needsCostConfirm, isArabicHighlight, isSourceHighlight
} from '../../apps/web/src/core/translate.js';

const book = () => ({
  id: 'b1', type: 'book', title: 'A Book', lang: 'en',
  chapters: [{
    title: 'The Idea of History',
    sections: [{
      title: 'Beginnings',
      blocks: [
        { type: 'p', text: 'History is not a record of facts, but a conversation between the past and the present.' },
        { type: 'p', text: 'In 1990 the argument changed, and the name Rivermere returned.' },
        { type: 'h4', text: 'A Short Heading' },
        { type: 'list', items: ['The first item is here.', 'The second item is here.'] },
        { type: 'box', kind: 'key', title: 'Key idea', text: ['The boxed paragraph is here.'] },
        { type: 'figure', src: 'img/p1.png', alt: 'A figure', caption: 'Figure one' },
        { type: 'html', html: '<p>An HTML paragraph with <em>markup</em> and 42.</p>' }
      ]
    }]
  }]
});

describe('glossary', () => {
  it('parses term lines, ignores comments and keeps the last duplicate', () => {
    const g = parseGlossary('# comment\nRivermere = ريفيرمير\nquantum entanglement => التشابك الكمي\nRivermere = ريفيرمير الثانية\nbroken line');
    expect(g).toEqual([
      { en: 'Rivermere', ar: 'ريفيرمير الثانية' },
      { en: 'quantum entanglement', ar: 'التشابك الكمي' }
    ]);
  });
  it('sends only terms present in the segment', () => {
    const terms = parseGlossary('Rivermere = ريفيرمير\nquantum entanglement = التشابك الكمي\nHomer = هوميروس');
    expect(glossaryForText(terms, 'The name Rivermere returned.').map(t => t.en)).toEqual(['Rivermere']);
    expect(glossaryForText(terms, 'Nothing here.').length).toBe(0);
    expect(glossaryHash(terms)).toBe(glossaryHash(terms.slice().reverse()));
  });
});

describe('chapter units', () => {
  it('keeps titles, paragraphs, headings, list items and boxes, and skips figures', () => {
    const units = extractChapterUnits(book(), 0);
    expect(units.map(u => u.id)).toEqual([
      'c0:title', 's0-0:title',
      '0-0-0', '0-0-1', '0-0-2',
      '0-0-3:li0', '0-0-3:li1',
      '0-0-4:boxTitle', '0-0-4:boxText0',
      '0-0-6'
    ]);
    expect(units.find(u => u.id === '0-0-0').blockKey).toBe('0-0-0');
    expect(units.find(u => u.id === '0-0-3:li1').kind).toBe('li');
    expect(units.find(u => u.id === '0-0-6').kind).toBe('html');
    expect(units.some(u => u.text.includes('figure'))).toBe(false);
  });
  it('filters only body blocks of three words or fewer for PDF', () => {
    const b = book();
    b.chapters[0].sections[0].blocks.unshift({ type: 'p', text: 'one two three' });
    b.chapters[0].sections[0].blocks.unshift({ type: 'p', text: 'one two three four' });
    const epub = extractChapterUnits(b, 0, { pdf: false });
    const pdf = extractChapterUnits(b, 0, { pdf: true });
    expect(epub.some(u => u.text === 'one two three')).toBe(true);
    expect(pdf.some(u => u.text === 'one two three')).toBe(false);
    expect(pdf.some(u => u.text === 'one two three four')).toBe(true);
    expect(pdf.some(u => u.kind === 'title')).toBe(true);
  });
});

describe('segments', () => {
  const units = Array.from({ length: 30 }, (_, i) => ({ id: 'u' + i, text: ('word '.repeat(90) + i).trim() }));
  it('keeps order and the source units intact', () => {
    const chunks = chunkUnits(units, { target: 1800, max: 2500 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flatMap(c => c.units.map(u => u.id))).toEqual(units.map(u => u.id));
    for (const c of chunks) expect(c.tokens).toBeLessThanOrEqual(2500);
  });
  it('splits an oversized single unit at sentence boundaries', () => {
    const long = { id: 'long', text: Array.from({ length: 300 }, (_, i) => 'This is sentence number ' + i + ' with enough words to matter. ').join('') };
    const chunks = chunkUnits([long], { target: 1800, max: 2500 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flatMap(c => c.units.map(u => u.text)).join(' ')).toContain('sentence number 0');
    expect(chunks.every(c => c.tokens <= 2500)).toBe(true);
  });
});

describe('prompt and parse', () => {
  const units = [{ id: 'a', text: 'Hello 1990.' }, { id: 'b', text: 'A second paragraph.' }];
  it('keeps the system message byte-identical and puts context outside the units', () => {
    const a = buildMessages({ units, context: 'Previous sentence.', glossary: [{ en: 'Hello', ar: 'مرحبا' }] });
    const b = buildMessages({ units, context: 'Another context.', glossary: [] });
    expect(a[0].content).toBe(SYSTEM_PROMPT);
    expect(a[0].content).toBe(b[0].content);
    expect(a[1].content).toContain('Previous sentence.');
    expect(a[1].content).toContain('Hello => مرحبا');
    expect(a[1].content).toContain('"id":"a"');
  });
  it('parses object, array and fenced JSON', () => {
    expect(parseTranslation('{"translations":[{"id":"a","text":"مرحبا"}]}').items).toEqual([{ id: 'a', text: 'مرحبا' }]);
    expect(parseTranslation('[{"id":"a","text":"مرحبا"}]').items).toEqual([{ id: 'a', text: 'مرحبا' }]);
    expect(parseTranslation('```json\n{"a":"مرحبا"}\n```').items).toEqual([{ id: 'a', text: 'مرحبا' }]);
    expect(parseTranslation('not json').ok).toBe(false);
  });
});

describe('QA', () => {
  const units = [{ id: 'a', text: 'Hello 1990.' }, { id: 'b', text: 'The quantum entanglement matters.' }];
  const glossary = [{ en: 'quantum entanglement', ar: 'التشابك الكمي' }];
  it('accepts a faithful segment and has no hard failures', () => {
    const qa = qaSegment({ units, glossary, items: [{ id: 'a', text: 'مرحبا 1990.' }, { id: 'b', text: 'التشابك الكمي مهم.' }] });
    expect(qa.ok).toBe(true);
    expect(qa.hard).toEqual([]);
  });
  it('rejects missing, duplicate and extra ids', () => {
    expect(qaSegment({ units, items: [{ id: 'a', text: 'مرحبا.' }] }).hard).toContain('missing_ids');
    expect(qaSegment({ units, items: [{ id: 'a', text: 'مرحبا.' }, { id: 'a', text: 'مرحبا.' }] }).hard).toContain('duplicate_ids');
    expect(qaSegment({ units, items: [{ id: 'a', text: 'مرحبا.' }, { id: 'b', text: 'مرحبا.' }, { id: 'x', text: 'مرحبا.' }] }).hard).toContain('extra_ids');
  });
  it('rejects empty, non-Arabic and refusal output', () => {
    expect(qaSegment({ units:[units[0]], items:[{ id:'a', text:'' }] }).hard).toContain('empty');
    expect(qaSegment({ units:[units[0]], items:[{ id:'a', text:'Hello 1990.' }] }).hard).toContain('non_arabic');
    expect(qaSegment({ units:[units[0]], items:[{ id:'a', text:'لا أستطيع ترجمة هذا.' }] }).hard).toContain('refusal');
  });
  it('warns about missing numbers, glossary terms and odd length', () => {
    const qa = qaSegment({ units, glossary, items: [{ id:'a', text:'مرحبا.' }, { id:'b', text:'شيء مختلف تماما هنا.' }] });
    expect(qa.ok).toBe(true);
    expect(qa.warn).toContain('numbers');
    expect(qa.warn).toContain('glossary');
  });
});

describe('cost and fingerprint', () => {
  it('prices DeepSeek Flash off-peak and peak', () => {
    const p = priceFor('deepseek-flash', 'https://api.deepseek.com');
    expect(p.input).toBe(0.15);
    expect(p.output).toBe(0.60);
    expect(p.peakInput).toBe(0.30);
    const est = estimateChapter(book(), 0, { model:'deepseek-flash', base:'https://api.deepseek.com', glossary:[] });
    expect(est.estimate).toBe(true);
    expect(est.cost).toBeGreaterThan(0);
    expect(est.peakCost).toBeGreaterThan(est.offpeakCost);
  });
  it('recognises Gemini and unknown models', () => {
    expect(priceFor('gemini-3.8-flash', 'https://generativelanguage.googleapis.com/v1beta/openai').input).toBe(0.75);
    expect(priceFor('some-local-model', 'http://localhost:11434/v1')).toBe(null);
  });
  it('marks the official DeepSeek peak windows', () => {
    expect(isPeak(new Date('2026-11-11T02:00:00Z'))).toBe(true);
    expect(isPeak(new Date('2026-11-11T07:00:00Z'))).toBe(true);
    expect(isPeak(new Date('2026-11-11T10:30:00Z'))).toBe(false);
    expect(isPeak(new Date('2026-11-14T02:00:00Z'))).toBe(false);
  });
  it('changes the fingerprint with the source, model, prompt or glossary', () => {
    const units = extractChapterUnits(book(), 0);
    const base = { sourceHash:chapterSourceHash(units), model:'deepseek-flash', base:'https://api.deepseek.com', promptVersion:PROMPT_VERSION, glossaryHash:glossaryHash([]) };
    expect(fingerprint(base)).toBe(fingerprint(Object.assign({}, base)));
    expect(fingerprint(Object.assign({}, base, { model:'gemini-3.8-flash' }))).not.toBe(fingerprint(base));
    expect(fingerprint(Object.assign({}, base, { glossaryHash:glossaryHash([{ en:'x', ar:'س' }]) }))).not.toBe(fingerprint(base));
  });
  it('counts words for the preflight estimate', () => {
    expect(countWords('one two, three!')).toBe(3);
  });
});

describe('whole-book planning', () => {
  it('plans a range and keeps already-translated chapters out of the active cost', () => {
    const b = book();
    b.chapters.push({ title:'Chapter Two', sections:[{ title:'Second', blocks:[{ type:'p', text:'The second chapter has its own paragraph and 2025.' }] }] });
    const first = bookPlan(b, { from:0, to:1, model:'deepseek-flash', base:'https://api.deepseek.com', glossary:[] });
    expect(first.from).toBe(0);
    expect(first.to).toBe(1);
    expect(first.rows).toHaveLength(2);
    expect(first.totals.segments).toBeGreaterThan(1);
    expect(first.totals.cost).toBeGreaterThan(0);
    expect(first.totals.timeHighSec).toBeGreaterThanOrEqual(first.totals.timeLowSec);
    const skipped = bookPlan(b, {
      from:0, to:1, model:'deepseek-flash', base:'https://api.deepseek.com', glossary:[],
      states:{ 0:{ state:'done', fingerprint:first.rows[0].fingerprint } }
    });
    expect(skipped.rows[0].skipped).toBe(true);
    expect(skipped.totals.done).toBe(1);
    expect(skipped.totals.segments).toBeLessThan(first.totals.segments + skipped.rows[1].segments);
  });
  it('flags a cost above the confirmation threshold', () => {
    expect(needsCostConfirm(1.01)).toBe(true);
    expect(needsCostConfirm(1.00)).toBe(false);
    expect(needsCostConfirm(0)).toBe(false);
    const big = book();
    big.chapters[0].sections[0].blocks = Array.from({ length:300 }, () => ({ type:'p', text:'word '.repeat(100) }));
    const plan = bookPlan(big, { model:'claude-opus-5.5', base:'https://api.anthropic.com', glossary:[] });
    expect(plan.totals.cost).toBeGreaterThan(1);
    expect(plan.needsConfirm).toBe(true);
  });
});

describe('concurrency helper', () => {
  it('runs at most the limit and returns results in input order', async () => {
    let active = 0, max = 0;
    const out = await runConcurrent([0,1,2,3,4], async n => {
      active++; max = Math.max(max, active);
      await new Promise(r => setTimeout(r, (5 - n) * 5));
      active--;
      return n * 10;
    }, { limit:2 });
    expect(max).toBeLessThanOrEqual(2);
    expect(out).toEqual([0,10,20,30,40]);
  });
});

describe('annotation view filtering', () => {
  it('matches Arabic highlights only on the exact translation fingerprint', () => {
    const a = { kind:'hl', lang:'ar', trFp:'fp1', text:'نص عربي' };
    expect(isArabicHighlight(a, 'fp1')).toBe(true);
    expect(isArabicHighlight(a, 'fp2')).toBe(false);
    expect(isArabicHighlight(a, '')).toBe(false);
    expect(isSourceHighlight(a)).toBe(false);
  });
  it('keeps old highlights as source highlights', () => {
    expect(isSourceHighlight({ kind:'hl', text:'English' })).toBe(true);
    expect(isSourceHighlight({ kind:'hl', lang:'en', text:'English' })).toBe(true);
    expect(isSourceHighlight({ kind:'quote', text:'x' })).toBe(false);
  });
});
