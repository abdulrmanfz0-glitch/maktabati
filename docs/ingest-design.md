# Ingest engine: design

`packages/ingest` converts a PDF, EPUB, Markdown, or text file into the app's book format, and reports honestly how well it did. It is not wired into the app yet.

## Principles

- **Pure core.** Stages take plain data in and give plain data out. The core has no DOM, no `fs`, and no network, so it runs the same in a Web Worker and in Node.
  - pdf.js and JSZip are the only libraries.
  - Loading pdf.js is injected through a thin adapter: `src/adapters/pdfjs-node.js` for Node, and a worker adapter at integration time.
- **Safety.** pdf.js is opened with `isEvalSupported: false`, `enableXfa: false`, and `disableFontFace: true`, and no scripting sandbox. Nothing from the PDF is ever executed. Encrypted PDFs fail with `IngestError('encrypted')` and are never bypassed.
- **Measurement first.** Every rule has an id, an on/off toggle (`options.rules[id] = false`), and at least one metric it moves. `tools/ablate.mjs` enforces this.
- **No special cases.** Rules are general, or they belong to a *profile* selected by a font/producer fingerprint. Nothing ever keys on a file name, title, or content.
- **Reports carry metrics, never book text.** File ids in the tools are content hashes.

## Pipeline (PDF)

```
extract -> reorder -> normalize -> layout -> clean -> structure -> assemble -> render
```

| Stage | In, out | Job |
|---|---|---|
| extract | pdf.js page -> `PageRaw` | Text items with geometry, font, size, bold/italic, and pdf.js `dir`. Also image placements (CTM tracking) and pixels. |
| reorder | items -> lines | Groups items into lines by baseline. Orders items inside a line with an item-level UAX #9 pass (RTL base, keeping L/EN runs left-to-right). A statistical direction check per page catches items that are still in visual order and reverses them at character level with bracket mirroring. |
| normalize | lines -> lines with text | Attaches separated diacritic items to their base item by x-overlap. Maps presentation forms to base letters (NFKC, limited to Arabic presentation-form ranges, with lam-alef handled as a unit). Handles tatweel. Joins items with a space only where the gap exceeds the document's word-gap threshold. |
| layout | lines -> page lines with zones | Finds the body size, the column edges, and two-column pages (reading order right, then left). Marks the top/bottom band and paragraph starts (vertical gap, right indent, short previous line). |
| clean | pages -> pages | Removes running headers, footers, and page numbers by repetition across pages after digit normalization. It never removes text found on fewer than `minRepeatShare` of pages. |
| structure | pages -> labelled lines | Finds footnotes (smaller font at the page bottom, with a leading marker) and links them to body markers. Finds headings by size and weight relative to the body median. Finds chapters from the outline first, then TOC pages, then headings, and records the method. |
| assemble | labelled lines -> `book` | Builds chapters, sections, paragraphs (merged across pages), notes (`[^n]`, renumbered per chapter), and figures with captions. |
| render | `book` -> Markdown | `toMarkdown`, in the app dialect. |

Scoring (`score.js`) runs on the assembled page text. It measures:
- presentation-form ratio
- isolated-letter ratio
- function words per 1000 tokens
- a character-trigram model self-calibrated on the document's best pages

It also compares each page with its reversed version, to catch reversed text.

Routing gives `ok`, `review`, or `vision`, with a confidence value. The `VisionFallback` interface (page images in, Markdown out) is defined but not implemented.

## Data model

`book` is **exactly** the app's single-item JSON import format (see `docs/phase1-analysis.md` section c), so it imports without migration:

```
{ type:'book', title, author, intro?: { blocks }, chapters: [ { title, minutes,
  sections: [ { title, blocks: [ {type:'p',text} | {type:'h4',text} | {type:'list',items}
                                | {type:'box',kind,text} | {type:'figure',src,alt,caption} ] } ],
  notes?: [ { id, text } ] } ] }
```

Footnote markers live in the text as `[^id]`, and ids are unique per chapter. That is what the app's `fnHTML` expects.

`ingest(input, options)` is an async generator:
- it yields `{ type:'progress', stage, page, pages }` events;
- it finishes with `{ type:'result', book, report, assets }`;
- `options.signal` (AbortSignal) cancels it.

`ingestToResult()` collects the final event, and `toMarkdown(result)` renders it.

`report` holds only metrics:

| Field | Contents |
|---|---|
| input | `kind`, `pages`, `fingerprint`, `profile` |
| score | the document score (0..1) |
| pageScores | `[{ page, score, tokens, issues, route }]` |
| chapters | `{ count, method, items: [{ index, method, startPage }] }` |
| footnotes | `{ found, linked }` |
| figures | the figure count |
| issues | `[{ code, pages }]` |
| routing | `recommendation`, `confidence`, `visionPages` |
| timings | time per stage |

## Profiles

A profile is data: a fingerprint matcher plus rule parameters. It is never a code path.

```js
{ id: 'hindawi',
  match: { producer: /iTextSharp/i, font: /YakoutLinotype/i },   // all must match
  params: { minRepeatShare: 0.02, footnoteSizeRatio: 0.9, chapterStartsPage: true } }
```

The fingerprint is `{ producer, fonts (base names, subset prefix removed), pageSize, itemGranularity }`. Unknown fingerprints use `generic`.

## Markdown dialect limits (for integration)

The app's `mdParse` has no footnote-definition syntax and renders only `http(s)` images. So:
- **The lossless output is the `book` JSON.** It has notes and figure `src`.
- The Markdown carries `[^n]: text` lines, which the current app would show as plain paragraphs.
- Asterisks and underscores in the source text are not escaped, because the app's inline parser has no escape syntax.
