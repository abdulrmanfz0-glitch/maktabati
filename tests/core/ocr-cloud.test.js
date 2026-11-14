// Cloud OCR unit tests: message shape, image-token/cost math, canvas->dataURL,
// and the fetch (success, empty, provider error, retry, abort, bad config).
import { describe, it, expect } from 'vitest';
import {
  OCR_CLOUD_PROMPT, cloudOcrMessage, imageTokensFor,
  estimateCloudPageCost, estimateCloudBookCost, canvasToDataURL,
  ocrEndpoint, ocrPageCloud
} from '../../apps/web/src/core/ocr-cloud.js';

const CFG = { base: 'https://api.deepseek.com', model: 'deepseek-flash', key: 'sk-test', provider: 'deepseek' };
const DATA_URL = 'data:image/jpeg;base64,AAAA';

function jsonResponse(obj, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => '' },
    json: async () => obj,
    text: async () => JSON.stringify(obj)
  };
}

describe('cloudOcrMessage', () => {
  it('attaches the image and the verbatim-copy instruction', () => {
    const [m] = cloudOcrMessage(DATA_URL);
    expect(m.role).toBe('user');
    expect(m.content[0]).toEqual({ type: 'image_url', image_url: { url: DATA_URL } });
    expect(m.content[1].text).toContain('حرفيًا');
    expect(m.content[1].text).toBe(OCR_CLOUD_PROMPT);
  });
});

describe('imageTokensFor', () => {
  it('charges 258 for small images', () => {
    expect(imageTokensFor(384, 384)).toBe(258);
    expect(imageTokensFor(200, 300)).toBe(258);
  });
  it('tiles larger images into 768x768 tiles', () => {
    expect(imageTokensFor(768, 768)).toBe(258);
    expect(imageTokensFor(769, 768)).toBe(258 * 2);
    expect(imageTokensFor(1600, 2400)).toBe(258 * 3 * 4); // 3 x 4 tiles
  });
});

describe('cost estimates', () => {
  it('is non-negative and provider-dependent', () => {
    const g = estimateCloudPageCost('gemini', 1600, 2400);
    const d = estimateCloudPageCost('deepseek', 1600, 2400);
    expect(g).toBeGreaterThan(0);
    expect(d).toBeGreaterThan(0);
    expect(g).not.toBe(d);
  });
  it('scales linearly with page count', () => {
    expect(estimateCloudBookCost('gemini', 100, 1600, 2400)).toBeCloseTo(estimateCloudPageCost('gemini', 1600, 2400) * 100, 10);
    expect(estimateCloudBookCost('gemini', 0, 1600, 2400)).toBe(0);
  });
});

describe('canvasToDataURL', () => {
  it('uses jpeg with the requested quality', () => {
    expect(canvasToDataURL({ toDataURL: (t, q) => t === 'image/jpeg' && q === 0.85 ? 'data:image/jpeg;base64,x' : 'bad' })).toBe('data:image/jpeg;base64,x');
  });
  it('falls back to png when jpeg throws', () => {
    const canvas = { toDataURL: t => { if (t === 'image/png') return 'data:image/png;base64,p'; throw new Error('no jpeg'); } };
    expect(canvasToDataURL(canvas)).toBe('data:image/png;base64,p');
  });
});

describe('ocrEndpoint', () => {
  it('appends /chat/completions once', () => {
    expect(ocrEndpoint('https://api.deepseek.com')).toBe('https://api.deepseek.com/chat/completions');
    expect(ocrEndpoint('https://api.deepseek.com/')).toBe('https://api.deepseek.com/chat/completions');
  });
});

describe('ocrPageCloud', () => {
  it('returns the transcribed text on success', async () => {
    const fetchFn = async () => jsonResponse({ choices: [{ message: { content: 'نص الصفحة' }, finish_reason: 'stop' }] });
    await expect(ocrPageCloud(CFG, DATA_URL, { fetchFn })).resolves.toBe('نص الصفحة');
  });
  it('throws cloud-config when the connection is missing', async () => {
    await expect(ocrPageCloud(null, DATA_URL, { fetchFn: async () => jsonResponse({}) })).rejects.toMatchObject({ code: 'cloud-config' });
  });
  it('throws empty when the model returns blank text', async () => {
    const fetchFn = async () => jsonResponse({ choices: [{ message: { content: '  ' }, finish_reason: 'stop' }] });
    await expect(ocrPageCloud(CFG, DATA_URL, { fetchFn })).rejects.toMatchObject({ code: 'empty' });
  });
  it('throws provider on a 4xx', async () => {
    const fetchFn = async () => jsonResponse({ error: { message: 'bad key' } }, 401);
    await expect(ocrPageCloud(CFG, DATA_URL, { fetchFn })).rejects.toMatchObject({ code: 'provider', status: 401 });
  });
  it('retries on 429 then succeeds', async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls++;
      if (calls === 1) return jsonResponse({ error: { message: 'busy' } }, 429);
      return jsonResponse({ choices: [{ message: { content: 'نجحت بعد إعادة المحاولة' }, finish_reason: 'stop' }] });
    };
    await expect(ocrPageCloud(CFG, DATA_URL, { fetchFn })).resolves.toBe('نجحت بعد إعادة المحاولة');
    expect(calls).toBe(2);
  });
  it('throws aborted when the signal aborts', async () => {
    const ctrl = new AbortController();
    const fetchFn = async (url, init) => {
      ctrl.abort();
      const e = new Error('aborted'); e.name = 'AbortError'; throw e;
    };
    await expect(ocrPageCloud(CFG, DATA_URL, { fetchFn, signal: ctrl.signal })).rejects.toMatchObject({ code: 'aborted' });
  });
  it('throws network when fetch rejects', async () => {
    const fetchFn = async () => { throw new Error('boom'); };
    await expect(ocrPageCloud(CFG, DATA_URL, { fetchFn })).rejects.toMatchObject({ code: 'network' });
  });
});
