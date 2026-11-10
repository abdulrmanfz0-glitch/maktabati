// VisionFallback interface. Interface only: this package makes no model calls.
//
// A caller that wants pages routed to 'vision' converted by a vision model implements:
//
//   /** @type {VisionFallback} */
//   const vision = {
//     async pagesToMarkdown(pages, { signal }) {
//       // pages: [{ page: number, image: { mime: 'image/png', bytes: Uint8Array, width, height } }]
//       // return one Markdown string per page, in the app dialect (see render.js)
//       return pages.map(() => '');
//     }
//   };
//
// and a page renderer (the engine has no canvas):
//
//   /** @type {PageRenderer} */
//   const renderPage = async (page /* 1-based */) => ({ mime: 'image/png', bytes, width, height });
//
// ingest(input, { vision, renderPage }) then calls vision.pagesToMarkdown for the pages the
// report routes to 'vision' and records the returned Markdown in result.vision[page].
// Nothing is merged into `book` automatically: the caller decides.

/**
 * @typedef {{ pagesToMarkdown(pages: {page:number, image:{mime:string, bytes:Uint8Array, width:number, height:number}}[], ctx: {signal?: AbortSignal}): Promise<string[]> }} VisionFallback
 * @typedef {(page:number) => Promise<{mime:string, bytes:Uint8Array, width:number, height:number}>} PageRenderer
 */

export function isVisionFallback(v) {
  return !!v && typeof v.pagesToMarkdown === 'function';
}

export async function runVision(vision, renderPage, pages, signal) {
  if (!isVisionFallback(vision) || typeof renderPage !== 'function' || !pages.length) return null;
  const input = [];
  for (const page of pages) {
    if (signal && signal.aborted) throw abortError();
    input.push({ page, image: await renderPage(page) });
  }
  const md = await vision.pagesToMarkdown(input, { signal });
  const out = {};
  pages.forEach((p, i) => { out[p] = String((md && md[i]) || ''); });
  return out;
}

export function abortError() {
  try { return new DOMException('Aborted', 'AbortError'); } catch (e) { const x = new Error('Aborted'); x.name = 'AbortError'; return x; }
}
