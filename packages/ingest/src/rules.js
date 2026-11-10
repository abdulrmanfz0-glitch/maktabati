// Registry of every repair/structure rule. Each rule can be switched off with
// options.rules[id] = false, which is what tools/ablate.mjs does. When a rule is off,
// the stage falls back to the naive behaviour described in `off`.

export const RULES = [
  { id: 'raw-ligatures', stage: 'extract', off: 'pdf.js expands ligature glyphs before its right-to-left reversal (their letters come out reversed)' },
  { id: 'reversed-multi', stage: 'glyphs', off: 'multi-letter glyph mappings stay reversed inside right-to-left chunks' },
  { id: 'glyph-names', stage: 'glyphs', off: 'glyphs with no usable Unicode are not read from their glyph names' },
  { id: 'ligature-solver', stage: 'glyphs', off: 'unknown glyphs are not solved (their pages go to vision)' },
  { id: 'lossy-repair', stage: 'normalize', off: 'tokens missing a lost ى/ا stay as extracted, even in a document whose function words show lossy forms' },
  { id: 'pair-order', stage: 'normalize', off: 'guillemets/quotes stay as extracted even when the document closes them before opening them' },
  { id: 'strip-controls', stage: 'normalize', off: 'keep control characters (NUL etc.) from unmapped glyphs' },
  { id: 'order-items', stage: 'reorder', off: 'keep pdf.js stream order inside a line' },
  { id: 'mirror-brackets', stage: 'reorder', off: 'keep brackets as pdf.js returns them in RTL chunks' },
  { id: 'stat-reverse', stage: 'normalize', off: 'never reverse a page judged to be in visual order' },
  { id: 'attach-marks', stage: 'normalize', off: 'leave separated diacritic items where they fall' },
  { id: 'nfkc-forms', stage: 'normalize', off: 'keep Arabic presentation forms' },
  { id: 'strip-tatweel', stage: 'normalize', off: 'keep tatweel (U+0640)' },
  { id: 'gap-space', stage: 'normalize', off: 'join the items of a line with one space' },
  { id: 'sup-markers', stage: 'normalize', off: 'treat raised small digits as ordinary text' },
  { id: 'columns', stage: 'layout', off: 'treat every page as one column' },
  { id: 'paragraphs', stage: 'layout', off: 'every line is its own paragraph' },
  { id: 'relative-indent', stage: 'layout', off: 'indentation is measured against the page frame only' },
  { id: 'verse', stage: 'layout', off: 'centered verse lines are ordinary lines' },
  { id: 'page-numbers', stage: 'clean', off: 'keep page-number lines' },
  { id: 'running-headers', stage: 'clean', off: 'keep repeated header/footer lines' },
  { id: 'title-echo-headers', stage: 'clean', off: 'headers repeating a heading need the general repeat threshold' },
  { id: 'diagram-labels', stage: 'clean', off: 'short off-center lines inside diagrams stay in the text' },
  { id: 'footnotes', stage: 'structure', off: 'footnote lines stay in the body text' },
  { id: 'endnotes', stage: 'structure', off: 'notes-section pages stay in the body; markers only link to same-page notes' },
  { id: 'endnote-continuity', stage: 'structure', off: 'every numbered line in a notes section starts a new entry' },
  { id: 'endnote-align', stage: 'structure', off: 'pair marker and endnote sequences in plain order' },
  { id: 'headings', stage: 'structure', off: 'no heading detection (no sections, no heading chapters)' },
  { id: 'merge-heading-lines', stage: 'structure', off: 'each heading line is separate' },
  { id: 'outline-chapters', stage: 'structure', off: 'ignore the PDF outline' },
  { id: 'spaceless-keys', stage: 'structure', off: 'TOC and heading keys must match with their spaces' },
  { id: 'toc-anagram', stage: 'structure', off: 'TOC entries must match headings letter for letter' },
  { id: 'toc-titles', stage: 'structure', off: 'chapter titles come from the heading text, not the TOC line' },
  { id: 'toc-chapters', stage: 'structure', off: 'ignore table-of-contents pages' },
  { id: 'heading-chapters', stage: 'structure', off: 'no chapters from heading heuristics' },
  { id: 'drop-front-matter', stage: 'assemble', off: 'keep pages before the first chapter as intro' },
  { id: 'cross-page-paragraphs', stage: 'assemble', off: 'a page break always ends the paragraph' },
  { id: 'figures', stage: 'assemble', off: 'no figure extraction' },
  { id: 'captions', stage: 'assemble', off: 'no caption detection' },
  { id: 'cover-pages', stage: 'score', off: 'an image-only first/last page is routed to vision' },
  { id: 'hyphen-join', stage: 'assemble', off: 'keep end-of-line hyphens in Latin words' }
];

export const RULE_IDS = RULES.map(r => r.id);

/** True unless options.rules[id] === false. */
export const on = (opts, id) => !(opts && opts.rules && opts.rules[id] === false);
