// Browser builds: the engine's Node-only pdf.js adapter (legacy build, node:zlib) is never used,
// because the worker always passes the web adapter. This stub keeps it out of the bundles.
export function loadPdfjs() { throw new Error('node adapter not available in the browser'); }
export function openPdf() { throw new Error('node adapter not available in the browser'); }
export function inflate() { throw new Error('node adapter not available in the browser'); }
export const SAFE_OPTIONS = {};
