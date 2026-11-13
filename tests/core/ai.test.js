import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  AI_DEFAULTS, basePolicy, keylessAllowed, estimateMessagesTokens,
  fitRequest, parseSSE, shouldRetry, retryDelayMs, validateCard, clipAround,
  createTimeoutGuard, linkAbort, isDeepSeekBase, isGeminiBase, migrateDeepSeekModel,
  GEMINI_REASONING_EFFORT, providerRequestOptions, providerChatHeaders, providerModelHeaders, parseProviderErrorBody, emptyAnswerError, finishAnswer,
  GEMINI_FIRST_BYTE_TIMEOUT_MS, GEMINI_BUSY_MESSAGE, GEMINI_MODEL_GONE_MESSAGE,
  geminiFallbackCandidates, filterModelChoices, firstByteTimeoutFor, webSearchPlan,
  PROVIDERS, providerForBase, detectProvider, pickDefaultModel, parseModels, modelsEndpoint
} from '../../apps/web/src/core/ai.js';

afterEach(() => { vi.useRealTimers(); });

describe('base URL and key policy', () => {
  it('allows an empty key only for localhost or 127.0.0.1', () => {
    expect(basePolicy('http://localhost:11434/v1', '').ok).toBe(true);
    expect(basePolicy('http://127.0.0.1:11434/v1', '').ok).toBe(true);
    expect(basePolicy('https://api.deepseek.com', '').ok).toBe(true);
    expect(keylessAllowed('https://api.deepseek.com')).toBe(false);
    expect(basePolicy('http://example.com/v1', 'sk-test').ok).toBe(false);
    expect(basePolicy('http://example.com/v1', 'sk-test').reason).toBe('insecure');
  });
  it('omits auth for a local keyless base and sends it when a key exists', () => {
    expect(basePolicy('http://localhost:11434', '').sendAuth).toBe(false);
    expect(basePolicy('http://localhost:11434', 'k').sendAuth).toBe(true);
  });
});

describe('DeepSeek defaults', () => {
  it('recognizes only the DeepSeek host, not look-alike domains', () => {
    expect(isDeepSeekBase('https://api.deepseek.com')).toBe(true);
    expect(isDeepSeekBase('https://api.deepseek.com/')).toBe(true);
    expect(isDeepSeekBase('https://api.deepseek.com/v1')).toBe(true);
    expect(isDeepSeekBase('https://api.deepseek.com.evil.example')).toBe(false);
    expect(isDeepSeekBase('https://openrouter.ai/api/v1')).toBe(false);
    expect(isDeepSeekBase('')).toBe(false);
  });

  it('moves the retired model names to deepseek-flash on DeepSeek only', () => {
    expect(migrateDeepSeekModel('https://api.deepseek.com', 'deepseek-chat')).toBe('deepseek-flash');
    expect(migrateDeepSeekModel('https://api.deepseek.com', 'deepseek-reasoner')).toBe('deepseek-flash');
    expect(migrateDeepSeekModel('https://api.deepseek.com', 'deepseek-flash')).toBe('deepseek-flash');
    expect(migrateDeepSeekModel('https://api.deepseek.com', 'deepseek-v4-pro')).toBe('deepseek-v4-pro');
    expect(migrateDeepSeekModel('https://openrouter.ai/api/v1', 'deepseek-chat')).toBe('deepseek-chat');
  });
});

describe('Gemini request controls', () => {
  it('recognizes only the Gemini host, not look-alike domains', () => {
    expect(isGeminiBase('https://generativelanguage.googleapis.com/v1beta/openai')).toBe(true);
    expect(isGeminiBase('https://generativelanguage.googleapis.com')).toBe(true);
    expect(isGeminiBase('http://generativelanguage.googleapis.com:443/v1beta/openai')).toBe(true);
    expect(isGeminiBase('https://generativelanguage.googleapis.com.evil.example')).toBe(false);
    expect(isGeminiBase('https://api.deepseek.com')).toBe(false);
    expect(isGeminiBase('')).toBe(false);
  });

  it('sends low reasoning_effort to Gemini and thinking disabled to DeepSeek only', () => {
    expect(GEMINI_REASONING_EFFORT).toBe('low');
    const gemini = providerRequestOptions('https://generativelanguage.googleapis.com/v1beta/openai');
    expect(gemini).toEqual({ reasoning_effort:'low' });
    expect(gemini.thinking).toBeUndefined();
    const deepseek = providerRequestOptions('https://api.deepseek.com');
    expect(deepseek).toEqual({ thinking:{ type:'disabled' } });
    expect(deepseek.reasoning_effort).toBeUndefined();
    expect(providerRequestOptions('https://api.deepseek.com/v1')).toEqual({ thinking:{ type:'disabled' } });
    expect(providerRequestOptions('https://openrouter.ai/api/v1')).toEqual({});
    expect(providerRequestOptions('https://api.anthropic.com/v1')).toEqual({});
    expect(providerRequestOptions('http://localhost:11434/v1')).toEqual({});
  });
});

describe('reader-chat web search switch', () => {
  it('enables search only for Gemini, a supported model, and an allowed conversation', () => {
    const gemini = 'https://generativelanguage.googleapis.com/v1beta/openai';
    expect(webSearchPlan({ base:gemini, model:'gemini-3.1-flash-lite', allowed:true }))
      .toEqual({ enabled:true, reason:'ok' });
    expect(webSearchPlan({ base:gemini, model:'gemini-3.8-flash' }).enabled).toBe(true);
    expect(webSearchPlan({ base:gemini, model:'gemini-3.8-flash', allowed:false }))
      .toEqual({ enabled:false, reason:'off' });
    expect(webSearchPlan({ base:gemini, model:'gemini-3.5-flash', allowed:true }))
      .toEqual({ enabled:false, reason:'model' });
    expect(webSearchPlan({ base:'https://api.deepseek.com', model:'deepseek-flash', allowed:true }))
      .toEqual({ enabled:false, reason:'provider' });
    expect(webSearchPlan({ base:'http://localhost:11434/v1', model:'gemini-3.8-flash', allowed:true }))
      .toEqual({ enabled:false, reason:'provider' });
  });
});

describe('provider headers', () => {
  it('uses Bearer for chat on every provider and adds Claude browser access', () => {
    expect(providerChatHeaders('https://api.deepseek.com', 'sk-test')).toEqual({ Authorization:'Bearer sk-test' });
    expect(providerChatHeaders('https://generativelanguage.googleapis.com/v1beta/openai', 'AQ.test')).toEqual({ Authorization:'Bearer AQ.test' });
    expect(providerChatHeaders('https://api.anthropic.com/v1', 'sk-ant-test')).toEqual({
      Authorization:'Bearer sk-ant-test',
      'anthropic-dangerous-direct-browser-access':'true'
    });
    expect(providerChatHeaders('https://api.anthropic.com/v1', 'sk-ant-test')['x-api-key']).toBeUndefined();
  });

  it('uses x-api-key and anthropic-version for Claude models, Bearer elsewhere', () => {
    expect(providerModelHeaders('https://api.anthropic.com/v1', 'sk-ant-test')).toEqual({
      'x-api-key':'sk-ant-test',
      'anthropic-version':'2023-06-01',
      'anthropic-dangerous-direct-browser-access':'true'
    });
    expect(providerModelHeaders('https://api.anthropic.com/v1', 'sk-ant-test').Authorization).toBeUndefined();
    expect(providerModelHeaders('https://api.deepseek.com', 'sk-test')).toEqual({ Authorization:'Bearer sk-test' });
    expect(providerModelHeaders('http://localhost:11434/v1', '')).toEqual({});
  });
});

describe('provider errors and empty answers', () => {
  it('reads a Gemini array error body', () => {
    expect(parseProviderErrorBody('[{"error":{"message":"API key not valid"}}]')).toBe('API key not valid');
    expect(parseProviderErrorBody('{"error":{"message":"quota"}}')).toBe('quota');
    expect(parseProviderErrorBody('{"message":"bad model"}')).toBe('bad model');
    expect(parseProviderErrorBody('[{"error":"boom"}]')).toBe('boom');
    expect(parseProviderErrorBody('plain failure')).toBe('plain failure');
  });

  it('keeps the provider text and reason for 400 and 401 bodies', () => {
    expect(parseProviderErrorBody('{"error":{"code":400,"message":"Invalid Auth key."}}')).toBe('Invalid Auth key.');
    expect(parseProviderErrorBody('{"error":{"code":401,"message":"Unauthorized","status":"UNAUTHENTICATED","details":[{"reason":"ACCESS_TOKEN_TYPE_UNSUPPORTED"}]}}'))
      .toBe('Unauthorized (ACCESS_TOKEN_TYPE_UNSUPPORTED)');
    expect(parseProviderErrorBody('[{"error":{"code":401,"message":"ACCESS_TOKEN_TYPE_UNSUPPORTED","details":[{"reason":"ACCESS_TOKEN_TYPE_UNSUPPORTED"}]}}]'))
      .toBe('ACCESS_TOKEN_TYPE_UNSUPPORTED');
    expect(parseProviderErrorBody('{"type":"error","error":{"type":"authentication_error","message":"Invalid Anthropic API Key"}}'))
      .toBe('Invalid Anthropic API Key');
  });

  it('captures finish_reason from the last streamed chunk', () => {
    const r = parseSSE('data: {"choices":[{"delta":{"content":"A"},"finish_reason":"stop"}]}\n');
    expect(r.events).toEqual([{ delta:'A' }, { finish:'stop' }]);
    const empty = parseSSE('data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n');
    expect(empty.events).toEqual([{ finish:'length' }]);
  });

  it('throws the Arabic length error for an empty answer that hit the token cap', () => {
    let err;
    try { finishAnswer('', 'length'); } catch (e) { err = e; }
    expect(err).toMatchObject({ empty:true, finish:'length' });
    expect(err.message).toContain('استهلك حدّ التوكنز');
    expect(err.message).toContain('Flash');
    expect(() => finishAnswer('   ', 'length')).toThrow('استهلك');
  });

  it('throws the generic empty-answer error otherwise and keeps real content', () => {
    const err = emptyAnswerError('stop');
    expect(err).toMatchObject({ empty:true, finish:'stop' });
    expect(err.message).toContain('ردًّا فارغًا');
    expect(() => finishAnswer(null, 'stop')).toThrow('ردًّا فارغًا');
    expect(finishAnswer('تمام', 'stop')).toBe('تمام');
  });
});

describe('provider detection from an API key', () => {
  it('detects every supported prefix', () => {
    expect(detectProvider('AIzaSyExampleKey')).toEqual({ kind:'known', provider:'gemini' });
    expect(detectProvider('AQ.AbExampleAuthKey')).toEqual({ kind:'known', provider:'gemini' });
    expect(detectProvider('sk-or-v1-example')).toEqual({ kind:'known', provider:'openrouter' });
    expect(detectProvider('gsk_example')).toEqual({ kind:'known', provider:'groq' });
    expect(detectProvider('sk-ant-api03-example')).toEqual({ kind:'known', provider:'anthropic' });
    expect(detectProvider('sk-ant-').provider).toBe('anthropic');
    expect(detectProvider('pk-example').kind).toBe('unknown');
    expect(detectProvider('AIza').provider).toBe('gemini');
    expect(detectProvider('gsk_').provider).toBe('groq');
    expect(detectProvider('sk-or-').provider).toBe('openrouter');
    expect(detectProvider('').kind).toBe('empty');
    expect(detectProvider(null).kind).toBe('empty');
  });

  it('probes DeepSeek first, then OpenAI, for a generic sk- key', () => {
    const d = detectProvider('sk-proj-abc123');
    expect(d.kind).toBe('ambiguous');
    expect(d.providers).toEqual(['deepseek', 'openai']);
  });

  it('has one complete table entry per known provider', () => {
    for (const id of ['deepseek', 'gemini', 'anthropic', 'openrouter', 'groq', 'openai']) {
      const p = PROVIDERS[id];
      expect(p.id).toBe(id);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.base).toMatch(/^https:\/\//);
      expect(p.prefixes.length).toBeGreaterThan(0);
      expect(p.model.length).toBeGreaterThan(0);
      expect(p.limits.max).toBeGreaterThan(0);
      expect(p.limits.ctx).toBeGreaterThan(p.limits.max);
      expect(p.limits.first).toBeGreaterThan(0);
      expect(p.requestOptions).toBeTypeOf('object');
    }
    expect(modelsEndpoint('https://api.deepseek.com/')).toBe('https://api.deepseek.com/models');
    expect(modelsEndpoint('https://api.deepseek.com/v1/models')).toBe('https://api.deepseek.com/v1/models');
  });

  it('infers a provider from a saved base and treats other bases as custom', () => {
    expect(providerForBase('https://api.deepseek.com').id).toBe('deepseek');
    expect(providerForBase('https://api.deepseek.com/v1').id).toBe('deepseek');
    expect(providerForBase('https://generativelanguage.googleapis.com/v1beta/openai').id).toBe('gemini');
    expect(providerForBase('https://api.anthropic.com/v1').id).toBe('anthropic');
    expect(providerForBase('https://api.openai.com/v1').id).toBe('openai');
    expect(providerForBase('https://api.deepseek.com.evil.example')).toBe(null);
    expect(providerForBase('http://localhost:11434/v1')).toBe(null);
    expect(providerForBase('')).toBe(null);
  });
});

describe('default model preference', () => {
  it('picks the newest Gemini flash and excludes non-chat image/audio variants', () => {
    expect(pickDefaultModel('gemini', [
      'gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite',
      'gemini-3.8-flash', 'gemini-2.5-pro', 'gemini-3.8-flash-image'
    ])).toBe('gemini-3.8-flash');
    expect(pickDefaultModel('gemini', ['gemini-3.9-flash', 'gemini-3.10-flash'])).toBe('gemini-3.10-flash');
    expect(pickDefaultModel('gemini', ['gemini-3.8-flash-lite'])).toBe('gemini-3.8-flash-lite');
    expect(pickDefaultModel('gemini', ['gemini-3.8-pro'])).toBe(null);
  });

  it('prefers a Claude Haiku model, then Sonnet', () => {
    expect(pickDefaultModel('anthropic', [
      'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'
    ])).toBe('claude-haiku-5-5');
    expect(pickDefaultModel('anthropic', [
      'claude-opus-5-5', 'claude-sonnet-5-5'
    ])).toBe('claude-sonnet-5-5');
    expect(pickDefaultModel('anthropic', ['claude-opus-5-5'])).toBe(null);
    expect(PROVIDERS.anthropic.model).toBe('claude-haiku-5-5');
  });

  it('uses the preference list only when the id is present', () => {
    expect(pickDefaultModel('deepseek', ['deepseek-chat', 'deepseek-flash'])).toBe('deepseek-flash');
    expect(pickDefaultModel('deepseek', ['deepseek-chat'])).toBe(null);
    expect(pickDefaultModel('openrouter', ['google/gemini-2.5-flash', 'openai/gpt-4.1-mini'])).toBe('google/gemini-2.5-flash');
    expect(pickDefaultModel('openrouter', ['vendor/unknown'])).toBe(null);
    expect(pickDefaultModel('groq', ['llama-3.3-70b-versatile'])).toBe('llama-3.3-70b-versatile');
    expect(pickDefaultModel('openai', ['gpt-4o', 'gpt-4o-mini'])).toBe('gpt-4o-mini');
    expect(pickDefaultModel('nope', ['anything'])).toBe(null);
    expect(pickDefaultModel('gemini', [])).toBe(null);
  });

  it('parses both {data:[{id}]} and bare arrays', () => {
    expect(parseModels({ data:[{ id:'a' }, { id:'b' }, { id:'a' }] })).toEqual(['a', 'b']);
    expect(parseModels(['x', { id:'y' }, { nope:1 }])).toEqual(['x', 'y']);
    expect(parseModels(null)).toEqual([]);
  });

  it('strips Gemini models/ prefixes and hides non-chat ids', () => {
    const ids = parseModels({ data:[
      { id:'models/gemini-3.1-flash-lite' },
      { id:'models/gemini-2.5-flash-image' },
      { id:'models/gemini-2.5-flash-tts' },
      { id:'models/gemini-2.5-flash-transcribe' },
      { id:'models/gemini-2.5-flash-omni' },
      { id:'models/gemini-2.5-flash-lyria' },
      { id:'models/gemini-2.5-flash-nano-banana' },
      { id:'models/gemini-2.5-flash-customtools' },
      { id:'models/gemini-3.8-flash' }
    ] });
    expect(ids[0]).toBe('gemini-3.1-flash-lite');
    expect(ids).not.toContain('models/gemini-3.1-flash-lite');
    expect(filterModelChoices('gemini', ids)).toEqual(['gemini-3.1-flash-lite', 'gemini-3.8-flash']);
    expect(filterModelChoices('openai', ['gpt-4o-image'])).toEqual(['gpt-4o-image']);
  });

  it('prefers gemini-3.1-flash-lite, then the newest flash', () => {
    expect(pickDefaultModel('gemini', [
      'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'
    ])).toBe('gemini-3.1-flash-lite');
    expect(pickDefaultModel('gemini', ['gemini-3.5-flash-lite', 'gemini-3.8-flash'])).toBe('gemini-3.8-flash');
    expect(pickDefaultModel('gemini', ['gemini-3.1-flash-lite-image'])).toBe(null);
  });

  it('builds the Gemini fallback queue from ids that exist', () => {
    expect(geminiFallbackCandidates(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']))
      .toEqual(['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite']);
    expect(geminiFallbackCandidates(['gemini-3.5-flash-lite'])).toEqual(['gemini-3.5-flash-lite']);
    expect(geminiFallbackCandidates(['gemini-3.8-flash'])).toEqual([]);
    expect(GEMINI_FIRST_BYTE_TIMEOUT_MS).toBe(45000);
    expect(firstByteTimeoutFor('https://generativelanguage.googleapis.com/v1beta/openai', 90000)).toBe(45000);
    expect(firstByteTimeoutFor('https://generativelanguage.googleapis.com/v1beta/openai', 30000)).toBe(30000);
    expect(firstByteTimeoutFor('https://api.deepseek.com', 90000)).toBe(90000);
    expect(firstByteTimeoutFor('http://localhost:11434/v1', 120000)).toBe(120000);
    expect(GEMINI_BUSY_MESSAGE).toContain('خوادم Gemini مزدحمة');
    expect(GEMINI_MODEL_GONE_MESSAGE).toContain('ما عاد متاح');
  });
});

describe('token estimator and trimmer', () => {
  it('estimates Arabic as heavier than Latin for the same character count', () => {
    const ar = estimateMessagesTokens([{ role:'user', content:'ا'.repeat(100) }]);
    const en = estimateMessagesTokens([{ role:'user', content:'a'.repeat(100) }]);
    expect(ar).toBeGreaterThan(en);
  });

  it('keeps system and newest message and drops oldest history first', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content:'رسالة رقم ' + i + ' ' + 'ا'.repeat(200) }));
    const r = fitRequest({ base:'نظام', parts:[], history, budget:1200 });
    expect(r.ok).toBe(true);
    expect(r.messages[0].role).toBe('system');
    expect(r.messages[r.messages.length - 1].content).toContain('رسالة رقم 19');
    expect(r.messages.length).toBeLessThan(history.length + 1);
    expect(r.estimated).toBeLessThanOrEqual(1200);
  });

  it('drops the library map before clipping the chapter', () => {
    const base = 'نظام';
    const parts = [
      { id:'library_map', label:'خريطة المكتبة', text:'خريطة '.repeat(200) },
      { id:'chapter', label:'نص هالفصل', text:'نص الفصل. '.repeat(300) + 'موضع القارئ هنا.' }
    ];
    const r = fitRequest({ base, parts, history:[{ role:'user', content:'سؤال قصير' }], budget:2200, focus:'موضع القارئ هنا' });
    expect(r.ok).toBe(true);
    const sys = r.messages[0].content;
    expect(sys).toContain('نص هالفصل');
    expect(sys).not.toContain('خريطة خريطة خريطة');
    expect(r.estimated).toBeLessThanOrEqual(2200);
  });

  it('fails instead of sending something it knows is over budget', () => {
    const r = fitRequest({ base:'ا'.repeat(10000), parts:[], history:[{ role:'user', content:'س' }], budget:600 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('context');
    expect(r.messages).toBe(null);
  });
});

describe('SSE parser', () => {
  it('parses normal chunks and DONE', () => {
    const a = parseSSE('data: {"choices":[{"delta":{"content":"مر"}}]}\n');
    expect(a.events).toEqual([{ delta:'مر' }]);
    expect(a.rest).toBe('');
    const b = parseSSE('data: {"choices":[{"delta":{"content":"حبا"}}]}\ndata: [DONE]\n');
    expect(b.events).toEqual([{ delta:'حبا' }]);
    expect(b.done).toBe(true);
  });
  it('keeps split lines in rest', () => {
    const a = parseSSE('data: {"choices":[{"delta":{"content":"A"}}]}\n' + 'data: {"choices":[{"delta":{"con');
    expect(a.events).toEqual([{ delta:'A' }]);
    expect(a.rest).toContain('con');
    const b = parseSSE(a.rest + 'tent":"B"}}]}\n');
    expect(b.events).toEqual([{ delta:'B' }]);
  });
  it('returns provider error objects', () => {
    const r = parseSSE('data: {"error":{"message":"insufficient balance"}}\n');
    expect(r.events).toEqual([{ error:'insufficient balance' }]);
  });
});

describe('first-byte and stream-idle timeouts', () => {
  it('defaults to 90s for the first byte and waits the full period', () => {
    vi.useFakeTimers();
    let fired = 0;
    const g = createTimeoutGuard({ onTimeout:() => fired++ });
    g.first();
    vi.advanceTimersByTime(89_999);
    expect(fired).toBe(0);
    expect(g.pending).toBe(true);
    vi.advanceTimersByTime(1);
    expect(fired).toBe(1);
    expect(g.timedOut).toBe(true);
    expect(g.pending).toBe(false);
  });

  it('can shorten the first-byte wait for a Gemini fallback', () => {
    vi.useFakeTimers();
    let fired = 0;
    const g = createTimeoutGuard({ onTimeout:() => fired++ });
    g.first(1000);
    vi.advanceTimersByTime(999);
    expect(fired).toBe(0);
    vi.advanceTimersByTime(1);
    expect(fired).toBe(1);
  });

  it('uses a 20s idle timeout and resets when a chunk arrives', () => {
    vi.useFakeTimers();
    let fired = 0;
    const g = createTimeoutGuard({ onTimeout:() => fired++ });
    g.idle();
    vi.advanceTimersByTime(19_999);
    expect(fired).toBe(0);
    g.idle();
    vi.advanceTimersByTime(19_999);
    expect(fired).toBe(0);
    vi.advanceTimersByTime(1);
    expect(fired).toBe(1);
  });

  it('Stop aborts during a pending first byte without firing the timeout', () => {
    vi.useFakeTimers();
    const outer = new AbortController(), inner = new AbortController();
    let fired = 0;
    const g = createTimeoutGuard({ onTimeout:() => fired++ });
    const unlink = linkAbort(outer.signal, inner);
    g.first();
    outer.abort();
    expect(inner.signal.aborted).toBe(true);
    g.clear(); unlink();
    vi.advanceTimersByTime(90_000);
    expect(fired).toBe(0);
  });
});

describe('retry policy', () => {
  it('retries only transient statuses, at most twice', () => {
    expect(shouldRetry(429)).toBe(true);
    expect(shouldRetry(504)).toBe(true);
    expect(shouldRetry(400)).toBe(false);
    expect(retryDelayMs(0)).toBe(500);
    expect(retryDelayMs(1)).toBe(1000);
    expect(retryDelayMs(2)).toBe(2000);
    expect(retryDelayMs(0, '3')).toBe(3000);
    expect(retryDelayMs(0, '0')).toBe(500);
  });
});

describe('card validation', () => {
  it('accepts a valid card and rejects wrong shapes', () => {
    expect(validateCard({ ideas:['أ'], terms:['م'], topics:['ت'] })).toEqual({ ideas:['أ'], terms:['م'], topics:['ت'] });
    expect(validateCard({ ideas:[] })).toBe(null);
    expect(validateCard({ ideas:[1] })).toBe(null);
    expect(validateCard({ ideas:['أ'], terms:'bad' })).toBe(null);
    expect(validateCard(null)).toBe(null);
  });
  it('clips around a focus phrase', () => {
    const s = 'أ'.repeat(100) + 'التركيز' + 'ب'.repeat(100);
    const out = clipAround(s, 'التركيز', 30);
    expect(out).toContain('التركيز');
    expect(out.length).toBeLessThanOrEqual(32);
  });
});

describe('defaults', () => {
  it('has bounded defaults', () => {
    expect(AI_DEFAULTS.maxTokens).toBeGreaterThan(0);
    expect(AI_DEFAULTS.contextWindow).toBeGreaterThan(AI_DEFAULTS.maxTokens);
  });
});
