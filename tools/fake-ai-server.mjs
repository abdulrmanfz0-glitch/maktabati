// Minimal OpenAI-compatible fake for failure e2e. No dependencies.
import http from 'node:http';

export async function startFakeAI() {
  const stats = { requests:0, closed:0, models:[] };
  const sockets = new Set();
  let first429 = false;
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
      let model = '';
      try { model = JSON.parse(raw).model || ''; } catch (e) {}
      stats.requests++; stats.models.push(model);
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
