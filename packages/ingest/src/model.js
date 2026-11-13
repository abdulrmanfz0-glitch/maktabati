// Output data model. `book` is exactly the app's single-item import format
// (see docs/phase1-analysis.md, section c), so it can be imported as-is.
//
// Book    { type:'book', title, author, intro?, chapters: Chapter[] }
// Chapter { title, minutes, sections: Section[], notes?: Note[] }
// Section { title, blocks: Block[] }
// Block   { type:'p', text } | { type:'h4', text } | { type:'list', items }
//         | { type:'box', kind, title?, text } | { type:'figure', src, alt, caption? }
// Note    { id, text }   (referenced from block text as [^id], ids unique per chapter)
//
// Result  { book, report, assets }
// Asset   { path, mime, bytes: Uint8Array }  (figures; blocks reference them by `path`)
// Report  metrics only, never book text: see makeReport().

export const BOX_KINDS = ['key', 'term', 'example', 'myth', 'link', 'explain'];

export function makeBook(o = {}) {
  return { type: 'book', title: o.title || '', author: o.author || '', chapters: [] };
}

export function makeChapter(title = '') {
  return { title, minutes: 1, sections: [], notes: [] };
}

export function makeSection(title = '') {
  return { title, blocks: [] };
}

/** Reading time, same rule as the app: 200 words per minute, at least 1. */
export function minutesOf(ch) {
  let words = 0;
  for (const s of ch.sections) for (const b of s.blocks) {
    const t = b.type === 'list' ? b.items.join(' ') : b.type === 'figure' ? (b.caption || '') : (b.text || '');
    words += t.split(/\s+/).filter(Boolean).length;
  }
  return Math.max(1, Math.round(words / 200));
}

/** Drop empty sections/notes and set minutes. Mutates and returns the book. */
export function finalizeBook(book) {
  book.chapters = book.chapters.filter(ch => {
    ch.sections = ch.sections.filter(s => s.blocks.length || s.title);
    if (!ch.notes || !ch.notes.length) delete ch.notes;
    ch.minutes = minutesOf(ch);
    return ch.sections.length || ch.title;
  });
  if (book.intro && !book.intro.blocks.length) delete book.intro;
  return book;
}

export function makeReport(kind) {
  return {
    kind,
    pages: 0,
    fingerprint: null,
    profile: 'generic',
    score: 0,
    pageScores: [],
    chapters: { count: 0, method: 'none', items: [] },
    footnotes: { found: 0, linked: 0 },
    figures: 0,
    issues: [],
    recommendation: 'review',
    confidence: 0,
    visionPages: [],
    scanned: { pages: 0, share: 0 },
    timings: {}
  };
}

export class IngestError extends Error {
  constructor(code, message) { super(message); this.name = 'IngestError'; this.code = code; }
}
