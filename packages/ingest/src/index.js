// Public API of the ingest engine.
export { toMarkdown } from './render.js';
export { IngestError } from './model.js';
export { DETECTION_THRESHOLDS } from './score.js';

/**
 * Detect the input kind from bytes (magic numbers) or an explicit hint.
 * @returns {'pdf'|'epub'|'md'|'txt'}
 */
export function detectKind(bytes, hint) {
  if (hint) return hint;
  if (typeof bytes === 'string') return 'md';
  const b = bytes;
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf'; // %PDF
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b) return 'epub'; // PK (zip)
  return 'txt';
}

/**
 * ingest(input, options): async iterator of progress events, ending with
 * { type: 'result', book, report, assets }.
 * input: Uint8Array | ArrayBuffer | string | { bytes, kind?, name? }
 */
export async function* ingest(input, options = {}) {
  const src = normalizeInput(input);
  const kind = detectKind(src.bytes, src.kind);
  if (kind === 'pdf') { const m = await import('./pdf.js'); yield* m.ingestPdf(src.bytes, options); return; }
  if (kind === 'epub') { const m = await import('./epub.js'); yield* m.ingestEpub(src.bytes, options); return; }
  const m = await import('./markdown.js');
  yield* m.ingestText(src.bytes, kind, options);
}

/** Convenience: run ingest to completion and return { book, report, assets }. */
export async function ingestToResult(input, options = {}) {
  let result = null;
  for await (const ev of ingest(input, options)) {
    if (ev.type === 'result') result = ev;
    else if (options.onProgress) options.onProgress(ev);
  }
  return result;
}

function normalizeInput(input) {
  if (input && typeof input === 'object' && 'bytes' in input) return { bytes: toBytes(input.bytes), kind: input.kind };
  return { bytes: toBytes(input), kind: undefined };
}

function toBytes(x) {
  if (typeof x === 'string') return x;
  if (x instanceof Uint8Array) return x;
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  throw new TypeError('ingest: unsupported input');
}
