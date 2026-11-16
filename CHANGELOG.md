# Changelog

All notable changes are recorded here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses the
`AGPL-3.0-only` license.

## [Unreleased]

### Added

- Library collections: create, rename, and delete shelves; add or remove a book
  from its page or its library menu; filter the library by a collection or by
  unfiled books.

### Fixed

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
