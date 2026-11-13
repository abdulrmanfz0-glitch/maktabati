// Scanned-book saving: pure decision helpers plus IndexedDB operations that keep
// the book record and its source bytes atomic. No OCR, no network.
import { DETECTION_THRESHOLDS } from '@maktabati/ingest';

/** Stable per-page id (bookId + PDF page index); PR4 stores each page's OCR under it. */
export const scanPageId = (bookId, pageIndex) => bookId + ':' + pageIndex;

/** Only whole scanned PDFs are saved; every other 'vision' case stays refused. */
export function scannedSaveAllowed(kind, report) {
  return kind === 'pdf' && !!report && !!report.scanned && report.scanned.share >= DETECTION_THRESHOLDS.visionShare;
}

/** Marker written on the book record (no OCR text yet). */
export function scanBookFields(pages) {
  return { source: 'scan', ocr: { status: 'pending', pages: Number(pages) || 0, done: 0 } };
}

/** True while the book is a saved scan whose text has not been produced yet. */
export function isPendingScan(it) {
  return !!it && it.source === 'scan' && !!it.ocr && it.ocr.status === 'pending';
}

/** Create missing object stores only; existing stores are never touched (additive upgrade). */
export function ensureStores(db, specs) {
  for (const name of Object.keys(specs)) {
    if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: specs[name] });
  }
}

/** navigator.storage.estimate() pre-check: true when the bytes clearly fit. */
export function quotaAllows(estimate, bytes) {
  if (!estimate || typeof estimate.quota !== 'number' || typeof estimate.usage !== 'number') return true;
  return bytes <= estimate.quota - estimate.usage;
}

const isQuotaError = e => !!e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message || '')));

/**
 * Atomic save: the book record and its bytes commit together or not at all.
 * Resolves { ok, reason } — reason 'space' on QuotaExceededError, 'db' otherwise.
 */
export function saveScannedBook(db, item, bytes) {
  return new Promise(resolve => {
    let tx;
    try { tx = db.transaction(['items', 'files'], 'readwrite'); }
    catch (e) { resolve({ ok: false, reason: 'db' }); return; }
    let settled = false;
    const done = v => { if (settled) return; settled = true; resolve(v); };
    tx.oncomplete = () => done({ ok: true });
    tx.onabort = tx.onerror = () => done({ ok: false, reason: isQuotaError(tx.error) ? 'space' : 'db' });
    try {
      tx.objectStore('items').put(item);
      tx.objectStore('files').put({ id: item.id, bytes });
    } catch (e) {
      try { tx.abort(); } catch (_) {}
      done({ ok: false, reason: isQuotaError(e) ? 'space' : 'db' });
    }
  });
}

/** Delete the bytes of one book from the files store (tolerates a missing store). */
export function deleteScannedFile(db, itemId) {
  return new Promise(resolve => {
    if (!db.objectStoreNames.contains('files')) { resolve(true); return; }
    let tx;
    try { tx = db.transaction('files', 'readwrite'); }
    catch (e) { resolve(false); return; }
    let settled = false;
    const done = v => { if (settled) return; settled = true; resolve(v); };
    tx.oncomplete = () => done(true);
    tx.onabort = tx.onerror = () => done(false);
    try { tx.objectStore('files').delete(itemId); } catch (e) { try { tx.abort(); } catch (_) {} done(false); }
  });
}

/** Remove files-store records whose book no longer exists (orphan sweep). */
export function sweepOrphanFiles(db, existingBookIds) {
  return new Promise(resolve => {
    if (!db.objectStoreNames.contains('files')) { resolve(0); return; }
    let tx;
    try { tx = db.transaction('files', 'readwrite'); }
    catch (e) { resolve(0); return; }
    const store = tx.objectStore('files');
    const q = store.getAll();
    let removed = 0, settled = false;
    const done = n => { if (settled) return; settled = true; resolve(n); };
    q.onsuccess = () => {
      const dead = (q.result || []).filter(f => !existingBookIds.has(f.id));
      for (const f of dead) store.delete(f.id);
      removed = dead.length;
    };
    q.onerror = () => done(0);
    tx.oncomplete = () => done(removed);
    tx.onabort = tx.onerror = () => done(0);
  });
}
