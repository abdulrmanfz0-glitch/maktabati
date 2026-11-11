import { describe, it, expect } from 'vitest';
import {
  COL_PREFIX, FILTER_ALL, FILTER_UNFILED, MAX_NAME,
  collectionKey, idFromKey, isCollectionKey, cleanName,
  makeCollection, validateCollection, collectionsFromKv, sortCollections,
  hasBook, addBookToCollection, removeBookFromCollection, renameCollection,
  countCollectionBooks, collectionsOfBook, filterByCollection, removeBookFromAll
} from '../../apps/web/src/core/collections.js';

const col = (id, name, bookIds = [], createdAt = 1) => ({ id, name, createdAt, bookIds });
const map = pairs => new Map(pairs);

describe('cleanName', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanName('  تاريخ   الإسلام  ')).toBe('تاريخ الإسلام');
  });
  it('returns empty for blank input', () => {
    expect(cleanName('   ')).toBe('');
    expect(cleanName(null)).toBe('');
  });
  it('caps very long names', () => {
    expect(Array.from(cleanName('ا'.repeat(200))).length).toBe(MAX_NAME);
  });
});

describe('keys', () => {
  it('builds and reads collection keys', () => {
    expect(collectionKey('c1')).toBe(COL_PREFIX + 'c1');
    expect(isCollectionKey(COL_PREFIX + 'c1')).toBe(true);
    expect(isCollectionKey('cards')).toBe(false);
    expect(idFromKey(COL_PREFIX + 'c1')).toBe('c1');
    expect(idFromKey('chat:x')).toBe(null);
  });
});

describe('makeCollection', () => {
  it('builds the documented shape', () => {
    expect(makeCollection({ id: 'c1', name: '  تاريخ ', createdAt: 5 }))
      .toEqual({ id: 'c1', name: 'تاريخ', createdAt: 5, bookIds: [] });
  });
  it('dedupes book ids and ignores junk', () => {
    expect(makeCollection({ id: 'c1', name: 'علوم', bookIds: ['b1', 'b1', '', null, 7] }).bookIds)
      .toEqual(['b1']);
  });
  it('rejects an empty name or a missing id', () => {
    expect(makeCollection({ id: 'c1', name: '   ' })).toBe(null);
    expect(makeCollection({ id: '', name: 'تاريخ' })).toBe(null);
  });
});

describe('validateCollection', () => {
  it('accepts a full document and ignores unknown fields', () => {
    expect(validateCollection({ ...col('c1', 'تاريخ', ['b1']), extra: true })).toEqual([]);
  });
  it('reports missing or wrong fields', () => {
    expect(validateCollection(null)).toEqual(['not-an-object']);
    expect(validateCollection({ id: 'c1', name: '', createdAt: 1, bookIds: [] })).toContain('name');
    expect(validateCollection({ id: 'c1', name: 'تاريخ', createdAt: 'x', bookIds: [] })).toContain('createdAt');
    expect(validateCollection({ id: 'c1', name: 'تاريخ', createdAt: 1, bookIds: ['b1', 2] })).toContain('bookIds');
    expect(validateCollection({ id: '', name: 'تاريخ', createdAt: 1, bookIds: [] })).toContain('id');
  });
});

describe('collectionsFromKv', () => {
  it('reads only collection keys and takes the id from the key', () => {
    const kv = map([
      [collectionKey('c1'), col('stale-id', 'تاريخ', ['b1'])],
      ['cards', { x: 1 }],
      ['chat:b:1', []]
    ]);
    const list = collectionsFromKv(kv);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('c1');
    expect(list[0].name).toBe('تاريخ');
  });
  it('drops malformed records and normalises duplicates', () => {
    const kv = map([
      [collectionKey('bad1'), { name: 'بلا معرف', bookIds: [] }],
      [collectionKey('bad2'), { id: 'bad2', name: 'بلا تاريخ', bookIds: [] }],
      [collectionKey('c1'), col('c1', 'علوم', ['b1', 'b1'])],
      [collectionKey('c2'), 'not an object']
    ]);
    const list = collectionsFromKv(kv);
    expect(list.map(c => c.id)).toEqual(['c1']);
    expect(list[0].bookIds).toEqual(['b1']);
  });
  it('accepts an empty or missing entry list', () => {
    expect(collectionsFromKv()).toEqual([]);
    expect(collectionsFromKv(new Map())).toEqual([]);
  });
});

describe('sortCollections', () => {
  it('sorts by name and does not mutate the input', () => {
    const list = [col('c1', 'Science'), col('c2', 'History')];
    expect(sortCollections(list, 'en').map(c => c.name)).toEqual(['History', 'Science']);
    expect(list.map(c => c.name)).toEqual(['Science', 'History']);
  });
  it('sorts Arabic names by Arabic order', () => {
    const list = [col('c1', 'علوم'), col('c2', 'تاريخ')];
    expect(sortCollections(list, 'ar').map(c => c.name)).toEqual(['تاريخ', 'علوم']);
  });
  it('falls back to createdAt on equal names', () => {
    const list = [col('c1', 'تاريخ', [], 20), col('c2', 'تاريخ', [], 10)];
    expect(sortCollections(list, 'ar').map(c => c.id)).toEqual(['c2', 'c1']);
  });
});

describe('membership', () => {
  it('adds a book once and returns the same object on a repeat', () => {
    const c = col('c1', 'تاريخ');
    const one = addBookToCollection(c, 'b1');
    expect(one.bookIds).toEqual(['b1']);
    expect(addBookToCollection(one, 'b1')).toBe(one);
    expect(c.bookIds).toEqual([]);
  });
  it('removes a book and returns the same object when it is absent', () => {
    const c = col('c1', 'تاريخ', ['b1', 'b2']);
    expect(removeBookFromCollection(c, 'b1').bookIds).toEqual(['b2']);
    expect(removeBookFromCollection(c, 'b9')).toBe(c);
  });
  it('lets a book belong to several collections', () => {
    const list = [col('c1', 'تاريخ', ['b1']), col('c2', 'علوم', ['b1'])];
    expect(collectionsOfBook(list, 'b1').map(c => c.id)).toEqual(['c1', 'c2']);
    expect(hasBook(list[1], 'b1')).toBe(true);
  });
});

describe('renameCollection', () => {
  it('trims and keeps the rest of the document', () => {
    const c = col('c1', 'تاريخ', ['b1'], 3);
    expect(renameCollection(c, ' تاريخ ')).toBe(c);
    expect(renameCollection(c, 'تاريخ قديم')).toEqual({ id: 'c1', name: 'تاريخ قديم', createdAt: 3, bookIds: ['b1'] });
  });
  it('ignores an empty name', () => {
    const c = col('c1', 'تاريخ');
    expect(renameCollection(c, '  ')).toBe(c);
  });
});

describe('countCollectionBooks', () => {
  it('counts only books that exist', () => {
    const c = col('c1', 'تاريخ', ['b1', 'b2', 'gone']);
    expect(countCollectionBooks(c, new Set(['b1', 'b2']))).toBe(2);
    expect(countCollectionBooks(c, ['b1'])).toBe(1);
    expect(countCollectionBooks(c, new Set())).toBe(0);
  });
});

describe('filterByCollection', () => {
  const items = [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }];
  const list = [col('c1', 'تاريخ', ['b1', 'b2']), col('c2', 'علوم', ['b2'])];

  it('returns everything for all', () => {
    expect(filterByCollection(items, list, FILTER_ALL)).toBe(items);
    expect(filterByCollection(items, list)).toBe(items);
  });
  it('returns only members for a collection', () => {
    expect(filterByCollection(items, list, 'c1').map(i => i.id)).toEqual(['b1', 'b2']);
    expect(filterByCollection(items, list, 'c2').map(i => i.id)).toEqual(['b2']);
  });
  it('returns the books that are in no collection for unfiled', () => {
    expect(filterByCollection(items, list, FILTER_UNFILED).map(i => i.id)).toEqual(['b3']);
    expect(filterByCollection(items, [col('c1', 'تاريخ', ['b1', 'b2', 'b3'])], FILTER_UNFILED)).toEqual([]);
  });
  it('returns nothing for a filter that no longer exists', () => {
    expect(filterByCollection(items, list, 'c9')).toEqual([]);
  });
});

describe('removeBookFromAll', () => {
  it('returns only the collections that changed', () => {
    const list = [col('c1', 'تاريخ', ['b1', 'b2']), col('c2', 'علوم', ['b2']), col('c3', 'أدب', [])];
    const changed = removeBookFromAll(list, 'b1');
    expect(changed).toHaveLength(1);
    expect(changed[0].id).toBe('c1');
    expect(changed[0].bookIds).toEqual(['b2']);
  });
  it('returns an empty list when the book is in no collection', () => {
    expect(removeBookFromAll([col('c1', 'تاريخ', ['b2'])], 'b1')).toEqual([]);
  });
});
