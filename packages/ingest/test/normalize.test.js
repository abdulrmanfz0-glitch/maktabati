import { describe, it, expect } from 'vitest';
import { mapForms, stripTatweel, stripControls, attachMarks, joinItems, normalizePage, reversalStats, repairSplitMarks, MARK_OPEN, MARK_CLOSE, toAsciiDigits } from '../src/stages/normalize.js';
import { assemble } from '../src/stages/assemble.js';
import { RE_PRES } from '../src/text.js';

const U = (...cps) => String.fromCodePoint(...cps);
const it1 = (s, x, w, extra = {}) => Object.assign({ s, x, y: 100, w, size: 13, font: 'F', bold: false, italic: false, dir: 'rtl' }, extra);
const line = (items, extra = {}) => Object.assign({ items, y: 100, x0: Math.min(...items.map(i => i.x)), x1: Math.max(...items.map(i => i.x + i.w)), base: 1 }, extra);

describe('presentation forms', () => {
  it('maps contextual forms to base letters', () => {
    // "كتب" written with initial/medial/final forms: FEDB FE98 FE90
    expect(mapForms(U(0xFEDB, 0xFE98, 0xFE90))).toBe('كتب');
  });
  it('expands lam-alef ligatures to lam + the right alef', () => {
    expect(mapForms(U(0xFEFB))).toBe('لا');
    expect(mapForms(U(0xFEFC))).toBe('لا');
    expect(mapForms(U(0xFEF7))).toBe('لأ');
    expect(mapForms(U(0xFEF9))).toBe('لإ');
    expect(mapForms(U(0xFEF5))).toBe('لآ');
  });
  it('maps spacing mark forms without inserting a space', () => {
    // FE77 = fatha medial form
    expect(mapForms('ب' + U(0xFE77))).toBe('ب' + U(0x064E));
  });
  it('leaves base letters, Latin and digits alone', () => {
    expect(mapForms('كتاب book 12')).toBe('كتاب book 12');
  });
});

describe('tatweel, controls, digits', () => {
  it('strips tatweel but keeps diacritics', () => {
    expect(stripTatweel('كـــتَـاب')).toBe('كتَاب');
  });
  it('strips NUL and other controls', () => {
    expect(stripControls('ك' + U(0) + 'ت' + U(7) + 'ب')).toBe('كتب');
  });
  it('converts Arabic-Indic digits', () => {
    expect(toAsciiDigits(U(0x0661, 0x0662))).toBe('12');
  });
});

describe('attachMarks', () => {
  it('puts a separated mark after the letter it sits over (RTL)', () => {
    // item "كتب" spans x 100..130; a fatha drawn over its first (rightmost) letter
    const base = it1('كتب', 100, 30);
    const mark = it1(U(0x064E), 124, 4);
    const out = attachMarks([base, mark]);
    expect(out.length).toBe(1);
    expect(out[0].s).toBe('ك' + U(0x064E) + 'تب');
  });
  it('is a no-op without mark-only items', () => {
    const a = it1('كتب', 100, 30);
    expect(attachMarks([a])).toEqual([a]);
  });
});

describe('joinItems', () => {
  it('joins overlapping fragments without spaces', () => {
    // logical order already: fragments of one word, overlapping widths (as in fragment files)
    const items = [it1('الك', 120, 20), it1('تا', 105, 20), it1('ب', 95, 12)];
    expect(joinItems(items, 1, {})).toBe('الكتاب');
  });
  it('inserts a space for a word-sized gap', () => {
    const items = [it1('في', 200, 15), it1('البيت', 150, 40)];
    expect(joinItems(items, 1, {})).toBe('في البيت');
  });
  it('rule off: always joins with a space', () => {
    const items = [it1('الك', 120, 20), it1('تا', 105, 20)];
    expect(joinItems(items, 1, { rules: { 'gap-space': false } })).toBe('الك تا');
  });
});

describe('split Arabic diacritics from pdf.js', () => {
  it('repairs a space before a combining mark in one item', () => {
    const out = normalizePage([line([it1('ل ُغة', 50, 80)])], {});
    expect(out.lines[0].text).toBe('لُغة');
  });

  it('repairs the five reported examples without touching real spaces', () => {
    const cases = [
      [[it1('ل', 160, 20), it1('ُ', 176, 4), it1('غة', 120, 40)], 'لُغة'],
      [[it1('تترس', 160, 40), it1('ّ', 162, 4), it1('خ', 115, 45)], 'تترسّخ'],
      [[it1('حس', 160, 40), it1('ّ', 162, 4), it1('اسة', 115, 45)], 'حسّاسة'],
      [[it1('نتبن', 160, 40), it1('ّ', 162, 4), it1('اها', 115, 45)], 'نتبنّاها']
    ];
    for (const [items, after] of cases) {
      const out = normalizePage([line(items)], {});
      expect(out.lines[0].text).toBe(after);
    }
    // The fifth example is a shadda item attached to the previous base and a
    // following item that starts with a space; their boxes touch.
    const joined = normalizePage([line([it1('يجد', 200, 20), it1('ّ', 200, 4), it1('فان', 160, 40)])], {});
    expect(joined.lines[0].text).toBe('يجدّفان');
  });

  it('keeps a normal sentence with real word spaces unchanged', () => {
    const s = 'هذا كتابٌ جديدٌ على الطاولة.';
    const out = normalizePage([line([it1(s, 50, 220)])], {});
    expect(out.lines[0].text).toBe(s);
  });

  it('applies NFC to the repaired text', () => {
    const out = repairSplitMarks('ل ُغة');
    expect(out).toBe('لُغة');
    expect(out.normalize('NFC')).toBe(out);
  });
});

describe('real spaces after a word ending in a mark', () => {
  const phrases = [
    ['كلّ شيء', ['كلّ', ' شيء']],
    ['حقّ الناس', ['حقّ', ' الناس']],
    ['كتابٌ جديدٌ مفيدٌ', ['كتابٌ', ' جديدٌ', ' مفيدٌ']],
    ['جدّاً كبيراً', ['جدّاً', ' كبيراً']],
    ['إنّ الله', ['إنّ', ' الله']]
  ];
  const itemsAt = (words, gap) => {
    const out = []; let x = 260;
    for (const w of words) { out.push(it1(w, x, 40)); x -= 40 + gap; }
    return out;
  };

  for (const [label, words] of phrases) {
    it('joinItems keeps a touching real space: ' + label, () => {
      const out = joinItems(itemsAt(words, 0), 1, {});
      expect(out).toBe(label);
    });
    it('joinItems keeps a word-sized gap: ' + label, () => {
      const out = joinItems(itemsAt(words, 12), 1, {});
      expect(out).toBe(label);
    });
    it('assemble.closePara keeps a line-ending real space: ' + label, () => {
      const lines = words.map((text, i) => ({ text, y: 100 - i * 16, x0: 40, x1: 200, size: 13, base: 1, parStart: i === 0 }));
      const pages = [{ index: 1, lines, images: [], notes: [], width: 300, height: 400 }];
      const { book } = assemble(pages, { bodySize: 13, leading: 16 }, { chapters: [] }, [], {}, {});
      const text = book.chapters[0].sections[0].blocks[0].text;
      expect(text).toBe(label);
    });
  }
});

describe('normalizePage', () => {
  it('turns raised small digits into marker tokens', () => {
    const l = line([it1('نص', 200, 20), it1('1', 190, 5, { size: 8, y: 105 }), it1('هنا', 150, 30)]);
    const { lines } = normalizePage([l], {});
    expect(lines[0].text).toContain(MARK_OPEN + '1' + MARK_CLOSE);
    expect(lines[0].markers).toBe(1);
  });

  it('maps forms and removes tatweel in the output', () => {
    const l = line([it1(U(0xFEDB, 0x0640, 0xFE98, 0xFE90), 100, 40)]);
    const { lines } = normalizePage([l], {});
    expect(lines[0].text).toBe('كتب');
    expect(RE_PRES.test(lines[0].text)).toBe(false);
  });

  it('reverses a page whose words look reversed, and lam-alef cannot flip', () => {
    // Logical words with ال- and a lam-alef ligature; then reversed at character level
    const words = ['الكتاب', 'البيت', 'القلم', 'الولد', 'المدرسة', 'البحر', 'الشمس', 'القمر', 'الطريق', 'الليل'];
    const logical = words.join(' ') + ' ' + U(0xFEFB) + ' ' + words.join(' ');
    const visual = [...logical].reverse().join('');
    const l = line([it1(visual, 50, 350)]);
    const out = normalizePage([l], {});
    expect(out.reversed).toBe(true);
    expect(out.lines[0].text).toBe(mapForms(logical));
    expect(out.lines[0].text).toContain(' لا ');
  });

  it('keeps a logical page as it is', () => {
    const txt = 'ذهب الولد إلى المدرسة في الصباح وقرأ الكتاب والدرس والقصة';
    const out = normalizePage([line([it1(txt, 50, 350)])], {});
    expect(out.reversed).toBe(false);
    expect(out.lines[0].text).toBe(txt);
  });

  it('can strip diacritics when asked', () => {
    const out = normalizePage([line([it1('كَتَبَ', 50, 50)])], { stripMarks: true });
    expect(out.lines[0].text).toBe('كتب');
  });
});

describe('reversalStats', () => {
  it('counts al- starts and -la ends', () => {
    const s = reversalStats('الكتاب البيت');
    expect(s.al).toBe(2);
    expect(s.reversed).toBe(false);
  });
});
