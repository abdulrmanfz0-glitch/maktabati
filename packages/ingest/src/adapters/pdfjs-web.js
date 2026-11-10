// Browser / Web Worker adapter: the non-legacy pdf.js build, run in the calling thread.
// Importing pdf.worker.mjs sets globalThis.pdfjsWorker, so pdf.js uses its in-thread ("fake")
// worker instead of spawning another one. Call this from inside a Web Worker so the page stays
// responsive. Same safe options as the Node adapter: nothing from the PDF is ever executed.
import { SAFE_OPTIONS } from './safe-options.js';

let libP = null;
export function loadPdfjs() {
  if (!libP) libP = (async () => {
    const [lib] = await Promise.all([import('pdfjs-dist/build/pdf.mjs'), import('pdfjs-dist/build/pdf.worker.mjs')]);
    return lib;
  })();
  return libP;
}

// In browsers pdf.js would hand images over as ImageBitmaps; the engine needs raw pixels
// (as in Node) to encode figures, so the canvas and image-decoder paths are turned off.
const WEB_OPTIONS = Object.freeze({ isOffscreenCanvasSupported: false, isImageDecoderSupported: false });

export async function openPdf(bytes, extra) {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument(Object.assign({ data: bytes }, SAFE_OPTIONS, WEB_OPTIONS, extra || {})).promise;
}

/** Options for ingest(): { openPdf, pdfjs } (inflate falls back to DecompressionStream). */
export async function webPdfOptions() {
  return { openPdf, pdfjs: await loadPdfjs() };
}
