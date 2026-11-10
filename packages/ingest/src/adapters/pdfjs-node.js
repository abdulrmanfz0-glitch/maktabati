// Thin Node adapter: loads pdf.js (legacy build, works in Node) with scripting and eval disabled.
// The browser/worker adapter is the same call with the non-legacy build.
import { SAFE_OPTIONS } from './safe-options.js';

let libP = null;
export function loadPdfjs() {
  if (!libP) libP = import('pdfjs-dist/legacy/build/pdf.mjs');
  return libP;
}

export { SAFE_OPTIONS };

export async function openPdf(bytes, extra) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument(Object.assign({ data: bytes }, SAFE_OPTIONS, extra || {}));
  return task.promise;
}

/** FlateDecode for the embedded-font reader (fontfile.js). */
export async function inflate(bytes) {
  const zlib = await import('node:zlib');
  try { return new Uint8Array(zlib.inflateSync(bytes)); }
  catch (e) { return new Uint8Array(zlib.inflateSync(bytes, { finishFlush: zlib.constants.Z_SYNC_FLUSH })); }
}
