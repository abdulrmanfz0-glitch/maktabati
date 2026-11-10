# Ingest findings (Phase A reconnaissance)

**Source of every number below:** `node tools/inspect-pdf.mjs`. The tool prints metrics only. Files are named by the first 8 hex digits of their SHA-1, never by title.

> **All 7 fixtures come from a single publisher (Hindawi).** Every finding below describes Hindawi files only, not Arabic PDFs in general.

## Corpus

| id | pages | MB | producer | outline | page size | pages with no text items | Latin-heavy pages | images in 12 sampled pages |
|---|---:|---:|---|---:|---|---:|---:|---:|
| 007572a7 | 116 | 0.9 | iTextSharp 5.2.1 | 0 | 450×600 | 5 | 0 | 0 |
| 0f1b65bc | 368 | 5.0 | iTextSharp 5.2.1 | 0 | 450×600 | 15 | 1 | 0 |
| 35590259 | 88 | 11.3 | iTextSharp 5.2.1 | 0 | 450×600 | 4 | 2 | 0 |
| 5150ac47 | 284 | 41.2 | iTextSharp 5.2.0 | 0 | 450×600 | 17 | 78 | 9 |
| 74b4b9e2 | 220 | 10.4 | iTextSharp 5.2.0 | 0 | 450×600 | 14 | 5 | 0 |
| f42c7b4f | 56 | 18.1 | iTextSharp 5.2.0 | 0 | 450×600 | 6 | 2 | 0 |
| f692654d | 192 | 2.8 | iTextSharp 5.2.0 | 0 | 450×600 | 8 | 2 | 0 |

Every file:
- is unencrypted;
- has **no PDF outline**, so chapters must come from TOC pages or headings;
- has the same page size;
- sets its body text at 13 pt in `YakoutLinotypeLight-Regular` (73–99.7% of characters).

One file (5150ac47) has 22% Latin text (LucidaBright) and real figures. Pages with no text items are:
- the cover (page 1), which is an image with no text layer;
- blank pages.

## Failure modes

| # | Failure mode | Evidence (metric) | Files affected |
|---|---|---|---|
| F1 | **Presentation forms instead of letters.** The ToUnicode maps give Arabic presentation-form code points. | 69.8–73.9% of Arabic letters are presentation forms. Function words: 13–34 per 1000 raw, 89–185 after NFKC restricted to presentation forms. | **all 7** |
| F2 | **Word-fragment items.** Lines arrive as many 2–6 glyph chunks whose widths overlap (median gap −0.84 to −0.91 em), in left-to-right stream order. | 8.0 and 15.5 chars per item, against 38–65 elsewhere. Only 2.7–4.0% of same-line item pairs run right-to-left. Isolated single letters: 23.1% and 44.4% after NFKC with naive joining. | 007572a7, 0f1b65bc |
| F3 | **NUL code points.** Some glyphs map to U+0000. | 8.9% and 20.8% of item characters | 007572a7, 0f1b65bc |
| F4 | **Separated diacritics.** Mark-only items. | 33 and 27 items (few, but each breaks a word) | 007572a7, 0f1b65bc (1–9 elsewhere) |
| F5 | **Brackets not mirrored.** pdf.js's bidi pass reorders RTL chunks without mirroring (confirmed in its source). | Lines whose first bracket is `)`: 232 of 268 in f692654d; about half in others | all files with Arabic parentheses |
| F6 | **`<` and `>` deleted.** pdf.js's bidi pass removes them. | pdf.js source (`bidi()`): cannot be recovered from the text layer | all (only where the book uses them) |
| F7 | **Running headers and page numbers** on almost every page | The top line repeats (≥3 pages) on 87–99% of pages, and the bottom line on 86–96%. The bottom line is digits only on 43–325 pages per file. | **all 7** |
| F8 | **Footnotes** in a smaller font at the page bottom, with raised small digit markers in the body | Pages with a small-font Arabic block in the lower half: 1–52. Raised small digit items: 0–285. | 5 of 7 (007572a7, 0f1b65bc, 5150ac47, 74b4b9e2, f692654d) |
| F9 | **Image-only cover.** Page 1 has no text layer. | no text items, image | all 7 |
| F10 | **Mixed script.** Latin paragraphs and references. | 50% of items are LTR, and 78 pages are Latin-heavy | 5150ac47 |

## What was *not* a problem

- **Reversed text.** Once NFKC is applied, every file is in logical order. Word-start ال outnumbers word-end لا by 27× to 95×. Reversing the text drops function words from 89–185 to 44–71. pdf.js's own bidi pass already un-reverses each chunk.
- **Two-column pages.** No evidence in these files.
- **Encryption and scanned bodies.** Neither occurs. All scans are covers.

## Common vs file-specific

- **Common to all 7:** F1, F5, F7, F9. These justify general rules: presentation-form mapping, bracket mirroring, and repetition-based header/page-number removal. The cover page is routed as a cover, not as a vision page.
- **Common to a subset:** F2, F3, and F4 occur together, in the 2 files that have fragment granularity. They are handled by general geometry rules: order items by x through item-level bidi, join items without a separator unless the gap is word-sized, and strip control characters. None of these rules needs a profile. They switch on from what the geometry shows.
- **Only one file:** F10, mixed script, which needs LTR base-direction lines.

## Measured choice of the line-join strategy (F2)

In the fragment files, each item already carries its own spaces, and an item boundary is not a word boundary:

| id | NUL | stream order: fw / isolated | right-to-left by x, no separator: fw / isolated |
|---|---:|---|---|
| 007572a7 | 8.9% | 195 / 1.9% | **214 / 1.7%** |
| 0f1b65bc | 20.8% | 139 / 2.9% | **177 / 2.5%** |
| other 5 files | 0% | identical (one item per line) | identical |

"fw" is function words per 1000 Arabic tokens. Joining items with a space instead gives 91–111 fw and 34–42% isolated letters.
