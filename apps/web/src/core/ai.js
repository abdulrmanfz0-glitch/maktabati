// Pure AI request budgeting, base-URL policy, SSE parsing, retries, and card validation.
// No fetch, DOM, timers, or storage here; callers pass values in and get values out.

export const AI_DEFAULTS = Object.freeze({
  maxTokens: 1200,
  cardTokens: 700,
  contextWindow: 64000,
  firstByteTimeoutMs: 30000,
  idleStreamTimeoutMs: 20000,
  maxRetries: 2
});

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string';
const nonEmptyStr = v => isStr(v) && v.trim().length > 0;

export function isLocalBase(base) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(String(base || '').trim());
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
        const t = j && j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (t) events.push({ delta: t });
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
