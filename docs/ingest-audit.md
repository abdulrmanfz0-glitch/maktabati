# Ingest engine audit

**Date:** 2026-11-10  
**Base:** `public` at `5e8151b` (before the diacritics fix)  
**Scope:** `packages/ingest`, the Node/web adapters, and the app's consumption of
the returned book.

## Method

- Every PDF in `tests/fixtures/pdf` (7 local files, never committed) was run with
  `tools/bench-ingest.mjs --no-history --json`, which runs each file in a fresh
  process for time and peak RSS.
- Book dumps were written to ignored `out/audit/` and inspected with counts and
  short samples. No fixture text or file names are committed.
- The image-heavy fixture was also run with `images:true` to measure figures.
- Each fixture was imported twice; the canonical `book.json` SHA-1 was compared.
- EPUB has no local fixture in this checkout. Its findings are code-read and are
  marked **unverified**; EPUB-01 in `CHECKLIST.md` still needs a real file.
- File names are represented by the first 8 hex chars of their SHA-1, matching
  the existing ingest tools.

## Corpus results

| ID | Pages | Time | Peak RSS | Score | Chapters | Notes linked | Figures | Recommendation |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `007572a7` | 116 | 1.8s | 301 MB | 0.928 | 3 (toc) | 27/27 | 0 | ok |
| `0f1b65bc` | 368 | 5.4s | 307 MB | 0.945 | 25 (toc) | 10/10 | 0 | ok |
| `35590259` | 88 | 2.0s | 269 MB | 0.938 | 3 (headings) | 0/0 | 0 | ok |
| `5150ac47` | 284 | 10.7s | **509 MB** | 0.930 | 23 (toc) | **275/288** | 162 | review |
| `74b4b9e2` | 220 | 2.7s | 267 MB | 0.961 | 18 (toc) | 39/40 | 0 | ok |
| `f42c7b4f` | 56 | 1.8s | 289 MB | 0.924 | 4 (toc) | 0/0 | 0 | ok |
| `f692654d` | 192 | 2.8s | 226 MB | 0.970 | 4 (toc) | 99/99 | 0 | review |

All files are unencrypted, 450×600, from the same producer/fingerprint. Five of
seven passed the automatic success rule; two were routed to review.

### Arabic character checks

| ID | Space before mark | Space after mark | Presentation forms left | Tatweel | Arabic-Indic / Latin digits | Mixed script lines |
|---|---:|---:|---:|---:|---:|---:|
| `007572a7` | 1,956 | 488 | 0 | 0 | 4 / 39 | 0 |
| `0f1b65bc` | **15,414** | 3,598 | 46 (`FD3E/FD3F`) | 0 | 238 / 29 | 5 |
| `35590259` | 1,503 | 357 | 0 | 0 | 42 / 3 | 0 |
| `5150ac47` | 2,676 | 560 | 0 | 0 | 1,248 / 3,871 | 124 |
| `74b4b9e2` | 796 | 52 | 0 | 0 | 767 / 120 | 1 |
| `f42c7b4f` | 1,186 | 256 | 0 | 0 | 0 / 0 | 0 |
| `f692654d` | 1,985 | 399 | 0 | 0 | 364 / 173 | 17 |

- **Diacritics/shadda were split by a space in every fixture**, 796–15,414
  occurrences. This is the critical text bug fixed in this branch. The common
  front-matter example appears on page 4 of every file:
  `"ِّإن َّ مؤسسة هنداوي"` → `"ِّإنَّ مؤسسة هنداوي"`.
- Tatweel is already removed. Presentation-form letters are mapped; the only
  remaining presentation-form code points are the ornate parentheses
  U+FD3E/U+FD3F in `0f1b65bc`.
- Arabic-Indic digits are preserved, not converted. That is a consistency issue,
  not text loss.
- Mixed Arabic/Latin lines occur mostly in `5150ac47` (references); punctuation
  direction is handled by the existing bracket vote, but 3.4% of lines still
  have a closing bracket before an opening one.
- No ordinary word begins with a combining mark. After the fix, the fixture check
  counts **zero** spaces before a combining mark in all seven files.

### Layout, structure, and figures

- Line order: no reversed-page failures after NFKC. Two-column pages were not
  present in this corpus.
- Headers/footers/page numbers: removed; residual repeats were 0 for all files.
- Footnotes: `5150ac47` has **13 unlinked markers of 288**; the other files are
  fully linked. Unlinked notes are left as body text, so a page can read out of
  order.
- Chapters: no empty chapters; `35590259` and `74b4b9e2` each have one duplicate
  chapter title. `f692654d` has a **284,152-character chapter**, far larger than
  the others (the next largest is 118,979).
- Figures (`5150ac47`): 162 assets, 0 missing, 0 duplicate hashes, 0 tiny
  (smallest 977×241), but **49 have no caption** (113/162 captioned) and 7 are
  larger than 2000 px on a side. The first figure (`img/p19-1.png`) has neither
  alt nor caption and is the last block in its section.
- Figure order follows page order; the paths encode the page (`pNN-*`). Captions
  are attached only when the caption block directly follows its image.

### EPUB, scanned PDFs, robustness, performance, determinism

- **EPUB:** no local EPUB fixture. Code review shows spine order and EPUB 3
  nav/EPUB 2 NCX are implemented; nested TOC entries are ignored
  (`parseNav`/`parseNcx` only keep depth 1), `read()` decodes all documents as
  UTF-8, and CSS-hidden text is not filtered deliberately. Marked unverified.
- **Scanned PDFs:** no scanned body in the corpus; page 1 of each file is an
  image-only cover. The app reports “needs image reading” and disables Save;
  `vision` is present but not exercised by these fixtures.
- **Robustness:** existing tests cover empty, corrupt, encrypted, truncated,
  cancellation, and a synthetic 600-page book. All pass. Zero-text PDF and a real
  encrypted book are not in the fixture set; the UI path is code-reviewed only.
- **Performance:** slowest fixture `5150ac47`: 10.7s, 509 MB peak, 3,776 ms per
  100 pages. No obvious quadratic loop was proven in the PDF path; the main
  cost is full-page extraction, figure decoding, and repeated whole-text scans.
  Memory scales with full-resolution figures, not page count alone.
- **Determinism:** all seven fixtures produced the same canonical book hash on a
  second import. `same:true` for every ID; hashes ranged from `3aec1c36b634` to
  `e8c446a213a8` (first 12 hex chars).

## Findings

| ID | Severity | Area | Description | Evidence | Suggested fix | Size |
|---|---|---|---|---|---|---|
| A-01 | **critical** | Arabic | pdf.js leaves combining marks after a space; words are split (`ل ُغة`) | all 7; page 4; 796–15,414 per file | attach mark to previous base; drop space before mark; NFC | S — **fixed** |
| A-02 | **high** | Footnotes | 13/288 note markers unlinked in `5150ac47`; note text remains in body | `5150ac47`, 275 linked / 288 found | improve marker/note alignment or visibly warn per page | M |
| A-03 | **high** | Structure | One 284k-character chapter in `f692654d`; duplicate chapter titles in two files | `f692654d`; `35590259`; `74b4b9e2` | split overly long chapters at detected sections; de-duplicate titles | M |
| A-04 | **medium** | Figures | 49/162 figures have no caption; first figure has neither alt nor caption; 7 assets >2000 px | `5150ac47`, `img/p19-1.png`; 113/162 captions | attach nearby caption, fall back to alt, downscale on display | M |
| A-05 | **medium** | EPUB | No fixture; nested TOC is dropped; all documents decoded as UTF-8 | `packages/ingest/src/epub.js` `parseNav`/`parseNcx`/`read` | add real EPUB fixtures; recursive TOC; detect encoding | M |
| A-06 | **medium** | Bidi | 124 mixed Arabic/Latin lines in `5150ac47`; 3.4% bracket order still bad | `5150ac47`, report `bracketBad` 0.027 | add mixed-direction tests; preserve punctuation order per run | M |
| A-07 | **low** | Arabic | U+FD3E/U+FD3F ornate parentheses are left as presentation forms | `0f1b65bc`, 46 code points | map them to `()` when context is Arabic | S |
| A-08 | **low** | Numerals | Arabic-Indic and Latin digits coexist without a policy | `5150ac47`: 1,248 Arabic-Indic / 3,871 Latin | document policy; keep author digits by default | S |
| A-09 | **low** | Performance | 43 MB PDF peaks at 509 MB; full-resolution figures dominate | `5150ac47`, 10.7s, 509 MB | stream/downscale figures, or store JPEG/WebP | L |
| A-10 | **low** | Coverage | Corpus is one publisher/fingerprint; no scanned body, EPUB, or corrupt real book | all 7 are 450×600 iTextSharp | add legally distributable fixtures from other publishers | M |

## Top 5 by severity

1. **A-01** — split Arabic marks everywhere; **fixed**.
2. **A-02** — unlinked footnotes in the largest mixed book; open.
3. **A-03** — mega-chapter and duplicate titles; open.
4. **A-04** — uncaptioned/oversized figures; open.
5. **A-05** — EPUB TOC/encoding path is unverified; open.

## Fixes applied in this branch

- `repairSplitMarks`: removes whitespace before a combining mark and applies NFC.
- `joinItems`: never inserts a space before a mark, and strips a leading space in
  a touching next item when the previous item ends with a mark.
- `assemble.closePara`: applies the same repair across line/paragraph joins.
- Tests cover the five reported examples, a normal spaced sentence, NFC, and a
  zero space-before-mark count over every local PDF fixture.

Everything else in the table is left as an issue in
[`first-issues.md`](first-issues.md); no large refactor was started.
