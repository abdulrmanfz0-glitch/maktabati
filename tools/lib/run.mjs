// Run the engine on one fixture and return the report plus a few derived metrics.
// Never returns or prints book text.
import { ingestToResult } from '../../packages/ingest/src/index.js';
import { isSuccess } from '../../packages/ingest/src/score.js';

export async function runOne(fx, options = {}) {
  const t0 = Date.now();
  let peak = process.memoryUsage().rss;
  const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 50);
  try {
    const res = await ingestToResult({ bytes: fx.bytes(), kind: 'pdf' }, Object.assign({ images: true }, options));
    peak = Math.max(peak, process.memoryUsage().rss);
    const r = res.report;
    return {
      id: fx.id, ok: true, report: r, success: isSuccess(r),
      ms: Date.now() - t0, peakMB: Math.round(peak / 1048576),
      chapterCount: res.book.chapters.length, notes: res.book.chapters.reduce((n, c) => n + (c.notes ? c.notes.length : 0), 0),
      book: options.keepBook ? res.book : undefined
    };
  } catch (e) {
    return { id: fx.id, ok: false, error: (e && (e.code || e.name)) || 'error', message: e && e.message, ms: Date.now() - t0 };
  } finally {
    clearInterval(timer);
  }
}
