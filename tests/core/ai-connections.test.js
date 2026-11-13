import { describe, it, expect } from 'vitest';
import {
  AI_TASKS, AI_STATE_VERSION, migrateAiConfig, normalizeAiState, emptyAiState,
  resolveAiConfig, removeConnection, setConnectionPins, setTaskDefault,
  setAllDefaultsToPin, addConnection, pinModel, groupedPins, allPinned,
  defaultPinForTask, resolveChatPin, resolveDetectedProvider, detectionChoices,
  exportAiConfig, shortModelLabel, pinKey, parsePinKey, modelChoicesFor,
  defaultModelFor
} from '../../apps/web/src/core/ai-connections.js';
import { detectProvider, filterModelChoices } from '../../apps/web/src/core/ai.js';

const DEEPSEEK = 'https://api.deepseek.com';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/openai';

const legacy = {
  base:DEEPSEEK,
  model:'deepseek-chat',
  key:'sk-legacy-secret',
  max:1200,
  ctx:64000,
  first:90000
};

function twoConnectionState() {
  return normalizeAiState({
    v:AI_STATE_VERSION,
    connections:[
      { id:'c1', provider:'deepseek', base:DEEPSEEK, key:'sk-connection-one', label:'DeepSeek', max:1200, ctx:64000, first:90000 },
      { id:'c2', provider:'gemini', base:GEMINI, key:'AQ.connection-two', label:'Gemini', max:4096, ctx:1000000, first:45000 }
    ],
    pinned:[
      { connectionId:'c1', model:'deepseek-flash', label:'DeepSeek Flash' },
      { connectionId:'c2', model:'gemini-3.1-flash-lite', label:'Gemini 3.1 Flash Lite' }
    ],
    defaults:{
      chat:{ connectionId:'c1', model:'deepseek-flash' },
      translation:{ connectionId:'c2', model:'gemini-3.1-flash-lite' }
    }
  });
}

describe('migration from the single config', () => {
  it('creates the first connection, keeps the key, pins its model, and defaults every task', () => {
    const s = migrateAiConfig(legacy);
    expect(s.v).toBe(AI_STATE_VERSION);
    expect(s.connections).toHaveLength(1);
    const c = s.connections[0];
    expect(c).toMatchObject({ id:'c1', provider:'deepseek', base:DEEPSEEK, key:'sk-legacy-secret', label:'DeepSeek', max:1200, ctx:64000, first:90000 });
    expect(s.pinned).toEqual([{ connectionId:'c1', model:'deepseek-flash', label:'DeepSeek Flash' }]);
    for (const task of AI_TASKS) expect(s.defaults[task.id]).toEqual({ connectionId:'c1', model:'deepseek-flash' });
  });

  it('is idempotent and never duplicates the connection or loses the key', () => {
    const once = migrateAiConfig(legacy);
    const twice = migrateAiConfig(once);
    expect(twice).toEqual(once);
    expect(twice.connections[0].key).toBe('sk-legacy-secret');
  });

  it('keeps provider-specific limits when the old config did not store any', () => {
    const s = migrateAiConfig({ base:GEMINI, model:'gemini-3.1-flash-lite', key:'AQ.test' });
    expect(s.connections[0]).toMatchObject({ provider:'gemini', max:4096, ctx:1000000, first:45000 });
  });

  it('keeps explicit limits written by the old settings screen', () => {
    const s = migrateAiConfig({ base:DEEPSEEK, model:'deepseek-flash', key:'sk-k', max:8000, ctx:32000, first:5000 });
    expect(s.connections[0]).toMatchObject({ max:8000, ctx:32000, first:5000 });
  });

  it('treats an empty or missing old config as no connections', () => {
    expect(migrateAiConfig(null)).toEqual(emptyAiState());
    expect(migrateAiConfig({})).toEqual(emptyAiState());
    expect(migrateAiConfig('nonsense')).toEqual(emptyAiState());
  });

  it('does not turn a v2 state back into a legacy connection', () => {
    const s = twoConnectionState();
    expect(migrateAiConfig(s)).toEqual(s);
    expect(migrateAiConfig(s).connections).toHaveLength(2);
  });
});

describe('task resolution and fallback', () => {
  it('resolves each task to its own pinned model', () => {
    const s = twoConnectionState();
    const chat = resolveAiConfig(s, 'chat');
    const tr = resolveAiConfig(s, 'translation');
    expect(chat).toMatchObject({ base:DEEPSEEK, model:'deepseek-flash', key:'sk-connection-one', connectionId:'c1', task:'chat' });
    expect(tr).toMatchObject({ base:GEMINI, model:'gemini-3.1-flash-lite', key:'AQ.connection-two', connectionId:'c2', task:'translation' });
  });

  it('falls back to the chat default when a task has no default', () => {
    const s = twoConnectionState();
    const cards = resolveAiConfig(s, 'cards');
    expect(cards).toMatchObject({ connectionId:'c1', model:'deepseek-flash', task:'cards' });
    expect(defaultPinForTask(s, 'cards')).toEqual({ connectionId:'c1', model:'deepseek-flash' });
  });

  it('uses an explicit conversation pin without changing the task default', () => {
    const s = twoConnectionState();
    const picked = { connectionId:'c2', model:'gemini-3.1-flash-lite' };
    const cfg = resolveAiConfig(s, 'chat', picked);
    expect(cfg).toMatchObject({ connectionId:'c2', model:'gemini-3.1-flash-lite' });
    expect(s.defaults.chat).toEqual({ connectionId:'c1', model:'deepseek-flash' });
    expect(resolveChatPin(s, picked)).toEqual(picked);
  });

  it('falls back to the chat default when an explicit conversation pin is gone', () => {
    const s = twoConnectionState();
    expect(resolveChatPin(s, { connectionId:'c2', model:'gone' })).toEqual({ connectionId:'c1', model:'deepseek-flash' });
    expect(resolveAiConfig(s, 'chat', { connectionId:'c2', model:'gone' }).connectionId).toBe('c1');
  });

  it('returns null when there is no default and no connection', () => {
    expect(resolveAiConfig(emptyAiState(), 'chat')).toBeNull();
    expect(resolveAiConfig(twoConnectionState(), 'chat', { connectionId:'missing', model:'x' })).not.toBeNull();
  });

  it('rejects a default that is not pinned', () => {
    const s = twoConnectionState();
    const next = setTaskDefault(s, 'chat', { connectionId:'c1', model:'not-pinned' });
    expect(next.defaults.chat).toBeUndefined();
    expect(resolveAiConfig(next, 'chat')).toBeNull();
  });
});

describe('removing a connection', () => {
  it('removes its pins and key and moves affected tasks to the chat default', () => {
    const s = twoConnectionState();
    const r = removeConnection(s, 'c2');
    expect(r.removed.label).toBe('Gemini');
    expect(r.state.connections.map(c => c.id)).toEqual(['c1']);
    expect(r.state.connections[0].key).toBe('sk-connection-one');
    expect(r.state.pinned.every(p => p.connectionId === 'c1')).toBe(true);
    expect(r.state.defaults.translation).toEqual({ connectionId:'c1', model:'deepseek-flash' });
    expect(r.fallbacks).toEqual([{ task:'translation', from:{ connectionId:'c2', model:'gemini-3.1-flash-lite' }, to:{ connectionId:'c1', model:'deepseek-flash' } }]);
    expect(JSON.stringify(r.state)).not.toContain('AQ.connection-two');
  });

  it('moves chat and dependants to the first remaining pinned model when chat is removed', () => {
    const s = twoConnectionState();
    const r = removeConnection(s, 'c1');
    expect(r.state.connections.map(c => c.id)).toEqual(['c2']);
    expect(r.state.defaults.chat).toEqual({ connectionId:'c2', model:'gemini-3.1-flash-lite' });
    expect(r.state.defaults.translation).toEqual({ connectionId:'c2', model:'gemini-3.1-flash-lite' });
    expect(r.fallbacks.map(f => f.task).sort()).toEqual(['cards', 'chat']);
  });

  it('leaves no defaults when the last connection is removed', () => {
    const one = migrateAiConfig(legacy);
    const r = removeConnection(one, 'c1');
    expect(r.state.connections).toEqual([]);
    expect(r.state.pinned).toEqual([]);
    expect(r.state.defaults).toEqual({});
    expect(resolveAiConfig(r.state, 'chat')).toBeNull();
  });
});

describe('pinning models', () => {
  it('keeps only the pinned models in switcher groups', () => {
    const s = twoConnectionState();
    const groups = groupedPins(s);
    expect(groups).toHaveLength(2);
    expect(groups.flatMap(g => g.pins.map(p => p.model))).toEqual(['deepseek-flash', 'gemini-3.1-flash-lite']);
    expect(allPinned(s).map(p => p.label)).toEqual(['DeepSeek Flash', 'Gemini 3.1 Flash Lite']);
  });

  it('unpinning a model used by a task falls the task back and reports it', () => {
    const s = twoConnectionState();
    const r = setConnectionPins(s, 'c2', []);
    expect(allPinned(r.state).map(p => p.model)).toEqual(['deepseek-flash']);
    expect(r.state.defaults.translation).toEqual({ connectionId:'c1', model:'deepseek-flash' });
    expect(r.fallbacks.map(f => f.task)).toContain('translation');
  });

  it('keeps pin labels when the same model is pinned again', () => {
    const s = twoConnectionState();
    const renamed = normalizeAiState(Object.assign({}, s, {
      pinned:s.pinned.map(p => p.model === 'deepseek-flash' ? Object.assign({}, p, { label:'My Flash' }) : p)
    }));
    const r = setConnectionPins(renamed, 'c1', ['deepseek-flash', 'deepseek-chat']);
    expect(r.state.pinned.find(p => p.model === 'deepseek-flash').label).toBe('My Flash');
    expect(r.state.pinned.find(p => p.model === 'deepseek-chat').label).toBe('DeepSeek Chat');
  });

  it('can pin a model and set every task default to it', () => {
    const s = addConnection(emptyAiState(), { provider:'deepseek', base:DEEPSEEK, key:'sk-next', label:'DeepSeek' });
    const pinned = pinModel(s, s.connections[0].id, 'deepseek-flash');
    const all = setAllDefaultsToPin(pinned, { connectionId:s.connections[0].id, model:'deepseek-flash' });
    for (const task of AI_TASKS) expect(all.defaults[task.id]).toEqual({ connectionId:s.connections[0].id, model:'deepseek-flash' });
  });

  it('groups only pinned models, never every model a provider returned', () => {
    const s = twoConnectionState();
    const filtered = modelChoicesFor('gemini', ['models/gemini-3.1-flash-lite', 'models/gemini-2.5-flash-image']);
    expect(filtered).toEqual(['gemini-3.1-flash-lite']);
    expect(filterModelChoices('deepseek', ['deepseek-flash', 'deepseek-chat'])).toEqual(['deepseek-flash', 'deepseek-chat']);
    expect(groupedPins(s).flatMap(g => g.pins)).toHaveLength(2);
  });
});

describe('ambiguous sk- detection', () => {
  it('asks DeepSeek or OpenAI instead of guessing', () => {
    const d = detectProvider('sk-ambiguous-test');
    expect(d.kind).toBe('ambiguous');
    expect(d.providers).toEqual(['deepseek', 'openai']);
    const ui = detectionChoices(d);
    expect(ui.kind).toBe('choose');
    expect(ui.providers).toEqual(['deepseek', 'openai']);
    expect(ui.message).toContain('DeepSeek');
    expect(ui.message).toContain('OpenAI');
  });

  it('resolves only a choice the key actually supports', () => {
    const d = detectProvider('sk-ambiguous-test');
    expect(resolveDetectedProvider(d, 'deepseek')).toBe('deepseek');
    expect(resolveDetectedProvider(d, 'openai')).toBe('openai');
    expect(resolveDetectedProvider(d, 'gemini')).toBeNull();
    expect(resolveDetectedProvider(detectProvider('AQ.gemini-key'), 'openai')).toBe('gemini');
  });

  it('reports unknown keys for the provider picker without a network guess', () => {
    const d = detectProvider('not-a-known-key');
    expect(detectionChoices(d).kind).toBe('unknown');
    expect(resolveDetectedProvider(d, 'custom')).toBe('custom');
    expect(resolveDetectedProvider(d, 'groq')).toBe('groq');
  });
});

describe('export privacy', () => {
  it('never includes a key, but keeps labels, pins, and defaults', () => {
    const s = twoConnectionState();
    const exported = exportAiConfig(s);
    const text = JSON.stringify(exported);
    expect(text).not.toContain('sk-connection-one');
    expect(text).not.toContain('AQ.connection-two');
    for (const c of exported.connections) expect('key' in c).toBe(false);
    expect(exported.connections.map(c => c.label)).toEqual(['DeepSeek', 'Gemini']);
    expect(exported.pinned).toHaveLength(2);
    expect(exported.defaults.translation).toEqual({ connectionId:'c2', model:'gemini-3.1-flash-lite' });
  });
});

describe('pins and labels', () => {
  it('round-trips pin keys used by the UI selects', () => {
    const pin = { connectionId:'c1', model:'openai/gpt-4o-mini' };
    expect(parsePinKey(pinKey(pin))).toEqual(pin);
    expect(parsePinKey('bad')).toBeNull();
  });

  it('builds short labels per provider', () => {
    expect(shortModelLabel('deepseek', 'deepseek-flash')).toBe('DeepSeek Flash');
    expect(shortModelLabel('gemini', 'gemini-3.1-flash-lite')).toBe('Gemini 3.1 Flash Lite');
    expect(shortModelLabel('anthropic', 'claude-haiku-5-5')).toBe('Claude Haiku 5.5');
    expect(shortModelLabel('openrouter', 'openai/gpt-4o-mini')).toBe('OpenRouter GPT 4o Mini');
    expect(shortModelLabel('custom', 'fake-model')).toBe('Fake Model');
  });

  it('picks a filtered provider default from /models, never an arbitrary model', () => {
    expect(defaultModelFor('gemini', ['models/gemini-2.5-flash-image', 'models/gemini-3.8-flash'])).toBe('gemini-3.8-flash');
    expect(defaultModelFor('deepseek', ['deepseek-chat'])).toBe('deepseek-flash');
  });
});
