// EPUB adapter: uses the EPUB's own structure (OPF spine; EPUB 3 nav or EPUB 2 NCX table of
// contents for chapters), footnotes (noteref links and note elements), and images.
// Output uses the same model and report as the PDF pipeline. Pure: JSZip only.
import JSZip from 'jszip';
import { IngestError, makeBook, makeChapter, makeSection, finalizeBook, makeReport } from './model.js';
import { tokenize, htmlBlocks, noteTargetsOf, decodeEntities } from './html.js';
import { mapForms, stripControls } from './stages/normalize.js';
import { scorePages, docIssues, route } from './score.js';
import { abortError } from './vision.js';

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' };
const REF = /([^]+)/g;

export function resolvePath(base, href) {
  const out = [];
  (base + decodeURIComponent(String(href).split('#')[0])).split('/').forEach(p => { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); });
  return out.join('/');
}
const dirOf = p => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
const textOf = (toks, i, stop) => { let s = ''; for (let j = i; j < toks.length && !(toks[j].t === 'close' && toks[j].name === stop); j++) if (toks[j].t === 'text') s += toks[j].text; return s.replace(/\s+/g, ' ').trim(); };

/** Top-level TOC entries [{ title, file, frag }] from an EPUB 3 nav document. */
export function parseNav(xhtml, base) {
  const toks = tokenize(xhtml);
  let inToc = false, depth = 0, navDepth = 0;
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'open' && t.name === 'nav' && /toc/.test(t.attrs['epub:type'] || t.attrs.role || t.attrs.id || '')) { inToc = true; navDepth = 0; continue; }
    if (!inToc) continue;
    if (t.t === 'close' && t.name === 'nav') break;
    if (t.t === 'open' && t.name === 'ol') { depth++; continue; }
    if (t.t === 'close' && t.name === 'ol') { depth--; continue; }
    if (t.t === 'open' && t.name === 'a' && depth === 1 && t.attrs.href) {
      const [f, frag] = t.attrs.href.split('#');
      out.push({ title: textOf(toks, i + 1, 'a'), file: resolvePath(base, f), frag: frag || null });
    }
  }
  return out;
}

/** Top-level TOC entries from an EPUB 2 NCX document. */
export function parseNcx(xml, base) {
  const toks = tokenize(xml);
  const out = [];
  let depth = 0, cur = null;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'open' && t.name === 'navpoint') { depth++; if (depth === 1) cur = { title: '', file: '', frag: null }; }
    else if (t.t === 'close' && t.name === 'navpoint') { if (depth === 1 && cur && cur.file) out.push(cur); depth--; }
    else if (depth === 1 && cur && t.t === 'open' && t.name === 'text' && !cur.title) cur.title = textOf(toks, i + 1, 'text');
    else if (depth === 1 && cur && t.t === 'open' && t.name === 'content' && !cur.file) { const [f, frag] = (t.attrs.src || '').split('#'); cur.file = resolvePath(base, f); cur.frag = frag || null; }
  }
  return out;
}

export async function* ingestEpub(bytes, options = {}) {
  const t0 = Date.now();
  const check = () => { if (options.signal && options.signal.aborted) throw abortError(); };
  if (!bytes || !bytes.length) throw new IngestError('empty', 'The file is empty.');
  let zip;
  try { zip = await JSZip.loadAsync(bytes); } catch (e) { throw new IngestError('invalid-epub', 'This file could not be read as an EPUB (it may be damaged).'); }
  if (zip.file('META-INF/encryption.xml')) {
    const enc = await zip.file('META-INF/encryption.xml').async('string');
    if (/EncryptedData/.test(enc) && !/obfuscation|font/i.test(enc)) throw new IngestError('encrypted', 'This EPUB is DRM-protected and cannot be read.');
  }
  const read = async p => { const f = zip.file(p); return f ? f.async('string') : null; };
  const container = await read('META-INF/container.xml');
  if (!container) throw new IngestError('invalid-epub', 'Missing META-INF/container.xml.');
  const rootTok = tokenize(container).find(t => t.t === 'open' && t.name === 'rootfile');
  const opfPath = rootTok && rootTok.attrs['full-path'];
  const opf = opfPath && await read(opfPath);
  if (!opf) throw new IngestError('invalid-epub', 'Missing package document.');
  const base = dirOf(opfPath);
  const toks = tokenize(opf);
  const meta = tag => { const i = toks.findIndex(t => t.t === 'open' && t.name === tag); return i >= 0 ? decodeEntities(textOf(toks, i + 1, tag)) : ''; };
  const manifest = new Map();
  let navHref = null, ncxId = null;
  for (const t of toks) {
    if (t.t === 'open' && t.name === 'item') {
      manifest.set(t.attrs.id, { href: resolvePath(base, t.attrs.href || ''), type: t.attrs['media-type'] || '' });
      if (/\bnav\b/.test(t.attrs.properties || '')) navHref = resolvePath(base, t.attrs.href);
    }
    if (t.t === 'open' && t.name === 'spine') ncxId = t.attrs.toc || null;
  }
  const spine = toks.filter(t => t.t === 'open' && t.name === 'itemref' && t.attrs.linear !== 'no').map(t => manifest.get(t.attrs.idref)).filter(x => x && /html|xml/.test(x.type));
  yield { type: 'progress', stage: 'open', page: 0, pages: spine.length };

  // Table of contents: EPUB 3 nav, else EPUB 2 NCX.
  let toc = [], tocMethod = 'spine';
  if (navHref) { const nav = await read(navHref); if (nav) { toc = parseNav(nav, dirOf(navHref)); if (toc.length) tocMethod = 'epub-nav'; } }
  if (!toc.length && ncxId && manifest.get(ncxId)) { const ncx = await read(manifest.get(ncxId).href); if (ncx) { toc = parseNcx(ncx, dirOf(manifest.get(ncxId).href)); if (toc.length) tocMethod = 'epub-ncx'; } }

  // Content: blocks of every spine document, with anchors, in order.
  const stream = [];
  const allNotes = new Map();
  const assets = [];
  const imgPaths = new Map();
  for (let k = 0; k < spine.length; k++) {
    check();
    const doc = spine[k];
    if (navHref && doc.href === navHref) continue;
    const html = await read(doc.href);
    if (!html) continue;
    const { blocks, notes } = htmlBlocks(html, noteTargetsOf(html));
    for (const [id, t] of notes) allNotes.set(id, t);
    stream.push({ kind: 'file', file: doc.href });
    for (const b of blocks) {
      if (b.kind === 'img' && options.images !== false) {
        const p = resolvePath(dirOf(doc.href), b.src);
        if (!imgPaths.has(p) && zip.file(p)) {
          const ext = (p.split('.').pop() || '').toLowerCase();
          const out = 'img/' + String(imgPaths.size + 1).padStart(3, '0') + '.' + ext;
          imgPaths.set(p, out);
          assets.push({ path: out, mime: MIME[ext] || 'application/octet-stream', bytes: await zip.file(p).async('uint8array') });
        }
        b.path = imgPaths.get(p) || null;
      }
      stream.push(b);
    }
    yield { type: 'progress', stage: 'extract', page: k + 1, pages: spine.length };
  }

  // Chapter start positions from the TOC (file start or fragment anchor), else one per file.
  const starts = [];
  if (toc.length) {
    let from = 0;
    for (const e of toc) {
      let pos = -1;
      for (let i = 0; i < stream.length; i++) {
        const b = stream[i];
        if (e.frag ? (b.kind === 'anchor' && b.id === e.frag && fileAt(stream, i) === e.file) : (b.kind === 'file' && b.file === e.file)) { pos = i; break; }
      }
      if (pos >= from) { starts.push({ pos, title: e.title }); from = pos; }
    }
  }
  if (starts.length < 1) {
    tocMethod = 'spine';
    stream.forEach((b, i) => { if (b.kind === 'file') starts.push({ pos: i, title: '' }); });
  }

  // Assemble.
  const book = makeBook({ title: meta('title'), author: meta('creator') });
  const clean = s => mapForms(stripControls(s));
  let chapter = null, section = null, pendingCaption = null, notesFound = 0, linked = 0, figures = 0;
  const startAt = new Map(starts.map(s => [s.pos, s]));
  const firstPos = starts.length ? starts[0].pos : 0;
  const pageTexts = [];
  let curText = '';
  for (let i = firstPos; i < stream.length; i++) {
    const b = stream[i];
    if (startAt.has(i)) {
      if (chapter) { pageTexts.push(curText); curText = ''; }
      const s = startAt.get(i);
      chapter = makeChapter(clean(s.title)); chapter._n = 0; book.chapters.push(chapter);
      section = makeSection(''); chapter.sections.push(section);
      chapter._titleKey = s.title.replace(/\s+/g, ' ').trim();
    }
    if (!chapter) continue;
    if (b.kind === 'h') {
      const t = clean(b.text);
      if (!chapter.title) { chapter.title = t; continue; }
      if (t.replace(/\s+/g, ' ') === chapter.title || t === chapter._titleKey) continue;
      if (b.level <= 3) { section = makeSection(t); chapter.sections.push(section); }
      else section.blocks.push({ type: 'h4', text: t });
      curText += t + '\n';
    } else if (b.kind === 'p') {
      const text = clean(b.text).replace(REF, (m, id) => {
        const note = allNotes.get(id);
        if (!note) return '';
        notesFound++; linked++;
        const nid = String(++chapter._n);
        chapter.notes.push({ id: nid, text: clean(note) });
        return '[^' + nid + ']';
      });
      if (!text) continue;
      const last = section.blocks[section.blocks.length - 1];
      if (b.list && last && last.type === 'list') last.items.push(text);
      else if (b.list) section.blocks.push({ type: 'list', items: [text] });
      else section.blocks.push({ type: 'p', text });
      curText += text + '\n';
    } else if (b.kind === 'img' && b.path) {
      section.blocks.push({ type: 'figure', src: b.path, alt: clean(b.alt), caption: '' }); figures++;
      pendingCaption = section.blocks[section.blocks.length - 1];
    } else if (b.kind === 'caption' && pendingCaption) {
      pendingCaption.caption = clean(b.text); if (!pendingCaption.alt) pendingCaption.alt = pendingCaption.caption; pendingCaption = null;
    }
  }
  if (chapter) pageTexts.push(curText);
  for (const c of book.chapters) { delete c._n; delete c._titleKey; }
  finalizeBook(book);

  const report = makeReport('epub');
  report.pages = spine.length;
  report.fingerprint = { producer: 'epub', creator: '', fonts: [], pageSize: '', granularity: 'document' };
  const sc = scorePages(pageTexts.map((text, i) => ({ page: i + 1, text })));
  const extra = book.chapters.length < 2 ? [{ code: 'no-chapters', pages: 0, severity: 'major' }] : [];
  const issues = docIssues(sc.pages, extra);
  const rt = route(sc.pages, sc.score, issues, book.chapters.length);
  // EPUB text is born-digital: an unscored book (e.g. too little Arabic) is still readable.
  const scored = sc.pages.some(p => p.scored);
  report.score = Math.round((scored ? sc.score : 1) * 1000) / 1000;
  report.pageScores = sc.pages.map(r => ({ page: r.page, score: r.score, tokens: r.tokens, issues: r.issues, route: r.route }));
  report.chapters = { count: book.chapters.length, method: tocMethod, tocPages: [], items: book.chapters.map((c, i) => ({ index: i + 1, method: tocMethod, startPage: null })) };
  report.footnotes = { found: notesFound, linked, placed: linked, unlinkedMarkers: 0 };
  report.figures = figures;
  report.issues = issues.map(({ pageList, ...x }) => x);
  const rec = scored ? rt : { recommendation: book.chapters.length >= 2 ? 'ok' : 'review', confidence: 0.6, visionPages: [] };
  report.recommendation = !book.chapters.length || !pageTexts.join('').trim() ? 'vision' : rec.recommendation;
  report.confidence = Math.round(rec.confidence * 1000) / 1000;
  report.visionPages = [];
  report.timings = { total: Date.now() - t0 };
  yield { type: 'result', book, report, assets, vision: null };
}

function fileAt(stream, i) { for (let k = i; k >= 0; k--) if (stream[k].kind === 'file') return stream[k].file; return null; }
