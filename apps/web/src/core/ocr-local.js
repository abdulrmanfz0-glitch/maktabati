// Local OCR engine: self-hosted Tesseract, loaded ONLY via dynamic import so the
// main bundle stays untouched. Every OCR asset (worker, core wasm, traineddata)
// is served from our own origin under /ocr/<version>/ — never from a CDN.
//
// The transcription is verbatim: no AI, no spelling fixes, no word changes.
// The only normalization is the clearly-safe kind: whole-text trim,
// trailing-space removal per line, removal of invisible LRM/RLM marks, and
// putting a line Tesseract emitted in visual order back into reading order
// (fixBidiLine). Line breaks and every character Tesseract read are kept.
import { createWorker } from 'tesseract.js';
import { segmentLines, rgbaToGray } from './ocr-lines.js';

export const OCR_VERSION = '7.0.0';
export const OCR_BASE = '/ocr/' + OCR_VERSION;

export const DEFAULT_IDLE_MS = 60000;
export const DEFAULT_RENDER_DPI = 300;
/** A4 at 300 DPI (~8.7 MP): the pixel cap that keeps phones from running out of memory. */
export const MAX_RENDER_PIXELS = 8.7e6;

/** Tesseract parameters set on every worker (see ensureWorker). */
export const TESS_PARAMS = Object.freeze({ preserve_interword_spaces: '0' });

/** Typed OCR errors: code is 'assets' | 'oom' | 'aborted' | 'engine' | 'decode'. */
export class OcrError extends Error {
  constructor(code, message) { super(message); this.name = 'OcrError'; this.code = code; }
}

const abortError = () => new OcrError('aborted', 'OCR aborted');

const LRM = '\u200E', RLM = '\u200F';
const LTR_RUN = /[A-Za-z0-9\u0660-\u0669\u06F0-\u06F9](?:[A-Za-z0-9\u0660-\u0669\u06F0-\u06F9\/.,:'\- ]*[A-Za-z0-9\u0660-\u0669\u06F0-\u06F9])?|[\s\S]/g;

/**
 * Put one Tesseract line back into logical (reading) order.
 * Tesseract marks direction runs with LRM/RLM. A normal Arabic line is already
 * in logical order and only wraps its numbers as LRM…RLM. But when it lays a
 * line out left-to-right (typically a line holding numbers or brackets, e.g.
 * '(١) أي : ... (٢) أي : ...' footnotes), it emits the runs in VISUAL order
 * with each Arabic run wrapped RLM…LRM: the phrases come out last-first. Such a
 * line is recognised by its first mark being an RLM that opens Arabic text; its
 * runs are then reversed (Arabic runs keep their own order, numbers and Latin
 * words stay intact, neutral characters such as brackets are reversed one by
 * one). The marks themselves are always removed. Nothing else is changed.
 */
export function fixBidiLine(line) {
  const s = String(line == null ? '' : line);
  const first = s.search(/[\u200E\u200F]/);
  if (first < 0) return s;
  const opensArabic = s[first] === RLM && /[\u0600-\u06FF]/.test(s.slice(first + 1).split(/[\u200E\u200F]/)[0]);
  if (!opensArabic) return s.replace(/[\u200E\u200F]/g, '');
  const segs = [];
  let cur = { rtl: false, text: '' };
  for (const ch of s) {
    if (ch === RLM || ch === LRM) { segs.push(cur); cur = { rtl: ch === RLM, text: '' }; continue; }
    cur.text += ch;
  }
  segs.push(cur);
  const out = segs.filter(x => x.text).reverse()
    .map(x => (x.rtl ? x.text : (x.text.match(LTR_RUN) || []).reverse().join('')))
    .join('');
  return out.replace(/[ \t]{2,}/g, ' ').trim();
}

/** Light, safe normalization only (see the module comment). */
export function normalizeOcrText(text) {
  return String(text == null ? '' : text).split('\n').map(l => fixBidiLine(l).trimEnd()).join('\n').trim();
}

/** Build paragraph-separated text from tesseract's blocks JSON (reading order):
 *  lines within a paragraph joined with \n, paragraphs with \n\n — the split
 *  mergeOcrBook expects. Returns null when blocks carry no paragraphs. */
export function blocksToText(blocks) {
  if (!Array.isArray(blocks) || !blocks.length) return null;
  const out = [];
  for (const b of blocks) {
    if (!b || !Array.isArray(b.paragraphs)) continue;
    for (const p of b.paragraphs) {
      const lines = (Array.isArray(p && p.lines) ? p.lines : [])
        .map(l => fixBidiLine(String(l && l.text || '')).trim()).filter(Boolean);
      const t = lines.length ? lines.join('\n') : normalizeOcrText(String(p && p.text || ''));
      if (t) out.push(t);
    }
  }
  return out.length ? normalizeOcrText(out.join('\n\n')) : null;
}

/** Darkest-pixel test on an RGBA buffer: true when no pixel is darker than `threshold`. */
export function isBlankRGBA(data, threshold = 250) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < threshold || data[i + 1] < threshold || data[i + 2] < threshold) return false;
  }
  return true;
}

/** pdf.js operators that paint a raster image (what a scanned page is made of). */
const IMAGE_OP_NAMES = ['paintImageXObject', 'paintInlineImageXObject', 'paintImageMaskXObject', 'paintImageXObjectRepeat',
  'paintInlineImageXObjectGroup', 'paintImageMaskXObjectGroup', 'paintImageMaskXObjectRepeat', 'paintSolidColorImageMask'];
export function hasImageOps(fnArray, OPS) {
  const want = new Set(IMAGE_OP_NAMES.map(n => OPS && OPS[n]).filter(v => typeof v === 'number'));
  return Array.from(fnArray || []).some(f => want.has(f));
}

/** Downscaled copy of the rendered page, read back once to tell an empty render. */
function renderedBlank(canvas) {
  const w = Math.min(256, canvas.width), h = Math.max(1, Math.round(canvas.height * w / Math.max(1, canvas.width)));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(canvas, 0, 0, w, h);
  const blank = isBlankRGBA(x.getImageData(0, 0, w, h).data);
  c.width = 0; c.height = 0;
  return blank;
}

function mapError(e) {
  const m = String((e && e.message) || e || '');
  if (/failed to fetch|network|ENOENT|traineddata|langPath|worker|failed to load/i.test(m)) return new OcrError('assets', m);
  if (/out of memory|allocation|memory/i.test(m)) return new OcrError('oom', m);
  return new OcrError('engine', m);
}

/** Segmentation runs on a copy scaled by this factor (cheaper; measured as good as full size). */
export const SEGMENT_SCALE = 0.5;
const PSM_BLOCK = '6', PSM_LINE = '7', PSM_RAW_LINE = '13';

/** DOM helpers for the line path (replaced by fakes in unit tests). */
export const domLineIO = {
  /** Grayscale copy of the page at `scale`, or null when the image is not a canvas we can read. */
  gray(image, scale) {
    if (typeof document === 'undefined' || !image || typeof image.getContext !== 'function' || !image.width || !image.height) return null;
    const w = Math.max(1, Math.round(image.width * scale)), h = Math.max(1, Math.round(image.height * scale));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(image, 0, 0, w, h);
    const g = rgbaToGray(x.getImageData(0, 0, w, h).data, w, h);
    c.width = 0; c.height = 0;
    return { w, h, g };
  },
  /** One line of the page as its own small canvas. */
  crop(image, l) {
    const c = document.createElement('canvas'); c.width = l.x1 - l.x0; c.height = l.y1 - l.y0;
    const x = c.getContext('2d', { alpha: false });
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(image, l.x0, l.y0, c.width, c.height, 0, 0, c.width, c.height);
    return c;
  },
  release(c) { if (c) { c.width = 0; c.height = 0; } }
};

/** Page lines in full-size page coordinates, or null (then the whole page is read at once). */
export function pageLines(image, io = domLineIO, scale = SEGMENT_SCALE) {
  const small = io.gray(image, scale);
  if (!small) return null;
  const lines = segmentLines(small);
  if (!lines) return null;
  const W = image.width, H = image.height;
  return lines.map(l => ({
    x0: Math.max(0, Math.floor(l.x0 / scale)), x1: Math.min(W, Math.ceil(l.x1 / scale)),
    y0: Math.max(0, Math.floor(l.y0 / scale)), y1: Math.min(H, Math.ceil(l.y1 / scale)),
    parBreak: l.parBreak
  })).filter(l => l.x1 - l.x0 > 1 && l.y1 - l.y0 > 1);
}

/** A line reading looks lost when it has fewer letters than the line is wide (in line heights). */
export const lineLooksEmpty = (text, w, h) => String(text || '').replace(/\s/g, '').length < w / Math.max(1, h);

/**
 * Read a page line by line (see ocr-lines.js for why). `recognize(img, psm)`
 * reads one line image; a line that comes back (nearly) empty in single-line
 * mode is read again in raw-line mode, which skips Tesseract's own layout step
 * that drops some clean lines. Lines join with \n, paragraphs with \n\n.
 */
export async function readLines(image, lines, { recognize, io = domLineIO, signal } = {}) {
  const paras = []; let cur = [], confSum = 0, confW = 0, retried = 0;
  for (const l of lines) {
    if (signal && signal.aborted) throw abortError();
    const c = io.crop(image, l);
    try {
      const w = l.x1 - l.x0, h = l.y1 - l.y0;
      let r = await recognize(c, PSM_LINE);
      if (lineLooksEmpty(r.text, w, h)) {
        const r2 = await recognize(c, PSM_RAW_LINE);
        if (String(r2.text || '').trim().length > String(r.text || '').trim().length) { r = r2; retried++; }
      }
      const t = String(r.text || '').replace(/\s*\n\s*/g, ' ').trim();
      if (l.parBreak && cur.length) { paras.push(cur); cur = []; }
      if (t) { cur.push(t); confSum += (r.confidence || 0) * t.length; confW += t.length; }
    } finally { io.release(c); }
  }
  if (cur.length) paras.push(cur);
  return { text: paras.map(p => p.join('\n')).join('\n\n'), confidence: confW ? Math.round(confSum / confW) : 0, lines: lines.length, retried };
}

/**
 * One engine = one shared Tesseract worker, created lazily on the first page,
 * reused for every page, and terminated after an idle timeout or on abort.
 * `paths` overrides workerPath/corePath/langPath; null means "Tesseract default"
 * (used by the Node tests, which must not point at browser assets).
 */
export function createOcrEngine({ createWorkerFn = createWorker, idleMs = DEFAULT_IDLE_MS, paths = {}, lang = 'ara', lineMode = true, lineIO = domLineIO } = {}) {
  let psm = PSM_BLOCK;
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
          // preserve_interword_spaces must stay off for Arabic: with it on,
          // Tesseract drops the space before the last (leftmost) word of most
          // RTL lines, gluing two words together ("الفهملأنه"). Measured on the
          // scanned-book benchmark: word error 45.8% -> 40.8%, modern print
          // 20% -> 7%, no speed cost.
          await w.setParameters(TESS_PARAMS);
          if (gen !== generation) { // aborted while the worker was starting: discard it
            creating = null;
            try { await w.terminate(); } catch (e) {}
            throw abortError();
          }
          worker = w; psm = PSM_BLOCK; // tesseract.js starts every worker in single-block mode
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
      const aborted = signal ? new Promise((_, rej) => signal.addEventListener('abort', () => rej(abortError()), { once: true })) : null;
      if (aborted) aborted.catch(() => {});
      const race = p => (aborted ? Promise.race([p, aborted]) : p);
      const setPsm = async m => { if (psm !== m) { await race(w.setParameters({ tessedit_pageseg_mode: m })); psm = m; } };

      // Arabic pages are read line by line (see ocr-lines.js); anything the
      // segmenter is unsure about is read as a whole page, as before.
      const lines = lineMode && currentLang === 'ara' ? pageLines(image, lineIO) : null;
      if (lines && lines.length) {
        const r = await readLines(image, lines, {
          io: lineIO, signal,
          recognize: async (img, mode) => {
            await setPsm(mode);
            const { data } = await race(w.recognize(img, {}, { blocks: true }));
            return { text: blocksToText(data.blocks) || normalizeOcrText(data.text), confidence: data.confidence };
          }
        });
        return { text: r.text, confidence: r.confidence, ms: Math.max(1, Math.round(performance.now() - t0)), lines: r.lines };
      }
      await setPsm(PSM_BLOCK);
      const { data } = await race(w.recognize(image, {}, { blocks: true }));
      const ms = Math.max(1, Math.round(performance.now() - t0));
      const text = blocksToText(data.blocks) || normalizeOcrText(data.text);
      return { text, confidence: Math.round(data.confidence || 0), ms };
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
    const [{ getDocument, GlobalWorkerOptions, OPS }, workerUrl] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.mjs?url').then(m => m.default)
    ]);
    if (!GlobalWorkerOptions.workerSrc) GlobalWorkerOptions.workerSrc = workerUrl;
    const doc = await getDocument({ data: pdfBytes.slice ? pdfBytes.slice() : pdfBytes, isEvalSupported: false, enableXfa: false, disableFontFace: true, wasmUrl: '/pdfjs-wasm/' }).promise;
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
        // pdf.js paints an image it cannot decode (missing codec file, broken
        // stream) as nothing and only logs a warning. An all-white render of a
        // page that draws images is that case: report it instead of OCRing a
        // blank canvas and calling the page done. A truly empty page is flagged
        // `blank` so the caller can skip OCR for it.
        if (renderedBlank(canvas)) {
          const ops = await page.getOperatorList();
          if (hasImageOps(ops && ops.fnArray, OPS)) { canvas.width = 0; canvas.height = 0; throw new OcrError('decode', 'page image could not be decoded'); }
          return { canvas, width: canvas.width, height: canvas.height, scale: s, blank: true };
        }
        return { canvas, width: canvas.width, height: canvas.height, scale: s };
      } catch (e) {
        if (signal && signal.aborted) throw abortError();
        if (e && e.name === 'RenderingCancelledException') throw abortError();
        if (e && e.name === 'OcrError') throw e;
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
