// Minimal OpenAI-compatible fake for failure and translation e2e. No dependencies.
import http from 'node:http';

export async function startFakeAI() {
  const stats = { requests:0, closed:0, models:[], last:null };
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (u.pathname === '/stats') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(stats)); return; }
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw); } catch (e) {}
      const model = String(body.model || '');
      stats.requests++; stats.models.push(model);
      stats.last = {
        model,
        stream:!!body.stream,
        temperature:body.temperature,
        response_format:body.response_format || null,
        thinking:body.thinking || null,
        hasUnits:/<units>/.test(raw),
        hasCorrective:isCorrective(body)
      };

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
      if (model === 'fake-429') { delta('نجح بعد 429'); send({ choices:[{ delta:{ content:'' }, finish_reason:'stop' }] }); res.write('data: [DONE]\n\n'); res.end(); return; }
      delta('تم');
      res.write('data: [DONE]\n\n'); res.end();
    });
  });
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return {
    url: 'http://127.0.0.1:' + server.address().port,
    stats,
    async close(){ for (const s of sockets) try{ s.destroy(); }catch(e){} await new Promise(r => server.close(r)); }
  };
}
