// Tiny static file server for local checks (no dependencies). Serves `root` on 127.0.0.1.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json', '.woff2':'font/woff2', '.woff':'font/woff', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.webmanifest':'application/manifest+json', '.txt':'text/plain; charset=utf-8', '.wasm':'application/wasm', '.pdf':'application/pdf', '.epub':'application/epub+zip', '.md':'text/markdown; charset=utf-8' };

export function serve(root, port = 0) {
  root = path.resolve(root);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(root, p);
    if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r({ url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(c => server.close(c)) })));
}
