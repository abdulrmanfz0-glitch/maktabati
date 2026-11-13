// PR5 OCR UX helpers: persist-once, lock checks, time estimates, shared copy,
// mem/IDB sync under stale writes, onlyFailed retries, and single-PDF-open runs.
import { describe, it, expect } from 'vitest';
import { persistOnce, ocrLockHeld, scanBookFields } from '../../apps/web/src/core/scan-save.js';
import { ocrTimeEstimate, OCR_DEFAULT_MS_PER_PAGE, OCR_FAILED_LINE, OCR_CHAT_LABEL, OCR_BOOK_DISCLOSURE, OCR_EXPORT_NOTICE, ensureOcrPagesStore, putOcrPageAndBook, getOcrPage, getAllPages, putBook, getBook } from '../../apps/web/src/core/ocr-store.js';
import { createOcrRunner, mergeOcrBook } from '../../apps/web/src/core/ocr-run.js';
import { scanPageId, ensureStores } from '../../apps/web/src/core/scan-save.js';

describe('persistOnce', () => {
  it('asks once and remembers the result', async () => {
    let asked = null, persistCalls = 0;
    const set = v => { asked = v; };
    const persist = () => { persistCalls++; return Promise.resolve(true); };
    const r1 = await persistOnce({ get: () => asked, set, persist });
    const r2 = await persistOnce({ get: () => asked, set, persist });
    expect(r1).toEqual(r2);
    expect(persistCalls).toBe(1);
    expect(asked.granted).toBe(true);
  });
  it('remembers a denial and never blocks', async () => {
    let asked = null;
    const r = await persistOnce({ get: () => asked, set: v => { asked = v; }, persist: () => Promise.reject(new Error('nope')) });
    expect(r.granted).toBe(false);
    expect(asked.granted).toBe(false);
  });
});

describe('ocrLockHeld', () => {
  it('detects a held lock by name', async () => {
    expect(await ocrLockHeld({ query: async () => ({ held: [{ name: 'ocr:b1' }, { name: 'x' }] }) }, 'b1')).toBe(true);
    expect(await ocrLockHeld({ query: async () => ({ held: [{ name: 'ocr:b2' }] }) }, 'b1')).toBe(false);
    expect(await ocrLockHeld({ query: async () => ({ held: [] }) }, 'b1')).toBe(false);
  });
  it('tolerates missing or throwing locks API', async () => {
    expect(await ocrLockHeld(null, 'b1')).toBe(false);
    expect(await ocrLockHeld(undefined, 'b1')).toBe(false);
    expect(await ocrLockHeld({ query: async () => { throw new Error('x'); } }, 'b1')).toBe(false);
  });
});

describe('time estimate and shared copy', () => {
  it('estimates seconds and minutes from measured ms/page', () => {
    expect(ocrTimeEstimate(80, 400)).toBe('32 ثانية');
    expect(ocrTimeEstimate(600, 400)).toBe('4 دقايق');
    expect(ocrTimeEstimate(1, 400)).toBe('1 ثانية');
    expect(ocrTimeEstimate(0)).toBe('1 ثانية');
  });
  it('shared Arabic copy exists and mentions the essentials', () => {
    expect(OCR_FAILED_LINE).toBe('تعذّرت قراءة هذه الصفحة.');
    expect(OCR_CHAT_LABEL).toContain('مقروء آليًا');
    expect(OCR_BOOK_DISCLOSURE).toContain('Tesseract');
    expect(OCR_EXPORT_NOTICE).toContain('الـPDF الأصلي');
    expect(OCR_DEFAULT_MS_PER_PAGE).toBeGreaterThan(0);
  });
});

// ---- fake IDB (items + ocrPages) and engine with openPdfDoc ----
function fakeDb() {
  const stores = new Map();
  const db = {
    objectStoreNames: { contains: n => stores.has(n) },
    createObjectStore(n, spec) {
      const st = { keyPath: spec.keyPath, rows: new Map(), indexes: new Map() };
      st.createIndex = (name, keyPath) => st.indexes.set(name, { keyPath, values: new Map() });
      stores.set(n, st);
      return st;
    },
    transaction(names) {
      const list = Array.isArray(names) ? names : [names];
      for (const n of list) if (!stores.has(n)) throw Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' });
      const tx = { error: null, aborted: false, abort() { this.aborted = true; }, objectStore(n) {
        const st = stores.get(n);
        const reindex = v => { for (const [name, idx] of st.indexes) { const k = v[idx.keyPath]; if (!idx.values.has(k)) idx.values.set(k, new Set()); idx.values.get(k).add(v[st.keyPath]); } };
        const unindex = v => { for (const [name, idx] of st.indexes) { const k = v[idx.keyPath]; const s = idx.values.get(k); if (s) { s.delete(v[st.keyPath]); if (!s.size) idx.values.delete(k); } } };
        const req = val => { const q = { result: val, onsuccess: null, onerror: null }; queueMicrotask(() => q.onsuccess && q.onsuccess()); return q; };
        return {
          get(id) { return req(st.rows.get(id) === undefined ? undefined : structuredClone(st.rows.get(id))); },
          getAll() { return req([...st.rows.values()].map(v => structuredClone(v))); },
          put(v) { const old = st.rows.get(v[st.keyPath]); if (old) unindex(old); st.rows.set(v[st.keyPath], structuredClone(v)); reindex(v); },
          delete(id) { const old = st.rows.get(id); if (old) unindex(old); st.rows.delete(id); },
          index(name) { const idx = st.indexes.get(name); return { openKeyCursor(range) {
            const keys = [...((idx && idx.values.get(range)) || [])].sort();
            let i = 0;
            const c = { result: null, onsuccess: null, onerror: null };
            const step = () => { if (i < keys.length) { c.result = { primaryKey: keys[i++], continue: () => queueMicrotask(step) }; } else c.result = null; c.onsuccess && c.onsuccess(); };
            queueMicrotask(step);
            return c;
          } }; }
        };
      } };
      setTimeout(() => { if (!tx.aborted && tx.oncomplete) tx.oncomplete(); }, 0);
      return tx;
    }
  };
  return db;
}
function fakeEngine(behavior) {
  const state = { opens: 0, closes: 0, renders: [], ocrs: 0 };
  const engine = {
    state,
    async openPdfDoc(bytes) {
      state.opens++;
      return {
        async renderPage(page, opts) {
          state.renders.push({ page, dpi: opts.dpi });
          const fail = behavior && behavior.fail && behavior.fail('render', page, opts.dpi);
          if (fail) { const e = new Error(fail.msg || 'x'); e.code = fail.code; throw e; }
          return { canvas: { width: 100, height: 100 } };
        },
        async close() { state.closes++; }
      };
    },
    async ocrPage(canvas, opts) {
      state.ocrs++;
      const fail = behavior && behavior.fail && behavior.fail('ocr', canvas);
      if (fail) { const e = new Error(fail.msg || 'x'); e.code = fail.code; throw e; }
      return { text: 'نص الصفحة', confidence: 80, ms: 350 };
    }
  };
  return engine;
}
const book = (pages = 3, over = {}) => Object.assign({ id: 'b1', title: 'كتاب ممسوح', type: 'book', chapters: [] }, scanBookFields(pages), over);
const deps = (db, engine, extra = {}) => Object.assign({
  store: { getBook: id => getBook(db, id), putBook: it => putBook(db, it), getOcrPage: id => getOcrPage(db, id), getAllPages: id => getAllPages(db, id), putOcrPageAndBook: (r, id, d) => putOcrPageAndBook(db, r, id, d) },
  engine, now: () => 1
}, extra);
const rec = (bookId, page, over = {}) => Object.assign({ id: scanPageId(bookId, page), bookId, page, text: 'نص الصفحة', confidence: 80, ms: 350, engine: 'tesseract.js-7.0.0/ara-fast', status: 'done', at: 1 }, over);

describe('single PDF open per run', () => {
  it('opens once, renders every page, and closes at the end', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', files: 'id' });
    ensureOcrPagesStore(db);
    await putBook(db, book(5));
    const engine = fakeEngine();
    const r = await createOcrRunner(deps(db, engine)).run('b1', new Uint8Array(1));
    expect(r.done).toBe(5);
    expect(engine.state.opens).toBe(1);
    expect(engine.state.closes).toBe(1);
    expect(engine.state.renders.map(x => x.page)).toEqual([1, 2, 3, 4, 5]);
  }, 15000);
  it('closes the document when aborted mid-run', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', files: 'id' });
    ensureOcrPagesStore(db);
    await putBook(db, book(5));
    const engine = fakeEngine();
    const ctrl = new AbortController();
    const run = createOcrRunner(deps(db, engine)).run('b1', new Uint8Array(1), { signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 30);
    const r = await run;
    expect(r.stopped).toBe(true);
    expect(engine.state.closes).toBe(1);
  }, 15000);
});

describe('mem/IDB sync under stale writes', () => {
  it('an app put mid-run with a stale ocr field never loses done or chapters', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', files: 'id' });
    ensureOcrPagesStore(db);
    await putBook(db, book(3));
    const engine = fakeEngine({ fail: () => null });
    // simulate an app-side stale write after page 1: whole-item put with done=0
    let afterFirst = false;
    const origPut = db.transaction.bind(db);
    const store = deps(db, engine).store;
    const wrapped = Object.assign({}, store, {
      putOcrPageAndBook: async (r, id, d) => {
        const out = await store.putOcrPageAndBook(r, id, d);
        if (d === 1 && !afterFirst) {
          afterFirst = true;
          const stale = Object.assign(book(3), { ocr: { status: 'pending', pages: 3, done: 0 } });
          await putBook(db, stale); // app-side whole-item write with a stale ocr
        }
        return out;
      }
    });
    const r = await createOcrRunner(Object.assign({}, deps(db, engine), { store: wrapped })).run('b1', new Uint8Array(1));
    expect(r.done).toBe(3);
    const b = await getBook(db, 'b1');
    expect(b.ocr.done).toBe(3); // the live record was read-modify-written, not clobbered
    expect(b.chapters.length).toBe(1); // merged chapters survive
  }, 15000);
});

describe('onlyFailed retries', () => {
  it('touches only failed pages and re-merges deterministically', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', files: 'id' });
    ensureOcrPagesStore(db);
    await putBook(db, Object.assign(book(3), { ocr: { status: 'done', pages: 3, done: 3 } }));
    await putOcrPageAndBook(db, rec('b1', 1), 'b1', 1);
    await putOcrPageAndBook(db, rec('b1', 2, { status: 'failed', text: '', error: 'engine' }), 'b1', 2);
    await putOcrPageAndBook(db, rec('b1', 3), 'b1', 3);
    const engine = fakeEngine();
    const r = await createOcrRunner(deps(db, engine)).run('b1', new Uint8Array(1), { onlyFailed: true });
    expect(r.done).toBe(3);
    expect(engine.state.renders.map(x => x.page)).toEqual([2]); // only the failed page
    const p2 = await getOcrPage(db, scanPageId('b1', 2));
    expect(p2.status).toBe('done');
    expect((await getAllPages(db, 'b1')).length).toBe(3); // no duplicates
    const b = await getBook(db, 'b1');
    expect(b.ocr.done).toBe(3);
    expect(mergeOcrBook(b, await getAllPages(db, 'b1'))).toEqual(mergeOcrBook(b, await getAllPages(db, 'b1')));
  }, 15000);
  it('a no-op when nothing failed', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', files: 'id' });
    ensureOcrPagesStore(db);
    await putBook(db, Object.assign(book(2), { ocr: { status: 'done', pages: 2, done: 2 } }));
    await putOcrPageAndBook(db, rec('b1', 1), 'b1', 1);
    await putOcrPageAndBook(db, rec('b1', 2), 'b1', 2);
    const engine = fakeEngine();
    const r = await createOcrRunner(deps(db, engine)).run('b1', new Uint8Array(1), { onlyFailed: true });
    expect(r.done).toBe(2);
    expect(engine.state.renders.length).toBe(0);
  }, 15000);
});
