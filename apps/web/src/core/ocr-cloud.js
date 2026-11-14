// Cloud OCR (quality boost): transcribe a page image through the reader's own
// AI model. Pure helpers plus one self-contained fetch, reusing ai.js policies
// (base/key/headers/retries). No DOM, timers, or storage; fetch is injectable.
import {
  basePolicy, keylessAllowed, providerChatHeaders, providerRequestOptions,
  parseProviderErrorBody, shouldRetry, retryDelayMs
} from './ai.js';

/** The reader's model must copy the page verbatim, never rewrite the author's text. */
export const OCR_CLOUD_PROMPT =
  'انسخ نص هذه الصفحة حرفيًا كما هو، دون أي إضافة أو تصحيح أو حذف أو تلخيص. ' +
  'حافظ على التشكيل وعلامات الترقيم وترتيب الأسطر والفقرات والحواشي إن وُجدت. ' +
  'أخرج النص فقط، بلا أي كلام آخر.';

export const OCR_CLOUD_MAX_TOKENS = 4000;
/** Approximate Arabic output tokens per page (measured in OCR_PLAN.md). */
export const OCR_CLOUD_OUTPUT_TOKENS = 700;

/** OpenAI-style messages: the page image plus the verbatim-copy instruction. */
export function cloudOcrMessage(dataURL) {
  return [{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: dataURL } },
      { type: 'text', text: OCR_CLOUD_PROMPT }
    ]
  }];
}

/**
 * Gemini image-token rule: an image ≤384px on both sides costs 258 tokens;
 * anything larger is tiled into 768×768 tiles at 258 tokens each.
 */
export function imageTokensFor(width, height) {
  const w = Math.max(1, Math.floor(Number(width) || 0));
  const h = Math.max(1, Math.floor(Number(height) || 0));
  if (w <= 384 && h <= 384) return 258;
  return Math.ceil(w / 768) * Math.ceil(h / 768) * 258;
}

/** $ per 1M input/output tokens (Nov 2026, from OCR_PLAN.md §3-b). */
const RATES = Object.freeze({
  gemini: { input: 0.25, output: 1.50 },
  deepseek: { input: 0.15, output: 0.60 },
  openai: { input: 0.10, output: 0.50 },
  anthropic: { input: 0.10, output: 0.50 },
  groq: { input: 0.80, output: 4.00 },
  openrouter: { input: 0.10, output: 0.50 },
  custom: { input: 0.10, output: 0.50 }
});

/** Rough cost in USD to transcribe one page with the given provider. */
export function estimateCloudPageCost(provider, width, height) {
  const r = RATES[provider] || RATES.custom;
  return (imageTokensFor(width, height) / 1e6) * r.input + (OCR_CLOUD_OUTPUT_TOKENS / 1e6) * r.output;
}

/** Rough cost in USD for a whole book. */
export function estimateCloudBookCost(provider, pages, width, height) {
  return estimateCloudPageCost(provider, width, height) * Math.max(0, Math.floor(Number(pages) || 0));
}

/** Canvas → JPEG data URL (PNG fallback). The page image never touches disk. */
export function canvasToDataURL(canvas, quality = 0.85) {
  try { return canvas.toDataURL('image/jpeg', quality); }
  catch (e) { return canvas.toDataURL('image/png'); }
}

/** The OpenAI-compatible Chat Completions endpoint for a base URL. */
export const ocrEndpoint = base => String(base || '').trim().replace(/\/+$/, '') + '/chat/completions';

/**
 * Transcribe one page image (data URL) through the reader's configured model.
 * @param {object} cfg  resolveAiConfig() shape: { base, model, key, provider }.
 * @param {string} dataURL
 * @param {{ max?:number, signal?:AbortSignal, fetchFn?:typeof fetch }} opts
 * @returns {Promise<string>} the verbatim text (trimmed), throws { code, status?, message? }.
 */
export async function ocrPageCloud(cfg, dataURL, opts = {}) {
  const policy = cfg ? basePolicy(cfg.base, cfg.key) : { ok: false };
  if (!cfg || !cfg.base || !cfg.model || !policy.ok || (!cfg.key && !keylessAllowed(cfg.base))) {
    throw { code: 'cloud-config', message: 'اتصال الذكاء غير مهيأ للقراءة بالصور.' };
  }
  const fetchFn = opts.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
  if (typeof fetchFn !== 'function') throw { code: 'cloud-fetch', message: 'fetch غير متاح.' };

  const body = {
    model: cfg.model,
    messages: cloudOcrMessage(dataURL),
    max_tokens: Math.max(1, Math.min(8000, Math.floor(Number(opts.max) || OCR_CLOUD_MAX_TOKENS))),
    temperature: 0
  };
  Object.assign(body, providerRequestOptions(cfg.base));
  const headers = Object.assign({ 'Content-Type': 'application/json' }, providerChatHeaders(cfg.base, cfg.key));

  const ctrl = new AbortController();
  const onAbort = () => { try { ctrl.abort(); } catch (e) {} };
  if (opts.signal) {
    if (opts.signal.aborted) throw { code: 'aborted' };
    opts.signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetchFn(ocrEndpoint(cfg.base), { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
      } catch (e) {
        if (opts.signal && opts.signal.aborted) throw { code: 'aborted' };
        throw { code: 'network', message: String((e && e.message) || e) };
      }
      if (res.ok) {
        const j = await res.json().catch(() => null);
        if (j && j.error) throw { code: 'provider', status: res.status, message: String((j.error.message || j.error) || 'AI error') };
        const choice = j && j.choices && j.choices[0];
        const text = choice && choice.message && choice.message.content;
        if (typeof text === 'string' && text.trim()) return text.trim();
        throw { code: 'empty', status: res.status, message: 'المزوّد رجّع نصًّا فارغًا.' };
      }
      const detail = await res.text().then(parseProviderErrorBody).catch(() => '');
      if (shouldRetry(res.status) && attempt < 2) {
        await new Promise(r => setTimeout(r, retryDelayMs(attempt, (res.headers && res.headers.get) ? res.headers.get('retry-after') : '')));
        continue;
      }
      throw { code: 'provider', status: res.status, message: detail || ('HTTP ' + res.status) };
    }
  } finally {
    if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
  }
}
