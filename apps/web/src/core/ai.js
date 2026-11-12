// Pure AI request budgeting, base-URL policy, SSE parsing, retries, and card validation.
// No fetch, DOM, timers, or storage here; callers pass values in and get values out.

export const AI_DEFAULTS = Object.freeze({
  maxTokens: 1200,
  cardTokens: 700,
  contextWindow: 64000,
  firstByteTimeoutMs: 90000,
  idleStreamTimeoutMs: 20000,
  maxRetries: 2
});

/**
 * Timer guard used by aiCall. It owns one timer at a time: first-byte, then
 * stream-idle. The caller clears it in finally. Injected timers make it testable.
 */
export function createTimeoutGuard({ firstMs = AI_DEFAULTS.firstByteTimeoutMs, idleMs = AI_DEFAULTS.idleStreamTimeoutMs, onTimeout, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = null, timedOut = false;
  const clear = () => { if (timer !== null){ clearTimer(timer); timer = null; } };
  const arm = ms => {
    clear();
    timer = setTimer(() => { timer = null; timedOut = true; if (onTimeout) onTimeout(); }, ms);
  };
  return {
    first: () => arm(firstMs),
    idle: () => arm(idleMs),
    clear,
    get timedOut(){ return timedOut; },
    get pending(){ return timer !== null; }
  };
}

/** Link an outer AbortSignal (Stop, closeChat, deleteConv) to an inner controller. */
export function linkAbort(parent, ctrl) {
  if (!parent || !ctrl) return () => {};
  const onAbort = () => { try{ ctrl.abort(parent.reason); }catch(e){ ctrl.abort(); } };
  if (parent.aborted) onAbort();
  else parent.addEventListener('abort', onAbort, { once:true });
  return () => { try{ parent.removeEventListener('abort', onAbort); }catch(e){} };
}

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string';
const nonEmptyStr = v => isStr(v) && v.trim().length > 0;

export function isLocalBase(base) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(String(base || '').trim());
}

/** True only for the DeepSeek API host, never for a look-alike domain. */
export function isDeepSeekBase(base) {
  return /^https?:\/\/api\.deepseek\.com(?::\d+)?(\/|$)/i.test(String(base || '').trim());
}

/** True only for the Gemini API host, never for a look-alike domain. */
export function isGeminiBase(base) {
  return /^https?:\/\/generativelanguage\.googleapis\.com(?::\d+)?(\/|$)/i.test(String(base || '').trim());
}

/**
 * Gemini 3 models always think, and thinking tokens count against max_tokens.
 * Ask for the shortest reasoning round so an ordinary chat answer still fits.
 * Change this one constant if a future Gemini version needs a different level.
 */
export const GEMINI_REASONING_EFFORT = 'low';

/**
 * Provider-specific request fields. DeepSeek gets its explicit "no thinking" switch;
 * Gemini gets a low reasoning budget. Every other OpenAI-compatible provider gets neither.
 */
export function providerRequestOptions(base) {
  if (isDeepSeekBase(base)) return { thinking:{ type:'disabled' } };
  if (isGeminiBase(base)) return { reasoning_effort:GEMINI_REASONING_EFFORT };
  return {};
}

/**
 * Known providers for key-prefix detection. "model" is the hardcoded fallback used
 * only when GET /models cannot answer; "prefs" is the small preference list tried
 * against the model ids the provider actually returns.
 */
export const PROVIDERS = Object.freeze({
  deepseek: { id:'deepseek', label:'DeepSeek', base:'https://api.deepseek.com', model:'deepseek-flash', prefs:['deepseek-flash'] },
  gemini: { id:'gemini', label:'Gemini', base:'https://generativelanguage.googleapis.com/v1beta/openai', model:'gemini-3.8-flash', prefs:[] },
  openrouter: { id:'openrouter', label:'OpenRouter', base:'https://openrouter.ai/api/v1', model:'openai/gpt-4o-mini', prefs:['openai/gpt-4o-mini', 'google/gemini-2.5-flash', 'anthropic/claude-3.5-haiku', 'openrouter/auto'] },
  groq: { id:'groq', label:'Groq', base:'https://api.groq.com/openai/v1', model:'llama-3.3-70b-versatile', prefs:['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it'] },
  openai: { id:'openai', label:'OpenAI', base:'https://api.openai.com/v1', model:'gpt-4o-mini', prefs:['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o'] }
});

/** Detect a provider from the key prefix only. No network and no key is logged. */
export function detectProvider(key) {
  const k = String(key == null ? '' : key).trim();
  if (!k) return { kind:'empty' };
  if (k.startsWith('AIza')) return { kind:'known', provider:'gemini' };
  if (k.startsWith('sk-or-')) return { kind:'known', provider:'openrouter' };
  if (k.startsWith('gsk_')) return { kind:'known', provider:'groq' };
  if (k.startsWith('sk-ant-')) return {
    kind:'unsupported',
    provider:'anthropic',
    message:'مفاتيح Anthropic تحتاج واجهة Messages API مختلفة، والتطبيق يتكلم OpenAI Chat Completions. استخدم OpenRouter بمفتاح يبدأ بـsk-or- بدلًا منها.'
  };
  if (k.startsWith('sk-')) return { kind:'ambiguous', providers:['deepseek', 'openai'] };
  return {
    kind:'unknown',
    message:'ما عرفت المزوّد من صيغة المفتاح. افتح «خيارات متقدمة» وأدخل رابط الـAPI واسم النموذج.'
  };
}

/** GET {base}/models, without duplicating a trailing /models. */
export function modelsEndpoint(base) {
  const b = String(base || '').trim().replace(/\/+$/, '');
  return /\/models$/.test(b) ? b : b + '/models';
}

/** OpenAI-style {data:[{id}]} or a bare array of ids. Keeps first-seen order, drops duplicates. */
export function parseModels(json) {
  const rows = Array.isArray(json) ? json : (json && Array.isArray(json.data) ? json.data : []);
  const out = [];
  for (const row of rows) {
    const id = typeof row === 'string' ? row : (row && typeof row.id === 'string' ? row.id : '');
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

function versionParts(id) {
  const m = String(id).match(/(\d+(?:\.\d+)*)/);
  return m ? m[1].split('.').map(Number) : [0];
}
function compareVersions(a, b) {
  const x = versionParts(a), y = versionParts(b), n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}

/**
 * Pick a default only from ids the provider returned. Gemini prefers the newest
 * "flash" id (excluding image/audio variants); the others use their preference
 * list. Returns null when the preferred model is absent, so the UI can show the list.
 */
export function pickDefaultModel(provider, ids) {
  const list = (Array.isArray(ids) ? ids : []).map(String).filter(Boolean);
  if (!list.length) return null;
  if (provider === 'gemini') {
    const flashes = list.filter(id => /flash/i.test(id) && !/(image|tts|audio|live|embedding)/i.test(id));
    if (!flashes.length) return null;
    return flashes.slice().sort((a, b) => compareVersions(b, a) || a.localeCompare(b))[0];
  }
  const p = PROVIDERS[provider];
  if (!p) return null;
  for (const wanted of p.prefs) if (list.includes(wanted)) return wanted;
  return null;
}

/** The real message from a provider error body: object, array of objects, or plain text. */
function providerMessage(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) { const m = providerMessage(item); if (m) return m; }
    return '';
  }
  if (typeof value !== 'object') return '';
  if (value.error != null) { const m = providerMessage(value.error); if (m) return m; }
  if (value.message != null) return providerMessage(value.message);
  return '';
}

/**
 * Gemini returns some errors as a JSON array: [{"error":{"message":"..."}}].
 * Return the provider's own message when there is one, else the raw body.
 */
export function parseProviderErrorBody(text) {
  const raw = String(text == null ? '' : text);
  try {
    const message = providerMessage(JSON.parse(raw));
    if (message) return message;
  } catch (e) { /* not JSON; use the raw body */ }
  return raw.trim();
}

const EMPTY_LENGTH_MESSAGE = 'الموديل استهلك حدّ التوكنز كامل — غالبًا في التفكير — وما بقي له نص للرد. ارفع «أقصى توكنز للرد» من الإعدادات، أو استخدم موديل Flash.';
const EMPTY_MESSAGE = 'المزوّد رجّع ردًّا فارغًا بدون نص. جرّب مرة ثانية، أو غيّر الموديل.';

/** Error object for an answer that ended without any text. */
export function emptyAnswerError(finishReason) {
  const finish = finishReason == null || finishReason === '' ? null : String(finishReason);
  return { empty:true, finish, message:finish === 'length' ? EMPTY_LENGTH_MESSAGE : EMPTY_MESSAGE };
}

/** Return the answer, or throw a clear empty-answer error instead of returning ''. */
export function finishAnswer(content, finishReason) {
  const text = content == null ? '' : String(content);
  if (text.trim()) return text;
  throw emptyAnswerError(finishReason);
}

/** The two legacy names were retired on 2026-07-24; route them to the current Flash model. */
export function migrateDeepSeekModel(base, model) {
  const m = String(model || '').trim();
  if (!isDeepSeekBase(base)) return m;
  return m === 'deepseek-chat' || m === 'deepseek-reasoner' ? 'deepseek-flash' : m;
}

/** Whether this base/key combination is allowed. Local HTTP may be keyless; other HTTP may not carry a key. */
export function basePolicy(base, key) {
  const b = String(base || '').trim();
  if (!/^https?:\/\//i.test(b)) return { ok:false, reason:'url', message:'رابط الـAPI لازم يبدأ بـhttp:// أو https://.' };
  if (isLocalBase(b)) return { ok:true, sendAuth:!!key, local:true };
  if (/^https:\/\//i.test(b)) return { ok:true, sendAuth:!!key, local:false };
  return { ok:false, reason:'insecure', message:'لا أرسل مفتاحًا إلى رابط غير مشفّر. استخدم https أو localhost.' };
}

/** Keyless operation is only for localhost/127.0.0.1. */
export const keylessAllowed = base => isLocalBase(base);

/** Conservative token estimate: Arabic costs more per character than Latin. */
export function estimateTextTokens(text) {
  const s = String(text == null ? '' : text);
  let ar = 0, other = 0;
  for (const ch of s) {
    if (/[\u0600-\u06FF]/.test(ch)) ar++;
    else if (!/\s/.test(ch)) other++;
  }
  return Math.ceil(ar / 1.5 + other / 3.5) + 1;
}

export function estimateMessagesTokens(messages) {
  return (messages || []).reduce((n, m) => n + 4 + estimateTextTokens(m && m.content), 0) + 2;
}

/** Take a window around a focus phrase, else from the start. */
export function clipAround(text, focus, maxChars) {
  const s = String(text || '');
  const max = Math.max(0, Math.floor(maxChars));
  if (s.length <= max) return s;
  if (!max) return '';
  const f = String(focus || '').trim().slice(0, 40);
  const i = f ? s.indexOf(f) : -1;
  const start = i >= 0 ? Math.max(0, i - Math.floor(max / 3)) : 0;
  return (start ? '…' : '') + s.slice(start, start + max) + (start + max < s.length ? '…' : '');
}

function assemble(base, parts, history) {
  const refs = parts.filter(p => p.text).map(p => '<' + p.id + '>\n' + (p.label ? p.label + '\n' : '') + p.text + '\n</' + p.id + '>').join('\n\n');
  const system = base + (refs ? '\n\n<reference_material>\n' + refs + '\n</reference_material>' : '');
  return [{ role:'system', content:system }].concat(history.map(m => ({ role:m.role, content:String(m.content || '') })));
}

/**
 * Fit a request into a context budget.
 * Order: oldest history, then reference parts from first to last, then clip the last
 * remaining part around the reader's focus. The system prompt and newest message stay.
 * @returns {{ok:boolean, messages:Array, estimated:number, error?:string}}
 */
export function fitRequest({ base, parts = [], history = [], budget, focus = '' }) {
  const limit = Math.max(512, Number(budget) || AI_DEFAULTS.contextWindow);
  let h = history.slice();
  let p = parts.map(x => ({ id:x.id || 'part', label:x.label || '', text:String(x.text || '') }));
  const original = p.map(x => x.text);
  const build = () => assemble(base, p, h);
  let messages = build(), estimate = estimateMessagesTokens(messages);

  while (estimate > limit && h.length > 1) { h.shift(); messages = build(); estimate = estimateMessagesTokens(messages); }
  for (let i = 0; i < p.length && estimate > limit; i++) {
    if (!p[i].text) continue;
    p[i].text = '';
    messages = build(); estimate = estimateMessagesTokens(messages);
  }
  if (estimate > limit) {
    let last = -1;
    for (let i = p.length - 1; i >= 0; i--) if (original[i]) { last = i; break; }
    if (last >= 0) {
      let chars = original[last].length;
      while (estimate > limit && chars > 300) {
        chars = Math.max(300, Math.floor(chars * 0.6));
        p[last].text = clipAround(original[last], focus, chars);
        messages = build(); estimate = estimateMessagesTokens(messages);
      }
    }
  }
  if (estimate > limit) return { ok:false, messages:null, estimated:estimate, error:'context' };
  return { ok:true, messages, estimated:estimate };
}

/** Parse complete SSE lines from a buffer. Returns events, the unfinished rest, and whether [DONE] was seen. */
export function parseSSE(buffer) {
  let rest = String(buffer || ''), events = [], done = false;
  for (;;) {
    const i = rest.indexOf('\n');
    if (i < 0) break;
    let line = rest.slice(0, i).replace(/\r$/, '').trim();
    rest = rest.slice(i + 1);
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') { done = true; break; }
    try {
      const j = JSON.parse(data);
      if (j && j.error) events.push({ error: String((j.error.message || j.error) || 'AI error') });
      else {
        const choice = j && j.choices && j.choices[0];
        const t = choice && choice.delta && choice.delta.content;
        if (t) events.push({ delta: t });
        if (choice && choice.finish_reason) events.push({ finish: String(choice.finish_reason) });
      }
    } catch (e) { /* ignore malformed SSE lines */ }
  }
  return { events, rest, done };
}

export function shouldRetry(status) {
  return [429, 500, 502, 503, 504].includes(Number(status));
}

/** Delay in ms for a retry attempt (0-based), honouring Retry-After seconds or HTTP date. */
export function retryDelayMs(attempt, retryAfter, now = Date.now()) {
  const base = Math.min(8000, 500 * 2 ** Math.max(0, attempt));
  if (retryAfter == null || retryAfter === '') return base;
  const s = String(retryAfter).trim();
  if (/^\d+$/.test(s)) return Math.min(15000, Math.max(base, Number(s) * 1000));
  const t = Date.parse(s);
  if (Number.isFinite(t)) return Math.min(15000, Math.max(base, t - now));
  return base;
}

/** Validate and normalize a chapter card. Returns null when the shape is wrong. */
export function validateCard(j) {
  if (!isObj(j) || !Array.isArray(j.ideas) || !j.ideas.length || !j.ideas.every(nonEmptyStr)) return null;
  for (const k of ['terms', 'topics']) if (j[k] != null && (!Array.isArray(j[k]) || !j[k].every(nonEmptyStr))) return null;
  return {
    ideas: j.ideas.map(x => x.trim()).slice(0, 6),
    terms: (j.terms || []).map(x => x.trim()).slice(0, 12),
    topics: (j.topics || []).map(x => x.trim()).slice(0, 8)
  };
}
