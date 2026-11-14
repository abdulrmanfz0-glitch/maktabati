// PR3 local OCR engine unit tests. Lifecycle tests inject a fake worker
// (reuse, idle terminate, abort mid-page, error mapping); one real-tesseract
// test runs the actual Node worker against the committed traineddata file.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOcrEngine, normalizeOcrText, OCR_BASE, OCR_VERSION, DEFAULT_IDLE_MS } from '../../apps/web/src/core/ocr-local.js';
import { createWorker } from 'tesseract.js';
import { encodePng } from '../../packages/ingest/src/png.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LANG_DIR = path.join(ROOT, 'apps', 'web', 'public', 'ocr', '7.0.0');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const whitePng = () => encodePng(320, 200, new Uint8Array(320 * 200 * 4).fill(255), 4);
// valid 1x1 JPEG (content is irrelevant; only the lifecycle is under test)
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==',
  'base64');

function fakeWorkerFactory() {
  const state = { created: 0, terminated: 0, pending: [] };
  const create = async () => {
    state.created++;
    return {
      setParameters: async () => {},
      recognize: async () => new Promise((res, rej) => { state.pending.push({ res, rej }); }),
      terminate: async () => { state.terminated++; const p = state.pending; state.pending = []; p.forEach(x => x.rej(Object.assign(new Error('Terminated'), { name: 'Terminated' }))); }
    };
  };
  return { state, create };
}
const settle = async state => { await sleep(20); state.pending.forEach(p => p.res({ data: { text: 'نص', confidence: 80 } })); state.pending = []; };

describe('engine constants and normalization', () => {
  it('self-hosted asset base and version', () => {
    expect(OCR_VERSION).toBe('7.0.0');
    expect(OCR_BASE).toBe('/ocr/7.0.0');
    expect(DEFAULT_IDLE_MS).toBe(60000);
  });
  it('normalization only trims, keeps line breaks', () => {
    expect(normalizeOcrText('  سطر أول   \nسطر ثان\t')).toBe('سطر أول\nسطر ثان');
    expect(normalizeOcrText('')).toBe('');
  });
});

describe('worker lifecycle (fake worker)', () => {
  it('creates one worker lazily and reuses it across pages', async () => {
    const { state, create } = fakeWorkerFactory();
    const engine = createOcrEngine({ createWorkerFn: create });
    expect(state.created).toBe(0);
    const p1 = engine.ocrPage(TINY_JPEG);
    const p2 = engine.ocrPage(TINY_JPEG);
    await settle(state);
    await Promise.all([p1, p2]);
    expect(state.created).toBe(1);
    expect(state.terminated).toBe(0);
  }, 15000);
  it('terminates after the idle timeout and can start again', async () => {
    const { state, create } = fakeWorkerFactory();
    const engine = createOcrEngine({ createWorkerFn: create, idleMs: 20 });
    const p = engine.ocrPage(TINY_JPEG);
    await settle(state);
    await p;
    await sleep(80);
    expect(state.terminated).toBe(1);
    const p2 = engine.ocrPage(TINY_JPEG);
    await settle(state);
    await p2;
    expect(state.created).toBe(2); // fresh worker after idle, no leak
    await engine.terminate();
  }, 15000);
  it('abort mid-page terminates the worker and throws a typed aborted error', async () => {
    const { state, create } = fakeWorkerFactory();
    const engine = createOcrEngine({ createWorkerFn: create });
    const ctrl = new AbortController();
    const p = engine.ocrPage(TINY_JPEG, { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'OcrError', code: 'aborted' });
    expect(state.terminated).toBe(1);
    const p2 = engine.ocrPage(TINY_JPEG); // clean state: a new worker is created
    await settle(state);
    await p2;
    expect(state.created).toBe(2);
    await engine.terminate();
  }, 15000);
  it('abort during worker creation discards the fresh worker (no leak)', async () => {
    const { state, create } = fakeWorkerFactory();
    const engine = createOcrEngine({ createWorkerFn: create });
    const ctrl = new AbortController();
    const p = engine.ocrPage(TINY_JPEG, { signal: ctrl.signal });
    await sleep(1); // creation is in flight, recognize not yet reached
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'OcrError', code: 'aborted' });
    expect(state.terminated).toBe(1); // the fresh worker was discarded
  }, 15000);
});

describe('error mapping (fake worker)', () => {
  it('worker load failures map to the assets error', async () => {
    const engine = createOcrEngine({ createWorkerFn: async () => { throw new Error('Failed to fetch worker script'); } });
    await expect(engine.ocrPage(TINY_JPEG)).rejects.toMatchObject({ name: 'OcrError', code: 'assets' });
  }, 15000);
  it('traineddata load failures map to the assets error', async () => {
    const engine = createOcrEngine({ createWorkerFn: async () => { throw new Error('Failed to load traineddata ara'); } });
    await expect(engine.ocrPage(TINY_JPEG)).rejects.toMatchObject({ name: 'OcrError', code: 'assets' });
  }, 15000);
  it('out-of-memory failures map to the oom error', async () => {
    const engine = createOcrEngine({ createWorkerFn: async () => { throw new Error('RuntimeError: out of memory'); } });
    await expect(engine.ocrPage(TINY_JPEG)).rejects.toMatchObject({ name: 'OcrError', code: 'oom' });
  }, 15000);
});

describe('language selection (fake worker)', () => {
  function langRecordingFactory() {
    const state = { created: [], terminated: 0 };
    const create = async lang => {
      state.created.push(lang);
      return {
        setParameters: async () => {},
        recognize: async () => ({ data: { text: 'نص', confidence: 80 } }),
        terminate: async () => { state.terminated++; }
      };
    };
    return { state, create };
  }
  it('passes the configured lang to createWorkerFn', async () => {
    const { state, create } = langRecordingFactory();
    const engine = createOcrEngine({ createWorkerFn: create, lang: 'eng' });
    await engine.ocrPage(TINY_JPEG);
    expect(state.created).toEqual(['eng']);
    await engine.terminate();
  }, 15000);
  it('setLang recreates the worker with the new language', async () => {
    const { state, create } = langRecordingFactory();
    const engine = createOcrEngine({ createWorkerFn: create }); // default ara
    await engine.ocrPage(TINY_JPEG);
    await engine.setLang('eng');
    await engine.ocrPage(TINY_JPEG);
    expect(state.created).toEqual(['ara', 'eng']);
    await engine.terminate();
  }, 15000);
  it('setLang to the same language keeps the worker', async () => {
    const { state, create } = langRecordingFactory();
    const engine = createOcrEngine({ createWorkerFn: create });
    await engine.ocrPage(TINY_JPEG);
    await engine.setLang('ara');
    await engine.ocrPage(TINY_JPEG);
    expect(state.created).toEqual(['ara']);
    await engine.terminate();
  }, 15000);
});

describe('real tesseract (Node worker)', () => {
  it('committed ara.traineddata.gz loads and recognizes', async () => {
    const engine = createOcrEngine({ createWorkerFn: createWorker, paths: { workerPath: null, corePath: null, langPath: LANG_DIR, cacheMethod: 'none' } });
    const r = await engine.ocrPage(await whitePng());
    expect(typeof r.text).toBe('string');
    expect(typeof r.confidence).toBe('number');
    expect(typeof r.ms).toBe('number');
    expect(r.ms).toBeGreaterThan(0);
    await engine.terminate();
  }, 120000);
  it('committed eng.traineddata.gz loads and recognizes', async () => {
    const engine = createOcrEngine({ createWorkerFn: createWorker, lang: 'eng', paths: { workerPath: null, corePath: null, langPath: LANG_DIR, cacheMethod: 'none' } });
    const r = await engine.ocrPage(await whitePng());
    expect(typeof r.text).toBe('string');
    expect(typeof r.confidence).toBe('number');
    await engine.terminate();
  }, 120000);
});
