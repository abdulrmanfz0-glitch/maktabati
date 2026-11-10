# Changelog

All notable changes are recorded here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses the
`AGPL-3.0-only` license.

## [Unreleased]

### Added

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
  to get the repaired text.

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

[Unreleased]: https://github.com/abdulrmanfz0-glitch/maktabati/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/abdulrmanfz0-glitch/maktabati/releases/tag/v0.1.0
