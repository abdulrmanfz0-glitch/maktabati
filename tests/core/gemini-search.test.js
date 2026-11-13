import { describe, it, expect } from 'vitest';
import {
  supportsGeminiSearch, geminiNativeEndpoint, geminiSearchHeaders,
  buildGeminiSearchRequest, parseGeminiSearchSSE, normalizeGroundingMetadata,
  mergeCitations, uniqueCitationSources, citationDomain, searchFailureCode,
  classifyGeminiSearchError
} from '../../apps/web/src/core/gemini-search.js';

const event = obj => 'data: ' + JSON.stringify(obj) + '\n';

describe('Gemini search model support', () => {
  it('accepts the documented generateContent search models', () => {
    for (const id of [
      'gemini-3.1-flash-lite', 'models/gemini-3.5-flash-lite', 'gemini-3.6-flash',
      'gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview',
      'gemini-2.5-flash', 'gemini-4-hydrogen', 'gemini-4-carbon'
    ]) expect(supportsGeminiSearch(id), id).toBe(true);
  });

  it('rejects unsupported and non-chat Gemini ids', () => {
    for (const id of [
      '', null, 'gemini-3.5-flash', 'gemini-3.8-flash-lite', 'gemini-3.8-flash-image',
      'gemini-3.5-transcribe', 'gemini-3.8-flash-tts', 'gemini-omni-1.2-flash',
      'gemini-3.8-live', 'gemini-nano-banana-2.1'
    ]) expect(supportsGeminiSearch(id), String(id)).toBe(false);
  });
});

describe('native Gemini search request', () => {
  it('derives the streaming endpoint from the saved OpenAI-compatible base', () => {
    expect(geminiNativeEndpoint('https://generativelanguage.googleapis.com/v1beta/openai', 'gemini-3.8-flash'))
      .toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse');
    expect(geminiNativeEndpoint('https://generativelanguage.googleapis.com/v1beta', 'models/gemini-3.1-flash-lite'))
      .toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:streamGenerateContent?alt=sse');
    expect(geminiNativeEndpoint('https://generativelanguage.googleapis.com/', 'gemini-3.8-flash'))
      .toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse');
    expect(() => geminiNativeEndpoint('https://generativelanguage.googleapis.com/v1beta', '')).toThrow('model');
  });

  it('sends the key only as x-goog-api-key', () => {
    expect(geminiSearchHeaders('AQ.example')).toEqual({ 'Content-Type':'application/json', 'x-goog-api-key':'AQ.example' });
    expect(geminiSearchHeaders('AIza.example').Authorization).toBeUndefined();
    expect(geminiSearchHeaders('').Authorization).toBeUndefined();
    expect(geminiSearchHeaders('')).not.toHaveProperty('x-goog-api-key');
  });

  it('builds contents, system instruction, tool, and generation config', () => {
    const body = buildGeminiSearchRequest({
      model:'gemini-3.8-flash',
      maxTokens:4096,
      temperature:0.4,
      messages:[
        { role:'system', content:'نظام' },
        { role:'user', content:'سؤال' },
        { role:'assistant', content:'جواب' },
        { role:'user', content:'تكملة' }
      ]
    });
    expect(body.systemInstruction).toEqual({ parts:[{ text:'نظام' }] });
    expect(body.contents).toEqual([
      { role:'user', parts:[{ text:'سؤال' }] },
      { role:'model', parts:[{ text:'جواب' }] },
      { role:'user', parts:[{ text:'تكملة' }] }
    ]);
    expect(body.tools).toEqual([{ googleSearch:{} }]);
    expect(body.tools[0].google_search).toBeUndefined();
    expect(body.generationConfig.maxOutputTokens).toBe(4096);
    expect(body.generationConfig.temperature).toBe(0.4);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel:'LOW' });
    expect(body.model).toBeUndefined();
  });

  it('merges consecutive same-role turns and omits thinking for Gemini 2.5', () => {
    const body = buildGeminiSearchRequest({
      model:'gemini-2.5-flash',
      messages:[
        { role:'user', content:'أول' },
        { role:'user', content:'ثاني' },
        { role:'assistant', content:'' }
      ]
    });
    expect(body.contents).toEqual([{ role:'user', parts:[{ text:'أول\n\nثاني' }] }]);
    expect(body.generationConfig.thinkingConfig).toBeUndefined();
    expect(buildGeminiSearchRequest({ model:'gemini-3.8-flash' }).generationConfig.maxOutputTokens).toBe(1200);
  });
});

describe('Gemini stream parsing and citations', () => {
  it('parses deltas, grounding metadata, finish reason, and DONE', () => {
    const grounding = {
      webSearchQueries:['استعلام'],
      groundingChunks:[{ web:{ uri:'https://example.com/a', title:'example.com' } }],
      groundingSupports:[{ segment:{ startIndex:0, endIndex:5 }, groundingChunkIndices:[0] }]
    };
    const buffer = event({ candidates:[{ content:{ parts:[{ text:'مر' }] } }] }) +
      event({ candidates:[{ content:{ parts:[{ text:'حبا' }] }, finishReason:'STOP', groundingMetadata:grounding }] }) +
      'data: [DONE]\n';
    const parsed = parseGeminiSearchSSE(buffer);
    expect(parsed.done).toBe(true);
    expect(parsed.events).toEqual([
      { delta:'مر' },
      { delta:'حبا' },
      { grounding },
      { finish:'STOP' }
    ]);
  });

  it('keeps a split line in rest, skips thoughts, and ignores malformed data', () => {
    const a = parseGeminiSearchSSE(event({ candidates:[{ content:{ parts:[{ text:'خفي', thought:true }, { text:'ظاهر' }] } }] }) +
      'data: {"candidates":[{"content":{"parts":[{"te');
    expect(a.events).toEqual([{ delta:'ظاهر' }]);
    expect(a.rest).toContain('"te');
    const b = parseGeminiSearchSSE('data: not-json\n' + a.rest + 'xt":"بقية"}]}}]}\n');
    expect(b.events).toEqual([{ delta:'بقية' }]);
  });

  it('returns provider errors from the native stream', () => {
    const parsed = parseGeminiSearchSSE(event({ error:{ message:'quota' } }));
    expect(parsed.events).toEqual([{ error:'quota' }]);
  });

  it('maps grounding supports to url, title, and text position', () => {
    const meta = {
      webSearchQueries:['أ', 'أ', ' '],
      groundingChunks:[
        { web:{ uri:'https://www.example.com/a', title:'Example A' } },
        { web:{ uri:'javascript:alert(1)', title:'bad' } },
        { web:{ uri:'https://news.example.org/b', title:'' } }
      ],
      groundingSupports:[
        { segment:{ startIndex:0, endIndex:5 }, groundingChunkIndices:[0] },
        { segment:{ startIndex:0, endIndex:5 }, groundingChunkIndices:[0] },
        { segment:{ startIndex:6, endIndex:9 }, groundingChunkIndices:[1] },
        { segment:{ startIndex:10, endIndex:14 }, groundingChunkIndices:[2] }
      ]
    };
    const out = normalizeGroundingMetadata(meta);
    expect(out.queries).toEqual(['أ']);
    expect(out.citations).toEqual([
      { url:'https://www.example.com/a', title:'Example A', startIndex:0, endIndex:5 },
      { url:'https://news.example.org/b', title:'news.example.org', startIndex:10, endIndex:14 }
    ]);
  });

  it('accumulates incremental stream chunks whose support indices are global', () => {
    const first = {
      groundingChunks:[{ web:{ uri:'https://a.example/one', title:'a' } }],
      groundingSupports:[{ segment:{ startIndex:0, endIndex:4 }, groundingChunkIndices:[0] }]
    };
    const second = {
      groundingChunks:[{ web:{ uri:'https://b.example/two', title:'b' } }],
      groundingSupports:[{ segment:{ startIndex:5, endIndex:9 }, groundingChunkIndices:[1] }]
    };
    const out = normalizeGroundingMetadata({
      groundingChunks:first.groundingChunks.concat(second.groundingChunks),
      groundingSupports:first.groundingSupports.concat(second.groundingSupports)
    });
    expect(out.citations).toEqual([
      { url:'https://a.example/one', title:'a', startIndex:0, endIndex:4 },
      { url:'https://b.example/two', title:'b', startIndex:5, endIndex:9 }
    ]);
  });

  it('falls back to all chunks when no supports are returned', () => {
    const out = normalizeGroundingMetadata({ groundingChunks:[
      { web:{ uri:'https://example.com/one', title:'one' } },
      { web:{ uri:'data:text/html,hi', title:'bad' } },
      { web:{ uri:'https://example.org/two', title:'two' } }
    ] });
    expect(out.citations.map(c => c.url)).toEqual(['https://example.com/one', 'https://example.org/two']);
    expect(out.citations[0].startIndex).toBe(null);
  });

  it('merges streamed citations and lists one row per source', () => {
    const first = [{ url:'https://example.com/a', title:'A', startIndex:0, endIndex:4 }];
    const second = [
      { url:'https://example.com/a', title:'A', startIndex:0, endIndex:4 },
      { url:'https://example.com/a', title:'A', startIndex:5, endIndex:9 },
      { url:'https://example.org/b', title:'B' }
    ];
    expect(mergeCitations(first, second)).toHaveLength(3);
    expect(uniqueCitationSources(mergeCitations(first, second))).toEqual([
      { url:'https://example.com/a', domain:'example.com', title:'A' },
      { url:'https://example.org/b', domain:'example.org', title:'B' }
    ]);
    expect(citationDomain('https://www.example.com/x')).toBe('example.com');
    expect(citationDomain('ftp://example.com/x')).toBe('');
    expect(citationDomain('not a url')).toBe('');
  });
});

describe('search failure diagnostics', () => {
  it('adds only the HTTP status to the short note', () => {
    expect(searchFailureCode({ status:400 })).toBe('400');
    expect(searchFailureCode({ status:429 })).toBe('429');
    expect(searchFailureCode({ status:'503' })).toBe('503');
    expect(searchFailureCode({ network:true })).toBe('');
    expect(searchFailureCode({ timeout:true })).toBe('');
    expect(searchFailureCode(null)).toBe('');
  });

  it('classifies a free-tier grounding error from the recorded body', () => {
    const body = JSON.stringify({ error:{ code:429, message:'Grounding with Google Search is not available on the free tier. Please enable billing for your project.', status:'RESOURCE_EXHAUSTED' } });
    expect(classifyGeminiSearchError({ status:429, body })).toEqual({ kind:'grounding', status:429, retryAfterMs:null });
  });

  it('classifies a rate limit and reads RetryInfo / Retry-After', () => {
    const body = JSON.stringify({ error:{ code:429, message:'Resource has been exhausted (e.g. check quota).', status:'RESOURCE_EXHAUSTED', details:[{ '@type':'type.googleapis.com/google.rpc.RetryInfo', retryDelay:'21s' }] } });
    expect(classifyGeminiSearchError({ status:429, body })).toEqual({ kind:'rate-limit', status:429, retryAfterMs:21000 });
    expect(classifyGeminiSearchError({ status:429, body:'{"error":{"message":"Too many requests"}}', retryAfter:'30' }))
      .toEqual({ kind:'rate-limit', status:429, retryAfterMs:30000 });
  });

  it('classifies quota exhaustion from the recorded quota failure body', () => {
    const body = JSON.stringify({ error:{ code:429, message:'You exceeded your current quota, please check your plan and billing details.', status:'RESOURCE_EXHAUSTED', details:[{ '@type':'type.googleapis.com/google.rpc.QuotaFailure', violations:[{ quotaId:'GenerateContentRequestsPerDayPerProjectPerModel-FreeTier', quotaValue:'100' }] }] } });
    expect(classifyGeminiSearchError({ status:429, body })).toEqual({ kind:'quota', status:429, retryAfterMs:null });
  });

  it('leaves an unclassified 400 for the normal no-search fallback', () => {
    expect(classifyGeminiSearchError({ status:400, body:'{"error":{"message":"Unknown name googleSearch"}}' }))
      .toEqual({ kind:'other', status:400, retryAfterMs:null });
  });
});
