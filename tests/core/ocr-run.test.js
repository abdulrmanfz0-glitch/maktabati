// PR4 OCR runner unit tests: resume, idempotency, locking, retries, error stops,
// oom scale-down, quota pause, deterministic merge, delete, and the v2->v3 upgrade.
import { describe, it, expect } from 'vitest';
import { createOcrRunner, mergeOcrBook, OcrRunError } from '../../apps/web/src/core/ocr-run.js';
import { scanPageId, scanBookFields } from '../../apps/web/src/core/scan-save.js';
import { ensureStores } from '../../apps/web/src/core/scan-save.js';
import { ensureOcrPagesStore, putOcrPageAndBook, delOcrPagesForBook, getOcrPage, getAllPages, putBook, getBook } from '../../apps/web/src/core/ocr-store.js';

// ---- minimal IndexedDB-shaped fake (items + ocrPages with bookId index) ----
function fakeDb() {
  const stores = new Map();
  const db = {
    failOnPut: null,
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
      const tx = {
        error: null, aborted: false,
        abort() { this.aborted = true; },
        objectStore(n) {
          const st = stores.get(n);
          const reindex = v => {
            for (const [name, idx] of st.indexes) {
              const k = v[idx.keyPath];
              if (!idx.values.has(k)) idx.values.set(k, new Set());
              idx.values.get(k).add(v[st.keyPath]);
            }
          };
          const unindex = v => {
            for (const [name, idx] of st.indexes) {
              const k = v[idx.keyPath];
              const s = idx.values.get(k);
              if (s) { s.delete(v[st.keyPath]); if (!s.size) idx.values.delete(k); }
            }
          };
          const req = (val, extra) => {
            const q = Object.assign({ result: val, onsuccess: null, onerror: null }, extra);
            queueMicrotask(() => q.onsuccess && q.onsuccess());
            return q;
          };
          return {
            get(id) { return req(st.rows.get(id) === undefined ? undefined : structuredClone(st.rows.get(id))); },
            getAll() { return req([...st.rows.values()].map(v => structuredClone(v))); },
            put(v) {
              if (db.failOnPut && db.failOnPut(n, v)) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
              const old = st.rows.get(v[st.keyPath]);
              if (old) unindex(old);
              st.rows.set(v[st.keyPath], structuredClone(v)); // IDB serializes: no shared references
              reindex(v);
            },
            delete(id) { const old = st.rows.get(id); if (old) unindex(old); st.rows.delete(id); },
            index(name) {
              const idx = st.indexes.get(name);
              return {
                openKeyCursor(range) {
                  const keys = [...((idx && idx.values.get(range)) || [])].sort();
                  let i = 0;
                  const c = { result: null, onsuccess: null, onerror: null };
                  const step = () => {
                    if (i < keys.length) { c.result = { primaryKey: keys[i++], continue: () => queueMicrotask(step) }; }
                    else c.result = null;
                    c.onsuccess && c.onsuccess();
                  };
                  queueMicrotask(step);
                  return c;
                }
              };
            }
          };
        }
      };
      setTimeout(() => { if (!tx.aborted && tx.oncomplete) tx.oncomplete(); }, 0);
      return tx;
    }
  };
  return db;
}

// ---- fake engine ----
function fakeEngine(behavior) {
  const calls = [];
  const engine = {
    calls,
    async renderPage(bytes, page, opts) {
      calls.push({ kind: 'render', page, dpi: opts.dpi });
      const fail = behavior && behavior.fail && behavior.fail('render', page, opts.dpi);
      if (fail) { const e = new Error(fail.msg || 'x'); e.code = fail.code; throw e; }
      return { canvas: { width: 100, height: 100 } };
    },
    async ocrPage(canvas, opts) {
      calls.push({ kind: 'ocr', canvas });
      const fail = behavior && behavior.fail && behavior.fail('ocr', canvas);
      if (fail) { const e = new Error(fail.msg || 'x'); e.code = fail.code; throw e; }
      return { text: 'نص الصفحة', confidence: 80, ms: 5 };
    }
  };
  return engine;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const book = (pages = 5, over = {}) => Object.assign({ id: 'b1', title: 'كتاب ممسوح', type: 'book', chapters: [] }, scanBookFields(pages), over);
const rec = (page, over = {}) => Object.assign({ id: scanPageId('b1', page), bookId: 'b1', page, text: 'نص الصفحة', confidence: 80, ms: 5, engine: 'tesseract.js-7.0.0/ara-fast', status: 'done', at: 1 }, over);
const deps = (db, engine, extra = {}) => Object.assign({ store: { getBook: id => getBook(db, id), putBook: it => putBook(db, it), getOcrPage: id => getOcrPage(db, id), getAllPages: id => getAllPages(db, id), putOcrPageAndBook: (r, id, d) => putOcrPageAndBook(db, r, id, d) }, engine, now: () => 1 }, extra);

async function seedDone(db, n) { for (let p = 1; p <= n; p++) await putOcrPageAndBook(db, rec(p), 'b1', p); }

describe('runner: resume and idempotency', () => {
  it('skips done pages and processes only the missing ones', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', files: 'id' });
    ensureOcrPagesStore(db);
    await putBook(db, book(5));
    await seedDone(db, 2); // pages 1-2 done
    const engine = fakeEngine();
    const r = await createOcrRunner(deps(db, engine)).run('b1', new Uint8Array(1));
    expect(r).toEqual({ stopped: false, done: 5, total: 5 });
    expect(engine.calls.filter(c => c.kind === 'render').map(c => c.page)).toEqual([3, 4, 5]);
    expect((await getAllPages(db, 'b1')).length).toBe(5);
    expect((await getBook(db, 'b1')).ocr.status).toBe('done');
  }, 15000);
  it('re-running after completion does no work and adds no duplicates', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', files: 'id' });
    ensureOcrPagesStore(db);
    await putBook(db, book(5));
    const engine = fakeEngine();
    await createOcrRunner(deps(db, engine)).run('b1', new Uint8Array(1));
    const afterFirst = (await getAllPages(db, 'b1')).length;
    await createOcrRunner(deps(db, engine)).run('b1', new Uint8Array(1));
    expect(engine.calls.filter(c => c.kind === 'render').length).toBe(5); // still only the first run
    expect((await getAllPages(db, 'b1')).length).toBe(afterFirst);
    expect((await getBook(db, 'b1')).ocr.done).toBe(5);
  }, 15000);
  it('a completed book returns immediately', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', files: 'id' });
    ensureOcrPagesStore(db);
    await putBook(db, Object.assign(book(5), { ocr: { status: 'done', pages: 5, done: 5 } }));
    const engine = fakeEngine();
    const r = await createOcrRunner(deps(db, engine)).run('b1', new Uint8Array(1));
    expect(r.done).toBe(5);
    expect(engine.calls.length).toBe(0);
  }, 15000);
});

describe('runner: single runner per book', () => {
  it('Web Locks: a held lock makes the second runner fail with busy', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', files: 'id' });
    ensureOcrPagesStore(db);
    await putBook(db, book(2));
    const locks = { request: (name, opts, cb) => cb(null) }; // lock already held
    const engine = fakeEngine();
    await expect(createOcrRunner(deps(db, engine, { locks })).run('b1', new Uint8Array(1))).rejects.toMatchObject({ name: 'OcrRunError', code: 'busy' });
  }, 15000);
  it('lease fallback: a taken lease blocks, and release is called after a run', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', files: 'id' });
    ensureOcrPagesStore(db);
    await putBook(db, book(2));
    const engine = fakeEngine();
    let taken = true, releases = 0;
    const lease = { tryAcquire: async () => { if (taken) return false; taken = true; return true; }, release: async () => { taken = false; releases++; } };
    const runner = createOcrRunner(deps(db, engine, { lease }));
    await expect(runner.run('b1', new Uint8Array(1))).rejects.toMatchObject({ code: 'busy' });
    taken = false; // the other tab finished
    const r = await runner.run('b1', new Uint8Array(1));
    expect(r.done).toBe(2);
    expect(releases).toBe(1);
  }, 15000);
});

describe('runner: language', () => {
  it('threads lang to setLang and tags records per language', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', files: 'id' });
    ensureOcrPagesStore(db);
    await putBook(db, book(2));
    const engine = fakeEngine();
    const langs = [];
    engine.setLang = async l => { langs.push(l); };
    await createOcrRunner(deps(db, engine)).run('b1', new Uint8Array(1), { lang: 'eng' });
    expect(langs).toEqual(['eng']);
    const recs = await getAllPages(db, 'b1');
    expect(recs.map(r => r.engine)).toEqual(['tesseract.js-7.0.0/eng-fast', 'tesseract.js-7.0.0/eng-fast']);
  }, 15000);
  it('autoLang probes page 1 and switches language when the script differs', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', files: 'id' });
    ensureOcrPagesStore(db);
    await putBook(db, book(2));
    const engine = fakeEngine();
    const langs = [];
    engine.setLang = async l => { langs.push(l); };
    engine.ocrPage = async () => ({ text: 'This is a full page of English text with enough words to classify the script.', confidence: 80, ms: 5 });
    await createOcrRunner(deps(db, engine)).run('b1', new Uint8Array(1), { lang: 'ara', autoLang: true });
    expect(langs).toEqual(['ara', 'eng']); // configured ara, then corrected by the probe
    const recs = await getAllPages(db, 'b1');
    expect(recs.map(r => r.engine)).toEqual(['tesseract.js-7.0.0/eng-fast', 'tesseract.js-7.0.0/eng-fast']);
  }, 15000);
  it('uses a custom engineTag when provided', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', files: 'id' });
    ensureOcrPagesStore(db);
    await putBook(db, book(1));
    const engine = fakeEngine();
    await createOcrRunner(deps(db, engine)).run('b1', new Uint8Array(1), { engineTag: 'cloud' });
    const rec = await getOcrPage(db, scanPageId('b1', 1));
    expect(rec.engine).toBe('cloud');
  }, 15000);
});

describe('runner: failures and quota', () => {
  it('a page failing all attempts is saved failed and the run finishes', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', files: 'id' });
    ensureOcrPagesStore(db);
    await putBook(db, book(3));
    const engine = fakeEngine({ fail: (kind, page) => (kind === 'ocr' ? { code: 'engine', msg: 'boom' } : null) });
    const r = await createOcrRunner(deps(db, engine)).run('b1', new Uint8Array(1));
    expect(r.done).toBe(3);
    const p1 = await getOcrPage(db, scanPageId('b1', 1));
    expect(p1.status).toBe('failed');
    expect(p1.error).toBe('engine');
    expect(engine.calls.filter(c => c.kind === 'ocr').length).toBe(9); // 3 pages x 3 attempts
  }, 15000);
  it('assets error stops the whole run with reason assets', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', files: 'id' });
    ensureOcrPagesStore(db);
    await putBook(db, book(4));
    const engine = fakeEngine({ fail: (kind, page) => (kind === 'render' && page === 2 ? { code: 'assets', msg: 'load failed' } : null) });
    const r = await createOcrRunner(deps(db, engine)).run('b1', new Uint8Array(1));
    expect(r).toMatchObject({ stopped: true, reason: 'assets', done: 1 });
    const b = await getBook(db, 'b1');
    expect(b.ocr.status).toBe('paused');
    expect(b.ocr.reason).toBe('assets');
    expect(engine.calls.filter(c => c.kind === 'render').map(c => c.page)).toEqual([1, 2]);
  }, 15000);
  it('oom retries once at a lower render scale', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', files: 'id' });
    ensureOcrPagesStore(db);
    await putBook(db, book(2));
    const engine = fakeEngine({ fail: (kind, page, dpi) => (kind === 'render' && dpi > 240 ? { code: 'oom', msg: 'memory' } : null) });
    const r = await createOcrRunner(deps(db, engine)).run('b1', new Uint8Array(1));
    expect(r.done).toBe(2);
    expect(engine.calls.filter(c => c.kind === 'render' && c.page === 1).map(c => c.dpi)).toEqual([300, 225]);
  }, 15000);
  it('quota error on a page write pauses with reason space and writes nothing partial', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', files: 'id' });
    ensureOcrPagesStore(db);
    await putBook(db, book(3));
    await seedDone(db, 1);
    const engine = fakeEngine();
    db.failOnPut = (n, v) => n === 'ocrPages';
    const r = await createOcrRunner(deps(db, engine)).run('b1', new Uint8Array(1));
    expect(r).toMatchObject({ stopped: true, reason: 'space', done: 1 });
    const b = await getBook(db, 'b1');
    expect(b.ocr.status).toBe('paused');
    expect(b.ocr.reason).toBe('space');
    expect(b.ocr.done).toBe(1); // the failed write rolled back: count unchanged
    expect((await getAllPages(db, 'b1')).length).toBe(1);
  }, 15000);
});

describe('mergeOcrBook (deterministic)', () => {
  const records = [rec(1), rec(2, { text: 'سطر أول\nسطر ثانٍ\n\nفقرة ثانية', status: 'done' }), rec(3, { status: 'failed', text: '', error: 'engine' })];
  it('same records produce identical chapters on every call', () => {
    const b = book(3);
    expect(mergeOcrBook(b, records)).toEqual(mergeOcrBook(b, records));
  });
  it('keeps page markers, joins line breaks, and puts a placeholder on failed pages', () => {
    const out = mergeOcrBook(book(3), records);
    expect(out.ocr.status).toBe('done');
    expect(out.chapters.length).toBe(1);
    const sections = out.chapters[0].sections;
    expect(sections.map(s => s.title)).toEqual(['صفحة 1', 'صفحة 2', 'صفحة 3']);
    expect(sections[1].blocks.map(x => x.text)).toEqual(['سطر أول سطر ثانٍ', 'فقرة ثانية']);
    expect(sections[1].blocks[0].page).toBe(2);
    expect(sections[2].blocks[0].text).toBe('تعذّرت قراءة هذه الصفحة.');
    expect(sections[2].blocks[0].page).toBe(3);
  });
});

describe('storage and upgrade', () => {
  it('delete removes only that book pages (index path)', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', files: 'id' });
    ensureOcrPagesStore(db);
    await putBook(db, book(3));
    await putBook(db, Object.assign(book(3), { id: 'b2' }));
    await putOcrPageAndBook(db, Object.assign(rec(1), { id: scanPageId('b1', 1) }), 'b1', 1);
    await putOcrPageAndBook(db, Object.assign(rec(1), { id: scanPageId('b2', 1), bookId: 'b2' }), 'b2', 1);
    expect(await delOcrPagesForBook(db, 'b1')).toBe(1);
    expect((await getAllPages(db, 'b1')).length).toBe(0);
    expect((await getAllPages(db, 'b2')).length).toBe(1);
  }, 15000);
  it('v2 -> v3 upgrade adds ocrPages and keeps existing stores', async () => {
    const db = fakeDb();
    ensureStores(db, { items: 'id', annos: 'id', kv: 'k', files: 'id' }); // v2 shape
    ensureOcrPagesStore(db); // v3 addition
    expect(db.objectStoreNames.contains('items')).toBe(true);
    expect(db.objectStoreNames.contains('kv')).toBe(true);
    expect(db.objectStoreNames.contains('ocrPages')).toBe(true);
    await putBook(db, book(2));
    const b = await getBook(db, 'b1');
    expect(b.ocr.pages).toBe(2); // existing data untouched
    const created = [];
    const orig = db.createObjectStore;
    db.createObjectStore = (n, spec) => { created.push(n); orig(n, spec); };
    ensureOcrPagesStore(db);
    expect(created).toEqual([]); // no recreation
  }, 15000);
});
