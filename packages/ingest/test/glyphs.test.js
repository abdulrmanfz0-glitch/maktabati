import { describe, it, expect } from 'vitest';
import { glyphKind, glyphNameToText, classifyCensus, censusHasUnknown } from '../src/glyphs.js';
import { postNames, embeddedGlyphNames } from '../src/fontfile.js';
import { solveLigatures } from '../src/ligsolver.js';
import { repairGlyphs, pdfjsNormalized, multiEvidence } from '../src/stages/glyphfix.js';
import { makeLexicon, lexKey } from '../src/lexicon.js';
import { repairLossy, lossyEvidence, pairOrderVotes, decidePairOrder, mirrorPairs, mapForms } from '../src/stages/normalize.js';
import { functionWordCheck, pairSwaps } from '../src/text.js';
import { textLayerIssues, scorePages, TrigramModel } from '../src/score.js';

const U = (...cps) => String.fromCodePoint(...cps);
const rev = s => [...s].reverse().join('');

describe('glyph kinds', () => {
  it('classifies missing, PUA, multi-letter and ordinary mappings', () => {
    expect(glyphKind('', 5)).toBe('missing');
    expect(glyphKind(U(0), 1)).toBe('missing');
    expect(glyphKind(U(0xFFFD), 1)).toBe('missing');
    expect(glyphKind(String.fromCharCode(915), 915, false)).toBe('missing'); // raw charcode leaking through
    expect(glyphKind(String.fromCharCode(915), 915, true)).toBe('ok');
    expect(glyphKind(U(0xE012), 3)).toBe('pua');
    expect(glyphKind('ين', 4)).toBe('multi');
    expect(glyphKind(U(0x064D, 0x0651), 4)).toBe('ok'); // two marks are not letters
    expect(glyphKind(U(0xFEE8), 4)).toBe('ok');
  });
  it('treats a glyph absent from the font program as empty, not unknown', () => {
    const census = new Map([['f1', { name: 'X', codes: new Map([[1, { u: U(0), n: 9, pages: new Set([1]), inFont: false }]]), toUnicodeKeys: null }]]);
    classifyCensus(census);
    expect(census.get('f1').codes.get(1).kind).toBe('empty');
    expect(censusHasUnknown(census)).toBe(false);
  });
});

describe('glyph names to text', () => {
  it('reads AGL ligature names, uni names and suffixes', () => {
    expect(glyphNameToText('lam_alefmaksura')).toBe('لى');
    expect(glyphNameToText('lam_alefmaksura.fina')).toBe('لى');
    expect(glyphNameToText('uniFEDF_uniFEE0')).toBe('لل');
    expect(glyphNameToText('uni0641064A')).toBe('في');
    expect(glyphNameToText('uniFC32')).toBe('في');
    expect(glyphNameToText('feh_yeh.isol')).toBe('في');
    expect(glyphNameToText('lam-ar.init')).toBe('ل');
    expect(glyphNameToText('afii57444')).toBe('ل');
    expect(glyphNameToText('u0644')).toBe('ل');
  });
  it('returns null for unknown or non-Arabic names', () => {
    expect(glyphNameToText('glyph123')).toBeNull();
    expect(glyphNameToText('A')).toBeNull();
    expect(glyphNameToText('.notdef')).toBeNull();
    expect(glyphNameToText('lam_foo')).toBeNull();
    expect(glyphNameToText(null)).toBeNull();
  });
});

// Minimal TrueType with a `post` format 2 table: glyph 0 = .notdef (standard), 1 = custom name.
function ttfWithPost(names) {
  const n = names.length;
  const custom = names.filter(x => x !== null);
  const postLen = 34 + 2 * n + custom.reduce((s, x) => s + 1 + x.length, 0);
  const off = 12 + 16;
  const b = new Uint8Array(off + postLen);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, 0x00010000); dv.setUint16(4, 1);
  b.set([0x70, 0x6f, 0x73, 0x74], 12); // 'post'
  dv.setUint32(12 + 8, off); dv.setUint32(12 + 12, postLen);
  dv.setUint32(off, 0x20000); dv.setUint16(off + 32, n);
  let ci = 0, q = off + 34 + 2 * n;
  names.forEach((x, g) => { dv.setUint16(off + 34 + 2 * g, x === null ? 0 : 258 + ci++); });
  for (const x of custom) { b[q++] = x.length; for (const c of x) b[q++] = c.charCodeAt(0); }
  return b;
}

describe('embedded font glyph names', () => {
  it('reads custom names from a post format 2 table', () => {
    const m = postNames(ttfWithPost([null, 'lam_alefmaksura', 'feh_yeh']));
    expect(m.get(1)).toBe('lam_alefmaksura');
    expect(m.get(2)).toBe('feh_yeh');
    expect(m.has(0)).toBe(false);
  });
  it('finds a Type0/CIDFontType2 font in a synthetic PDF (Identity map: code = GID)', async () => {
    const font = ttfWithPost([null, 'lam_alefmaksura']);
    const enc = new TextEncoder();
    const parts = [
      '%PDF-1.4\n',
      '1 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /ABCDEF+Test /Encoding /Identity-H /DescendantFonts [2 0 R] >>\nendobj\n',
      '2 0 obj\n<< /Type /Font /Subtype /CIDFontType2 /BaseFont /ABCDEF+Test /FontDescriptor 3 0 R /CIDToGIDMap /Identity >>\nendobj\n',
      '3 0 obj\n<< /Type /FontDescriptor /FontName /ABCDEF+Test /FontFile2 4 0 R >>\nendobj\n',
      '4 0 obj\n<< /Length ' + font.length + ' >>\nstream\n'
    ];
    const head = enc.encode(parts.join(''));
    const tail = enc.encode('\nendstream\nendobj\n%%EOF\n');
    const pdf = new Uint8Array(head.length + font.length + tail.length);
    pdf.set(head); pdf.set(font, head.length); pdf.set(tail, head.length + font.length);
    const names = await embeddedGlyphNames(pdf, async x => x);
    expect(names.get('ABCDEF+Test').format).toBe('truetype');
    expect(names.get('ABCDEF+Test').names.get(1)).toBe('lam_alefmaksura');
  });
});

describe('pdf.js normalization (raw-ligatures off emulation)', () => {
  it('reverses expanded ligatures inside right-to-left chunks', () => {
    // U+FC32 is FEH WITH YEH; pdf.js expands it before reversing an RTL chunk.
    expect(mapForms(pdfjsNormalized(U(0xFC32), 'rtl'))).toBe('يف');
    expect(mapForms(pdfjsNormalized(U(0xFC32), 'ltr'))).toBe('في');
    // With the rule on, the ligature stays one character and maps correctly afterwards.
    expect(mapForms(U(0xFC32))).toBe('في');
  });
  it('maps Latin ligatures that pdf.js no longer expands', () => {
    expect(mapForms(U(0xFB01) + 'x')).toBe('fix');
  });
});

// A synthetic document: font f1 has a multi-letter glyph "ين" (reversed by pdf.js in RTL chunks)
// and an unknown glyph emitted as U+E001.
function doc({ multiItems = 8, unknownCode = true } = {}) {
  const census = new Map([['f1', {
    name: 'AAAAAA+Body',
    codes: new Map([
      [10, { u: 'ين', n: multiItems, pages: new Set([1]), inFont: true }],
      [11, { u: U(0xFEE3), n: 50, pages: new Set([1]), inFont: true }],
      ...(unknownCode ? [[12, { u: U(0xE001), n: 12, pages: new Set([2]), inFont: true }]] : [])
    ]),
    toUnicodeKeys: new Set([10, 11, 12])
  }]]);
  const items1 = [];
  for (let i = 0; i < multiItems; i++) items1.push({ s: 'ب' + rev('ين'), fid: 'f1', dir: 'rtl' });
  const items2 = [];
  for (let i = 0; i < 12; i++) items2.push({ s: 'ع' + U(0xE001), fid: 'f1', dir: 'rtl' });
  items2.push({ s: 'علم', fid: 'f1', dir: 'rtl' });
  return { census, raws: [{ index: 1, items: items1, images: [] }, { index: 2, items: items2, images: [] }] };
}

describe('reversed multi-letter mappings', () => {
  it('restores the letters when the evidence says the font is reversed', () => {
    const { census, raws } = doc();
    const r = repairGlyphs(raws, census, {}, {});
    expect(r.report.multiFontsReversed).toBe(1);
    expect(r.raws[0].items[0].s).toBe('بين');
    expect(raws[0].items[0].s).toBe('بني'); // input untouched
  });
  it('does nothing when the rule is off', () => {
    const { census, raws } = doc();
    const r = repairGlyphs(raws, census, {}, { rules: { 'reversed-multi': false } });
    expect(r.raws[0].items[0].s).toBe('بني');
  });
  it('needs evidence: a swap that makes no known word is not applied', () => {
    const items = [];
    for (let i = 0; i < 8; i++) items.push({ s: 'ق' + rev('ين') + 'ط', fid: 'f1', dir: 'rtl' });
    const ev = multiEvidence(items, new Map([[rev('ين'), 'ين']]), null);
    expect(ev.after).toBe(0);
  });
});

describe('unknown glyphs: names, solver, unresolved', () => {
  it('uses the embedded glyph name', () => {
    const { census, raws } = doc();
    const names = new Map([['AAAAAA+Body', new Map([[12, 'lam_alefmaksura']])]]);
    const r = repairGlyphs(raws, census, { names }, {});
    expect(r.report.namesResolved).toBe(1);
    expect(r.raws[1].items[0].s).toBe('علی'.replace('ی', 'ى'));
    expect(r.report.unresolvedCodes).toBe(0);
  });
  it('solves from the dictionary when there is no name', () => {
    const { census, raws } = doc();
    const lexicon = makeLexicon(['على', 'بين']); // علم absent: otherwise لم would be as good as لى
    const r = repairGlyphs(raws, census, { lexicon }, {});
    expect(r.report.solverResolved).toBe(1);
    expect(r.raws[1].items[0].s).toBe('على');
  });
  it('leaves an ambiguous glyph unresolved (two ligatures make equally known words)', () => {
    const { census, raws } = doc();
    const r = repairGlyphs(raws, census, { lexicon: makeLexicon(['على', 'علم']) }, {});
    expect(r.report.solverResolved).toBe(0);
    expect(r.report.solver[0].confidence).toBeLessThan(0.6);
    expect(r.unresolvedByPage.get(2)).toBeGreaterThan(0);
  });
  it('leaves the glyph unresolved without a dictionary and routes its page', () => {
    const { census, raws } = doc();
    const r = repairGlyphs(raws, census, {}, {});
    expect(r.report.unresolvedCodes).toBe(1);
    expect(r.unresolvedByPage.get(2)).toBeGreaterThan(0);
    expect(r.unresolvedByPage.has(1)).toBe(false);
  });
});

describe('ligature solver', () => {
  const lexicon = makeLexicon(['على', 'إلى', 'في', 'فيه', 'بين', 'علم']);
  it('assigns one value per glyph over the whole document', () => {
    const X = U(0xE000);
    const toks = new Map([['ع' + X, 20], ['إ' + X, 10], ['ع' + X + 'ه', 1]]);
    const r = solveLigatures(toks, [X], { lexicon });
    expect(r.get(X).text).toBe('لى');
    expect(r.get(X).confidence).toBeGreaterThanOrEqual(0.6);
  });
  it('gives low confidence when evidence is thin or ambiguous', () => {
    const X = U(0xE000);
    const r = solveLigatures(new Map([['ق' + X, 1]]), [X], { lexicon });
    expect(r.get(X).confidence).toBeLessThan(0.6);
  });
  it('solves two unknown glyphs in one word after a first pass', () => {
    const X = U(0xE000), Y = U(0xE001);
    const toks = new Map([['ع' + X, 20], [Y, 15], [Y + 'ه', 5], ['ع' + X + ' ' + Y, 1]]);
    const r = solveLigatures(toks, [X, Y], { lexicon });
    expect(r.get(X).text).toBe('لى');
    expect(r.get(Y).text).toBe('في');
  });
  it('can use a character model as a tie-breaker', () => {
    const lm = new TrigramModel(); lm.train('في في في على إلى');
    const X = U(0xE000);
    const r = solveLigatures(new Map([['ع' + X, 10]]), [X], { lexicon, lm });
    expect(r.get(X).text).toBe('لى');
  });
});

describe('lexicon', () => {
  it('folds alef forms, alef maksura and marks', () => {
    const l = makeLexicon(['إلى', 'كتاب']);
    expect(lexKey('إِلَى')).toBe('الي');
    expect(l.has('الى')).toBe(true);
    expect(l.rank('إلى')).toBe(1);
    expect(l.rank('غائب')).toBe(Infinity);
    expect(l.size).toBe(2);
  });
});

describe('lossy repair', () => {
  const lexicon = makeLexicon(['على', 'إلى', 'في', 'من', 'كتاب']);
  it('repairs a non-word when one lost letter gives a very common word', () => {
    expect(repairLossy('جلس عل الكرسي', lexicon)).toEqual({ text: 'جلس على الكرسي', n: 1 });
    expect(repairLossy('ذهب إل البيت', lexicon).text).toBe('ذهب إلى البيت');
  });
  it('repairs whole tokens only, never a run between diacritics', () => {
    // كِتب is a known word with a kasra: the letter run after the mark must not be "repaired".
    const lex = makeLexicon(['كتب', 'تاب', 'على']);
    expect(repairLossy('كِتب', lex).n).toBe(0);
  });
  it('needs document evidence: lossy function-word forms must be frequent', () => {
    expect(lossyEvidence('على '.repeat(100) + 'عل '.repeat(2)).damaged).toBe(false);
    expect(lossyEvidence('على '.repeat(100) + 'عل '.repeat(12)).damaged).toBe(true);
    expect(lossyEvidence('عل '.repeat(3)).damaged).toBe(false);
  });
  it('leaves known words and ambiguous or rare candidates alone', () => {
    expect(repairLossy('من', lexicon).n).toBe(0);
    expect(repairLossy('كتب', lexicon, 4).n).toBe(0); // كتاب has rank 5 > 4
  });
});

describe('guillemet and quote order (document level)', () => {
  it('mirrors a pair type only when closing-first lines dominate the document', () => {
    let v;
    for (let i = 0; i < 6; i++) v = pairOrderVotes('قال »نعم« ثم', v);
    v = pairOrderVotes('قال «نعم»', v);
    expect(decidePairOrder(v)).toEqual([true, false]);
    expect(mirrorPairs('قال »نعم« ثم', [true, false])).toBe('قال «نعم» ثم');
  });
  it('does not touch a correct document where one line closes a quote and opens the next', () => {
    let v;
    for (let i = 0; i < 20; i++) v = pairOrderVotes('قال «نعم» ثم', v);
    for (let i = 0; i < 6; i++) v = pairOrderVotes('نهاية» ثم «بداية', v); // legitimate
    expect(decidePairOrder(v)).toEqual([false, false]);
  });
  it('mirrors double quotes too', () => {
    expect(mirrorPairs('قال ”نعم“', [false, true])).toBe('قال “نعم”');
  });
});

describe('text-layer checks', () => {
  it('pairSwaps lists reversed-ligature forms of a function word', () => {
    expect(pairSwaps('في')).toEqual(['يف']);
    expect(pairSwaps('على')).toContain('عىل');
  });
  it('flags a document whose function words carry reversed ligatures', () => {
    const bad = functionWordCheck('يف '.repeat(30) + 'من '.repeat(10));
    expect(bad.swapped).toBe(30);
    expect(textLayerIssues({ fw: bad, dictCoverage: null }).map(i => i.code)).toEqual(['reversed-ligatures']);
    const good = functionWordCheck('في '.repeat(30));
    expect(textLayerIssues({ fw: good, dictCoverage: 0.9 })).toEqual([]);
    expect(textLayerIssues({ fw: good, dictCoverage: 0.3 }).map(i => i.code)).toEqual(['low-dictionary-coverage']);
  });
  it('routes a page with unresolved glyphs to vision', () => {
    const s = scorePages([{ page: 1, text: 'كلمة '.repeat(50), unresolvedGlyphs: 2 }, { page: 2, text: 'كلمة '.repeat(50) }]);
    expect(s.pages[0].route).toBe('vision');
    expect(s.pages[0].issues).toContain('unresolved-glyphs');
    expect(s.pages[1].route).toBe('ok');
  });
});
