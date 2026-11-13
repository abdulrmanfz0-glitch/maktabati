// OCR runner (PR4): processes one scanned book page by page, resumable and
// single-runner-per-book. Loaded only via dynamic import; no AI, no corrections.
// The merge is a pure function of the ocrPages records, so re-running it always
// produces identical chapters (highlights never break on identical input).
import { scanPageId } from './scan-save.js';
import { OCR_ENGINE_TAG } from './ocr-store.js';
import { ocrPage, renderPage } from './ocr-local.js';

export class OcrRunError extends Error {
  constructor(code, message) { super(message); this.name = 'OcrRunError'; this.code = code; }
}

const FAILED_LINE = 'تعذّرت قراءة هذه الصفحة.';

/**
 * Build the book's chapters from the page records: one chapter, one section per
 * page ("صفحة N"), paragraphs split on blank lines with lines joined by spaces.
 * Every block carries a `page` marker so later PRs can map text back to pages.
 * Failed pages get a short Arabic placeholder, never empty text. Verbatim text.
 */
export function mergeOcrBook(book, records) {
  const byPage = new Map((records || []).filter(r => r && r.page).map(r => [r.page, r]));
  const pages = (book.ocr && book.ocr.pages) || 0;
  const sections = [];
  for (let p = 1; p <= pages; p++) {
    const r = byPage.get(p);
    const blocks = [];
    if (r && r.status === 'done' && r.text) {
      for (const para of String(r.text).split(/\n{2,}/).map(s => s.split('\n').map(l => l.trim()).filter(Boolean).join(' ')).filter(Boolean)) {
        blocks.push({ type: 'p', text: para, page: p });
      }
    }
    if (!blocks.length) blocks.push({ type: 'p', text: FAILED_LINE, page: p });
    sections.push({ title: 'صفحة ' + p, blocks });
  }
  const out = Object.assign({}, book, { chapters: [{ title: book.title || 'كتاب ممسوح ضوئيًا', sections }] });
  out.ocr = Object.assign({}, book.ocr, { status: 'done' });
  return out;
}

/**
 * @param {object} deps { store, engine?, locks?, lease?, now?, dpi? }
 * store: makeOcrStore(db). engine: { renderPage, ocrPage } (real ocr-local by default).
 * locks: navigator.locks when available. lease: { tryAcquire, release } fallback.
 */
export function createOcrRunner({ store, engine = { renderPage, ocrPage }, locks = null, lease = null, now = () => Date.now(), dpi = 300 } = {}) {
  async function pause(bookId, reason) {
    try {
      const book = await store.getBook(bookId);
      if (book && book.ocr) { book.ocr.status = 'paused'; book.ocr.reason = reason; await store.putBook(book); }
    } catch (e) { /* status write is best effort */ }
  }

  async function doRun(bookId, pdfBytes, opts = {}) {
    const signal = opts.signal || null;
    const onProgress = opts.onProgress || null;
    let book = await store.getBook(bookId);
    if (!book || !book.ocr) throw new OcrRunError('no-book', 'الكتاب ليس كتابًا ممسوحًا ضوئيًا.');
    if (book.ocr.status === 'done') return { stopped: false, done: book.ocr.done, total: book.ocr.pages };
    book.ocr.status = 'running'; delete book.ocr.reason;
    await store.putBook(book);
    const total = book.ocr.pages || 0;
    let doneCount = 0;

    for (let p = 1; p <= total; p++) {
      if (signal && signal.aborted) { await pause(bookId, 'cancel'); return { stopped: true, reason: 'cancel', done: doneCount, total }; }
      const id = scanPageId(bookId, p);
      const existing = await store.getOcrPage(id);
      if (existing && (existing.status === 'done' || existing.status === 'failed')) {
        doneCount++;
        if (onProgress) onProgress({ page: p, done: doneCount, total });
        continue; // resume: skip already-processed pages, no duplicates
      }
      let rec = null, scale = 1;
      for (let attempt = 1; attempt <= 3 && !rec; attempt++) {
        if (signal && signal.aborted) { await pause(bookId, 'cancel'); return { stopped: true, reason: 'cancel', done: doneCount, total }; }
        let rendered = null;
        try {
          rendered = await engine.renderPage(pdfBytes, p, { dpi: dpi * scale, signal });
          const r = await engine.ocrPage(rendered.canvas, { signal });
          rec = { id, bookId, page: p, text: r.text, confidence: r.confidence, ms: r.ms, engine: OCR_ENGINE_TAG, status: 'done', at: now() };
        } catch (e) {
          if (signal && signal.aborted) { await pause(bookId, 'cancel'); return { stopped: true, reason: 'cancel', done: doneCount, total }; }
          if (e && e.code === 'assets') { await pause(bookId, 'assets'); return { stopped: true, reason: 'assets', done: doneCount, total }; }
          if (e && e.code === 'oom' && scale === 1) { scale = 0.75; continue; } // retry once at a lower render scale
          if (attempt === 3) rec = { id, bookId, page: p, text: '', confidence: 0, ms: 0, engine: OCR_ENGINE_TAG, status: 'failed', error: (e && e.code) || 'engine', at: now() };
        } finally {
          if (rendered && rendered.canvas) { rendered.canvas.width = 0; rendered.canvas.height = 0; } // release the bitmap
        }
      }
      try {
        await store.putOcrPageAndBook(rec, bookId, ++doneCount);
      } catch (e) {
        if (e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message || '')))) { await pause(bookId, 'space'); return { stopped: true, reason: 'space', done: doneCount - 1, total }; }
        throw e;
      }
      if (onProgress) onProgress({ page: p, done: doneCount, total });
    }

    book = await store.getBook(bookId);
    const records = await store.getAllPages(bookId);
    await store.putBook(mergeOcrBook(book, records));
    if (onProgress) onProgress({ done: doneCount, total, finished: true });
    return { stopped: false, done: doneCount, total };
  }

  /** Single runner per book: Web Locks when available, else a kv lease. */
  function run(bookId, pdfBytes, opts = {}) {
    const inner = () => doRun(bookId, pdfBytes, opts);
    if (locks && typeof locks.request === 'function') {
      return locks.request('ocr:' + bookId, { ifAvailable: true }, async lock => {
        if (!lock) throw new OcrRunError('busy', 'كتاب آخر يعالج الكتاب نفسه الآن.');
        return inner();
      });
    }
    if (lease) {
      return (async () => {
        if (!(await lease.tryAcquire(bookId))) throw new OcrRunError('busy', 'كتاب آخر يعالج الكتاب نفسه الآن.');
        try { return await inner(); } finally { await lease.release(bookId).catch(() => {}); }
      })();
    }
    return inner();
  }

  return { run, merge: mergeOcrBook };
}

export const runBookOcr = (deps, bookId, pdfBytes, opts) => createOcrRunner(deps).run(bookId, pdfBytes, opts);
