# Changelog

All notable changes are recorded here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses the
`AGPL-3.0-only` license.

## [Unreleased]

### Added

- Reading template «مرتب» (Tidy): one calm page with a short measure, a
  green rule under the chapter opening, headings in the UI font, a small page number, and every
  tool behind the round button. Phone first: a full-bleed page, shorter picker previews, and a
  readable measure when the phone is on its side.
- Library collections: create, rename, and delete shelves; add or remove a book
  from its page or its library menu; filter the library by a collection or by
  unfiled books.

### Fixed

- Reader, selection on a phone: the tools (highlight kinds, explain, term, meaning, quote) used to
  pop up under the selection, where they collided with the system's own copy/paste menu, which
  cannot be moved or dismissed, and the system selection stayed tinted after the tools closed. With
  a finger the tools are now a dock at the foot of the screen, away from that menu; the system
  selection is released as soon as the dock opens (the selected phrase is kept and shown in the
  dock), so the blue block and the system menu disappear, and a "نسخ النص" action copies the
  selection in one tap. With a mouse the tools stay a small pill beside the selection.
- Reader, phone on its side: the page-based templates (The Book, Manuscript) used the desktop
  page and drew a 252x350 page in an 844x390 screen (10 pages became 51). A short screen now counts
  as a phone: the page fills the viewport, the measure is capped at 700px (660 for the manuscript),
  and the margins shrink.
- Reader, Modern: the page counter read backwards in RTL ("11 / 2" for page 2 of 11); both numbers
  now sit in a dir="ltr" island.
- Reader, Manuscript: the catchword at the foot of the page picked a box label or a list number
  ("مصطلح", "2") instead of the first word of the text. It now skips labels, numbering, footnote
  marks and non-words, and is hidden when the screen is too short for it.
- Reader, first open: once there were four templates, the picker's last card and the "use the
  default" button were cut off on a phone; the phone picker now uses shorter previews and fits.
- PDF import, notes: a note whose marker could not be linked used to be invisible (it is only
  reachable from its marker). Such notes now appear in a "الحواشي" section at the end of their
  chapter, numbered with the printed number, so the digits left in the text can be looked up. 13
  notes (18,658 characters) in one test book become readable; no note text is lost in any file.
- PDF import, reading units: a paragraph is no longer a wall of text (cut at sentence ends above
  3,000 characters; longest paragraph in the test PDFs 82,814 -> 4,096) and a chapter no longer
  holds most of a book: chapters over 20,000 characters are cut at their own sections, then at
  headings, then at paragraph breaks. Chapters per book rise from 3-25 to 6-89 and the longest
  chapter falls from 289 minutes to 18. The two rules are `paragraph-cap` and
  `split-long-chapters`; paragraph sequence and text are unchanged (checked per fixture).
- PDF import, reading quality: words that the text layer split with a stray space are joined
  (`الص وت` -> `الصوت`), a paragraph of inset justified prose is no longer mistaken for verse (which
  put hard line breaks inside sentences), ornate parentheses read as ordinary ones, spaces before
  `، ؛ : ! ؟` are removed, an Arabic/Latin boundary always gets a space, and the caption prefix
  check matches Arabic captions. On the seven test PDFs split-word pairs fall from 156 to 28 and
  prose hard-break paragraphs from 701 to 529; what remains is real poetry and quoted verse. See
  `docs/ingest-rules.md` round 5.
- PDF import glued words together: pdf.js writes the word gap before a word's last diacritic
  ("رجلا ًمن" for "رجلًا من") and the importer deleted that space instead of moving it after the
  mark, so common words ran into each other. The new `mark-word-gap` rule keeps the gap using the
  tanween, the letter shapes of the text layer and the word list, and a final pass applies it to
  captions, notes, headings and titles too. Across the seven test PDFs 319–6,671 word spaces per
  book are restored and the dictionary coverage rises in every file. Books imported before this
  change keep their old text until they are imported again.
- In-book chat panel: with a model pinned, the header overflowed and the close
  button was pushed off screen (clipped on phones, drawn over the reader on
  desktop) with the book title collapsed, so there was no visible way back to
  the book. The close button now comes first and is always on screen, the title
  truncates, history and new chat moved into a ⋯ menu, and Escape closes an open
  menu before the panel. Closing keeps the same page and scroll position;
  expanding keeps the same conversation.

## [0.1.0] - 2026-11-10

### Added

- Arabic-first reader with Modern, The Book, and Manuscript templates.
- PDF/EPUB/Markdown/text import in a Web Worker, with quality reporting.
- Local library, highlights, notes, quotes, bookmarks, glossary, review cards,
  reading sessions, idea map, quote-card export, and remote sound mixer.
- BYOK OpenAI-compatible AI chat, chapter cards, spoiler guard, and
  prompt-injection delimiters.
- Atomic, versioned library import with duplicate detection and figure
  pre-decoding.
- EPUB zip-bomb limits, paste/file caps, and low-memory warning.
- AI timeouts (90s first byte, 20s stream idle), retries, context budgeting,
  max-token settings, provider errors, and localhost-keyless Ollama support.
- Storage-unavailable state, awaited/batched IndexedDB writes, multi-tab
  notices, wipe-with-settings option, and Arabic-aware search highlighting.
- AGPL-3.0-only license, third-party notices and license texts, CSP, and
  remote-image blocking.
- GitHub Actions CI: unit tests, web/single-file builds, smoke e2e, and AI
  failure e2e on Node 22.13.
- `CONTRIBUTING.md`, issue forms, pull-request template, `ROADMAP.md`, and
  `docs/first-issues.md`.
- `tools/bench-ui.mjs` and `docs/performance.md` with before/after numbers.

### Changed

- Idea-map settling uses fewer iterations on large graphs.
- Library context stops building full memory at the 24k-character budget and
  shares search hits with passages.
- Cover fitting uses a 6-step binary search and waits for fonts once.
- README documents limits, timeouts, providers, privacy, and the two wipe modes.

### Fixed

- PDF import no longer leaves a space before Arabic combining marks, so shadda
  and vowel marks stay attached to their letter, and joined paragraph text is
  NFC-normalized. Existing imported PDFs keep their old text; re-import the PDF
  to get the repaired text. Non-combining Quranic signs (۞, ۩) keep the
  space before them.

[Unreleased]: https://github.com/abdulrmanfz0-glitch/maktabati/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/abdulrmanfz0-glitch/maktabati/releases/tag/v0.1.0
