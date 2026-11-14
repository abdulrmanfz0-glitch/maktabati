// PR2 scanned-book saving: save decision, record shape, atomic IDB writes with
// QuotaExceededError rollback, delete, orphan sweep, and additive DB upgrades.
import { describe, it, expect } from 'vitest';
import {
  scanPageId, scannedSaveAllowed, scanBookFields, isPendingScan,
  ensureStores, quotaAllows, saveScannedBook, deleteScannedFile, sweepOrphanFiles
} from '../../apps/web/src/core/scan-save.js';

// Minimal IndexedDB-shaped fake: same surface the store helpers use.
function fakeDb(stores = {}) {
  const data = new Map(Object.entries(stores).map(([n, spec]) => [n, { keyPath: spec, rows: new Map() }]));
  const db = {
    failOnPut: null,
    objectStoreNames: { contains: n => data.has(n) },
    createObjectStore(n, spec) { data.set(n, { keyPath: spec.keyPath, rows: new Map() }); },
    transaction(names) {
      const list = Array.isArray(names) ? names : [names];
      for (const n of list) if (!data.has(n)) throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' });
      const ops = [];
      const tx = {
        error: null,
        aborted: false,
        abort() { this.aborted = true; },
        objectStore(n) {
          return {
            put(v) {
              if (db.failOnPut && db.failOnPut(n, v)) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
              ops.push(['put', n, v]);
            },
            delete(id) { ops.push(['del', n, id]); },
            getAll() {
              const q = { result: null, onsuccess: null, onerror: null };
              queueMicrotask(() => { q.result = [...data.get(n).rows.values()]; q.onsuccess && q.onsuccess(); });
              return q;
            }
          };
        }
      };
      // Macrotask: like a real transaction, requests (microtasks) complete first.
      setTimeout(() => {
        if (tx.aborted) return;
        for (const [op, n, v] of ops) {
          const st = data.get(n);
          if (op === 'put') {
            if (db.failOnPut && db.failOnPut(n, v)) { tx.error = Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); tx.onabort && tx.onabort(); return; }
            st.rows.set(v[st.keyPath], v);
          } else st.rows.delete(v);
        }
        tx.oncomplete && tx.oncomplete();
      }, 0);
      return tx;
    }
  };
  return db;
}
const all = (db, n) => new Promise(res => { const q = db.transaction(n, 'readonly').objectStore(n).getAll(); q.onsuccess = () => res(q.result); });

describe('scannedSaveAllowed (decision)', () => {
  const rep = share => ({ kind: 'pdf', scanned: { pages: 3, share } });
  it('allows a scanned PDF at and above the vision share threshold', () => {
    expect(scannedSaveAllowed('pdf', rep(0.5))).toBe(true);
    expect(scannedSaveAllowed('pdf', rep(0.51))).toBe(true);
    expect(scannedSaveAllowed('pdf', rep(1))).toBe(true);
  });
  it('refuses below the threshold (mixed books stay refused)', () => {
    expect(scannedSaveAllowed('pdf', rep(0.49))).toBe(false);
    expect(scannedSaveAllowed('pdf', rep(0))).toBe(false);
  });
  it('refuses non-PDF kinds and missing reports', () => {
    expect(scannedSaveAllowed('epub', rep(1))).toBe(false);
    expect(scannedSaveAllowed('pdf', null)).toBe(false);
    expect(scannedSaveAllowed('pdf', {})).toBe(false);
  });
});

describe('record shape', () => {
  it('scanBookFields marks source and pending OCR with page count', () => {
    expect(scanBookFields(12)).toEqual({ source: 'scan', ocr: { status: 'pending', pages: 12, done: 0 } });
    expect(scanBookFields(0).ocr.pages).toBe(0);
  });
  it('scanBookFields records the cloud mode only when requested', () => {
    expect(scanBookFields(12).ocr.mode).toBeUndefined();
    expect(scanBookFields(12, 'local').ocr.mode).toBeUndefined();
    expect(scanBookFields(12, 'cloud').ocr.mode).toBe('cloud');
  });
  it('isPendingScan detects the marker', () => {
    expect(isPendingScan(Object.assign({ id: 'b1' }, scanBookFields(3)))).toBe(true);
    expect(isPendingScan({ id: 'b2' })).toBe(false);
    expect(isPendingScan({ source: 'scan', ocr: { status: 'done' } })).toBe(false);
  });
  it('scanPageId is stable: bookId + PDF page index', () => {
    expect(scanPageId('abc', 1)).toBe('abc:1');
    expect(scanPageId('abc', 12)).toBe('abc:12');
    expect(scanPageId('abc', 12)).toBe(scanPageId('abc', 12));
  });
});

describe('ensureStores (additive upgrade)', () => {
  it('creates only missing stores with the right keyPaths (v1 -> v2)', async () => {
    const db = fakeDb({ items: 'id', annos: 'id', kv: 'k' }); // v1 shape
    ensureStores(db, { items: 'id', annos: 'id', kv: 'k', files: 'id' });
    expect(db.objectStoreNames.contains('items')).toBe(true);
    expect(db.objectStoreNames.contains('annos')).toBe(true);
    expect(db.objectStoreNames.contains('kv')).toBe(true);
    expect(db.objectStoreNames.contains('files')).toBe(true);
    expect(await all(db, 'files')).toEqual([]); // new store is empty, existing ones untouched
  });
  it('does not recreate existing stores', () => {
    const db = fakeDb({ items: 'id', files: 'id' });
    const created = [];
    const orig = db.createObjectStore;
    db.createObjectStore = (n, spec) => { created.push(n); orig(n, spec); };
    ensureStores(db, { items: 'id', files: 'id', kv: 'k' });
    expect(created).toEqual(['kv']);
  });
});

describe('quotaAllows', () => {
  it('fails when the file cannot fit the remaining quota', () => {
    expect(quotaAllows({ usage: 900, quota: 1000 }, 200)).toBe(false);
    expect(quotaAllows({ usage: 900, quota: 1000 }, 100)).toBe(true);
  });
  it('passes when the estimate is unavailable (never blocks)', () => {
    expect(quotaAllows(null, 1e9)).toBe(true);
    expect(quotaAllows({}, 1e9)).toBe(true);
  });
});

describe('saveScannedBook (atomic)', () => {
  const item = Object.assign({ id: 'b1', title: 'س', type: 'book', chapters: [] }, scanBookFields(5));
  it('commits book and bytes together', async () => {
    const db = fakeDb({ items: 'id', files: 'id' });
    const r = await saveScannedBook(db, item, new Uint8Array([1, 2, 3]));
    expect(r).toEqual({ ok: true });
    expect((await all(db, 'items')).map(x => x.id)).toEqual(['b1']);
    expect((await all(db, 'files')).map(x => x.id)).toEqual(['b1']);
  });
  it('rolls back everything on QuotaExceededError (sync throw)', async () => {
    const db = fakeDb({ items: 'id', files: 'id' });
    db.failOnPut = (n, v) => n === 'files' && v.bytes.length > 10;
    const r = await saveScannedBook(db, item, new Uint8Array(50));
    expect(r).toEqual({ ok: false, reason: 'space' });
    expect(await all(db, 'items')).toEqual([]); // no orphan book
    expect(await all(db, 'files')).toEqual([]); // no orphan bytes
  });
  it('reports space when the transaction aborts with QuotaExceededError', async () => {
    const db = fakeDb({ items: 'id', files: 'id' });
    db.failOnPut = (n, v) => n === 'files';
    const r = await saveScannedBook(db, item, new Uint8Array(3));
    expect(r).toEqual({ ok: false, reason: 'space' });
  });
  it('reports db failure when the files store is missing', async () => {
    const db = fakeDb({ items: 'id' });
    const r = await saveScannedBook(db, item, new Uint8Array(3));
    expect(r).toEqual({ ok: false, reason: 'db' });
  });
});

describe('delete and orphan sweep', () => {
  it('deleteScannedFile removes that book bytes', async () => {
    const db = fakeDb({ items: 'id', files: 'id' });
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put({ id: 'a', bytes: new Uint8Array(1) });
    tx.objectStore('files').put({ id: 'b', bytes: new Uint8Array(2) });
    await new Promise(r => setTimeout(r, 5));
    expect(await deleteScannedFile(db, 'a')).toBe(true);
    expect((await all(db, 'files')).map(f => f.id)).toEqual(['b']);
  });
  it('deleteScannedFile tolerates a missing files store', async () => {
    expect(await deleteScannedFile(fakeDb({ items: 'id' }), 'x')).toBe(true);
  });
  it('sweepOrphanFiles removes bytes whose book is gone and keeps the rest', async () => {
    const db = fakeDb({ items: 'id', files: 'id' });
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put({ id: 'keep', bytes: new Uint8Array(1) });
    tx.objectStore('files').put({ id: 'dead', bytes: new Uint8Array(2) });
    await new Promise(r => setTimeout(r, 5));
    const removed = await sweepOrphanFiles(db, new Set(['keep']));
    expect(removed).toBe(1);
    expect((await all(db, 'files')).map(f => f.id)).toEqual(['keep']);
  });
  it('sweepOrphanFiles tolerates a missing files store', async () => {
    expect(await sweepOrphanFiles(fakeDb({ items: 'id' }), new Set())).toBe(0);
  });
});
