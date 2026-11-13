import { describe, it, expect } from 'vitest';
import {
  searchModeFor, searchPlan, deepSeekSearchFields, historyWithServerToolCalls,
  deepSeekSearchSources, deepSeekSearchQueries, classifyDeepSeekSearchError,
  searchErrorText, toolUnsupportedError, unsupportedSearchKey,
  isSearchUnsupported, rememberUnsupported
} from '../../apps/web/src/core/web-search.js';

const calls = [{
  index:0,
  reasoning_content:'',
  calls:[{
    index:0,
    id:'srvtoolu_1',
    type:'deepseek_web_search',
    kind:'search',
    action:{ type:'search', queries:['مؤلف الكتاب', 'سيرة المؤلف'] },
    status:'completed',
    sources:[{ type:'url', url:'https://example.com/one', title:'example.com' }]
  }]
}, {
  index:1,
  calls:[{
    index:0,
    type:'deepseek_web_search',
    action:{ type:'search', queries:['مؤلف الكتاب'] },
    sources:[{ type:'url', url:'https://news.example.org/two', title:'news.example.org' }],
    page:{ url:'https://news.example.org/page', title:'page' }
  }]
}];
const annotations = [
  { type:'url_citation', url_citation:{ url:'https://example.com/one', title:'example.com', start_index:0, end_index:5 } },
  { type:'url_citation', url_citation:{ url:'https://extra.example.net/x', title:'extra.example.net', start_index:6, end_index:9 } }
];

describe('search mode mapping', () => {
  it('maps DeepSeek flash to auto and other DeepSeek models to none', () => {
    expect(searchModeFor('deepseek', 'deepseek-flash')).toBe('auto');
    expect(searchModeFor('deepseek', 'models/deepseek-flash')).toBe('auto');
    expect(searchModeFor('deepseek', 'deepseek-v4-pro')).toBe('none');
    expect(searchModeFor('deepseek', 'deepseek-chat')).toBe('none');
  });

  it('maps Gemini 3+ to auto', () => {
    for (const id of ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-3-flash-preview', 'gemini-4-hydrogen']) {
      expect(searchModeFor('gemini', id), id).toBe('auto');
    }
  });

  it('maps Gemini 2.5 and older or unknown ids to manual', () => {
    for (const id of ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-preview', '']) {
      expect(searchModeFor('gemini', id), id).toBe('manual');
    }
  });

  it('maps other providers to none', () => {
    for (const p of ['openai', 'anthropic', 'openrouter', 'groq', 'custom']) expect(searchModeFor(p, 'x')).toBe('none');
  });
});

describe('search plan', () => {
  it('auto attaches the tool on every request when the master setting is on', () => {
    expect(searchPlan({ provider:'deepseek', model:'deepseek-flash', autoSetting:true })).toEqual({ mode:'auto', attach:true, reason:'auto' });
    expect(searchPlan({ provider:'gemini', model:'gemini-3.8-flash', autoSetting:true })).toEqual({ mode:'auto', attach:true, reason:'auto' });
  });

  it('manual models attach only when their conversation toggle is on', () => {
    expect(searchPlan({ provider:'gemini', model:'gemini-2.5-flash', autoSetting:true, manual:false }))
      .toEqual({ mode:'manual', attach:false, reason:'manual-off' });
    expect(searchPlan({ provider:'gemini', model:'gemini-2.5-flash', autoSetting:true, manual:true }))
      .toEqual({ mode:'manual', attach:true, reason:'manual' });
  });

  it('the master setting off attaches nothing, even for manual-on or auto models', () => {
    expect(searchPlan({ provider:'deepseek', model:'deepseek-flash', autoSetting:false }).attach).toBe(false);
    expect(searchPlan({ provider:'gemini', model:'gemini-3.8-flash', autoSetting:false }).attach).toBe(false);
    expect(searchPlan({ provider:'gemini', model:'gemini-2.5-flash', autoSetting:false, manual:true }).attach).toBe(false);
  });

  it('does not attach an unsupported Gemini model or a provider without search', () => {
    expect(searchPlan({ provider:'gemini', model:'gemini-3.5-flash', autoSetting:true }).attach).toBe(false);
    expect(searchPlan({ provider:'openai', model:'gpt-4o', autoSetting:true }).attach).toBe(false);
    expect(searchPlan({ provider:'deepseek', model:'deepseek-v4-pro', autoSetting:true })).toEqual({ mode:'none', attach:false, reason:'provider' });
  });
});

describe('DeepSeek search request fields', () => {
  it('sends only the web-search tool, with no title or tool_choice', () => {
    expect(deepSeekSearchFields({ attach:true })).toEqual({ tools:[{ type:'deepseek_web_search' }] });
    expect(deepSeekSearchFields({ attach:false })).toEqual({});
    const fields = deepSeekSearchFields({ attach:true });
    expect(fields.title).toBeUndefined();
    expect(fields.tool_choice).toBeUndefined();
  });
});

describe('DeepSeek search metadata', () => {
  it('dedupes sources from server_tool_calls and annotations', () => {
    const sources = deepSeekSearchSources(calls, annotations);
    expect(sources).toEqual([
      { url:'https://example.com/one', domain:'example.com', title:'example.com' },
      { url:'https://news.example.org/two', domain:'news.example.org', title:'news.example.org' },
      { url:'https://news.example.org/page', domain:'news.example.org', title:'page' },
      { url:'https://extra.example.net/x', domain:'extra.example.net', title:'extra.example.net' }
    ]);
  });

  it('collects queries without duplicates', () => {
    expect(deepSeekSearchQueries(calls)).toEqual(['مؤلف الكتاب', 'سيرة المؤلف']);
  });
});

describe('DeepSeek search errors', () => {
  it('classifies 402, 429 with Retry-After, and a mid-stream error', () => {
    expect(classifyDeepSeekSearchError({ status:402, body:'{"error":{"message":"Insufficient Balance"}}' }))
      .toEqual({ kind:'deepseek-balance', status:402, retryAfterMs:null });
    expect(classifyDeepSeekSearchError({ status:429, body:'{"error":{"message":"Rate limit exceeded"}}', retryAfter:'5' }))
      .toEqual({ kind:'deepseek-rate', status:429, retryAfterMs:5000 });
    expect(classifyDeepSeekSearchError({ status:200, detail:'stream failed' }))
      .toEqual({ kind:'deepseek-stream', status:200, retryAfterMs:null });
  });

  it('uses Arabic count grammar in the wait sentence', () => {
    expect(searchErrorText('deepseek-rate', 7000, 'ar')).toContain('7 ثوانٍ');
    expect(searchErrorText('deepseek-rate', 7000, 'ar')).not.toContain('7 ثانية');
    expect(searchErrorText('deepseek-rate', 2000, 'ar')).toContain('ثانيتان');
    expect(searchErrorText('rate-limit', 7000, 'ar')).toContain('7 ثوانٍ');
    expect(searchErrorText('rate-limit', 7000, 'ar')).not.toContain('7 ثانية');
    expect(searchErrorText('deepseek-balance', 0, 'ar')).toContain('رصيد DeepSeek');
    expect(searchErrorText('deepseek-stream', 0, 'ar')).toContain('تعذّر البحث في DeepSeek');
    expect(searchErrorText('grounding', 0, 'en')).toContain('paid Gemini key');
  });
});

describe('DeepSeek multi-turn history', () => {
  it('passes server_tool_calls back unchanged for DeepSeek only', () => {
    const row = { role:'assistant', content:'جواب' };
    const message = { role:'assistant', content:'جواب', serverToolCalls:calls };
    const out = historyWithServerToolCalls(row, message, 'deepseek');
    expect(out.server_tool_calls).toBe(calls);
    expect(historyWithServerToolCalls(row, message, 'gemini').server_tool_calls).toBeUndefined();
    expect(historyWithServerToolCalls({ role:'user', content:'س' }, message, 'deepseek').server_tool_calls).toBeUndefined();
  });
});

describe('tool 400 and session memory', () => {
  it('detects only a tool/model 400', () => {
    expect(toolUnsupportedError(400, 'The model does not support tools')).toBe(true);
    expect(toolUnsupportedError(400, 'unknown field: tools')).toBe(true);
    expect(toolUnsupportedError(400, 'deepseek_web_search is not supported')).toBe(true);
    expect(toolUnsupportedError(400, 'Invalid model')).toBe(true);
    expect(toolUnsupportedError(400, 'Invalid request')).toBe(false);
    expect(toolUnsupportedError(400, 'Invalid Auth key.')).toBe(false);
    expect(toolUnsupportedError(429, 'The model does not support tools')).toBe(false);
  });

  it('remembers an unsupported connection+model for the session', () => {
    const memory = new Set();
    expect(isSearchUnsupported(memory, 'c1', 'models/deepseek-flash')).toBe(false);
    rememberUnsupported(memory, 'c1', 'models/deepseek-flash');
    expect(isSearchUnsupported(memory, 'c1', 'deepseek-flash')).toBe(true);
    expect(isSearchUnsupported(memory, 'c2', 'deepseek-flash')).toBe(false);
    expect(unsupportedSearchKey('c1', 'models/deepseek-flash')).toBe('c1|deepseek-flash');
  });
});
