import { describe, it, expect } from 'vitest';
import { scorePages, docIssues, route, TrigramModel, isSuccess, THRESHOLDS, coverage } from '../src/score.js';
import { fingerprint, selectProfile, paramsFor, DEFAULT_PARAMS } from '../src/profiles.js';
import { runVision, isVisionFallback } from '../src/vision.js';
import { SAFE_OPTIONS } from '../src/adapters/pdfjs-node.js';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// Synthetic "Arabic-like" prose: invented content words plus real function words at a natural rate.
const FW = ['في', 'من', 'على', 'أن', 'إلى', 'هذا', 'التي', 'الذي', 'كان', 'مع', 'عن', 'ما', 'لا', 'قد'];
const CW = ['الكتاب', 'المدينة', 'الطريق', 'البحر', 'الجبل', 'السماء', 'الزهرة', 'الباب', 'النافذة', 'القلم', 'البيت', 'الشجرة', 'النهر', 'الولد', 'المعلم', 'الدرس', 'يكتب', 'يقرأ', 'ذهب', 'رأى', 'قال', 'جميل', 'كبير', 'صغير'];
function prose(r, n = 200) { const w = []; for (let i = 0; i < n; i++) w.push(r() < 0.3 ? FW[Math.floor(r() * FW.length)] : CW[Math.floor(r() * CW.length)]); return w.join(' ') + '.'; }
const rev = s => s.split('\n').map(l => [...l].reverse().join('')).join('\n');
const broken = s => s.split(' ').map(w => [...w].join(' ')).join(' ');

describe('trigram model', () => {
  it('scores text like its training data higher than scrambled text', () => {
    const r = rng(1); const m = new TrigramModel();
    for (let i = 0; i < 5; i++) m.train(prose(r));
    expect(m.score(prose(r))).toBeGreaterThan(m.score(rev(prose(r))));
  });
});

describe('scorePages', () => {
  it('good pages score high; broken and reversed pages are flagged', () => {
    const r = rng(2);
    const pages = [];
    for (let i = 1; i <= 12; i++) pages.push({ page: i, text: prose(r) });
    pages.push({ page: 13, text: broken(prose(r)) });
    pages.push({ page: 14, text: rev(prose(r)) });
    pages.push({ page: 15, text: '', noText: true, image: 0.95 });
    pages.push({ page: 16, text: '', noText: true, image: 0 });
    const s = scorePages(pages);
    const by = Object.fromEntries(s.pages.map(p => [p.page, p]));
    expect(by[1].score).toBeGreaterThan(0.8);
    expect(by[13].issues).toContain('isolated-letters');
    expect(by[13].route).toBe('vision');
    expect(by[14].issues).toContain('reversed');
    expect(by[15].route).toBe('vision');
    expect(by[15].issues).toContain('no-text-layer');
    expect(by[16].route).toBe('blank');
    expect(s.lm.trainPages).toBeGreaterThanOrEqual(5);
  });
  it('does not score short or Latin-heavy pages', () => {
    const s = scorePages([{ page: 1, text: 'قليل' }, { page: 2, text: 'This page is mostly English text with a few words and no Arabic at all. '.repeat(10) }]);
    expect(s.pages.every(p => !p.scored)).toBe(true);
  });
});

describe('issues and routing', () => {
  const rows = (n, f) => Array.from({ length: n }, (_, i) => Object.assign({ page: i + 1, tokens: 100, issues: [], scored: true, score: 0.95, route: 'ok' }, f ? f(i) : {}));
  it('severity is major at >= 2% of non-blank pages', () => {
    const r = rows(100, i => (i < 3 ? { issues: ['broken-forms'] } : {}));
    expect(docIssues(r).find(i => i.code === 'broken-forms').severity).toBe('major');
    const r2 = rows(100, i => (i < 1 ? { issues: ['broken-forms'] } : {}));
    expect(docIssues(r2).find(i => i.code === 'broken-forms').severity).toBe('minor');
  });
  it('mixed quality when 5-60% of pages score under 0.6', () => {
    const r = rows(20, i => (i < 4 ? { score: 0.4 } : {}));
    expect(docIssues(r).some(i => i.code === 'mixed-quality')).toBe(true);
  });
  it('ok when score is high, chapters found and no major issue', () => {
    const r = rows(50);
    expect(route(r, 0.95, [], 5).recommendation).toBe('ok');
  });
  it('review when chapters are missing or score is middling', () => {
    expect(route(rows(50), 0.95, [], 1).recommendation).toBe('review');
    expect(route(rows(50), 0.7, [], 5).recommendation).toBe('review');
  });
  it('vision when most pages have no usable text', () => {
    const r = rows(10, i => (i < 6 ? { scored: false, route: 'vision', issues: ['no-text-layer'] } : {}));
    const out = route(r, 0.9, [], 5);
    expect(out.recommendation).toBe('vision');
    expect(out.visionPages.length).toBe(6);
  });
  it('confidence is within [0, 1]', () => {
    for (const s of [0, 0.3, 0.6, 0.8, 0.9, 1]) { const c = route(rows(20), s, [], 3).confidence; expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThanOrEqual(1); }
  });
  it('isSuccess follows the definition', () => {
    const rep = { score: 0.9, chapters: { count: 3 }, issues: [{ code: 'x', severity: 'minor' }] };
    expect(isSuccess(rep)).toBe(true);
    expect(isSuccess({ ...rep, issues: [{ code: 'x', severity: 'major' }] })).toBe(false);
    expect(isSuccess({ ...rep, score: THRESHOLDS.doc - 0.01 })).toBe(false);
  });
});

describe('profiles', () => {
  it('fingerprints and selects by producer and font, not by name or content', () => {
    const fp = fingerprint({ producer: 'iTextSharp 5.2.1 (c) 1T3XT BVBA', fonts: ['YakoutLinotypeLight-Regular'], pageSize: '450x600', charsPerItem: 60 });
    expect(fp.producer).toBe('iTextSharp 5.2.1');
    expect(fp.granularity).toBe('line');
    expect(selectProfile(fp).id).toBe('hindawi');
    expect(selectProfile(fingerprint({ producer: 'Adobe', fonts: ['Times'] })).id).toBe('generic');
  });
  it('params merge defaults, profile and override', () => {
    expect(paramsFor({ params: { spaceGapEm: 0.2 } }, { minRepeatCount: 5 })).toEqual({ ...DEFAULT_PARAMS, spaceGapEm: 0.2, minRepeatCount: 5 });
  });
});

describe('vision fallback interface (no model call)', () => {
  it('calls the provided implementation with rendered pages', async () => {
    const vision = { async pagesToMarkdown(pages) { return pages.map(p => '# page ' + p.page); } };
    expect(isVisionFallback(vision)).toBe(true);
    const out = await runVision(vision, async p => ({ mime: 'image/png', bytes: new Uint8Array([p]), width: 1, height: 1 }), [2, 5]);
    expect(out).toEqual({ 2: '# page 2', 5: '# page 5' });
  });
  it('does nothing without an implementation', async () => {
    expect(await runVision(null, null, [1])).toBe(null);
  });
});

describe('pdf.js safety options', () => {
  it('disables eval, XFA and font-face injection', () => {
    expect(SAFE_OPTIONS.isEvalSupported).toBe(false);
    expect(SAFE_OPTIONS.enableXfa).toBe(false);
    expect(SAFE_OPTIONS.disableFontFace).toBe(true);
  });
});

describe('page coverage', () => {
  const pages = (n, kind, extra = {}) => Array.from({ length: n }, (_, i) => Object.assign({ page: i + 1, kind }, extra));
  it('counts every page and passes when nothing is dropped', () => {
    const a = [{ page: 1, kind: 'cover' }, ...pages(3, 'front'), ...pages(90, 'chapter'), { page: 95, kind: 'blank' }];
    const { coverage: c, issue } = coverage(a);
    expect(c).toMatchObject({ pages: 95, cover: 1, front: 3, chapter: 90, blank: 1, dropped: 0, assignedShare: 1 });
    expect(issue).toBe(null);
  });
  it('flags coverage-low when dropped pages exceed 5% (a late first chapter)', () => {
    const a = [...pages(5, 'front'), ...pages(102, 'dropped', { reason: 'pre-chapter-text' }), ...pages(260, 'chapter')];
    const { coverage: c, issue } = coverage(a);
    expect(c.dropped).toBe(102);
    expect(c.droppedReasons).toEqual({ 'pre-chapter-text': 102 });
    expect(issue).toMatchObject({ code: 'coverage-low', severity: 'major' });
  });
  it('tolerates up to 5% dropped', () => {
    const a = [...pages(5, 'dropped', { reason: 'unplaced' }), ...pages(95, 'chapter')];
    expect(coverage(a).issue).toBe(null);
  });
});
