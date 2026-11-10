// Ingest worker: runs the engine (packages/ingest) off the main thread.
// Created only when the user imports a PDF or EPUB, so the reader never loads pdf.js.
//
// Every message of ours carries mk:1. pdf.worker.mjs, imported for in-thread parsing, also attaches
// to this worker's port and posts its own messages (for example "ready"); both sides ignore those.
//
// in : { mk:1, id, bytes: ArrayBuffer, kind?: 'pdf'|'epub'|'md'|'txt' }   |   { id, cancel: true }
// out: { id, type:'progress', stage, page, pages }
//      { id, type:'result', book, report, assets: [{ path, mime, bytes }] }   (asset buffers transferred)
//      { id, type:'error', code, message }
import { ingest, detectKind } from '@maktabati/ingest';

const jobs = new Map();
let lexP = null;
function lexicon() {
  if (!lexP) lexP = Promise.all([import('@maktabati/ingest/lexicon'), import('../../../../packages/ingest/data/ar-words.txt?raw')])
    .then(([m, t]) => m.makeLexicon(t.default.split(/\r?\n/)))
    .catch(() => null);
  return lexP;
}

self.onmessage = async e => {
  const m = e.data || {};
  if (m.mk !== 1) return;
  if (m.cancel) { const j = jobs.get(m.id); if (j) j.abort(); return; }
  const ctrl = new AbortController(); jobs.set(m.id, ctrl);
  try {
    const bytes = new Uint8Array(m.bytes);
    const kind = detectKind(bytes, m.kind);
    const options = { signal: ctrl.signal };
    if (kind === 'pdf') {
      const [web, lex] = await Promise.all([import('@maktabati/ingest/web'), lexicon()]);
      Object.assign(options, await web.webPdfOptions(), { lexicon: lex });
    }
    for await (const ev of ingest({ bytes, kind }, options)) {
      if (ev.type === 'result') {
        const assets = (ev.assets || []).map(a => ({ path: a.path, mime: a.mime, bytes: a.bytes }));
        self.postMessage({ mk: 1, id: m.id, type: 'result', kind, book: ev.book, report: ev.report, assets }, assets.map(a => a.bytes.buffer));
      } else self.postMessage({ mk: 1, id: m.id, type: 'progress', stage: ev.stage, page: ev.page, pages: ev.pages });
    }
  } catch (err) {
    self.postMessage({ mk: 1, id: m.id, type: 'error', code: (err && (err.code || err.name)) || 'error', message: String((err && err.message) || err) });
  } finally { jobs.delete(m.id); }
};
