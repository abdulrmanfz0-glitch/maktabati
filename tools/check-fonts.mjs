#!/usr/bin/env node
// Fail the normal web build if a font was inlined as a data: URI. The web CSP uses
// font-src 'self', so data: fonts are blocked in production. The single-file build
// intentionally inlines fonts and is not checked here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'dist', 'web', 'assets');
if (!fs.existsSync(assets)) {
  console.error('font check failed: ' + assets + ' does not exist');
  process.exit(1);
}
const cssFiles = fs.readdirSync(assets).filter(name => name.endsWith('.css'));
if (!cssFiles.length) {
  console.error('font check failed: no CSS files in ' + assets);
  process.exit(1);
}
const bad = [];
for (const name of cssFiles) {
  const css = fs.readFileSync(path.join(assets, name), 'utf8');
  if (/data:(?:font\/|application\/font)/i.test(css)) bad.push(name);
}
if (bad.length) {
  console.error('font check failed: data:font URI in ' + bad.join(', '));
  process.exit(1);
}
console.log('font check ok: no data:font URIs in dist/web CSS (' + cssFiles.join(', ') + ')');
