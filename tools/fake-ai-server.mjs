// Minimal OpenAI-compatible fake for failure and translation e2e. No dependencies.
import http from 'node:http';

export async function startFakeAI() {
  const stats = { requests:0, closed:0, models:[], last:null, modelFetches:[] };
  const control = { gemini503:false, gemini503Once:false, gemini404:false };
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access');
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
      stats.requests++; stats.models.push(model);
      stats.last = {
        path:u.pathname,
        model,
        stream:!!body.stream,
        temperature:body.temperature,
        response_format:body.response_format || null,
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
