// OCR page storage (PR4): the ocrPages IndexedDB store plus atomic book-progress
// writes. Records are keyed by scanPageId(bookId, pageIndex); every page write
// also sets the book's absolute ocr.done count in the same transaction, so the
// count can never drift from the records.
import { scanPageId } from './scan-save.js';

/** Engine tag written on every record (PR3 self-hosted Tesseract, ara fast). */
export const OCR_ENGINE_TAG = 'tesseract.js-7.0.0/ara-fast';

/** UI copy shared with the app and asserted by tests (Saudi tone, short). */
export const OCR_FAILED_LINE = 'تعذّرت قراءة هذه الصفحة.';
export const OCR_CHAT_LABEL = 'نص الكتاب مقروء آليًا من صور الصفحات على جهازك، وقد يحتوي أخطاء خصوصًا في التشكيل.';
export const OCR_BOOK_DISCLOSURE = 'النص مقروء آليًا من صور الصفحات وقد يحتوي أخطاء، خصوصًا في التشكيل. التعرّف: Tesseract على جهازك.';
export const OCR_EXPORT_NOTICE = 'ملف الـPDF الأصلي للكتب الممسوحة ما ينضم للتصدير، بس نصها المقروء آليًا ينضم.';
export const OCR_DEFAULT_MS_PER_PAGE = 400;
export const OCR_FIRST_DOWNLOAD_MB = 4.6;

/** Honest, approximate time estimate from measured ms/page. */
export function ocrTimeEstimate(pages, avgMs = OCR_DEFAULT_MS_PER_PAGE) {
  const total = Math.max(1, Math.round((pages || 0) * (avgMs || OCR_DEFAULT_MS_PER_PAGE) / 1000));
  if (total < 60) return total + ' ثانية';
  const m = Math.round(total / 60);
  return m + (m === 1 ? ' دقيقة' : ' دقايق');
}

/** Additive upgrade (v2 -> v3): create the store with a bookId index if missing. */
export function ensureOcrPagesStore(db) {
  if (db.objectStoreNames.contains('ocrPages')) return;
  const store = db.createObjectStore('ocrPages', { keyPath: 'id' });
  store.createIndex('bookId', 'bookId', { unique: false });
}

export function getOcrPage(db, id) {
  return new Promise(resolve => {
    let tx;
    try { tx = db.transaction('ocrPages', 'readonly'); } catch (e) { resolve(null); return; }
    const q = tx.objectStore('ocrPages').get(id);
    q.onsuccess = () => resolve(q.result || null);
    q.onerror = () => resolve(null);
  });
}

export function getAllPages(db, bookId) {
  return new Promise(resolve => {
    let tx;
    try { tx = db.transaction('ocrPages', 'readonly'); } catch (e) { resolve([]); return; }
    const q = tx.objectStore('ocrPages').getAll();
    q.onsuccess = () => resolve((q.result || []).filter(r => r && r.bookId === bookId));
    q.onerror = () => resolve([]);
  });
}

/** One transaction: page record + the book with its absolute ocr.done count. */
export function putOcrPageAndBook(db, rec, bookId, done) {
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(['ocrPages', 'items'], 'readwrite'); } catch (e) { reject(e); return; }
    let settled = false;
    const fail = e => { if (settled) return; settled = true; reject(e); };
    tx.onabort = tx.onerror = () => fail(tx.error || new Error('idb'));
    tx.oncomplete = () => { if (!settled) { settled = true; resolve(); } };
    const bookReq = tx.objectStore('items').get(bookId);
    bookReq.onsuccess = () => {
      const it = bookReq.result;
      if (!it || !it.ocr) { try { tx.abort(); } catch (e) {} return fail(new Error('no-book')); }
      it.ocr.done = done; // absolute count: never drifts
      try {
        tx.objectStore('ocrPages').put(rec);
        tx.objectStore('items').put(it);
      } catch (e) { try { tx.abort(); } catch (_) {} fail(e); }
    };
    bookReq.onerror = () => fail(bookReq.error || new Error('idb'));
  });
}

export function getBook(db, id) {
  return new Promise(resolve => {
    let tx;
    try { tx = db.transaction('items', 'readonly'); } catch (e) { resolve(null); return; }
    const q = tx.objectStore('items').get(id);
    q.onsuccess = () => resolve(q.result || null);
    q.onerror = () => resolve(null);
  });
}

export function putBook(db, it) {
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction('items', 'readwrite'); } catch (e) { reject(e); return; }
    let settled = false;
    tx.oncomplete = () => { if (!settled) { settled = true; resolve(); } };
    tx.onabort = tx.onerror = () => { if (!settled) { settled = true; reject(tx.error || new Error('idb')); } };
    try { tx.objectStore('items').put(it); } catch (e) { try { tx.abort(); } catch (_) {} reject(e); }
  });
}

/** Delete every ocrPages record of a book (via the bookId index). */
export function delOcrPagesForBook(db, bookId) {
  return new Promise(resolve => {
    if (!db.objectStoreNames.contains('ocrPages')) { resolve(0); return; }
    let tx;
    try { tx = db.transaction('ocrPages', 'readwrite'); } catch (e) { resolve(0); return; }
    let n = 0, settled = false;
    const done = v => { if (settled) return; settled = true; resolve(v); };
    tx.oncomplete = () => done(n);
    tx.onabort = tx.onerror = () => done(0);
    const idx = tx.objectStore('ocrPages').index('bookId');
    const range = typeof IDBKeyRange !== 'undefined' ? IDBKeyRange.only(bookId) : bookId; // Node tests: plain value
    const c = idx.openKeyCursor(range);
    c.onsuccess = () => {
      const cur = c.result;
      if (!cur) return;
      n++;
      tx.objectStore('ocrPages').delete(cur.primaryKey);
      cur.continue();
    };
    c.onerror = () => done(0);
  });
}

/** Orphan sweep: remove ocrPages whose book no longer exists. Returns removed count. */
export function sweepOcrPages(db, existingBookIds) {
  return new Promise(resolve => {
    if (!db.objectStoreNames.contains('ocrPages')) { resolve(0); return; }
    let tx;
    try { tx = db.transaction('ocrPages', 'readwrite'); } catch (e) { resolve(0); return; }
    const store = tx.objectStore('ocrPages');
    const q = store.getAll();
    let removed = 0, settled = false;
    const done = n => { if (settled) return; settled = true; resolve(n); };
    tx.oncomplete = () => done(removed);
    tx.onabort = tx.onerror = () => done(0);
    q.onsuccess = () => {
      const dead = (q.result || []).filter(r => r && !existingBookIds.has(r.bookId));
      for (const r of dead) store.delete(r.id);
      removed = dead.length;
    };
    q.onerror = () => done(0);
  });
}

/** The store surface the runner uses (db injected by the app). */
export function makeOcrStore(db) {
  return {
    getBook: id => getBook(db, id),
    putBook: it => putBook(db, it),
    getOcrPage: id => getOcrPage(db, id),
    getAllPages: bookId => getAllPages(db, bookId),
    putOcrPageAndBook: (rec, bookId, done) => putOcrPageAndBook(db, rec, bookId, done)
  };
}

export { scanPageId };
