// Translation storage: a separate IndexedDB so book records and the export format stay untouched.
// No DOM and no network here; the reader owns the user interface.

export const TR_DB_NAME = 'maktabati-tr';
export const TR_DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    let req = null, settled = false, timer = null;
    const finish = db => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (!db) dbPromise = null;
      resolve(db || null);
    };
    timer = setTimeout(() => {
      try { if (req && req.result) req.result.close(); } catch (e) {}
      finish(null);
    }, 2500);
    try {
      req = indexedDB.open(TR_DB_NAME, TR_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('jobs')) {
          const jobs = db.createObjectStore('jobs', { keyPath: 'id' });
          jobs.createIndex('bookId', 'bookId', { unique: false });
        }
        if (!db.objectStoreNames.contains('segments')) {
          const segments = db.createObjectStore('segments', { keyPath: ['jobId', 'index'] });
          segments.createIndex('jobId', 'jobId', { unique: false });
        }
        if (!db.objectStoreNames.contains('glossaries')) {
          db.createObjectStore('glossaries', { keyPath: 'bookId' });
        }
      };
      req.onsuccess = () => finish(req.result);
      req.onerror = req.onblocked = () => finish(null);
    } catch (e) { finish(null); }
  });
  return dbPromise;
}

function request(req) {
  return new Promise(resolve => {
    let done = false;
    const finish = value => { if (done) return; done = true; resolve(value); };
    req.onsuccess = () => finish(req.result == null ? null : req.result);
    req.onerror = () => finish(null);
  });
}

function txDone(tx) {
  return new Promise(resolve => {
    let done = false;
    const finish = ok => { if (done) return; done = true; resolve(ok); };
    tx.oncomplete = () => finish(true);
    tx.onabort = tx.onerror = () => finish(false);
  });
}

export async function trAvailable() {
  return !!(await openDB());
}

export async function trGetJob(id) {
  const db = await openDB(); if (!db) return null;
  try { return await request(db.transaction('jobs').objectStore('jobs').get(id)); } catch (e) { return null; }
}

export async function trPutJob(job) {
  const db = await openDB(); if (!db || !job || !job.id) return false;
  try {
    const tx = db.transaction('jobs', 'readwrite');
    tx.objectStore('jobs').put(job);
    return await txDone(tx);
  } catch (e) { return false; }
}

export async function trListJobs(bookId) {
  const db = await openDB(); if (!db) return [];
  try {
    const store = db.transaction('jobs').objectStore('jobs');
    const req = bookId ? store.index('bookId').getAll(bookId) : store.getAll();
    return (await request(req)) || [];
  } catch (e) { return []; }
}

export async function trGetSegments(jobId) {
  const db = await openDB(); if (!db) return [];
  try {
    const store = db.transaction('segments').objectStore('segments');
    const rows = (await request(store.index('jobId').getAll(jobId))) || [];
    return rows.sort((a, b) => a.index - b.index);
  } catch (e) { return []; }
}

export async function trPutSegment(segment) {
  const db = await openDB(); if (!db || !segment || !segment.jobId || !Number.isFinite(segment.index)) return false;
  try {
    const tx = db.transaction('segments', 'readwrite');
    tx.objectStore('segments').put(segment);
    return await txDone(tx);
  } catch (e) { return false; }
}

export async function trDeleteJob(jobId) {
  const db = await openDB(); if (!db || !jobId) return false;
  try {
    const tx = db.transaction(['jobs', 'segments'], 'readwrite');
    tx.objectStore('jobs').delete(jobId);
    const idx = tx.objectStore('segments').index('jobId');
    const cur = idx.openCursor(IDBKeyRange.only(jobId));
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) { c.delete(); c.continue(); }
    };
    return await txDone(tx);
  } catch (e) { return false; }
}

export async function trGetGlossary(bookId) {
  const db = await openDB(); if (!db) return null;
  try { return await request(db.transaction('glossaries').objectStore('glossaries').get(bookId)); } catch (e) { return null; }
}

export async function trPutGlossary(bookId, terms) {
  const db = await openDB(); if (!db || !bookId) return false;
  try {
    const tx = db.transaction('glossaries', 'readwrite');
    tx.objectStore('glossaries').put({ bookId, terms: Array.isArray(terms) ? terms : [], updatedAt: Date.now() });
    return await txDone(tx);
  } catch (e) { return false; }
}

export async function trDeleteBook(bookId) {
  const db = await openDB(); if (!db || !bookId) return false;
  try {
    const jobs = await trListJobs(bookId);
    for (const job of jobs) await trDeleteJob(job.id);
    const tx = db.transaction('glossaries', 'readwrite');
    tx.objectStore('glossaries').delete(bookId);
    return await txDone(tx);
  } catch (e) { return false; }
}

export async function trClearAll() {
  const db = await openDB(); if (!db) return false;
  try {
    const tx = db.transaction(['jobs', 'segments', 'glossaries'], 'readwrite');
    tx.objectStore('jobs').clear();
    tx.objectStore('segments').clear();
    tx.objectStore('glossaries').clear();
    return await txDone(tx);
  } catch (e) { return false; }
}

export function trClose() {
  if (!dbPromise) return;
  dbPromise.then(db => { try { if (db) db.close(); } catch (e) {} });
  dbPromise = null;
}
