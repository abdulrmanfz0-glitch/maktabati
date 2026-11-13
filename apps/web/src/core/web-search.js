// Web-search modes and DeepSeek server-tool helpers. Pure: no fetch, DOM, timers,
// or storage. Gemini request/SSE helpers live in gemini-search.js.
import { supportsGeminiSearch, uniqueCitationSources } from './gemini-search.js';
import { arCount } from './ocr-store.js';

export const SEARCH_MODES = Object.freeze({ auto:'auto', manual:'manual', none:'none' });

/**
 * auto: DeepSeek and Gemini 3+ (the model decides on every request).
 * manual: Gemini 2.5 and older, billed per prompt; the chat toggle controls it.
 * none: providers without a native search tool here.
 */
export function searchModeFor(provider, model) {
  if (provider === 'deepseek') return SEARCH_MODES.auto;
  if (provider === 'gemini') {
    const m = /^gemini-(\d+)(?:\.(\d+))?/i.exec(String(model || '').trim().replace(/^models\//i, ''));
    if (!m) return SEARCH_MODES.manual;
    return Number(m[1]) >= 3 ? SEARCH_MODES.auto : SEARCH_MODES.manual;
  }
  return SEARCH_MODES.none;
}

/**
 * Resolve whether this chat request should carry a native search tool.
 * autoSetting=false is a master off switch: no tool is ever attached.
 * manual=true is the per-conversation toggle for manual-mode models.
 */
export function searchPlan({ provider, model, autoSetting = true, manual = false } = {}) {
  const mode = searchModeFor(provider, model);
  if (mode === SEARCH_MODES.none) return { mode, attach:false, reason:'provider' };
  if (!autoSetting) return { mode, attach:false, reason:'auto-off' };
  if (mode === SEARCH_MODES.auto) {
    if (provider === 'deepseek') return { mode, attach:true, reason:'auto' };
    if (provider === 'gemini' && supportsGeminiSearch(model)) return { mode, attach:true, reason:'auto' };
    return { mode, attach:false, reason:'model' };
  }
  if (!manual) return { mode, attach:false, reason:'manual-off' };
  if (provider === 'gemini' && supportsGeminiSearch(model)) return { mode, attach:true, reason:'manual' };
  return { mode, attach:false, reason:'model' };
}

/** Only the web-search tool: no title, tool_choice, or other server tools. */
export function deepSeekSearchFields(search) {
  return search && search.attach ? { tools:[{ type:'deepseek_web_search' }] } : {};
}

/** Add the previous assistant's calls back, unchanged, for DeepSeek only. */
export function historyWithServerToolCalls(row, message, provider) {
  if (provider !== 'deepseek' || !row || row.role !== 'assistant' || !message || message.role !== 'assistant' || !Array.isArray(message.serverToolCalls) || !message.serverToolCalls.length) return row;
  return Object.assign({}, row, { server_tool_calls:message.serverToolCalls });
}

/** Sources from final server_tool_calls (sources/pages) and annotations. */
export function deepSeekSearchSources(serverToolCalls, annotations) {
  const raw = [];
  for (const step of Array.isArray(serverToolCalls) ? serverToolCalls : []) {
    for (const call of Array.isArray(step && step.calls) ? step.calls : []) {
      for (const source of Array.isArray(call && call.sources) ? call.sources : []) {
        if (source && source.url) raw.push({ url:source.url, title:source.title || source.site_name || '' });
      }
      if (call && call.page && call.page.url) raw.push({ url:call.page.url, title:call.page.title || '' });
    }
  }
  for (const annotation of Array.isArray(annotations) ? annotations : []) {
    const citation = annotation && annotation.url_citation;
    if (citation && citation.url) raw.push({ url:citation.url, title:citation.title || '' });
  }
  return uniqueCitationSources(raw);
}

/** Search queries from the final server_tool_calls, deduplicated. */
export function deepSeekSearchQueries(serverToolCalls) {
  const out = [];
  for (const step of Array.isArray(serverToolCalls) ? serverToolCalls : []) {
    for (const call of Array.isArray(step && step.calls) ? step.calls : []) {
      const queries = call && call.action && Array.isArray(call.action.queries) ? call.action.queries : [];
      for (const q of queries) {
        const text = String(q == null ? '' : q).trim();
        if (text && !out.includes(text)) out.push(text);
      }
    }
  }
  return out;
}

function retryFromHeader(value, now) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Math.max(0, Math.round(Number(raw) * 1000));
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

function retryFromBody(text) {
  const m = /"retry_after"\s*:\s*"?(\d+(?:\.\d+)?)"?/i.exec(text) || /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i.exec(text) || /retry\s+(?:after|in)\s+(\d+(?:\.\d+)?)/i.exec(text);
  return m ? Math.max(0, Math.round(Number(m[1]) * 1000)) : null;
}

/** Classify a DeepSeek web-search failure from status/body. */
export function classifyDeepSeekSearchError({ status = 0, body = '', detail = '', retryAfter = '', now = Date.now() } = {}) {
  const code = Number(status) || 0;
  const text = String(body || detail || '');
  const retry = retryFromHeader(retryAfter, now) ?? retryFromBody(text);
  if (code === 402 || /insufficient\s+balance|balance.*insufficient|رصيد/i.test(text)) {
    return { kind:'deepseek-balance', status:code, retryAfterMs:null };
  }
  if (code === 429 || /rate\s*limit|qps|too\s+many\s+requests/i.test(text)) {
    return { kind:'deepseek-rate', status:code, retryAfterMs:retry };
  }
  if (code >= 200 && code < 300 && text) {
    return { kind:'deepseek-stream', status:code, retryAfterMs:null };
  }
  return { kind:'', status:code, retryAfterMs:null };
}

export const SEARCH_ERROR_KINDS = Object.freeze(['grounding', 'rate-limit', 'quota', 'deepseek-balance', 'deepseek-rate', 'deepseek-stream']);
export const isSearchErrorKind = kind => SEARCH_ERROR_KINDS.includes(kind);

function waitSeconds(ms) {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.ceil(n / 1000)) : 0;
}

/** Arabic/English copy for a classified search failure. */
export function searchErrorText(kind, retryAfterMs = 0, lang = 'ar') {
  const en = lang === 'en';
  const wait = waitSeconds(retryAfterMs);
  if (kind === 'grounding') return en
    ? 'Web search with this model needs a paid Gemini key.'
    : 'البحث في الإنترنت بهذا الموديل يحتاج مفتاح Gemini مدفوع.';
  if (kind === 'rate-limit') return en
    ? 'Gemini search hit its rate limit.' + (wait ? ' Wait ' + wait + 's, then try again.' : ' Wait a moment, then try again.')
    : 'بحث Gemini وصل حد الطلبات.' + (wait ? ' انتظر ' + arCount(wait, 'ثانية') + ' ثم جرّب.' : ' انتظر قليلًا ثم جرّب.');
  if (kind === 'deepseek-rate') return en
    ? 'DeepSeek search hit its rate limit.' + (wait ? ' Wait ' + wait + 's, then try again.' : ' Wait a moment, then try again.')
    : 'بحث DeepSeek وصل حد الطلبات.' + (wait ? ' انتظر ' + arCount(wait, 'ثانية') + ' ثم جرّب.' : ' انتظر قليلًا ثم جرّب.');
  if (kind === 'quota') return en
    ? 'Gemini search quota is exhausted on this key. Try later or use another key.'
    : 'انتهت حصة بحث Gemini على هذا المفتاح. جرّب لاحقًا أو استخدم مفتاحًا آخر.';
  if (kind === 'deepseek-balance') return en
    ? 'DeepSeek balance is not enough for search.'
    : 'رصيد DeepSeek ما يكفي للبحث.';
  if (kind === 'deepseek-stream') return en
    ? 'DeepSeek search failed.'
    : 'تعذّر البحث في DeepSeek.';
  return en ? 'Web search failed.' : 'تعذّر البحث في الإنترنت.';
}
