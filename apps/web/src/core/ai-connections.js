// Multiple AI connections, pinned models, per-task defaults, and migration from
// the old single `maktabati:ai` config. Pure functions only: no fetch, DOM,
// timers, or localStorage. Keys travel through these objects, but exports never
// include them.
import {
  AI_DEFAULTS, PROVIDERS, providerForBase, migrateDeepSeekModel,
  filterModelChoices, pickDefaultModel
} from './ai.js';

export const AI_STATE_VERSION = 2;

/** Every AI feature that can use its own pinned model. Chat is the fallback. */
export const AI_TASKS = Object.freeze([
  { id:'chat', label:'الدردشة' },
  { id:'translation', label:'الترجمة' },
  { id:'cards', label:'بطاقات الفصول' }
]);

const TASK_BY_ID = new Map(AI_TASKS.map(t => [t.id, t]));
const clean = s => typeof s === 'string' ? s.trim() : '';
const plain = s => typeof s === 'string' ? s : '';
const clampInt = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
};
const copy = value => JSON.parse(JSON.stringify(value));

export function taskLabel(task) {
  const t = TASK_BY_ID.get(task);
  return t ? t.label : task;
}

export function providerLabel(provider) {
  const p = PROVIDERS[provider];
  return p ? p.label : 'مخصّص';
}

/** The visible default name for a connection. Never includes a key. */
export function defaultConnectionLabel(provider, base) {
  if (PROVIDERS[provider]) return PROVIDERS[provider].label;
  try {
    const url = new URL(String(base || ''));
    return url.hostname.replace(/^www\./i, '') || 'اتصال مخصّص';
  } catch (e) { return 'اتصال مخصّص'; }
}

/** Provider limits, used when a migrated config has no explicit limits. */
export function limitsForProvider(provider) {
  const lim = PROVIDERS[provider] ? PROVIDERS[provider].limits : AI_DEFAULTS;
  return { max:lim.max, ctx:lim.ctx, first:lim.first };
}

/**
 * Short, human labels for switchers: "DeepSeek Flash", "Gemini 3.1 Flash Lite".
 * This is presentation only; the request always uses the exact model id.
 */
export function shortModelLabel(provider, model) {
  const raw = clean(model).replace(/^models\//i, '');
  if (!raw) return providerLabel(provider);
  const tail = raw.includes('/') ? raw.slice(raw.lastIndexOf('/') + 1) : raw;
  let s = tail
    .replace(/^deepseek[-_]/i, '')
    .replace(/^claude[-_]/i, '')
    .replace(/^gemini[-_]/i, '')
    .replace(/^gpt[-_]/i, 'gpt ')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/\b([a-z])/g, ch => ch.toUpperCase());
  s = s.replace(/\bGpt\b/g, 'GPT');
  s = s.replace(/\b(\d+)\s+(\d+)\b/g, '$1.$2');
  const prefix = provider === 'custom' ? '' : providerLabel(provider) + ' ';
  s = (prefix + s).trim();
  return s.length > 30 ? s.slice(0, 29) + '…' : s;
}

export function emptyAiState() {
  return { v:AI_STATE_VERSION, connections:[], pinned:[], defaults:{} };
}

export function isAiState(raw) {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw) &&
    raw.v === AI_STATE_VERSION && Array.isArray(raw.connections) && Array.isArray(raw.pinned);
}

export function pinKey(pin) {
  return pin && pin.connectionId && pin.model ? pin.connectionId + '|' + pin.model : '';
}

export function parsePinKey(key) {
  const i = String(key || '').indexOf('|');
  if (i < 1) return null;
  return { connectionId:String(key).slice(0, i), model:String(key).slice(i + 1) };
}

function normalizeConnection(raw, index, usedIds) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const provider = PROVIDERS[src.provider] ? src.provider : 'custom';
  const limits = limitsForProvider(provider);
  let id = clean(src.id);
  if (!id || usedIds.has(id)) id = 'c' + (index + 1);
  while (usedIds.has(id)) id = id + 'x';
  usedIds.add(id);
  return {
    id,
    provider,
    base: clean(src.base),
    key: plain(src.key),
    label: clean(src.label) || defaultConnectionLabel(provider, src.base),
    max: clampInt(src.max, 1, 8000, limits.max),
    ctx: clampInt(src.ctx, 1024, 1000000, limits.ctx),
    first: clampInt(src.first, 5000, 300000, limits.first)
  };
}

/** Normalize a stored state without dropping keys or inventing connections. */
export function normalizeAiState(raw) {
  if (!isAiState(raw)) return emptyAiState();
  const usedIds = new Set();
  const connections = raw.connections.map((c, i) => normalizeConnection(c, i, usedIds));
  const byId = new Map(connections.map(c => [c.id, c]));
  const seen = new Set();
  const pinned = [];
  for (const p of raw.pinned) {
    if (!p || typeof p !== 'object') continue;
    const connectionId = clean(p.connectionId);
    const model = clean(p.model);
    if (!connectionId || !model || !byId.has(connectionId)) continue;
    const key = connectionId + '|' + model;
    if (seen.has(key)) continue;
    seen.add(key);
    const pin = { connectionId, model };
    if (clean(p.label)) pin.label = clean(p.label);
    pinned.push(pin);
  }
  const pinSet = new Set(pinned.map(pinKey));
  const defaults = {};
  const rawDefaults = raw.defaults && typeof raw.defaults === 'object' && !Array.isArray(raw.defaults) ? raw.defaults : {};
  for (const task of AI_TASKS) {
    const d = rawDefaults[task.id];
    if (!d || typeof d !== 'object') continue;
    const connectionId = clean(d.connectionId);
    const model = clean(d.model);
    if (pinSet.has(connectionId + '|' + model)) defaults[task.id] = { connectionId, model };
  }
  return { v:AI_STATE_VERSION, connections, pinned, defaults };
}

/**
 * Turn the old single config into the first connection. Its model is pinned and
 * used by every task; max/ctx/first keep the saved values or the provider limits.
 * Running this on a v2 state is a no-op, so it is safe on every load.
 */
export function migrateAiConfig(raw) {
  if (isAiState(raw)) return normalizeAiState(raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyAiState();
  const hasConfig = ['base', 'model', 'key', 'max', 'ctx', 'first'].some(k =>
    Object.prototype.hasOwnProperty.call(raw, k) && raw[k] != null && raw[k] !== '');
  if (!hasConfig) return emptyAiState();

  const base = clean(raw.base) || PROVIDERS.deepseek.base;
  const found = providerForBase(base);
  const provider = found ? found.id : 'custom';
  const limits = limitsForProvider(provider);
  const model = migrateDeepSeekModel(base, clean(raw.model) || (found ? PROVIDERS[provider].model : ''));
  const connection = {
    id:'c1',
    provider,
    base,
    key: plain(raw.key),
    label: defaultConnectionLabel(provider, base),
    max: clampInt(raw.max, 1, 8000, limits.max),
    ctx: clampInt(raw.ctx, 1024, 1000000, limits.ctx),
    first: clampInt(raw.first, 5000, 300000, limits.first)
  };
  const state = { v:AI_STATE_VERSION, connections:[connection], pinned:[], defaults:{} };
  if (model) {
    state.pinned.push({ connectionId:connection.id, model, label:shortModelLabel(provider, model) });
    for (const task of AI_TASKS) state.defaults[task.id] = { connectionId:connection.id, model };
  }
  return normalizeAiState(state);
}

export function nextConnectionId(state) {
  const s = isAiState(state) ? state : emptyAiState();
  const ids = new Set(s.connections.map(c => c.id));
  let i = 1;
  while (ids.has('c' + i)) i++;
  return 'c' + i;
}

export function addConnection(state, connection) {
  const s = copy(normalizeAiState(state));
  const used = new Set(s.connections.map(c => c.id));
  const next = normalizeConnection(Object.assign({}, connection, { id:clean(connection && connection.id) || nextConnectionId(s) }), s.connections.length, used);
  if (s.connections.some(c => c.id === next.id)) return normalizeAiState(s);
  s.connections.push(next);
  return normalizeAiState(s);
}

export function findConnection(state, id) {
  if (!isAiState(state)) return null;
  return state.connections.find(c => c.id === id) || null;
}

export function renameConnection(state, id, label) {
  const s = copy(normalizeAiState(state));
  const conn = s.connections.find(c => c.id === id);
  if (!conn) return normalizeAiState(s);
  conn.label = clean(label) || defaultConnectionLabel(conn.provider, conn.base);
  return normalizeAiState(s);
}

export function findPinned(state, pin) {
  if (!isAiState(state) || !pin) return null;
  return state.pinned.find(p => p.connectionId === pin.connectionId && p.model === pin.model) || null;
}

export function pinsForConnection(state, connectionId) {
  if (!isAiState(state)) return [];
  const conn = state.connections.find(c => c.id === connectionId);
  if (!conn) return [];
  return state.pinned.filter(p => p.connectionId === connectionId)
    .map(p => ({ connectionId:p.connectionId, model:p.model, label:p.label || shortModelLabel(conn.provider, p.model) }));
}

/** Every valid pinned model, enriched with labels and its connection. */
export function allPinned(state) {
  if (!isAiState(state)) return [];
  const out = [];
  for (const c of state.connections) {
    for (const p of state.pinned) {
      if (p.connectionId !== c.id) continue;
      out.push({
        connectionId:c.id,
        model:p.model,
        label:p.label || shortModelLabel(c.provider, p.model),
        connectionLabel:c.label,
        provider:c.provider,
        providerLabel:providerLabel(c.provider)
      });
    }
  }
  return out;
}

/** Pins grouped by connection for the switcher and the defaults dropdowns. */
export function groupedPins(state) {
  if (!isAiState(state)) return [];
  return state.connections.map(c => ({
    connectionId:c.id,
    label:c.label,
    provider:c.provider,
    providerLabel:providerLabel(c.provider),
    pins:allPinned(state).filter(p => p.connectionId === c.id)
  })).filter(g => g.pins.length);
}

export function defaultPinForTask(state, task) {
  if (!isAiState(state)) return null;
  const own = state.defaults[task];
  if (own && findPinned(state, own)) return { connectionId:own.connectionId, model:own.model };
  const chat = state.defaults.chat;
  if (chat && findPinned(state, chat)) return { connectionId:chat.connectionId, model:chat.model };
  return null;
}

/** The pin a conversation should use: its explicit choice, else the chat default. */
export function resolveChatPin(state, explicit) {
  if (explicit && findPinned(state, explicit)) return { connectionId:explicit.connectionId, model:explicit.model };
  return defaultPinForTask(state, 'chat');
}

/**
 * Resolve the request config for one task. `override` is a conversation pin.
 * Returns null when no task default and no chat default exist.
 */
export function resolveAiConfig(state, task = 'chat', override = null) {
  if (!isAiState(state)) return null;
  const pin = override && findPinned(state, override)
    ? { connectionId:override.connectionId, model:override.model }
    : defaultPinForTask(state, task);
  if (!pin) return null;
  const conn = findConnection(state, pin.connectionId);
  const pinned = findPinned(state, pin);
  if (!conn || !pinned) return null;
  const model = migrateDeepSeekModel(conn.base, pin.model);
  return {
    base:conn.base,
    model,
    key:conn.key,
    max:conn.max,
    ctx:conn.ctx,
    first:conn.first,
    connectionId:conn.id,
    connectionLabel:conn.label,
    provider:conn.provider,
    providerLabel:providerLabel(conn.provider),
    pin:{ connectionId:pin.connectionId, model },
    task
  };
}

export function setTaskDefault(state, task, pin) {
  const s = copy(normalizeAiState(state));
  if (!TASK_BY_ID.has(task)) return normalizeAiState(s);
  if (pin && findPinned(s, pin)) s.defaults[task] = { connectionId:pin.connectionId, model:pin.model };
  else delete s.defaults[task];
  return normalizeAiState(s);
}

export function setAllDefaultsToPin(state, pin) {
  const s = copy(normalizeAiState(state));
  if (!findPinned(s, pin)) return normalizeAiState(s);
  for (const task of AI_TASKS) s.defaults[task.id] = { connectionId:pin.connectionId, model:pin.model };
  return normalizeAiState(s);
}

function fallbackTarget(s, removedKey) {
  const chat = s.defaults.chat;
  if (chat && pinKey(chat) !== removedKey && findPinned(s, chat)) return { connectionId:chat.connectionId, model:chat.model };
  const first = s.pinned.find(p => pinKey(p) !== removedKey);
  return first ? { connectionId:first.connectionId, model:first.model } : null;
}

/**
 * Remove a connection, its pins, and its key. Every task that used it falls
 * back to the chat default (or the first remaining pinned model). The returned
 * `fallbacks` drives the Arabic "so-and-so moved to..." message.
 */
export function removeConnection(state, id) {
  const s = copy(normalizeAiState(state));
  const removed = s.connections.find(c => c.id === id) || null;
  if (!removed) return { state:normalizeAiState(s), removed:null, fallbacks:[] };
  const before = AI_TASKS.map(task => ({ task:task.id, pin:defaultPinForTask(s, task.id) }));
  s.connections = s.connections.filter(c => c.id !== id);
  s.pinned = s.pinned.filter(p => p.connectionId !== id);
  const fallback = fallbackTarget(s, '');
  const fallbacks = [];
  for (const row of before) {
    if (!row.pin || row.pin.connectionId !== id) continue;
    if (fallback) s.defaults[row.task] = { connectionId:fallback.connectionId, model:fallback.model };
    else delete s.defaults[row.task];
    fallbacks.push({ task:row.task, from:row.pin, to:fallback ? { connectionId:fallback.connectionId, model:fallback.model } : null });
  }
  if (s.defaults.chat && !findPinned(s, s.defaults.chat)) delete s.defaults.chat;
  return { state:normalizeAiState(s), removed, fallbacks };
}

/**
 * Replace the pinned models for one connection. Unpinning a model that a task
 * used moves that task to the chat default and reports it in `fallbacks`.
 */
export function setConnectionPins(state, connectionId, models) {
  const s = copy(normalizeAiState(state));
  const conn = s.connections.find(c => c.id === connectionId);
  if (!conn) return { state:normalizeAiState(s), fallbacks:[] };
  const before = new Map(s.pinned.filter(p => p.connectionId === connectionId).map(p => [p.model, p]));
  const wanted = [];
  const seen = new Set();
  for (const raw of Array.isArray(models) ? models : []) {
    const model = clean(raw);
    if (!model || seen.has(model)) continue;
    seen.add(model);
    const old = before.get(model);
    wanted.push(old ? { connectionId, model, label:old.label || shortModelLabel(conn.provider, model) }
      : { connectionId, model, label:shortModelLabel(conn.provider, model) });
  }
  s.pinned = s.pinned.filter(p => p.connectionId !== connectionId).concat(wanted);
  const fallback = fallbackTarget(s, '');
  const fallbacks = [];
  for (const task of AI_TASKS) {
    const d = s.defaults[task.id];
    if (!d) continue;
    if (findPinned(s, d)) continue;
    if (fallback) s.defaults[task.id] = { connectionId:fallback.connectionId, model:fallback.model };
    else delete s.defaults[task.id];
    fallbacks.push({ task:task.id, from:{ connectionId:d.connectionId, model:d.model }, to:fallback ? { connectionId:fallback.connectionId, model:fallback.model } : null });
  }
  return { state:normalizeAiState(s), fallbacks };
}

export function pinModel(state, connectionId, model) {
  const s = copy(normalizeAiState(state));
  const conn = s.connections.find(c => c.id === connectionId);
  const id = clean(model);
  if (!conn || !id) return normalizeAiState(s);
  if (!findPinned(s, { connectionId, model:id })) s.pinned.push({ connectionId, model:id, label:shortModelLabel(conn.provider, id) });
  return normalizeAiState(s);
}

/** Exact model ids from a /models response, filtered for the provider's picker. */
export function modelChoicesFor(provider, ids) {
  const normalized = (Array.isArray(ids) ? ids : [])
    .map(id => String(id || '').trim().replace(/^models\//i, ''))
    .filter(Boolean);
  return filterModelChoices(provider, normalized);
}

export function defaultModelFor(provider, ids) {
  const p = PROVIDERS[provider];
  if (!p) return '';
  return pickDefaultModel(provider, modelChoicesFor(provider, ids)) || p.model;
}

/** The provider an ambiguous `sk-` key may belong to; null means choose again. */
export function resolveDetectedProvider(detection, chosen) {
  const d = detection || {};
  if (d.kind === 'known') return d.provider;
  if (d.kind === 'ambiguous' && Array.isArray(d.providers) && d.providers.includes(chosen)) return chosen;
  if (d.kind === 'unknown' && (PROVIDERS[chosen] || chosen === 'custom')) return chosen;
  return null;
}

/** A plain UI description of key detection, including the ambiguous sk- path. */
export function detectionChoices(detection) {
  const d = detection || {};
  if (d.kind === 'known') return { kind:'known', provider:d.provider };
  if (d.kind === 'ambiguous') {
    return {
      kind:'choose',
      providers:d.providers.slice(),
      message:'هذا المفتاح يصلح لـDeepSeek وOpenAI. اختر المزوّد قبل الإضافة.'
    };
  }
  if (d.kind === 'unknown') return { kind:'unknown', message:d.message || 'ما عرفت المزوّد من صيغة المفتاح. اختر المزوّد من القائمة.' };
  return { kind:'empty' };
}

/**
 * Export-safe AI metadata: labels, base URLs, pins, defaults. Never keys.
 * This is intentionally a separate shape from the stored state so a future
 * field cannot leak by accident.
 */
export function exportAiConfig(state) {
  const s = normalizeAiState(state);
  return {
    v:AI_STATE_VERSION,
    connections:s.connections.map(c => ({
      id:c.id, provider:c.provider, base:c.base, label:c.label,
      max:c.max, ctx:c.ctx, first:c.first
    })),
    pinned:s.pinned.map(p => ({ connectionId:p.connectionId, model:p.model, label:p.label || '' })),
    defaults:copy(s.defaults)
  };
}
