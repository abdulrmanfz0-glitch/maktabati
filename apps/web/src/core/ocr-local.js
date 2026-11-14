// Local OCR engine: self-hosted Tesseract, loaded ONLY via dynamic import so the
// main bundle stays untouched. Every OCR asset (worker, core wasm, traineddata)
// is served from our own origin under /ocr/<version>/ — never from a CDN.
//
// The transcription is verbatim: no AI, no spelling fixes, no reordering.
// The only normalization is the clearly-safe kind: whole-text trim and
// trailing-space removal per line. Line breaks and RTL order are kept.
import { createWorker } from 'tesseract.js';

export const OCR_VERSION = '7.0.0';
export const OCR_BASE = '/ocr/' + OCR_VERSION;

export const DEFAULT_IDLE_MS = 60000;
export const DEFAULT_RENDER_DPI = 300;
/** A4 at 300 DPI (~8.7 MP): the pixel cap that keeps phones from running out of memory. */
export const MAX_RENDER_PIXELS = 8.7e6;

/** Typed OCR errors: code is 'assets' | 'oom' | 'aborted' | 'engine'. */
export class OcrError extends Error {
  constructor(code, message) { super(message); this.name = 'OcrError'; this.code = code; }
}

const abortError = () => new OcrError('aborted', 'OCR aborted');

/** Light, safe normalization only (see the module comment). */
export function normalizeOcrText(text) {
  return String(text == null ? '' : text).split('\n').map(l => l.trimEnd()).join('\n').trim();
}

function mapError(e) {
  const m = String((e && e.message) || e || '');
  if (/failed to fetch|network|ENOENT|traineddata|langPath|worker|failed to load/i.test(m)) return new OcrError('assets', m);
  if (/out of memory|allocation|memory/i.test(m)) return new OcrError('oom', m);
  return new OcrError('engine', m);
}

/**
 * One engine = one shared Tesseract worker, created lazily on the first page,
 * reused for every page, and terminated after an idle timeout or on abort.
 * `paths` overrides workerPath/corePath/langPath; null means "Tesseract default"
 * (used by the Node tests, which must not point at browser assets).
 */
export function createOcrEngine({ createWorkerFn = createWorker, idleMs = DEFAULT_IDLE_MS, paths = {}, lang = 'ara' } = {}) {
  let worker = null, creating = null, busy = 0, idleTimer = null, progressCb = null, generation = 0, currentLang = lang;
  const clearIdle = () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } };
  const armIdle = () => { clearIdle(); idleTimer = setTimeout(() => { if (!busy && worker) terminate(); }, idleMs); };

  async function terminate() {
    clearIdle();
    generation++; // an in-flight creation below must not resurrect a worker afterwards
    const w = worker; worker = null; creating = null;
    if (w) { try { await w.terminate(); } catch (e) {} }
  }

  /** Switch the recognition language; the worker is recreated lazily on the next page. */
  async function setLang(next) {
    if (next === currentLang) return;
    currentLang = next;
    await terminate();
  }

  async function ensureWorker() {
    if (worker) return worker;
    if (!creating) {
      const gen = generation;
      creating = (async () => {
        try {
          const opts = { gzip: true, workerBlobURL: false, logger: m => { if (progressCb) progressCb(m); } };
          // null = omit the key entirely (Tesseract defaults, used by Node tests);
          // otherwise always our own origin, never a CDN.
          if (paths.workerPath !== null) opts.workerPath = paths.workerPath || OCR_BASE + '/worker.min.js';
          if (paths.corePath !== null) opts.corePath = paths.corePath || OCR_BASE;
          if (paths.langPath !== null) opts.langPath = paths.langPath || OCR_BASE;
          if (paths.cacheMethod !== null && paths.cacheMethod !== undefined) opts.cacheMethod = paths.cacheMethod;
          const w = await createWorkerFn(currentLang, 1, opts);
          await w.setParameters({ preserve_interword_spaces: '1' });
          if (gen !== generation) { // aborted while the worker was starting: discard it
            creating = null;
            try { await w.terminate(); } catch (e) {}
            throw abortError();
          }
          worker = w;
          return w;
        } catch (e) { throw mapError(e); }
      })();
      creating.catch(() => { creating = null; });
    }
    return creating;
  }

  /**
   * @param {CanvasImageSource} image canvas or ImageBitmap of one page
   * @returns {Promise<{ text:string, confidence:number, ms:number }>}
   */
  async function ocrPage(image, opts = {}) {
    const signal = opts.signal;
    if (signal && signal.aborted) throw abortError();
    busy++;
    const onAbort = () => { terminate(); };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    try {
      const w = await ensureWorker();
      if (signal && signal.aborted) throw abortError();
      progressCb = opts.onProgress || null;
      const t0 = performance.now();
      // Race with the abort signal: terminating the worker does not reliably
      // reject an in-flight recognize() promise, so reject it ourselves.
      let result;
      if (signal) {
        result = await Promise.race([
          w.recognize(image),
          new Promise((_, rej) => signal.addEventListener('abort', () => rej(abortError()), { once: true }))
        ]);
      } else {
        result = await w.recognize(image);
      }
      const { data } = result;
      const ms = Math.max(1, Math.round(performance.now() - t0));
      return { text: normalizeOcrText(data.text), confidence: Math.round(data.confidence || 0), ms };
    } catch (e) {
      if (signal && signal.aborted) throw abortError();
      if (e && e.name === 'OcrError') throw e; // already typed (from the worker): keep its message
      throw mapError(e);
    } finally {
      progressCb = null;
      if (signal) signal.removeEventListener('abort', onAbort);
      busy--;
      armIdle();
    }
  }

  /**
   * Open the PDF once and render any number of pages from the same document.
   * Release with close() at the end of a run or on abort.
   * @returns {Promise<{ renderPage:(pageIndex, opts)=>Promise<{canvas,width,height,scale}>, close:()=>Promise<void> }>}
   */
  async function openPdfDoc(pdfBytes) {
    const [{ getDocument, GlobalWorkerOptions }, workerUrl] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.mjs?url').then(m => m.default)
    ]);
    if (!GlobalWorkerOptions.workerSrc) GlobalWorkerOptions.workerSrc = workerUrl;
    const doc = await getDocument({ data: pdfBytes.slice ? pdfBytes.slice() : pdfBytes, isEvalSupported: false, enableXfa: false, disableFontFace: true }).promise;
    let closed = false;
    const close = async () => { if (closed) return; closed = true; try { await doc.loadingTask.destroy(); } catch (e) {} };
    async function renderPdfPage(pageIndex, opts = {}) {
      if (closed) throw new OcrError('engine', 'PDF document already closed');
      const { dpi = DEFAULT_RENDER_DPI, maxPixels = MAX_RENDER_PIXELS, signal } = opts;
      if (signal && signal.aborted) throw abortError();
      let page = null;
      try {
        page = await doc.getPage(pageIndex);
        const v0 = page.getViewport({ scale: 1 });
        const s = Math.min(dpi / 72, Math.sqrt(maxPixels / Math.max(1, v0.width * v0.height)));
        const viewport = page.getViewport({ scale: s });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const task = page.render({ canvasContext: ctx, viewport });
        if (signal) signal.addEventListener('abort', () => { try { task.cancel(new DOMException('Aborted', 'AbortError')); } catch (e) {} }, { once: true });
        await task.promise;
        if (signal && signal.aborted) throw abortError();
        return { canvas, width: canvas.width, height: canvas.height, scale: s };
      } catch (e) {
        if (signal && signal.aborted) throw abortError();
        if (e && e.name === 'RenderingCancelledException') throw abortError();
        throw mapError(e);
      } finally {
        try { if (page) page.cleanup(); } catch (e) {}
      }
    }
    return { renderPage: renderPdfPage, close };
  }

  /**
   * One-shot convenience: opens the PDF, renders one page, and closes it.
   * @returns {Promise<{ canvas:HTMLCanvasElement, width:number, height:number, scale:number }>}
   */
  async function renderPage(pdfBytes, pageIndex, opts = {}) {
    const { dpi = DEFAULT_RENDER_DPI, maxPixels = MAX_RENDER_PIXELS, signal } = opts;
    if (signal && signal.aborted) throw abortError();
    const doc = await openPdfDoc(pdfBytes);
    try { return await doc.renderPage(pageIndex, { dpi, maxPixels, signal }); }
    finally { await doc.close().catch(() => {}); }
  }

  return { ocrPage, renderPage, openPdfDoc, terminate, setLang };
}

const defaultEngine = createOcrEngine();
export const ocrPage = (image, opts) => defaultEngine.ocrPage(image, opts);
export const renderPage = (pdfBytes, pageIndex, opts) => defaultEngine.renderPage(pdfBytes, pageIndex, opts);
export const openPdfDoc = (pdfBytes) => defaultEngine.openPdfDoc(pdfBytes);
export const ocrTerminate = () => defaultEngine.terminate();
export const setOcrLang = (lang) => defaultEngine.setLang(lang);
