import { describe, it, expect } from 'vitest';
import { validateLibrary, planLibraryImport } from '../../apps/web/src/core/library.js';

const fig = 'data:image/png;base64,iVBORw0KGgo=';

const item = {
  id: 'book-1', type: 'book', title: 'كتاب', author: 'مؤلف', createdAt: 1, progress: .2,
  chapters: [{
    title: 'الفصل', minutes: 3,
    overview: ['فكرة'],
    sections: [{
      title: 'قسم',
      blocks: [
        { type: 'p', text: 'نص' },
        { type: 'h4', text: 'عنوان' },
        { type: 'list', items: ['أ', 'ب'] },
        { type: 'box', kind: 'key', text: 'مهم' },
        { type: 'figure', fig: 'img/p1-1.png', alt: 'شكل' },
        { type: 'diagram', steps: ['أ', 'ب'], loop: true },
        { type: 'html', html: '<p>نص</p>' }
      ],
      recall: { q: 'س', a: 'ج' }
    }],
    review: [{ q: 'س', a: 'ج', applied: true }],
    terms: [{ ar: 'مصطلح', en: 'term', def: 'تعريف' }],
    notes: [{ id: '1', text: 'حاشية' }]
  }]
};

const exportData = {
  app: 'maktabati', v: 1, exported: '2026-11-10T00:00:00.000Z',
  items: [item],
  annos: [
    { id: 'a1', kind: 'hl', itemId: 'book-1', bk: '0-0-0', text: 'نص', hk: 'imp', note: '', links: ['a2'], t: 1 },
    { id: 'a2', kind: 'quote', itemId: 'book-1', bk: '0-0-0', text: 'اقتباس', t: 1 }
  ],
  kv: [
    { k: 'cards', v: { 'book-1|0|r0': { stage: 0, due: 1 } } },
    { k: 'chat:b:book-1', v: [{ id: 'c1', t: 1, bookId: 'book-1', msgs: [{ role: 'user', content: 'سؤال' }, { role: 'assistant', content: 'جواب' }] }] },
    { k: 'fig:book-1:img/p1-1.png', v: fig },
    { k: 'f:book-1:c0:predict', v: 'توقع' }
  ],
  unknown: 'ignored'
};

describe('validateLibrary', () => {
  it('accepts a complete export and ignores unknown top-level keys', () => {
    const r = validateLibrary(exportData);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });
  it('accepts a missing version as version 1', () => {
    const d = { ...exportData }; delete d.v;
    expect(validateLibrary(d).ok).toBe(true);
  });
  it('rejects an unknown version', () => {
    const r = validateLibrary({ ...exportData, v: 2 });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('إصدار');
  });
  it('rejects chapters:[null]', () => {
    const r = validateLibrary({ ...exportData, items: [{ ...item, chapters: [null] }] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('الفصل ليس كائنًا');
  });
  it('rejects a malformed card and a malformed conversation', () => {
    const badCard = { ...exportData, kv: [{ k: 'cards', v: { x: { stage: '0' } } }] };
    expect(validateLibrary(badCard).ok).toBe(false);
    const badChat = { ...exportData, kv: [{ k: 'chat:lib', v: [{ id: 'c', t: 1, msgs: [{ role: 'tool', content: 'x' }] }] }] };
    expect(validateLibrary(badChat).ok).toBe(false);
  });
});

describe('planLibraryImport', () => {
  it('plans a full import and decodes figures in phase 1', () => {
    const r = planLibraryImport(exportData, {}, () => ({ blob: true }));
    expect(r.ok).toBe(true);
    expect(r.writes.items).toHaveLength(1);
    expect(r.writes.annos).toHaveLength(2);
    expect(r.writes.kv.find(x => x.k.startsWith('fig:')).v).toEqual({ blob: true });
  });

  it('rejects a syntactically valid but undecodable figure and writes nothing', () => {
    const r = planLibraryImport(exportData, {}, () => { throw new Error('bad base64'); });
    expect(r.ok).toBe(false);
    expect(r.writes).toBe(null);
    expect(r.errors.join(' ')).toContain('تعذّر فك الصورة');
  });

  it('counts duplicates by id and by content hash', () => {
    const existing = {
      items: [{ id: 'book-1', hash: 'h1' }],
      annos: [{ id: 'a1' }],
      kv: new Map([['f:book-1:c0:predict', 'قديم']])
    };
    const d = {
      ...exportData,
      items: [item, { ...item, id: 'book-2', hash: 'h1' }, { ...item, id: 'book-3', hash: 'h3' }],
      kv: exportData.kv.map(x => x.k === 'f:book-1:c0:predict' ? { ...x } : x)
    };
    const r = planLibraryImport(d, existing, () => ({}));
    expect(r.ok).toBe(true);
    expect(r.writes.items.map(x => x.id)).toEqual(['book-3']);
    expect(r.writes.annos.map(x => x.id)).toEqual(['a2']);
    expect(r.skipped).toBeGreaterThanOrEqual(4);
  });

  it('merges cards and conversations additively and keeps existing keys', () => {
    const existing = {
      items: [], annos: [],
      kv: new Map([
        ['cards', { old: { stage: 1, due: 1 } }],
        ['chat:lib', [{ id: 'c1', t: 1, msgs: [] }]],
        ['log', { '2026-11-10': 60 }]
      ])
    };
    const d = {
      ...exportData,
      items: [], annos: [],
      kv: [
        { k: 'cards', v: { old: { stage: 2, due: 2 }, new: { stage: 0, due: 0 } } },
        { k: 'chat:lib', v: [{ id: 'c1', t: 1, msgs: [] }, { id: 'c2', t: 2, msgs: [] }] },
        { k: 'log', v: { '2026-11-10': 999 } }
      ]
    };
    const r = planLibraryImport(d, existing, () => null);
    expect(r.ok).toBe(true);
    expect(r.writes.kv.find(x => x.k === 'cards').v.old.stage).toBe(1);
    expect(r.writes.kv.find(x => x.k === 'cards').v.new.stage).toBe(0);
    expect(r.writes.kv.find(x => x.k === 'chat:lib').v.map(c => c.id)).toEqual(['c1', 'c2']);
    expect(r.writes.kv.some(x => x.k === 'log')).toBe(false);
  });
});
