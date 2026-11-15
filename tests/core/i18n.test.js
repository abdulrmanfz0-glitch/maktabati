// Localization catalog checks: every English value is real English, every tx()
// literal has a translation, the static shell is covered, and dynamic numeric
// strings still resolve through EN_PAT.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EN_UI, EN_PAT, TR_SKIP, translateText, hasArabic } from '../../apps/web/src/core/i18n.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APP = fs.readFileSync(path.join(ROOT, 'apps/web/src/legacy/app.js'), 'utf8');
const SHELL = fs.readFileSync(path.join(ROOT, 'apps/web/index.html'), 'utf8');
const AR = /[\u0600-\u06FF]/;

/* The app name is a brand and stays in Arabic inside the watermark and the
   “Maktabati file” label; these are the only English values allowed to carry
   Arabic letters. */
const BRAND_VALUES = new Set([
  'A «مكتبتي» file',
  '“مكتبتي” watermark'
]);

describe('localization catalog', () => {
  it('has a non-empty English value for every Arabic key', () => {
    for (const [key, value] of Object.entries(EN_UI)) {
      expect(key.trim(), 'empty key').not.toBe('');
      expect(value.trim(), 'empty value for ' + JSON.stringify(key)).not.toBe('');
    }
  });

  it('does not leak Arabic into English copy except brand names', () => {
    const leaks = Object.entries(EN_UI).filter(([, value]) => AR.test(value) && !BRAND_VALUES.has(value));
    expect(leaks).toEqual([]);
  });

  it('detects Arabic text', () => {
    expect(hasArabic('مكتبتي')).toBe(true);
    expect(hasArabic('My Library')).toBe(false);
    expect(hasArabic('')).toBe(false);
  });
});

describe('dynamic strings', () => {
  const cases = [
    ['الفصل 2', 'Chapter 2'],
    ['صفحة 3 من 10', 'Page 3 of 10'],
    ['قراءة تقريبًا 12 دقيقة', 'About 12 min read'],
    ['الفصل 1 · باقي 5 دقيقة', 'Chapter 1 · 5 min left'],
    ['نهاية الفصل 3', 'End of chapter 3'],
    ['المجموع: قرابة 21 دقيقة قراءة.', 'Total: about 21 min read.'],
    ['بدأت جلسة 25 دقيقة', 'Started a 25 min session'],
    ['انتهت جلستك (15 دقيقة)', 'Your session has ended (15 min)'],
    ['جلسة قراءة، باقي 12 دقيقة', 'Reading session, 12 min left'],
    ['· 2 تظليل', '· 2 highlights'],
    ['التكلفة التقريبية (تقدير): 2 فصل في 2 كتب = 2 طلب، قرابة 3 ألف توكن، تشمل تعليمات النظام ونص الفصل والرد.',
      'Estimated cost: 2 chapters = 2 requests, about 3k tokens, including system instructions, chapter text and the reply.'],
    ['من الفصل الحالي (2) إلى النهاية', 'From current chapter (2) to the end'],
    ['بطاقة 3 من 12', 'Card 3 of 12']
  ];
  for (const [input, expected] of cases) {
    it(input, () => expect(translateText(input)).toBe(expected));
  }

  it('leaves complete translations alone', () => {
    expect(translateText('مكتبتي')).toBe('My Library');
    expect(translateText('وش تبي تقرأ اليوم؟')).toBe('What do you want to read today?');
  });

  it('returns null instead of a partial translation for unknown copy', () => {
    expect(translateText('نص كتاب غير مترجم بلا مفتاح')).toBeNull();
  });
});

describe('source coverage', () => {
  it('translates every static tx() literal', () => {
    const missing = [];
    for (const m of APP.matchAll(/\btx\(\s*'((?:\\.|[^'\\])*)'/g)) {
      const key = m[1].replace(/\\'/g, "'");
      if (!AR.test(key) || key.includes('${')) continue;
      if (!translateText(key)) missing.push(key);
    }
    expect(missing).toEqual([]);
  });

  it('covers the Arabic UI copy in the static shell', () => {
    const found = new Set();
    for (const m of SHELL.matchAll(/>([^<>]*[\u0600-\u06FF][^<>]*)</g)) found.add(m[1].trim());
    for (const m of SHELL.matchAll(/(?:aria-label|placeholder|title|alt)="([^"]*[\u0600-\u06FF][^"]*)"/g)) found.add(m[1].trim());
    const missing = [...found].filter(s => !EN_UI[s] && !translateText(s));
    expect(missing).toEqual([]);
  });

  it('does not skip the reader chrome wholesale', () => {
    expect(TR_SKIP).not.toContain('#v-read');
    expect(TR_SKIP).toContain('[data-no-tr]');
    expect(TR_SKIP).toContain('.rt-fz');
    expect(TR_SKIP).toContain('.rt-gl');
  });

  it('has both exact and pattern rules', () => {
    expect(Object.keys(EN_UI).length).toBeGreaterThan(700);
    expect(EN_PAT.length).toBeGreaterThan(20);
  });
});
