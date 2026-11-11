import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  AI_DEFAULTS, basePolicy, keylessAllowed, estimateMessagesTokens,
  fitRequest, parseSSE, shouldRetry, retryDelayMs, validateCard, clipAround,
  createTimeoutGuard, linkAbort, isDeepSeekBase, migrateDeepSeekModel
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
