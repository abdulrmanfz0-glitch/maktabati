#!/usr/bin/env node
// Unpack a Claude Design export bundle into real source files.
//
//   node tools/unpack-design.mjs <bundle.html> <outDir>          unpack (outDir must be empty or absent)
//   node tools/unpack-design.mjs <bundle.html> <outDir> --force  unpack, replacing outDir
//   node tools/unpack-design.mjs <bundle.html> <outDir> --verify check outDir rebuilds the exact template
//
// A bundle stores the real page as a JSON string (script type="__bundler/template"), with its
// fonts and other assets base64 (optionally gzip) in a manifest keyed by uuid. The template
// refers to assets by uuid; ext_resources map ids (window.__resources.<id>) to uuids.
//
// Output:
//   index.html         the template, with inline <style> and <script> moved to files
//   styles/*.css       inline style blocks (fonts.css for the @font-face block)
//   scripts/*.js       inline script blocks (app.js is the largest)
//   scripts/resources.js  window.__resources, as the bundle loader injected it
//   fonts/*.woff2      font assets, named from their @font-face rules
//   vendor/<id>.js     ext resources (for example jszip, pdfjs, pdfworker)
//   assets/*           any other manifest asset
//   unpack.json        the map used by --verify to rebuild the template byte for byte
//
// The bundle loader's runtime work (unpacking, uuid swap, stripping integrity/crossorigin)
// is not reproduced except window.__resources; everything else in the template is kept as is.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const [, , src, out, flag] = process.argv;
if (!src || !out) { console.error('usage: node tools/unpack-design.mjs <bundle.html> <outDir> [--force|--verify]'); process.exit(2); }

const raw = fs.readFileSync(src, 'utf8');
const island = type => {
  const m = raw.match(new RegExp('<script type="__bundler/' + type + '">\\s*([\\s\\S]*?)\\s*</script>'));
  return m ? m[1] : null;
};
const tplJson = island('template'), manJson = island('manifest');
if (!tplJson || !manJson) { console.error('not a Claude Design bundle: missing template or manifest'); process.exit(1); }
const template = JSON.parse(tplJson);
const manifest = JSON.parse(manJson);
const extRes = JSON.parse(island('ext_resources') || '[]');
// The bundle encodes the template with "</" escaped; check our decode/encode is exact.
const encode = s => JSON.stringify(s).replace(/<\//g, '<\\u002F');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

if (flag === '--verify') process.exit(verify() ? 0 : 1);
unpack();

function unpack() {
  if (fs.existsSync(out)) {
    if (flag !== '--force' && fs.readdirSync(out).length) { console.error(out + ' is not empty (use --force)'); process.exit(1); }
    fs.rmSync(out, { recursive: true, force: true });
  }
  const write = (rel, data) => { const p = path.join(out, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };

  // 1. assets: name each uuid
  const extById = Object.fromEntries(extRes.map(e => [e.uuid, e.id]));
  const fontNames = nameFonts(template);
  const assets = {}; // uuid -> rel path
  const used = new Set();
  for (const [uuid, e] of Object.entries(manifest)) {
    let bytes = Buffer.from(e.data, 'base64');
    if (e.compressed) bytes = zlib.gunzipSync(bytes);
    const ext = extOf(e.mime);
    let rel = extById[uuid] ? 'vendor/' + extById[uuid] + ext
      : /^font\//.test(e.mime) ? 'fonts/' + (fontNames[uuid] || 'font-' + uuid.slice(0, 8)) + ext
      : 'assets/' + uuid.slice(0, 8) + ext;
    if (used.has(rel)) rel = rel.replace(/(\.[^.]+)$/, '-' + uuid.slice(0, 8) + '$1');
    used.add(rel); assets[uuid] = rel; write(rel, bytes);
  }

  // 2. inline blocks -> files
  const blocks = [];
  let html = template, styleN = 0, headN = 0, bodyN = 0;
  const headEnd = template.search(/<\/head>/i);
  const re = /(<(style|script)\b([^>]*)>)([\s\S]*?)(<\/\2>)/gi;
  const found = [];
  for (let m; (m = re.exec(template));) {
    const [all, open, tag, attrs, body, close] = m;
    if (tag.toLowerCase() === 'script' && (/\bsrc\s*=/.test(attrs) || (/\btype\s*=/.test(attrs) && !/type\s*=\s*["']?(text|application)\/javascript/i.test(attrs)))) continue;
    found.push({ index:m.index, all, open, tag:tag.toLowerCase(), body, close });
  }
  const largestScript = found.filter(b => b.tag === 'script').sort((a, b) => b.body.length - a.body.length)[0];
  for (const b of found) {
    let file;
    if (b.tag === 'style') file = /@font-face/.test(b.body) && !found.some(o => o !== b && o.tag === 'style' && /@font-face/.test(o.body) && o.index < b.index) ? 'styles/fonts.css' : 'styles/' + (styleN++ ? 'app-' + styleN : 'app') + '.css';
    else if (b === largestScript) file = 'scripts/app.js';
    else file = b.index < headEnd ? 'scripts/head-' + (++headN) + '.js' : 'scripts/body-' + (++bodyN) + '.js';
    const prefix = path.posix.relative(path.posix.dirname(file), '.') || '.';
    const { text, refs } = swapUuids(b.body, prefix + '/');
    write(file, text);
    const tag = b.tag === 'style' ? '<link rel="stylesheet" href="' + file + '" data-unpacked="' + file + '">' : '<script src="' + file + '" data-unpacked="' + file + '"></script>';
    blocks.push({ file, open:b.open, close:b.close, tag, refs });
    html = html.replace(b.all, () => tag);
  }

  // 3. uuids left in the markup itself
  const top = swapUuids(html, '');
  html = top.text;

  // 4. window.__resources, as the loader injected it right after <head>
  const resMap = Object.fromEntries(extRes.filter(e => assets[e.uuid]).map(e => [e.id, assets[e.uuid]]));
  let inject = null;
  if (extRes.length) {
    write('scripts/resources.js', 'window.__resources = ' + JSON.stringify(resMap, null, 2) + ';\n');
    inject = '<script src="scripts/resources.js" data-unpacked="resources"></script>';
    const h = html.match(/<head[^>]*>/i);
    html = html.slice(0, h.index + h[0].length) + inject + html.slice(h.index + h[0].length);
  }
  write('index.html', html);
  write('unpack.json', JSON.stringify({
    source: path.basename(src), templateSha256: sha(template), encodeExact: encode(template) === tplJson,
    inject, refs: top.refs, blocks, assets
  }, null, 2) + '\n');

  console.log('unpacked ' + path.basename(src) + ' -> ' + out);
  console.log('  ' + blocks.length + ' inline blocks, ' + Object.keys(assets).length + ' assets, template ' + template.length + ' chars');
  console.log('  re-encode exact: ' + (encode(template) === tplJson));
  if (!verify()) process.exit(1);

  function swapUuids(text, prefix) {
    const refs = {};
    for (const uuid of Object.keys(manifest)) {
      if (!text.includes(uuid)) continue;
      refs[prefix + assets[uuid]] = uuid;
      text = text.split(uuid).join(prefix + assets[uuid]);
    }
    return { text, refs };
  }
}

function verify() {
  const meta = JSON.parse(fs.readFileSync(path.join(out, 'unpack.json'), 'utf8'));
  const unswap = (text, refs) => { for (const [p, uuid] of Object.entries(refs)) text = text.split(p).join(uuid); return text; };
  let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  if (meta.inject) html = html.replace(meta.inject, '');
  html = unswap(html, meta.refs);
  for (const b of meta.blocks) {
    const body = unswap(fs.readFileSync(path.join(out, b.file), 'utf8'), b.refs);
    html = html.replace(b.tag, () => b.open + body + b.close);
  }
  let ok = html === template;
  for (const [uuid, rel] of Object.entries(meta.assets)) {
    const e = manifest[uuid]; let bytes = Buffer.from(e.data, 'base64'); if (e.compressed) bytes = zlib.gunzipSync(bytes);
    if (!fs.readFileSync(path.join(out, rel)).equals(bytes)) { console.error('asset differs: ' + rel); ok = false; }
  }
  console.log('verify: template ' + (html === template ? 'identical' : 'DIFFERS') + ', assets ' + Object.keys(meta.assets).length + ' checked -> ' + (ok ? 'OK' : 'FAIL'));
  return ok;
}

function extOf(mime) {
  return { 'application/javascript':'.js', 'text/javascript':'.js', 'font/woff2':'.woff2', 'font/woff':'.woff', 'font/ttf':'.ttf', 'font/otf':'.otf',
    'text/css':'.css', 'image/png':'.png', 'image/jpeg':'.jpg', 'image/svg+xml':'.svg', 'image/webp':'.webp', 'image/gif':'.gif', 'text/html':'.html' }[mime] || '.bin';
}

// Name fonts from their @font-face rules: family, weight(s), style, and the subset comment.
function nameFonts(tpl) {
  const byUuid = {};
  const re = /(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g;
  for (let m; (m = re.exec(tpl));) {
    const body = m[2], get = k => (body.match(new RegExp(k + '\\s*:\\s*([^;]+);')) || [])[1];
    const url = (body.match(/url\(["']?([0-9a-f-]{36})["']?\)/) || [])[1];
    if (!url) continue;
    const fam = String(get('font-family') || 'font').replace(/["']/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const o = byUuid[url] || (byUuid[url] = { fam, weights:new Set(), italic:false, subset:m[1] || '' });
    o.weights.add(String(get('font-weight') || '400').trim().replace(/\s+/g, '-'));
    if (/italic/.test(get('font-style') || '')) o.italic = true;
  }
  const names = {};
  for (const [uuid, o] of Object.entries(byUuid)) {
    const w = [...o.weights].sort();
    names[uuid] = [o.fam, w.length > 1 ? w[0] + '-' + w[w.length - 1] : w[0], o.italic ? 'italic' : '', o.subset].filter(Boolean).join('-');
  }
  return names;
}
