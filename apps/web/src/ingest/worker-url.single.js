// Single-file build: the worker is built beforehand into one script (vite build --mode worker),
// embedded here gzip-compressed as base64, and started from a blob: URL, so it works offline
// and from disk. It is only decompressed when the first PDF or EPUB is imported.
import packed from 'virtual:ingest-worker';

let url = null;
export default async function makeWorker() {
  if (!url) {
    const bin = Uint8Array.from(atob(packed), c => c.charCodeAt(0));
    const text = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
  }
  return new Worker(url); // classic worker: module workers from blob: URLs fail on file:// pages
}
