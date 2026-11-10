// Markdown and plain-text adapter. Same output model and report as the PDF pipeline.
// Understands the app dialect ("#" title, "##" chapters, "###" sections, "> [!KIND]" boxes,
// lists, images) plus GFM footnote definitions "[^id]: text" (kept as chapter notes).
// Pasted text often comes from PDFs, so the general repairs also apply: presentation forms,
// control characters, and whole-text reversal detection.
import { makeBook, makeChapter, makeSection, finalizeBook, makeReport } from './model.js';
import { mapForms, stripControls, reversalStats } from './stages/normalize.js';
import { visualToLogical } from './bidi.js';
import { scorePages, docIssues, route } from './score.js';

const ALERT = { KEY: 'key', IMPORTANT: 'key', NOTE: 'term', TERM: 'term', TIP: 'example', EXAMPLE: 'example', WARNING: 'myth', CAUTION: 'myth', MYTH: 'myth', LINK: 'link', SEE: 'link', EXPLAIN: 'explain', SIMPLE: 'explain' };

/** Decode bytes: UTF-8 (with or without BOM), UTF-16 by BOM, Windows-1256 when UTF-8 fails badly. */
export function decodeText(bytes) {
  if (typeof bytes === 'string') return bytes;
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  const s = new TextDecoder('utf-8').decode(bytes);
  const bad = (s.match(/�/g) || []).length;
  if (bad > 20 && bad > s.length * 0.01) { try { return new TextDecoder('windows-1256').decode(bytes); } catch (e) { /* not supported */ } }
  return s.replace(/^﻿/, '');
}

/** Parse Markdown into a book. */
export function parseMarkdown(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  // Footnote definitions first (they may appear anywhere).
  const defs = new Map();
  const body = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\[\^([^\]]+)\]:\s?(.*)$/.exec(lines[i]);
    if (m) {
      let t = m[2];
      while (i + 1 < lines.length && /^( {2,}|\t)\S/.test(lines[i + 1])) t += ' ' + lines[++i].trim();
      defs.set(m[1], t.trim());
    } else body.push(lines[i]);
  }
  const heads = body.map(l => /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l)).filter(Boolean).map(m => m[1].length);
  let titleLevel = 0, chL = 0, secL = 0;
  const levels = [...new Set(heads)].sort((a, b) => a - b);
  if (levels.length && heads.filter(h => h === levels[0]).length === 1 && levels.length > 1) { titleLevel = levels[0]; levels.shift(); }
  if (levels.length) chL = levels[0];
  if (levels.length > 1) secL = levels[1];

  const book = makeBook();
  let chapter = null, section = null, para = null, fence = null;
  const ensure = () => { if (!chapter) { chapter = makeChapter(''); book.chapters.push(chapter); chapter._ids = new Map(); } if (!section) { section = makeSection(''); chapter.sections.push(section); } };
  const refs = t => t.replace(/\[\^([^\]]+)\]/g, (m, id) => {
    if (!defs.has(id)) return m;
    ensure();
    if (!chapter._ids.has(id)) { const nid = String(chapter.notes.length + 1); chapter._ids.set(id, nid); chapter.notes.push({ id: nid, text: defs.get(id) }); }
    return '[^' + chapter._ids.get(id) + ']';
  });
  const close = () => { para = null; };
  for (let i = 0; i < body.length; i++) {
    const l = body[i];
    if (fence) { if (l.trim().startsWith(fence.mark)) { ensure(); section.blocks.push({ type: 'p', text: fence.buf.join(' ') }); fence = null; } else fence.buf.push(l.trim()); continue; }
    if (/^\s*(```|~~~)/.test(l)) { close(); fence = { mark: l.trim().slice(0, 3), buf: [] }; continue; }
    if (!l.trim()) { close(); continue; }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (h) {
      close();
      const lv = h[1].length, text = h[2];
      if (lv === titleLevel && !book.title) { book.title = text; continue; }
      if (lv === chL) { chapter = makeChapter(text); chapter._ids = new Map(); book.chapters.push(chapter); section = null; continue; }
      if (lv === secL) { ensure(); section = makeSection(text); chapter.sections.push(section); continue; }
      ensure(); section.blocks.push({ type: 'h4', text }); continue;
    }
    const q = /^\s*>\s?(.*)$/.exec(l);
    if (q) {
      close(); const buf = [q[1]];
      while (i + 1 < body.length && /^\s*>/.test(body[i + 1])) buf.push(body[++i].replace(/^\s*>\s?/, ''));
      const am = /^\[!(\w+)\]\s*(.*)$/i.exec(buf[0]);
      ensure();
      if (am) section.blocks.push({ type: 'box', kind: ALERT[am[1].toUpperCase()] || 'key', text: refs([am[2]].concat(buf.slice(1)).join(' ').trim()) });
      else section.blocks.push({ type: 'p', text: refs(buf.join(' ').trim()) });
      continue;
    }
    const li = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(l);
    if (li) {
      close(); ensure();
      const last = section.blocks[section.blocks.length - 1];
      if (last && last.type === 'list' && /^\s*(?:[-*+]|\d+[.)])\s/.test(body[i - 1] || '')) last.items.push(refs(li[1]));
      else section.blocks.push({ type: 'list', items: [refs(li[1])] });
      continue;
    }
    const img = /^\s*!\[([^\]]*)\]\(([^)\s]+)[^)]*\)\s*$/.exec(l);
    if (img) { close(); ensure(); section.blocks.push({ type: 'figure', src: img[2], alt: img[1], caption: img[1] }); continue; }
    ensure();
    if (para) para.text += ' ' + refs(l.trim());
    else { para = { type: 'p', text: refs(l.trim()) }; section.blocks.push(para); }
  }
  for (const c of book.chapters) delete c._ids;
  return finalizeBook(book);
}

export async function* ingestText(bytes, kind, options = {}) {
  const t0 = Date.now();
  let text = stripControls(decodeText(bytes)).replace(/\r\n?/g, '\n');
  text = mapForms(text);
  const rs = reversalStats(text);
  if (rs.reversed && options.rules?.['stat-reverse'] !== false) text = text.split('\n').map(l => visualToLogical(l)).join('\n');
  yield { type: 'progress', stage: 'parse', page: 1, pages: 1 };
  const book = parseMarkdown(text);
  const report = makeReport(kind === 'md' ? 'md' : 'txt');
  const pages = book.chapters.map((c, i) => ({ page: i + 1, text: c.sections.flatMap(s => s.blocks).map(b => b.text || (b.items || []).join(' ')).join('\n') }));
  const sc = scorePages(pages);
  const extra = book.chapters.length < 2 ? [{ code: 'no-chapters', pages: 0, severity: 'major' }] : [];
  const issues = docIssues(sc.pages, extra);
  const scored = sc.pages.some(p => p.scored);
  const rt = route(sc.pages, sc.score, issues, book.chapters.length);
  report.pages = pages.length;
  report.fingerprint = { producer: kind, creator: '', fonts: [], pageSize: '', granularity: 'document' };
  report.score = Math.round((scored ? sc.score : 1) * 1000) / 1000;
  report.pageScores = sc.pages.map(r => ({ page: r.page, score: r.score, tokens: r.tokens, issues: r.issues, route: r.route }));
  report.chapters = { count: book.chapters.length, method: book.chapters.length > 1 ? 'headings' : 'none', tocPages: [], items: book.chapters.map((c, i) => ({ index: i + 1, method: book.chapters.length > 1 ? 'headings' : 'none', startPage: null })) };
  const notes = book.chapters.reduce((n, c) => n + (c.notes ? c.notes.length : 0), 0);
  report.footnotes = { found: notes, linked: notes, placed: notes, unlinkedMarkers: 0 };
  report.figures = book.chapters.reduce((n, c) => n + c.sections.flatMap(s => s.blocks).filter(b => b.type === 'figure').length, 0);
  report.issues = issues.map(({ pageList, ...x }) => x);
  report.recommendation = scored ? rt.recommendation : (book.chapters.length >= 2 ? 'ok' : 'review');
  report.confidence = Math.round((scored ? rt.confidence : 0.6) * 1000) / 1000;
  report.metrics = { reversed: rs.reversed };
  report.timings = { total: Date.now() - t0 };
  yield { type: 'result', book, report, assets: [], vision: null };
}
