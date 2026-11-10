// Main-thread side of the ingest worker. The worker is created on first use and kept for later
// imports; nothing here loads pdf.js or the engine until runIngest() is called.
import makeWorker from './worker-url.js';

let worker = null, seq = 0;
const pending = new Map();

async function getWorker() {
  if (worker) return worker;
  worker = await makeWorker();
  worker.onmessage = e => {
    const m = e.data; if (!m || m.mk !== 1) return; // pdf.js posts its own messages too
    const p = pending.get(m.id); if (!p) return;
    if (m.type === 'progress') { if (p.onProgress) p.onProgress(m); return; }
    pending.delete(m.id);
    if (m.type === 'result' || m.type === 'validated') p.resolve(m);
    else { const err = new Error(m.message); err.code = m.code; p.reject(err); }
  };
  worker.onerror = e => { const err = new Error(e.message || 'worker failed'); err.code = 'worker'; for (const p of pending.values()) p.reject(err); pending.clear(); worker = null; };
  return worker;
}

/**
 * Convert a file with the engine. Resolves to { kind, book, report, assets }.
 * @param {Blob|ArrayBuffer|Uint8Array} input
 * @param {{ kind?: string, onProgress?: Function, signal?: AbortSignal }} [o]
 */
export async function runIngest(input, o = {}) {
  const buf = input instanceof Blob ? await input.arrayBuffer() : input instanceof Uint8Array ? input.slice().buffer : input.slice(0);
  const w = await getWorker(), id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress: o.onProgress });
    if (o.signal) o.signal.addEventListener('abort', () => { w.postMessage({ mk: 1, id, cancel: true }); }, { once: true });
    w.postMessage({ mk: 1, id, bytes: buf, kind: o.kind }, [buf]);
  });
}
