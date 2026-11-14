// Outputs from the same source:
//   vite build                 -> dist/web     normal web build (needs a server)
//   vite build --mode worker   -> dist/.worker/ingest-worker.js   the ingest worker as one classic script
//   vite build --mode single   -> dist/single  one self-contained index.html (opens from disk);
//                                 embeds dist/.worker/ingest-worker.js, so run --mode worker first
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
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
      /* No analytics, no tracking beacons, and no third-party script origins
         in the CSP. 'wasm-unsafe-eval' is for the Tesseract core (PR3), which
         instantiates embedded WASM; never add 'unsafe-eval'. */
      const script = single
        ? "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'"
        : "script-src 'self'" + (hashes.length ? ' ' + [...new Set(hashes)].join(' ') : '') + " 'wasm-unsafe-eval'";
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

// Self-hosted OCR runtime: the Tesseract worker and the two core builds are copied
// from node_modules into <outDir>/ocr/<version>/ at build time and served from
// node_modules in dev. The Arabic traineddata lives in public/ocr/<version>/ (the
// public dir copy is part of the existing build). The app never fetches OCR files
// from a CDN: workerPath/corePath/langPath all point at our own origin.
const OCR_VERSION = '7.0.0';
const require2 = createRequire(import.meta.url);
const tjsDir = require2('node:path').dirname(require2.resolve('tesseract.js/package.json'));
const nestedCore = require2('node:path').join(tjsDir, 'node_modules', 'tesseract.js-core');
const coreDir = fs.existsSync(require2('node:path').join(nestedCore, 'package.json'))
  ? nestedCore
  : require2('node:path').dirname(require2.resolve('tesseract.js-core/package.json'));
const OCR_FILES = [
  ['worker.min.js', require2('node:path').join(tjsDir, 'dist', 'worker.min.js')],
  ['tesseract-core-relaxedsimd-lstm.wasm.js', require2('node:path').join(coreDir, 'tesseract-core-relaxedsimd-lstm.wasm.js')],
  ['tesseract-core-simd-lstm.wasm.js', require2('node:path').join(coreDir, 'tesseract-core-simd-lstm.wasm.js')],
  ['tesseract-core-lstm.wasm.js', require2('node:path').join(coreDir, 'tesseract-core-lstm.wasm.js')]
];
function ocrAssetsPlugin() {
  let webOut = null;
  return {
    name: 'maktabati-ocr-assets',
    configResolved(cfg) {
      if (cfg.command === 'build' && cfg.mode !== 'worker' && cfg.mode !== 'single') webOut = require2('node:path').resolve(cfg.build.outDir, 'ocr', OCR_VERSION);
    },
    closeBundle() {
      if (!webOut) return;
      fs.mkdirSync(webOut, { recursive: true });
      for (const [name, src] of OCR_FILES) fs.copyFileSync(src, require2('node:path').join(webOut, name));
    },
    configureServer(server) {
      server.middlewares.use('/ocr/' + OCR_VERSION + '/', (req, res, next) => {
        const name = decodeURIComponent(String(req.url || '').split('?')[0].replace(/^\//, ''));
        const f = OCR_FILES.find(([n]) => n === name);
        if (!f) return next();
        res.setHeader('Content-Type', 'text/javascript');
        fs.createReadStream(f[1]).pipe(res);
      });
    }
  };
}

// pdf.js decodes JBIG2-compressed images (common in scanned books) with a WASM
// module loaded from `wasmUrl` + 'jbig2.wasm', so both files are served at a
// stable un-hashed URL in dev and copied into the web build.
const pdfjsDir = require2('node:path').dirname(require2.resolve('pdfjs-dist/package.json'));
const PDFJS_WASM_FILES = [
  ['jbig2.wasm', require2('node:path').join(pdfjsDir, 'wasm', 'jbig2.wasm')],
  ['jbig2_nowasm_fallback.js', require2('node:path').join(pdfjsDir, 'wasm', 'jbig2_nowasm_fallback.js')]
];
function pdfjsWasmPlugin() {
  let webOut = null;
  return {
    name: 'maktabati-pdfjs-wasm',
    configResolved(cfg) {
      if (cfg.command === 'build' && cfg.mode !== 'worker' && cfg.mode !== 'single') webOut = require2('node:path').resolve(cfg.build.outDir, 'pdfjs-wasm');
    },
    closeBundle() {
      if (!webOut) return;
      fs.mkdirSync(webOut, { recursive: true });
      for (const [name, src] of PDFJS_WASM_FILES) fs.copyFileSync(src, require2('node:path').join(webOut, name));
    },
    configureServer(server) {
      server.middlewares.use('/pdfjs-wasm/', (req, res, next) => {
        const name = decodeURIComponent(String(req.url || '').split('?')[0].replace(/^\//, ''));
        const f = PDFJS_WASM_FILES.find(([n]) => n === name);
        if (!f) return next();
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        fs.createReadStream(f[1]).pipe(res);
      });
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
    plugins: [cspPlugin(single), ocrAssetsPlugin(), pdfjsWasmPlugin()].concat(single ? [embedWorker(), viteSingleFile()] : []),
    resolve: {
      alias: [NO_NODE].concat(single ? [{ find: /^\.\/worker-url\.js$/, replacement: here('src/ingest/worker-url.single.js') }] : [])
    },
    worker: { format: 'es' },
    build: {
      outDir: here('../../dist/' + (single ? 'single' : 'web')),
      emptyOutDir: true,
      target: 'es2022',
      // The web build also emits the dev-only OCR check page (unlinked from the
      // app). The single-file build stays one page: it cannot serve /ocr files.
      rollupOptions: { input: single ? here('index.html') : { main: here('index.html'), 'ocr-check': here('ocr-check.html') } },
      // Single file: inline every asset (fonts). Normal web build: always emit fonts as
      // files, even tiny subsets, because the CSP is font-src 'self' and data: fonts
      // would be blocked. Other assets keep the usual 4 KB inline threshold.
      assetsInlineLimit: single ? 100 * 1024 * 1024 : (filePath, content) => {
        if (/\.woff2?$/i.test(filePath)) return false;
        return content.length < 4096;
      }
    },
    server: { port: 5173 }
  };
});
