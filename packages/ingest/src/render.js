// Markdown renderer in the app's dialect (docs/phase1-analysis.md):
//   "# " book title, "## " chapter, "### " section, "#### " sub-heading block,
//   "> [!KIND]" boxes, "- " lists, "![alt](src)" figures, "[^n]" note markers
//   with GFM-style "[^n]: text" definitions at the end of each chapter.
// The app's importer (mdToItem) maps "##" to chapters and "###" to sections when both exist.

const KIND = { key: 'KEY', term: 'TERM', example: 'EXAMPLE', myth: 'MYTH', link: 'LINK', explain: 'EXPLAIN' };

const oneLine = s => String(s || '').replace(/\s*\n\s*/g, ' ').trim();

function blockMd(b) {
  switch (b.type) {
    case 'h4': return '#### ' + oneLine(b.text);
    case 'list': return (b.items || []).map(x => '- ' + oneLine(x)).join('\n');
    case 'box': {
      const head = '> [!' + (KIND[b.kind] || 'KEY') + ']';
      const body = [b.title ? '**' + oneLine(b.title) + '**' : '', oneLine(b.text)].filter(Boolean);
      return [head].concat(body.map(l => '> ' + l)).join('\n');
    }
    case 'figure': {
      const img = b.src ? '![' + oneLine(b.alt || b.caption) + '](' + String(b.src).replace(/\s/g, '%20') + ')' : '';
      return [img, b.caption ? '*' + oneLine(b.caption) + '*' : ''].filter(Boolean).join('\n\n');
    }
    default: return oneLine(b.text);
  }
}

/** Render a book (or an ingest result) to Markdown. */
export function toMarkdown(input) {
  const book = input && input.book ? input.book : input;
  const out = [];
  if (book.title) out.push('# ' + oneLine(book.title));
  if (book.intro && book.intro.blocks) for (const b of book.intro.blocks) out.push(blockMd(b));
  for (const ch of book.chapters || []) {
    out.push('## ' + (oneLine(ch.title) || '—'));
    for (const s of ch.sections || []) {
      if (s.title) out.push('### ' + oneLine(s.title));
      for (const b of s.blocks || []) { const m = blockMd(b); if (m) out.push(m); }
    }
    for (const n of ch.notes || []) out.push('[^' + n.id + ']: ' + oneLine(n.text));
  }
  return out.join('\n\n') + '\n';
}
