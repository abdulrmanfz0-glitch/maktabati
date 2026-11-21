// pdf.js loads its image decoders (JBIG2, JPEG 2000, ICC colour) from `wasmUrl`
// at render time and paints an image it cannot decode as nothing, so a missing
// decoder file turns every page of a scan that uses that codec into a blank
// page. Build the real web output and check every decoder pdf.js ships is
// served under /pdfjs-wasm/, byte-identical to node_modules.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const WASM_DIR = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'wasm');
const SRC = fs.readFileSync(path.join(ROOT, 'apps', 'web', 'src', 'core', 'ocr-local.js'), 'utf8');

// Every decoder file pdf.js ships, except QuickJS (only used for PDF scripting,
// which the app never enables: isEvalSupported is false).
const decoders = () => fs.readdirSync(WASM_DIR).filter(n => /\.(wasm|js)$/.test(n) && !/^quickjs/.test(n)).sort();

describe('pdf.js image decoders in the web build', () => {
  it('pdf.js ships the decoders we expect (guards a silent rename on upgrade)', () => {
    expect(decoders()).toEqual(['jbig2.wasm', 'jbig2_nowasm_fallback.js', 'openjpeg.wasm', 'openjpeg_nowasm_fallback.js', 'qcms_bg.wasm']);
  });
  it('the OCR renderer points pdf.js at /pdfjs-wasm/', () => {
    expect(SRC).toContain("wasmUrl: '/pdfjs-wasm/'");
  });
  it('every decoder is copied into dist/web/pdfjs-wasm', async () => {
    const out = fs.mkdtempSync(path.join(ROOT, 'out', 'tmp-wasm-'));
    try {
      await build({ configFile: path.join(ROOT, 'apps', 'web', 'vite.config.mjs'), logLevel: 'error', build: { outDir: out, emptyOutDir: true } });
      for (const n of decoders()) {
        const f = path.join(out, 'pdfjs-wasm', n);
        expect(fs.existsSync(f), n + ' must be in the build').toBe(true);
        expect(fs.readFileSync(f).equals(fs.readFileSync(path.join(WASM_DIR, n))), n + ' must match node_modules').toBe(true);
      }
    } finally { fs.rmSync(out, { recursive: true, force: true }); }
  }, 180000);
});
