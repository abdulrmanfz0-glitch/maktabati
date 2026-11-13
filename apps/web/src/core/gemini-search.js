// Pure Gemini web-search helpers: capability, native request building, SSE parsing,
// and citation normalization. No fetch, DOM, timers, or storage here.

/** Models documented for Grounding with Google Search on generateContent. */
const SEARCH_MODEL_PATTERNS = [
  /^gemini-4-(?:carbon|argon|hydrogen)(?:$|[-.])/i,
  /^gemini-3\.8-flash(?:$|[-.])/i,
  /^gemini-3\.6-flash(?:$|[-.])/i,
  /^gemini-3\.5-flash-lite(?:$|[-.])/i,
  /^gemini-3\.1-flash-lite(?:$|[-.])/i,
  /^gemini-3\.1-pro(?:$|[-.])/i,
  /^gemini-3-flash(?:$|[-.])/i,
  /^gemini-2\.5-(?:pro|flash|flash-lite)(?:$|[-.])/i,
  /^gemini-2\.0-flash(?:$|[-.])/i
];

/* Image, audio, live and video models never take the reader-chat search path. */
const NON_CHAT_MODEL = /(tts|image|transcribe|omni|lyria|nano-banana|customtools|live)/i;

const modelId = model => String(model == null ? '' : model).trim().replace(/^models\//i, '');

/** True only for documented search-capable Gemini chat models. */
export function supportsGeminiSearch(model) {
  const id = modelId(model);
  if (!id || NON_CHAT_MODEL.test(id)) return false;
  /* Only the documented Flash-Lite ids may carry -lite; a 3.8 Flash-Lite does not exist. */
  if (/-lite(?:$|[-.])/i.test(id) && !/^gemini-(?:3\.5|3\.1)-flash-lite(?:$|[-.])/i.test(id) && !/^gemini-2\.5-flash-lite(?:$|[-.])/i.test(id)) return false;
  return SEARCH_MODEL_PATTERNS.some(re => re.test(id));
}

/** Native streaming endpoint, derived from the saved OpenAI-compatible base. */
export function geminiNativeEndpoint(base, model) {
  const id = modelId(model);
  if (!id) throw new Error('model required');
  const url = new URL(String(base || '').trim());
  let path = url.pathname.replace(/\/+$/, '').replace(/\/openai$/i, '');
  if (!/\/v\d+[a-z0-9]*$/i.test(path)) path = '/v1beta';
  return url.origin + path + '/models/' + encodeURIComponent(id) + ':streamGenerateContent?alt=sse';
}

/** Native Gemini key header. Never Bearer and never a second ?key= credential. */
export function geminiSearchHeaders(key) {
  const headers = { 'Content-Type':'application/json' };
  if (key) headers['x-goog-api-key'] = String(key);
  return headers;
}

function contentList(messages) {
  const out = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || (message.role !== 'user' && message.role !== 'assistant')) continue;
    const text = String(message.content == null ? '' : message.content);
    if (!text) continue;
    const role = message.role === 'assistant' ? 'model' : 'user';
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0].text += '\n\n' + text;
    else out.push({ role, parts:[{ text }] });
  }
  return out;
}

function systemText(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter(message => message && message.role === 'system')
    .map(message => String(message.content || ''))
    .filter(Boolean)
    .join('\n\n');
}

function majorVersion(model) {
  const m = /^gemini-(\d+)/i.exec(modelId(model));
  return m ? Number(m[1]) : 0;
}

/**
 * GenerateContent request for reader chat. The tool is always google_search;
 * the model decides whether to search. Gemini 3/4 get the low thinking level
 * that the rest of the app already uses on the OpenAI-compatible path.
 */
export function buildGeminiSearchRequest({ model = '', messages = [], maxTokens = 1200, temperature = 0.7 } = {}) {
  const max = Math.max(1, Math.min(65536, Math.floor(Number(maxTokens) || 1200)));
  const body = {
    contents: contentList(messages),
    /* The REST JSON field is googleSearch. The docs call the tool google_search
       in SDK examples, but the v1beta Tool schema uses googleSearch. */
    tools: [{ googleSearch: {} }],
    generationConfig: { maxOutputTokens:max }
  };
  const temp = Number(temperature);
  if (Number.isFinite(temp)) body.generationConfig.temperature = temp;
  const system = systemText(messages);
  if (system) body.systemInstruction = { parts:[{ text:system }] };
  if (majorVersion(model) >= 3) body.generationConfig.thinkingConfig = { thinkingLevel:'LOW' };
  return body;
}

/** Short HTTP code for the search-failure note; empty for transport/empty answers. */
export function searchFailureCode(error) {
  const status = Number(error && error.status);
  return Number.isFinite(status) && status >= 400 ? String(Math.floor(status)) : '';
}

const GROUNDING_WORD = /(grounding|google\s*search|search\s*tool)/i;
const GROUNDING_REASON = /(not\s+(?:available|supported|allowed|enabled)|requires?\s+(?:a\s+)?(?:paid|billing)|paid\s+(?:plan|tier|key)|free\s+tier|enable\s+billing|billing\s+(?:is\s+)?(?:required|not\s+enabled))/i;
const QUOTA_EXHAUSTED = /(exceeded\s+your\s+current\s+quota|quota\s*(?:has\s+been\s+)?exceeded|quotaExceeded|dailyLimitExceeded|per\s+day|per\s+month|QuotaFailure|quotaId)/i;

function retryAfterFromHeader(value, now) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Math.max(0, Math.round(Number(raw) * 1000));
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

function retryAfterFromBody(text) {
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i.exec(text) || /retry\s+in\s+(\d+(?:\.\d+)?)\s*s/i.exec(text);
  return m ? Math.max(0, Math.round(Number(m[1]) * 1000)) : null;
}

/**
 * Classify a native Gemini search HTTP error from its status and actual body.
 * Grounding/billing and quota are checked before the generic 429 rate limit so
 * a free-tier grounding error is not reported as a transient rate limit.
 */
export function classifyGeminiSearchError({ status = 0, body = '', retryAfter = '', now = Date.now() } = {}) {
  const code = Number(status) || 0;
  const text = String(body == null ? '' : body);
  const retryAfterMs = retryAfterFromHeader(retryAfter, now) ?? retryAfterFromBody(text);
  let kind = 'other';
  if ([400, 402, 403, 429].includes(code) && GROUNDING_WORD.test(text) && GROUNDING_REASON.test(text)) kind = 'grounding';
  else if (QUOTA_EXHAUSTED.test(text)) kind = 'quota';
  else if (code === 429) kind = 'rate-limit';
  return { kind, status:code, retryAfterMs };
}

/** Domain shown in the source list; empty for non-http(s) or invalid URLs. */
export function citationDomain(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) { return ''; }
}

function safeHttpUrl(raw) {
  try {
    const parsed = new URL(String(raw || ''));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.href;
  } catch (e) { return ''; }
}

function indexValue(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * Turn Gemini groundingMetadata into url/title/startIndex/endIndex citations.
 * Supports that reference the same source repeatedly are deduplicated, and links
 * that are not http(s) are dropped before they reach the UI.
 */
export function normalizeGroundingMetadata(metadata) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  const queries = [...new Set((Array.isArray(meta.webSearchQueries) ? meta.webSearchQueries : [])
    .map(query => String(query == null ? '' : query).trim()).filter(Boolean))];
  const chunks = Array.isArray(meta.groundingChunks) ? meta.groundingChunks : [];
  const supports = Array.isArray(meta.groundingSupports) ? meta.groundingSupports : [];
  const citations = [], seen = new Set();

  const add = (chunk, segment) => {
    const web = chunk && chunk.web && typeof chunk.web === 'object' ? chunk.web : null;
    if (!web) return;
    const url = safeHttpUrl(web.uri);
    if (!url) return;
    const title = String(web.title == null ? '' : web.title).trim() || citationDomain(url) || url;
    const startIndex = indexValue(segment && segment.startIndex);
    const endIndex = indexValue(segment && segment.endIndex);
    const key = url + '\u0000' + (startIndex == null ? '' : startIndex) + '\u0000' + (endIndex == null ? '' : endIndex);
    if (seen.has(key)) return;
    seen.add(key);
    citations.push({ url, title, startIndex, endIndex });
  };

  if (supports.length) {
    for (const support of supports) {
      const segment = support && support.segment;
      const indices = Array.isArray(support && support.groundingChunkIndices) ? support.groundingChunkIndices : [];
      for (const index of indices) add(chunks[Number(index)], segment);
    }
  }
  if (!citations.length) for (const chunk of chunks) add(chunk, null);
  return { queries, citations };
}

/** Merge citation lists without duplicating the same URL and text position. */
export function mergeCitations(first, second) {
  const out = [], seen = new Set();
  for (const citation of (Array.isArray(first) ? first : []).concat(Array.isArray(second) ? second : [])) {
    if (!citation || typeof citation !== 'object') continue;
    const url = safeHttpUrl(citation.url);
    if (!url) continue;
    const startIndex = indexValue(citation.startIndex);
    const endIndex = indexValue(citation.endIndex);
    const key = url + '\u0000' + (startIndex == null ? '' : startIndex) + '\u0000' + (endIndex == null ? '' : endIndex);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      url,
      title:String(citation.title == null ? '' : citation.title).trim() || citationDomain(url) || url,
      startIndex,
      endIndex
    });
  }
  return out;
}

/** One row per source, safe for the collapsible list in a chat message. */
export function uniqueCitationSources(citations) {
  const out = [], seen = new Set();
  for (const citation of Array.isArray(citations) ? citations : []) {
    if (!citation || typeof citation !== 'object') continue;
    const url = safeHttpUrl(citation.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const domain = citationDomain(url);
    out.push({
      url,
      domain,
      title:String(citation.title == null ? '' : citation.title).trim() || domain || url
    });
  }
  return out;
}

/**
 * Parse complete SSE lines from streamGenerateContent?alt=sse.
 * Returns text deltas, search metadata, finish reason, and the unfinished rest.
 */
export function parseGeminiSearchSSE(buffer) {
  let rest = String(buffer || ''), events = [], done = false;
  for (;;) {
    const i = rest.indexOf('\n');
    if (i < 0) break;
    const line = rest.slice(0, i).replace(/\r$/, '').trim();
    rest = rest.slice(i + 1);
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') { done = true; break; }
    let json;
    try { json = JSON.parse(data); } catch (e) { continue; }
    if (json && json.error) {
      events.push({ error:String((json.error.message || json.error) || 'Gemini error') });
      continue;
    }
    const candidate = json && Array.isArray(json.candidates) ? json.candidates[0] : null;
    if (!candidate) continue;
    const parts = candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      if (!part || part.thought) continue;
      if (typeof part.text === 'string' && part.text) events.push({ delta:part.text });
    }
    if (candidate.groundingMetadata) events.push({ grounding:candidate.groundingMetadata });
    if (candidate.finishReason) events.push({ finish:String(candidate.finishReason) });
  }
  return { events, rest, done };
}
