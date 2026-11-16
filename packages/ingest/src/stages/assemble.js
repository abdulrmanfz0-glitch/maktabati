// Stage 7: assemble. Walks the labelled pages in reading order and builds the book:
// chapters, sections, paragraphs (continued across page breaks), notes with per-chapter
// ids linked from [^id] markers, and figures with captions.
import { on } from '../rules.js';
import { makeBook, makeChapter, makeSection, finalizeBook } from '../model.js';
import { MARK_OPEN, MARK_CLOSE, repairSplitMarks } from './normalize.js';

const RE_MARK_G = new RegExp(MARK_OPEN + '(\\d+)' + MARK_CLOSE, 'g');
// ASCII \b never matches after an Arabic letter, so the Arabic alternatives use a lookahead.
const RE_CAPTION = /^(?:شكل|الشكل|صورة|جدول|خريطة|رسم)(?=[\s:]|$)|^(?:figure|fig\.|table|plate)\b/i;
const TERMINAL = /[.!?؟…»”"'):؛]$/;

/** Images that repeat at the same place on several pages are decoration (logos, ornaments). */
function decorativeKeys(pages) {
  const c = new Map();
  for (const p of pages) for (const im of p.images || []) c.set(im.key, (c.get(im.key) || 0) + 1);
  return new Set([...c].filter(([, n]) => n >= 3).map(([k]) => k));
}

/**
 * @param {Array} pages       pages with labelled lines, images, notes
 * @param {object} stats      docStats
 * @param {object} chapters   detectChapters result
 * @param {Array} groups      heading groups
 * @param {object} ctx        { title, author }
 */
/* ---------- reading units ----------
   The reader shows one paragraph as one block and one chapter as one unit with a duration, so a
   paragraph of 80,000 characters or a chapter that holds most of the book cannot be read or
   navigated. The cuts below only decide where a boundary already exists (a sentence end, a section
   heading, a heading paragraph, a paragraph break); no character of the text changes. */

export const PARA_CAP = 3000, PARA_MIN = 600;
export const CHAP_CAP = 20000, CHAP_MIN_PART = 800;

const textLen = b => (b.type === 'list' ? b.items.join(' ').length : b.type === 'figure' ? (b.caption || '').length : (b.text || '').length);
const blocksLen = bs => bs.reduce((n, b) => n + textLen(b), 0);
const chapterLen = ch => ch.sections.reduce((n, s) => n + blocksLen(s.blocks), 0);

/** Sentences of a paragraph, each keeping its closing mark. */
export function sentenceChunks(text) {
  const out = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c !== '.' && c !== '!' && c !== '؟' && c !== '…') continue;
    if (i + 1 < text.length && !/\s/.test(text[i + 1])) continue;
    out.push(text.slice(start, i + 1));
    start = i + 1;
  }
  if (start < text.length) out.push(text.slice(start));
  return out.map(s => s.trim()).filter(Boolean);
}

/** Split one paragraph into pieces of at most `cap` characters, at sentence ends or word breaks. */
export function splitParagraph(text, cap = PARA_CAP) {
  const parts = [];
  let cur = '';
  for (const sentence of sentenceChunks(text)) {
    if (cur && (cur + ' ' + sentence).length > cap) { parts.push(cur); cur = sentence; }
    else cur = cur ? cur + ' ' + sentence : sentence;
  }
  if (cur) parts.push(cur);
  const out = [];
  for (const p of parts) {
    if (p.length <= cap * 1.4) { out.push(p); continue; }
    let rest = p;
    while (rest.length > cap) {
      const cut = rest.lastIndexOf(' ', cap);
      if (cut <= 0) break;
      out.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
  }
  return out.filter(Boolean);
}

/** No paragraph is a wall of text: cut the very long ones at sentence ends. */
function capParagraphs(book, opts) {
  const cap = Math.max(PARA_MIN * 2, opts.params?.paragraphChars ?? PARA_CAP);
  const fix = blocks => {
    const out = [];
    for (const b of blocks) {
      if (b.type !== 'p' || (b.text || '').length <= cap || (b.text || '').includes('  \n')) { out.push(b); continue; }
      for (const text of splitParagraph(b.text, cap)) out.push({ type: 'p', text });
    }
    return out;
  };
  for (const ch of book.chapters) for (const s of ch.sections) s.blocks = fix(s.blocks);
  if (book.intro && book.intro.blocks) book.intro.blocks = fix(book.intro.blocks);
}

/** Notes follow the part that still contains their marker; the rest stay on the first part. */
function assignNotes(ch, parts) {
  const notes = ch.notes || [];
  if (!notes.length) return;
  for (const note of notes) {
    const mark = '[^' + note.id + ']';
    const hit = parts.find(p => p.sections.some(s => s.blocks.some(b => (b.text || '').includes(mark) || (b.items || []).some(x => x.includes(mark)))));
    (hit || parts[0]).notes.push(note);
  }
}

const partTitle = (base, k) => (k === 1 ? base : base + ' (' + k + ')');

/** Cut one oversized chapter into parts: its sections, then heading paragraphs, then paragraphs. */
function cutChapter(ch, cap) {
  if (chapterLen(ch) <= cap) return [ch];
  // 1. The chapter's own sections (they are real titles, so they make the best parts).
  const usable = ch.sections.filter(s => s.blocks.length && blocksLen(s.blocks) >= CHAP_MIN_PART);
  if (usable.length >= 2) {
    const parts = [];
    for (const s of ch.sections) {
      if (!s.blocks.length || !blocksLen(s.blocks)) continue;
      const title = s.title || partTitle(ch.title, parts.length + 1);
      if (blocksLen(s.blocks) <= cap) parts.push({ title, minutes: 1, sections: [s], notes: [] });
      else parts.push(...cutBlocks(s.blocks, title, cap));
    }
    if (parts.length >= 2) { assignNotes(ch, parts); return parts; }
  }
  // 2. Headings inside the chapter, then paragraph breaks.
  const blocks = ch.sections.flatMap(s => s.blocks);
  const parts = cutBlocks(blocks, ch.title, cap);
  if (parts.length >= 2) { assignNotes(ch, parts); return parts; }
  return [ch];
}

/**
 * Group blocks into parts of at most `cap` characters. A heading paragraph opens a new part and
 * becomes its title; otherwise a part is titled after the chapter (first part) or chapter plus
 * its number.
 */
function cutBlocks(blocks, baseTitle, cap) {
  const parts = [];
  let cur = [], title = baseTitle, k = 1;
  const flush = () => {
    if (!cur.length) return;
    parts.push({ title: title || baseTitle, minutes: 1, sections: [{ title: '', blocks: cur }], notes: [] });
    cur = []; k++; title = partTitle(baseTitle, k);
  };
  for (const b of blocks) {
    if (b.type === 'h4') {
      if (blocksLen(cur) >= CHAP_MIN_PART) { flush(); title = b.text; continue; }
      if (!cur.length) { title = b.text; continue; }   // a heading that opens the chapter is its title
    }
    if (cur.length && blocksLen(cur) + textLen(b) > cap) flush();
    cur.push(b);
  }
  flush();
  return parts;
}

function splitChapters(book, opts) {
  const cap = Math.max(1000, opts.params?.chapterChars ?? CHAP_CAP);
  const out = [];
  for (const ch of book.chapters) out.push(...cutChapter(ch, cap));
  book.chapters = out;
}

/**
 * A note whose marker could not be linked (an endnote whose page was missed, a marker read as a
 * plain digit) is invisible in the reader: it is only reachable from its marker. Move those notes
 * to a "الحواشي" section at the end of the chapter, where the reader can read them.
 */
function appendOrphanNotes(book) {
  for (const ch of book.chapters) {
    const notes = ch.notes || [];
    if (!notes.length) continue;
    const body = ch.sections.map(s => s.blocks.map(b => b.type === 'list' ? b.items.join(' ') : (b.text || '')).join('\n')).join('\n');
    const orphan = notes.filter(n => !body.includes('[^' + n.id + ']'));
    if (!orphan.length) continue;
    ch.sections.push({ title: 'الحواشي', blocks: orphan.map(n => ({ type: 'p', text: '(' + n.id + ') ' + n.text })) });
    ch.notes = notes.filter(n => !orphan.includes(n));
    if (!ch.notes.length) delete ch.notes;
  }
}

/** Assemble pages into the book: chapters, sections, paragraphs, notes and figures. */
export function assemble(pages, stats, chapters, groups, ctx = {}, opts = {}) {
  const book = makeBook({ title: ctx.title, author: ctx.author });
  const assets = [];
  let enSeq = -1, enLast = Infinity;
  const seqChapter = new Map(); // endnote sequence index -> chapter that received its notes
  const m = { endLinked: 0, nonTerminalEnd: {}, verse: 0, paragraphs: 0, terminal: 0, mega: 0, figures: 0, captions: 0, notes: 0, linked: 0, unlinkedMarkers: 0, frontMatterPages: 0, sections: 0, placed: new Map(), frontSkipped: [] };
  // Coverage: count what each page contributes to the book (lines, headings, figures).
  const mark = pi => m.placed.set(pi, (m.placed.get(pi) || 0) + 1);
  const starts = new Map(chapters.chapters.map(c => [c.page + ':' + c.line, c]));
  const groupAt = new Map(groups.map(g => [g.page + ':' + g.start, g]));
  const chapterLevel = chapters.chapters.length ? Math.min(...chapters.chapters.map(c => c.group ? c.group.level : 1)) : 0;
  // Section level: the shallowest heading level used inside the chapters (not in front matter).
  const chapterGroups = new Set(chapters.chapters.map(c => c.group).filter(Boolean));
  const firstStart = chapters.chapters.length ? chapters.chapters[0].page * 1e5 + chapters.chapters[0].line : 0;
  const inner = groups.filter(g => !chapterGroups.has(g) && g.page * 1e5 + g.start >= firstStart);
  const sectionLevel = inner.length ? Math.min(...inner.map(g => g.level)) : Infinity;
  const tocPages = new Set(chapters.toc ? chapters.toc.pages : []);
  const deco = decorativeKeys(pages);
  const first = chapters.chapters[0];
  const dropFront = on(opts, 'drop-front-matter') && first;

  let chapter = null, section = null, para = null, lastLine = null;
  const intro = [];
  const ensureChapter = () => {
    if (!chapter) { chapter = makeChapter(''); chapter._n = 0; book.chapters.push(chapter); section = null; }
    if (!section) { section = makeSection(''); chapter.sections.push(section); }
  };
  const target = () => (inFront ? intro : (ensureChapter(), section.blocks));
  const closePara = () => {
    if (!para) return;
    if (para.verse) {
      para.text = para.text.split('  \n').map(x => repairSplitMarks(x.replace(/\s+/g, ' '), opts.lexicon, on(opts, 'mark-word-gap')).trim()).filter(Boolean).join('  \n');
      delete para.verse; m.verse++;
      para = null; return;
    }
    para.text = repairSplitMarks(para.text.replace(/\s+/g, ' '), opts.lexicon, on(opts, 'mark-word-gap')).trim();
    if (para.text) {
      m.paragraphs++;
      if (TERMINAL.test(para.text)) m.terminal++;
      else m.nonTerminalEnd[para._end || 'structure'] = (m.nonTerminalEnd[para._end || 'structure'] || 0) + 1;
      if (para.text.length > 4000) m.mega++;
    }
    para = null;
  };
  let inFront = !!first;

  for (let pi = 0; pi < pages.length; pi++) {
    const p = pages[pi];
    if (first && (pi < first.page)) {
      if (dropFront || tocPages.has(pi)) { m.frontMatterPages++; m.frontSkipped.push(pi); continue; }
    }
    // page notes, placed when their marker is met
    const pending = new Map();
    for (const n of p.notes || []) if (n.n !== null) pending.set(n.n, n);
    const contNotes = (p.notes || []).filter(n => n.cont);
    // figures of this page, in reading position
    const figs = on(opts, 'figures') ? (p.images || []).filter(im => im.png && !deco.has(im.key)).sort((a, b) => b.y - a.y) : [];
    const units = [];
    const L = p.lines;
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      while (figs.length && figs[0].y + figs[0].h > l.y + l.size) units.push({ fig: figs.shift() });
      units.push({ line: l, i });
    }
    for (const f of figs) units.push({ fig: f });

    for (let u = 0; u < units.length; u++) {
      const unit = units[u];
      if (unit.fig) {
        closePara();
        const im = unit.fig;
        const path = 'img/p' + p.index + '-' + (++m.figures) + '.png';
        assets.push({ path, mime: 'image/png', bytes: im.png });
        let caption = '';
        if (on(opts, 'captions')) {
          const nx = units.slice(u + 1).find(x => x.line && !x.line.removed && x.line.role !== 'note');
          if (nx && im.y - nx.line.y < 2.4 * stats.leading && (nx.line.size < stats.bodySize - 0.4 || RE_CAPTION.test(nx.line.text))) {
            caption = nx.line.text.replace(RE_MARK_G, '$1'); nx.line.consumed = true; m.captions++;
          }
        }
        target().push({ type: 'figure', src: path, alt: caption, caption }); mark(pi);
        continue;
      }
      const l = unit.line, i = unit.i;
      if (l.removed || l.role === 'note' || l.role === 'endnote' || l.consumed) continue;
      const key = pi + ':' + i;
      const ch = starts.get(key);
      if (ch) {
        closePara(); inFront = false;
        chapter = makeChapter(ch.title || (ch.group && ch.group.text) || ''); chapter._n = 0; chapter._method = ch.method; book.chapters.push(chapter);
        section = null; lastLine = null;
        if (ch.group) for (let k = ch.group.start; k <= ch.group.end; k++) L[k].consumed = true;
        mark(pi);
        continue;
      }
      const g = groupAt.get(key);
      if (g && l.role === 'heading') {
        closePara();
        if (!inFront) ensureChapter();
        for (let k = g.start; k <= g.end; k++) L[k].consumed = true;
        if (inFront) intro.push({ type: 'h4', text: g.text });
        else if (g.level <= sectionLevel) { section = makeSection(g.text); chapter.sections.push(section); m.sections++; }
        else section.blocks.push({ type: 'h4', text: g.text });
        lastLine = null; mark(pi);
        continue;
      }
      if (l.role === 'heading') continue;
      mark(pi);
      // body line: place notes whose markers occur here, then join into the paragraph
      let text = l.text.replace(RE_MARK_G, (all, n) => {
        const note = pending.get(n);
        let noteText = note && !inFront ? note.text : null;
        if (note && !inFront) pending.delete(n);
        else if (!inFront && ctx.endnotes && ctx.endnotes.sequences.length) {
          // Endnotes: markers without a same-page note, split into sequences where numbering restarts.
          if (+n <= enLast) enSeq++;
          enLast = +n;
          const mapped = ctx.endnotes.map ? ctx.endnotes.map.get(enSeq) : enSeq;
          const seq = mapped === undefined ? null : ctx.endnotes.sequences[mapped];
          if (seq && seq.has(n)) { noteText = seq.get(n); m.endLinked++; if (ctx.endnotes.used) ctx.endnotes.used.add(mapped + ':' + n); seqChapter.set(mapped, chapter); }
        }
        if (noteText === null) { m.unlinkedMarkers++; return n; }
        ensureChapter();
        const id = String(++chapter._n);
        chapter.notes.push({ id, text: noteText });
        m.notes++; m.linked++;
        return '[^' + id + ']';
      });
      const pageBreak = lastLine && lastLine.page !== pi;
      if (l.verse) {
        // Verse lines stay one block with line breaks (the app renders "  \n" as <br>).
        if (para && para.verse && !(l.parStart && !pageBreak)) para.text += '  \n' + text;
        else { closePara(); para = { type: 'p', text, verse: true }; target().push(para); }
        lastLine = { page: pi, endsShort: true, verse: true };
        continue;
      }
      const newPara = !para || para.verse || l.parStart || (lastLine && lastLine.endsShort) || (pageBreak && !on(opts, 'cross-page-paragraphs'));
      if (newPara) {
        if (para) para._end = !para.verse && l.parStart ? l.startWhy || 'parStart' : lastLine && lastLine.endsShort ? 'prevShort' : 'pageBreak';
        closePara();
        para = { type: 'p', text };
        target().push(para);
      } else if (on(opts, 'hyphen-join') && /[A-Za-z]-$/.test(para.text) && /^[a-z]/.test(text)) {
        para.text = para.text.slice(0, -1) + text;
      } else para.text += ' ' + text;
      lastLine = { page: pi, endsShort: l.endsShort };
    }
    // continuation notes extend the previous note; unreferenced notes are kept, unlinked
    if (!inFront) {
      for (const n of contNotes) {
        if (chapter && chapter.notes.length) chapter.notes[chapter.notes.length - 1].text += ' ' + n.text;
      }
      for (const [num, n] of pending) {
        ensureChapter();
        // Keep the printed number so the note list matches the numbers in the text; fall back to
        // the running id when that number is already taken in this chapter.
        const id = num && isFinite(+num) && !chapter.notes.some(x => x.id === String(num)) ? String(num) : String(++chapter._n);
        chapter.notes.push({ id, text: n.text });
        m.notes++;
      }
    }
  }
  closePara();
  // Unlinked endnotes are kept (unlinked) so no text is lost: in the chapter that received
  // other notes of the same sequence, otherwise in the last chapter.
  if (ctx.endnotes && ctx.endnotes.sequences.length && book.chapters.length) {
    ctx.endnotes.sequences.forEach((seq, j) => {
      for (const [n, text] of seq) {
        if (ctx.endnotes.used && ctx.endnotes.used.has(j + ':' + n)) continue;
        const c = seqChapter.get(j) || book.chapters[book.chapters.length - 1];
        // The printed number, so the "الحواشي" list matches the markers the reader sees.
        const id = isFinite(+n) && !c.notes.some(x => x.id === String(n)) ? String(n) : String(++c._n);
        c.notes.push({ id, text }); m.notes++; m.endKept = (m.endKept || 0) + 1;
      }
    });
  }
  if (!on(opts, 'drop-front-matter') && intro.length) book.intro = { blocks: intro };
  for (const c of book.chapters) { delete c._n; delete c._method; }
  // Reading units: a wall of text in one paragraph, or one chapter that holds most of the book,
  // is unusable in the reader. Both are grouping decisions only; no character of the text changes.
  if (on(opts, 'paragraph-cap')) capParagraphs(book, opts);
  if (on(opts, 'split-long-chapters')) splitChapters(book, opts);
  if (on(opts, 'orphan-notes')) appendOrphanNotes(book);
  finalizeBook(book);
  return { book, assets, metrics: m };
}
