// Outputs from the same source:
//   vite build                 -> dist/web     normal web build (needs a server)
//   vite build --mode worker   -> dist/.worker/ingest-worker.js   the ingest worker as one classic script
//   vite build --mode single   -> dist/single  one self-contained index.html (opens from disk);
//                                 embeds dist/.worker/ingest-worker.js, so run --mode worker first
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const WORKER_OUT = here('../../dist/.worker');
const NO_NODE = { find: /^\.\/adapters\/pdfjs-node\.js$/, replacement: here('src/ingest/no-node.js') };

// Production CSP. Dev is deliberately left alone so Vite HMR keeps working.
// The normal web build has one inline theme-boot script; its exact SHA-256 is
// computed from the HTML Vite is about to write, because a meta CSP cannot use
// a nonce on a static host. The single-file build inlines the whole app, so it
// uses 'unsafe-inline' there; hashing every bundled chunk would be brittle.
function cspPlugin(single) {
  return {
    name: 'maktabati-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const hashes = [];
      for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        const attrs = m[1], body = m[2];
        if (/\bsrc\s*=/.test(attrs)) continue;
        if (/\btype\s*=\s*["']?(application\/(ld\+)?json|text\/template|importmap)/i.test(attrs)) continue;
        hashes.push("'sha256-" + createHash('sha256').update(body).digest('base64') + "'");
      }
      const script = single
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self'" + (hashes.length ? ' ' + [...new Set(hashes)].join(' ') : '');
      const csp = [
        "default-src 'self'",
        script,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        single ? "font-src 'self' data:" : "font-src 'self'",
        "worker-src 'self' blob:",
        "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'"
      ].join('; ');
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }];
    }
  };
}

// virtual:ingest-worker = the prebuilt worker script, gzip + base64 (decompressed in the browser)
function embedWorker() {
  const id = 'virtual:ingest-worker';
  return {
    name: 'maktabati-embed-worker',
    resolveId: s => (s === id ? '\0' + id : null),
    load(s) {
      if (s !== '\0' + id) return null;
      const f = WORKER_OUT + '/ingest-worker.js';
      if (!fs.existsSync(f)) throw new Error('missing ' + f + ': run "vite build --mode worker" first (npm run build:single does)');
      return 'export default ' + JSON.stringify(zlib.gzipSync(fs.readFileSync(f), { level: 9 }).toString('base64')) + ';';
    }
  };
}

export default defineConfig(({ mode }) => {
  if (mode === 'worker') return {
    root: here('.'),
    publicDir: false,
    resolve: { alias: [NO_NODE] },
    build: {
      outDir: WORKER_OUT, emptyOutDir: true, target: 'es2022', copyPublicDir: false, modulePreload: false, // no window in a worker
      rollupOptions: { input: here('src/ingest/worker.js'), output: { format: 'iife', entryFileNames: 'ingest-worker.js', inlineDynamicImports: true } }
    }
  };
  const single = mode === 'single';
  return {
    root: here('.'),
    base: './',
    // public/ holds the recorded sounds (public/sounds, from tools/sounds/build.mjs); the single file must not carry them
    publicDir: single ? false : here('public'),
    plugins: [cspPlugin(single)].concat(single ? [embedWorker(), viteSingleFile()] : []),
    resolve: {
      alias: [NO_NODE].concat(single ? [{ find: /^\.\/worker-url\.js$/, replacement: here('src/ingest/worker-url.single.js') }] : [])
    },
    worker: { format: 'es' },
    build: {
      outDir: here('../../dist/' + (single ? 'single' : 'web')),
      emptyOutDir: true,
      target: 'es2022',
      // single file: inline every asset (fonts); web: keep fonts as files
      assetsInlineLimit: single ? 100 * 1024 * 1024 : 4096
    },
    server: { port: 5173 }
  };
});
