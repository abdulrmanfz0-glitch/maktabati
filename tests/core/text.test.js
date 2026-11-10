import { describe, it, expect } from 'vitest';
import { foldArabic, findNormalizedRange } from '../../apps/web/src/core/text.js';

describe('Arabic search folding', () => {
  it('folds diacritics, alef forms, ya and ta marbuta', () => {
    expect(foldArabic('أَحْمَدُ')).toBe('احمد');
    expect(foldArabic('مُصْطَفَى')).toBe('مصطفي');
    expect(foldArabic('مَدْرَسَةٌ')).toBe('مدرسه');
  });

  it('maps a match with tashkeel back to the original text', () => {
    const s = 'قال: العِلْمُ نُورٌ وَالْجَهْلُ ظَلَامٌ.';
    const r = findNormalizedRange(s, 'العلم');
    expect(r).not.toBe(null);
    expect(s.slice(r.start, r.end)).toContain('العِلْمُ');
  });

  it('does not drift after tatweel and diacritics', () => {
    const s = 'بِسْــمِ اللهِ الرَّحْمَٰنِ';
    const r = findNormalizedRange(s, 'بسم');
    expect(s.slice(r.start, r.end)).toContain('بِسْــمِ');
  });

  it('maps a repaired PDF word with a combining mark', () => {
    const s = 'كلمة لُغة داخل النص';
    const r = findNormalizedRange(s, 'لغة');
    expect(r).not.toBe(null);
    expect(s.slice(r.start, r.end)).toBe('لُغة');
  });

  it('returns null when the query is absent or empty', () => {
    expect(findNormalizedRange('نص', 'غير موجود')).toBe(null);
    expect(findNormalizedRange('نص', '')).toBe(null);
  });
});
