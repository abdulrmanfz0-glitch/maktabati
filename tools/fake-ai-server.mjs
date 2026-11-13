// Minimal OpenAI-compatible fake for failure and translation e2e. No dependencies.
import http from 'node:http';

export async function startFakeAI() {
  const stats = { requests:0, searchRequests:0, closed:0, models:[], last:null, lastSearch:null, modelFetches:[] };
  const control = { gemini503:false, gemini503Once:false, gemini404:false, search429Once:false, searchSlow:false, searchNoGrounding:false, searchGroundingBlocked:false, searchQuota:false, deepseek402:false, deepseek429:false, deepseekMidError:false, deepseekSlow:false, deepseekSkipOnce:false };
  const modelLists = {
    '/v1/models': ['deepseek-flash', 'deepseek-chat', 'deepseek-v4-pro'],
    '/deepseek/v1/models': ['deepseek-flash', 'deepseek-chat', 'deepseek-v4-pro'],
    '/openai/v1/models': ['gpt-4o-mini', 'gpt-4o'],
    '/gemini/v1/models': [
      'models/gemini-3.1-flash-lite',
      'models/gemini-3.5-flash-lite',
      'models/gemini-3.8-flash',
      'models/gemini-2.5-flash',
      'models/gemini-2.5-flash-image',
      'models/gemini-2.5-flash-tts',
      'models/gemini-2.5-flash-transcribe',
      'models/gemini-2.5-flash-omni',
      'models/gemini-2.5-flash-lyria',
      'models/gemini-2.5-flash-nano-banana',
      'models/gemini-2.5-flash-customtools'
    ],
    '/groq/v1/models': ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    '/openrouter/v1/models': ['openai/gpt-4o-mini', 'google/gemini-2.5-flash'],
    '/odd/v1/models': ['vendor/unknown']
  };
  const sockets = new Set();
  let first429 = false;
  let translation429 = 0;
  let slowUsed = false;
  let missingUsed = false;

  const unitsFrom = body => {
    try {
      const msgs = body.messages || [];
      const user = msgs.filter(m => m && m.role === 'user').map(m => String(m.content || '')).join('\n');
      const m = user.match(/<units>\s*([\s\S]*?)\s*<\/units>/);
      return m ? JSON.parse(m[1]) : [];
    } catch (e) { return []; }
  };
  const glossaryFrom = body => {
    try {
      const user = (body.messages || []).filter(m => m && m.role === 'user').map(m => String(m.content || '')).join('\n');
      const m = user.match(/<glossary>\s*([\s\S]*?)\s*<\/glossary>/);
      if (!m) return [];
      return m[1].split(/\r?\n/).map(x => x.trim()).filter(x => x && x !== '(none)' && x.includes('=>')).map(x => {
        const i = x.indexOf('=>');
        return { en:x.slice(0, i).trim(), ar:x.slice(i + 2).trim() };
      });
    } catch (e) { return []; }
  };
  const isCorrective = body => (body.messages || []).some(m => m && m.role === 'user' && /did not match|previous output|أعد الإخراج/i.test(String(m.content || '')));

  const translationJSON = body => {
    const units = unitsFrom(body);
    const glossary = glossaryFrom(body);
    const suffix = glossary.map(g => g.ar).filter(Boolean).join(' ');
    let list = units.map(u => {
      const nums = (String(u.text || '').match(/\d+/g) || []);
      return { id:String(u.id), text:'ترجمة عربية للفقرة ' + String(u.id) + (nums.length ? ' ' + nums.join(' ') : '') + (suffix ? ' ' + suffix : '') };
    });
    if (body.model === 'fake-translate-missing' && !missingUsed && !isCorrective(body) && list.length > 1) {
      missingUsed = true;
      list = list.slice(0, -1);
    }
    return { translations:list };
  };

  const sendTranslation = (res, body) => {
    if (res.writableEnded || res.destroyed) return;
    const content = JSON.stringify(translationJSON(body));
    const payload = {
      id:'fake', object:'chat.completion', model:body.model,
      choices:[{ index:0, message:{ role:'assistant', content }, finish_reason:'stop' }],
      usage:{ prompt_tokens:100, completion_tokens:50, total_tokens:150 }
    };
    res.writeHead(200, { 'Content-Type':'application/json', 'Cache-Control':'no-cache' });
    res.end(JSON.stringify(payload));
  };

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-goog-api-key, anthropic-version, anthropic-dangerous-direct-browser-access');
    res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (u.pathname === '/stats') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(stats)); return; }
    if (req.method === 'GET') {
      /* GET /models is free and is how the app detects/verifies a pasted key.
         Only record whether auth was present; never store the key itself. */
      stats.modelFetches.push({
        path:u.pathname,
        hasAuth:!!req.headers.authorization,
        xApiKey:!!req.headers['x-api-key'],
        anthropicVersion:req.headers['anthropic-version'] || null,
        anthropicBrowser:req.headers['anthropic-dangerous-direct-browser-access'] || null
      });
      if (u.pathname === '/anthropic/v1/models') {
        if (!req.headers['x-api-key']) {
          res.writeHead(401, { 'Content-Type':'application/json' });
          res.end(JSON.stringify({ type:'error', error:{ type:'authentication_error', message:'Invalid Anthropic API Key' } }));
          return;
        }
        if (req.headers['anthropic-version'] !== '2023-06-01') {
          res.writeHead(400, { 'Content-Type':'application/json' });
          res.end(JSON.stringify({ type:'error', error:{ type:'invalid_request_error', message:'anthropic-version required' } }));
          return;
        }
        res.writeHead(200, { 'Content-Type':'application/json', 'Cache-Control':'no-cache' });
        res.end(JSON.stringify({ data:[
          { id:'claude-haiku-5-5', display_name:'Claude Haiku 5.5' },
          { id:'claude-sonnet-5-5', display_name:'Claude Sonnet 5.5' },
          { id:'claude-opus-5-5', display_name:'Claude Opus 5.5' }
        ] }));
        return;
      }
      if (/\/models$/.test(u.pathname)) {
        if (u.pathname.includes('/broken/') || u.pathname.includes('/missing/') || u.pathname.includes('/offline/')) {
          res.writeHead(404, { 'Content-Type':'application/json' });
          res.end(JSON.stringify([{ error:{ message:'models endpoint missing' } }]));
          return;
        }
        if (u.pathname.includes('/unauthorized/')) {
          res.writeHead(401, { 'Content-Type':'application/json' });
          res.end(JSON.stringify([{ error:{ message:'invalid key' } }]));
          return;
        }
        const ids = modelLists[u.pathname] || ['fake-model'];
        res.writeHead(200, { 'Content-Type':'application/json', 'Cache-Control':'no-cache' });
        res.end(JSON.stringify({ object:'list', data:ids.map(id => ({ id, object:'model' })) }));
        return;
      }
      res.writeHead(404, { 'Content-Type':'application/json' }); res.end('{}'); return;
    }
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw); } catch (e) {}
      const model = String(body.model || '');
      const hasDSWeb = Array.isArray(body.tools) && body.tools.some(t => t && t.type === 'deepseek_web_search');
      stats.requests++; stats.models.push(model);
      stats.last = {
        path:u.pathname,
        model,
        stream:!!body.stream,
        temperature:body.temperature,
        response_format:body.response_format || null,
        tools:body.tools || null,
        title:body.title || null,
        toolChoice:body.tool_choice || null,
        thinking:body.thinking || null,
        reasoning_effort:body.reasoning_effort || null,
        hasAuth:!!req.headers.authorization,
        apiKeyHeader:!!req.headers['x-goog-api-key'],
        xApiKey:!!req.headers['x-api-key'],
        anthropicVersion:req.headers['anthropic-version'] || null,
        anthropicBrowser:req.headers['anthropic-dangerous-direct-browser-access'] || null,
        queryKey:u.searchParams.has('key'),
        hasUnits:/<units>/.test(raw),
        hasCorrective:isCorrective(body)
      };
      stats.lastUserContent = (body.messages || []).filter(m => m && m.role === 'user').map(m => String(m.content || '')).join('\n');
      stats.lastFull = body; /* complete request body for e2e assertions (labels, placeholders) */

      /* Native Gemini streamGenerateContent (search enabled). Records only booleans
         about credentials, never the key itself. */
      if (/:streamGenerateContent$/.test(u.pathname)) {
        const match = /\/models\/([^/:]+):streamGenerateContent$/.exec(u.pathname);
        stats.searchRequests++;
        stats.lastSearch = {
          model:match ? decodeURIComponent(match[1]) : '',
          apiKeyHeader:!!req.headers['x-goog-api-key'],
          authHeader:!!req.headers.authorization,
          queryKey:u.searchParams.has('key'),
          tools:Array.isArray(body.tools) ? body.tools : null,
          system:body.systemInstruction && Array.isArray(body.systemInstruction.parts)
            ? body.systemInstruction.parts.map(p => String((p && p.text) || '')).join('\n') : '',
          body
        };
        if (control.searchGroundingBlocked) {
          res.writeHead(429, { 'Content-Type':'application/json', 'Cache-Control':'no-cache' });
          res.end(JSON.stringify([{ error:{ code:429, message:'Grounding with Google Search is not available for your project. Please enable billing.', status:'RESOURCE_EXHAUSTED' } }]));
          return;
        }
        if (control.searchQuota) {
          res.writeHead(429, { 'Content-Type':'application/json', 'Cache-Control':'no-cache' });
          res.end(JSON.stringify([{ error:{ code:429, message:'You exceeded your current quota, please check your plan and billing details.', status:'RESOURCE_EXHAUSTED', details:[{ '@type':'type.googleapis.com/google.rpc.QuotaFailure', violations:[{ quotaId:'GenerateContentRequestsPerDayPerProjectPerModel-FreeTier', quotaValue:'100' }] }] } }]));
          return;
        }
        if (control.search429Once) {
          control.search429Once = false;
          res.writeHead(429, { 'Content-Type':'application/json', 'Retry-After':'7', 'Cache-Control':'no-cache' });
          res.end(JSON.stringify([{ error:{ code:429, message:'Resource has been exhausted (e.g. check quota).', status:'RESOURCE_EXHAUSTED', details:[{ '@type':'type.googleapis.com/google.rpc.RetryInfo', retryDelay:'7s' }] } }]));
          return;
        }
        const sendSearch = obj => { try{ res.write('data: ' + JSON.stringify(obj) + '\n\n'); }catch (e) {} };
        const chunks = [
          { candidates:[{ content:{ role:'model', parts:[{ text:'وصلت ' }] }, groundingMetadata:{
            webSearchQueries:['سؤال تجريبي'],
            groundingChunks:[{ web:{ uri:'https://example.com/one', title:'example.com' } }],
            groundingSupports:[{ segment:{ startIndex:0, endIndex:6 }, groundingChunkIndices:[0] }]
          } }] },
          /* A second event with a new chunk and a global support index. The app must
             accumulate chunks across events, as the Gemini streaming docs require. */
          { candidates:[{ content:{ role:'model', parts:[{ text:'المعلومة من الويب.' }] }, groundingMetadata:{
            groundingChunks:[{ web:{ uri:'https://news.example.org/two', title:'news.example.org' } }],
            groundingSupports:[{ segment:{ startIndex:7, endIndex:26 }, groundingChunkIndices:[1] }]
          } }] }
        ];
        res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', 'Connection':'keep-alive' });
        if (control.searchNoGrounding) {
          sendSearch({ candidates:[{ content:{ role:'model', parts:[{ text:'تم بلا مصادر' }] }, finishReason:'STOP' }] });
          res.write('data: [DONE]\n\n'); res.end();
          return;
        }
        const endSearch = () => {
          sendSearch({ candidates:[{ content:{ role:'model', parts:[] }, finishReason:'STOP' }] });
          res.write('data: [DONE]\n\n'); res.end();
        };
        if (control.searchSlow) {
          res.on('close', () => { stats.closed++; });
          let index = 0;
          const timer = setInterval(() => {
            if (res.writableEnded || res.destroyed){ clearInterval(timer); return; }
            if (index < chunks.length) sendSearch(chunks[index++]);
            else { clearInterval(timer); endSearch(); }
          }, 700);
          return;
        }
        for (const chunk of chunks) sendSearch(chunk);
        endSearch();
        return;
      }

      if (u.pathname.startsWith('/gemini/')) {
        if (control.gemini404) {
          res.writeHead(404, { 'Content-Type':'application/json', 'Cache-Control':'no-cache' });
          res.end(JSON.stringify([{ error:{ code:404, message:'models/' + model + ' is no longer available to new users', status:'NOT_FOUND' } }]));
          return;
        }
        if (control.gemini503 || control.gemini503Once) {
          if (control.gemini503Once) control.gemini503Once = false;
          res.writeHead(503, { 'Content-Type':'application/json', 'Cache-Control':'no-cache' });
          res.end(JSON.stringify([{ error:{ code:503, message:'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.', status:'UNAVAILABLE' } }]));
          return;
        }
      }
      if (hasDSWeb && control.deepseek402) {
        res.writeHead(402, { 'Content-Type':'application/json', 'Cache-Control':'no-cache' });
        res.end(JSON.stringify({ error:{ code:402, message:'Insufficient Balance' } }));
        return;
      }
      if (hasDSWeb && control.deepseek429) {
        res.writeHead(429, { 'Content-Type':'application/json', 'Retry-After':'5', 'Cache-Control':'no-cache' });
        res.end(JSON.stringify({ error:{ code:429, message:'Rate limit exceeded, please retry later' } }));
        return;
      }

      if (model === 'fake-error-400') {
        res.writeHead(400, { 'Content-Type':'application/json', 'Cache-Control':'no-cache' });
        res.end(JSON.stringify({ error:{ code:400, message:'Invalid Auth key.' } }));
        return;
      }
      if (model === 'fake-error-401') {
        res.writeHead(401, { 'Content-Type':'application/json', 'Cache-Control':'no-cache' });
        res.end(JSON.stringify({ error:{ code:401, message:'Unauthorized', status:'UNAUTHENTICATED', details:[{ reason:'ACCESS_TOKEN_TYPE_UNSUPPORTED' }] } }));
        return;
      }
      if (model === 'fake-empty-json') {
        res.writeHead(200, { 'Content-Type':'application/json', 'Cache-Control':'no-cache' });
        res.end(JSON.stringify({ choices:[{ message:{ role:'assistant', content:'' }, finish_reason:'length' }] }));
        return;
      }
      if (model === 'fake-ok-json') {
        res.writeHead(200, { 'Content-Type':'application/json', 'Cache-Control':'no-cache' });
        res.end(JSON.stringify({ choices:[{ message:{ role:'assistant', content:'تم' }, finish_reason:'stop' }] }));
        return;
      }

      if (model.startsWith('fake-translate')){
        if (model === 'fake-translate-429' && translation429 < 3){
          translation429++;
          res.writeHead(429, { 'Content-Type':'application/json', 'Retry-After':'0' });
          res.end(JSON.stringify({ error:{ message:'translation rate limited' } }));
          return;
        }
        if (model === 'fake-translate-book'){
          res.on('close', () => { stats.closed++; });
          setTimeout(() => sendTranslation(res, body), 900);
          return;
        }
        if (model === 'fake-translate-slow' && !slowUsed){
          slowUsed = true;
          res.on('close', () => { stats.closed++; });
          setTimeout(() => sendTranslation(res, body), 3000);
          return;
        }
        sendTranslation(res, body);
        return;
      }

      if (!body.stream) {
        res.writeHead(200, { 'Content-Type':'application/json', 'Cache-Control':'no-cache' });
        res.end(JSON.stringify({ choices:[{ message:{ role:'assistant', content:'تم' }, finish_reason:'stop' }] }));
        return;
      }

      if (model === 'fake-429' && !first429) {
        first429 = true;
        res.writeHead(429, { 'Content-Type':'application/json', 'Retry-After':'0' });
        res.end(JSON.stringify({ error:{ message:'rate limited once' } }));
        return;
      }
      res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', 'Connection':'keep-alive' });
      const send = obj => { try{ res.write('data: ' + JSON.stringify(obj) + '\n\n'); }catch (e) {} };
      const delta = text => send({ choices:[{ delta:{ content:text } }] });
      if (hasDSWeb){
        if (control.deepseekSkipOnce){
          control.deepseekSkipOnce = false;
          delta('تم'); res.write('data: [DONE]\n\n'); res.end(); return;
        }
        const call = {
          index:0, id:'srvtoolu_fake', type:'deepseek_web_search', kind:'search',
          action:{ type:'search', queries:['مؤلف الكتاب'] },
          status:'completed',
          sources:[{ type:'url', url:'https://example.com/one', title:'example.com' }]
        };
        const serverToolCalls = [{ index:0, reasoning_content:'', calls:[call] }];
        const annotations = [{ type:'url_citation', url_citation:{ url:'https://example.com/one', title:'example.com', start_index:0, end_index:6 } }];
        const emitStart = () => send({ choices:[{ delta:{}, server_tool_event:{ type:'step_reasoning_done', step:0 } }] });
        const emitCall = () => send({ choices:[{ delta:{}, server_tool_event:{ type:'call_started', step:0, call } }] });
        const emitDone = () => send({ choices:[{ delta:{}, server_tool_event:{ type:'call_completed', step:0, call } }] });
        const emitFinal = () => {
          send({ choices:[{ delta:{ content:'المعلومة من الويب.', server_tool_calls:serverToolCalls, annotations }, finish_reason:'stop' }] });
          res.write('data: [DONE]\n\n'); res.end();
        };
        if (control.deepseekMidError){
          delta('بدأ');
          send({ error:{ message:'stream failed' }, choices:[] });
          res.end();
          return;
        }
        if (control.deepseekSlow){
          res.on('close', () => { stats.closed++; });
          const steps = [emitStart, emitCall, () => delta('وصلت '), emitDone, emitFinal];
          let i = 0;
          const timer = setInterval(() => {
            if (res.writableEnded || res.destroyed){ clearInterval(timer); return; }
            if (i < steps.length) steps[i++]();
            else clearInterval(timer);
          }, 700);
          return;
        }
        emitStart(); emitCall(); delta('وصلت '); emitDone(); emitFinal();
        return;
      }
      if (model === 'fake-close' || model === 'fake-idle') {
        delta(model === 'fake-close' ? 'بدأ' : 'سكون');
        res.on('close', () => { stats.closed++; });
        return;
      }
      if (model === 'fake-slow') {
        /* Streams a first chunk immediately, then more every 600ms, then finishes.
           Used to prove a reply keeps streaming after the chat view is closed. */
        delta('بدأ');
        const steps = [' ثم', ' وصل', ' الرد', ' كامل'];
        let i = 0;
        const timer = setInterval(() => {
          if (res.writableEnded || res.destroyed){ clearInterval(timer); return; }
          if (i < steps.length){ delta(steps[i]); i++; }
          else { clearInterval(timer); send({ choices:[{ delta:{ content:'' }, finish_reason:'stop' }] }); res.write('data: [DONE]\n\n'); res.end(); }
        }, 600);
        return;
      }
      if (model === 'fake-429') { delta('نجح بعد 429'); send({ choices:[{ delta:{ content:'' }, finish_reason:'stop' }] }); res.write('data: [DONE]\n\n'); res.end(); return; }
      if (model === 'fake-empty-length' || model === 'fake-empty-stop') {
        /* Gemini 3 can spend the whole max_tokens budget on thinking and emit only a
           final chunk with finish_reason. No delta at all, exactly like the report. */
        send({ choices:[{ delta:{}, finish_reason:model === 'fake-empty-length' ? 'length' : 'stop' }] });
        res.write('data: [DONE]\n\n'); res.end(); return;
      }
      delta('تم');
      res.write('data: [DONE]\n\n'); res.end();
    });
  });
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return {
    url: 'http://127.0.0.1:' + server.address().port,
    stats,
    control,
    async close(){ for (const s of sockets) try{ s.destroy(); }catch(e){} await new Promise(r => server.close(r)); }
  };
}
