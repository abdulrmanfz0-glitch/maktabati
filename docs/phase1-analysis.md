# Phase 0 analysis and Phase 1 plan

This analysis comes from reading "My Library.html" (read-only; the file was not modified). The checklist is in `CHECKLIST.md`.

---

## 0. The main finding: the file is a bundle, not plain source

"My Library.html" is a **Claude Design export bundle**. The app you see is not written directly in this file:

- **Line 370** is a JSON "manifest" with 26 woff2 font files, stored as base64.
- **Line 382** is the whole app (its HTML, CSS, and JS), stored as **one JSON-encoded string** of about 291 KB.
- **Lines 25–367** hold a loader script. It runs on `DOMContentLoaded` and does five things:
  1. It decodes the fonts into `data:` URIs.
  2. It swaps the font uuids into the template.
  3. It parses the template with `DOMParser` and replaces the whole `<html>` element with it.
  4. It re-creates every `<script>` so the scripts run.
  5. It shows "Unpacking…" while it works.

What this means:

- You cannot edit the app by hand in this file. Any change means decoding line 382, editing it, and re-encoding it.
- **Phase 1 must start by unbundling.** We extract the template into real source files and turn the fonts back into real `.woff2` files.
- All line numbers below refer to the **decoded app source**, which has 3,178 lines. I made it with a read-only Python script:
  - it takes `json.loads` of line 382 and writes the result to `template.html`;
  - the manifest on line 370 is decoded the same way (base64, then woff2).

  I did not save this file in the repo. Step 1 of Phase 1 reproduces it.

---

## a. Size breakdown

**Raw file:** 1,241,811 bytes.

| Part | Bytes | Share |
|---|---:|---:|
| Base64 fonts (manifest, line 370) | 932,023 | 75.1% |
| App template as a JSON string (line 382) | 290,981 | 23.4% |
| Bundle loader JS (lines 25–367) | 16,858 | 1.4% |
| Outer shell HTML/CSS (lines 1–24, thumbnail SVG) | 1,835 | 0.1% |
| Empty `ext_resources` and `page_order` blocks | 112 | ~0% |

- The fonts are 26 woff2 files: about 930 KB as base64, and about 697 KB when decoded. There are 4 families:
  - Amiri
  - Noto Naskh Arabic
  - IBM Plex Sans Arabic
  - Aref Ruqaa
- The fonts are covered by 36 `@font-face` rules, split by unicode range.
- There are no inline images. The only `data:` strings in the app are SSE parsing, not assets.

**Decoded app template:** 280,046 bytes.

| Part | Lines | Bytes |
|---|---|---:|
| JS: main app (one IIFE) | 1132–3175 | 189,215 |
| CSS: app styles | 527–1039 | 41,345 |
| CSS: `@font-face` rules (font url = uuid) | 201–525 | 24,079 |
| JS: demo data (`DEMO_BOOK`, `DEMO_MD`) | 8–179 | 14,551 |
| HTML markup (body skeleton) | 1040–1131 | 9,448 |
| JS: theme boot (runs before paint) | 181–197 | 1,065 |
| head, meta, preconnect | 1–7, 198–200 | ~340 |

**Totals by kind** (whole file, decoded):
- JS: about 222 KB, of which about 17 KB is the loader.
- CSS: about 66 KB.
- Markup: about 11 KB.
- Fonts: about 697 KB as binary, or 930 KB as base64.

---

## b. Structure map

### Script and style blocks (decoded template)

| Block | Lines | What |
|---|---|---|
| `<script>` | 8–179 | `DEMO_BOOK` object and `DEMO_MD` array. These are top-level `const`s in a classic script, so the main IIFE reads them as globals. The block also holds the item-format comment (lines 9–42). |
| `<script>` | 181–197 | Theme boot. It reads `reader:theme`, `fs`, `lang`, `side`, `font`, `lh`, and `width` from localStorage and sets `<html>` attributes before first paint. |
| `<style>` | 201–525 | 36 `@font-face` rules |
| `<style>` | 527–1039 | All app CSS. Sections start at: tokens and themes 528–600, header 605, library 616, toolbar 642, cover 651, reader blocks ~660–742, UI palette 743, sidebar 749, home chat 787, messages 802, composer 833, book chat panel 850, markdown 878, drawer 944, selbar/sheet/modal/toast 960, map 993, glossary/review 1006, reduced motion 1020, print 1025. |
| `<script>` | 1132–3175 | The whole app, as one `'use strict'` IIFE |

The outer file also has its own `<style>` blocks (lines 6–13 and 15) and the loader script (lines 25–367).

### Function groups inside the app IIFE

| Group | Lines (approx.) | Contents | Depends on |
|---|---|---|---|
| **core / utils** | 1135–1190 | `$`, `$$`, `esc`, `arr`, `stripD`, `norm`, `strip`, `uid`, `dayKey`, `short`, `hash`, `colorOf`, `PALETTE`, `TYPES`, `BOX`, `ALERT`, `STATUS`, icons `I`, `svg` | nothing |
| **core / db** | 1192–1217 | `mem`, `openDB`, `getAll`, `put`, `del`, `kv`, `pref`, `allItems`, `itemById`, `annosOf` | utils |
| ingest / markdown | 1219–1312 | `inline`, `mdParse`, `parseList`, `bHtml`, `toBlock`, `words`, `mdToItem` | utils |
| ingest / epub | 1314–1395 | `loadScript`, `inl`, `domBlocks`, `blocksToChapter`, `parseEpub` (JSZip) | utils, markdown |
| core / text index | 1397–1419 | `blockText`, `itemBlocks` (WeakMap cache) | utils |
| core / time | 1421–1441 | `rel`, `weekText` | db, **i18n** (`LANG`, `relEn`) |
| **ui / helpers** | 1443–1471 | `toast`, `openModal`, `closeModal`, `openSheet`, `closeSheet`, `go`, `findTarget`, `flash`, `srcLine`, `applyTheme` | utils; `go` calls **reader** (`RD`, `screenOf`, `renderReader`, `findIn`) |
| **core / router** | 1473–1503 | `cur`, `lastNonRead`, `parseHash`, `route` | **every view renderer**, chat, ui, sidebar, study |
| **library** | 1505–1575 | `card`, `renderLib`, `snip`, `doSearch`, `openItem` | db, utils, time, add/export, chat (`prepModal`) |
| **reader** | 1577–1826 | `block`, `chapterHTML`, `coverHTML`, `introHTML`, `mapHTML`, `conclusionHTML`, `readerHTML`, `screensOf`, `screenOf`, `screenHTML`, `drawerNav`, `wrapText`, `findIn`, `markHl`, `markTerm`, `applyAnnos`, `bindFields`, `setStatus`, `observe`, `renderReader`, plus `let RD` | db, utils, markdown (`md`), footnotes, study (`schedule`), display (`stripShown`), session, bookDir |
| reader / selection | 1828–1876 | `onSel`, `selAction`, `termModal`, plus `let SEL` | reader, study, library (`quoteModal`), chat (`openChat`, `aiReady`) |
| library / highlight sheet | 1878–1940 | `termGroups`, `linkedList`, `hlSheet`, `linkPicker`, `termSheet` | db, ui, study (`setHk`, `dropCard`) |
| library / quote card | 1942–1976 | `quoteCanvas`, `quoteModal` | ui, utils |
| reader / session | 1978–2012 | `SESS`, `updateSess`, `sessionSheet`, `endSession` | ui, db, reader |
| reader / bookmarks | 2014–2023 | `toggleBookmark` | db, reader |
| library / glossary | 2025–2037 | `renderGlossary` | `termGroups` |
| **study / review** | 2039–2089 | `cardData`, `dueCards`, `dueN`, `updateDue`, `renderReview`, `drawReview`, plus `let RV` | db, `hkOf`, `whereOf` |
| library / idea map | 2091–2164 | `buildGraph`, `layout`, `renderMap` | `termGroups`, ui sheets |
| library / add, import, export | 2166–2221 | `openAdd`, `exportLib`, `importLib` | ingest, db, ui, chat (`offerPrep`) |
| core / seed | 2223–2239 | `seed` | `DEMO_*` globals, markdown, db |
| study / highlight kinds | 2241–2269 | `HK`, `HKS`, `hkOf`, `hlKey`, `dropCard`, `hkSeg`, `setHk`, `bkPos`, `byPos`, `chName`, `whereOf`, `blockOf`, `plain`, `copyText`, `explainCopy` | db, ui |
| library / book highlights page | 2271–2310 | `renderHls` | study helpers |
| reader / in-book search | 2312–2327 | `bookSearch` | reader, `go` |
| reader / display panel | 2329–2358 | `setFs`, `stripShown`, `rerender`, `setPref`, `displaySheet` | `pref`, reader, ui |
| reader / footnotes | 2360–2377 | `fnHTML`, `showFn`, `hideFn` | reader |
| ui / hint, tooltip, bar | 2379–2408 | `selHint`, `showBar`, `hideBar`, `savePos`, `initTips` | reader (`RD`), db |
| **chat / AI client** | 2410–2449 | `AIK`, `aiCfg`, `aiSave`, `aiReady`, `visionReady`, `aiErr`, `aiCall` (fetch plus SSE), `parseJSON` | utils |
| chat / chapter cards | 2451–2501 | `chapterText`, `chCard`, `needCards`, `makeCard`, `prepModal`, `offerPrep` | AI client, db, ui |
| chat / context | 2503–2568 | `bookMemory`, `qTokens`, `searchHits`, `passagesTxt`, `glossaryTxt`, `libraryMap`, `currentCi`, `bookContext` | db, reader (`RD`, `topBlock`, `screenName`), study helpers |
| **chat / companion** | 2570–2775 | `SYS`, `MODES`, `CH`, `mountHome`, `openChat`, `closeChat`, `bookCard`, `aiHTML`, `drawChat`, `localCommand`, `buildMessages`, `chatSend` | all of the above, plus ui, i18n, sidebar |
| **ui / sidebar** | 2777–2809 | `PAGE_T`, `isMobile`, `side`, `backHash`, `drawSide`, `markSide`, `initSide` | db, chat (`CH`, `lastHomeConv`), router (`cur`) |
| library / quotes, all highlights | 2811–2831 | `renderQuotes`, `renderHlAll`, plus `let HLF` | db, study helpers |
| reader / book direction | 2833–2839 | `bookDir` | `chapterText` |
| **core / settings** | 2841–2864 | `renderSettings` | AI client, `needCards`, `pref` |
| ingest / PDF | 2866–3008 | `saveNew`, `importFile`, `loadPdfjs`, `pdfPages`, `cleanPages`, `pdfQuality`, `linesToParas`, `pdfStructure`, `pdfVision`, `pdfImport`, `pdfPreview` | AI client, markdown, ui, reader (`block`), router |
| **core / i18n** | 3010–3082 | `LANG`, `EN_UI` (Arabic string → English), `EN_PAT`, `tx`, `trStr`, `trNode`, `relEn`, `applyLang` (MutationObserver) | utils; it mutates `TYPES` and `STATUS` |
| ui / menu | 3084–3090 | `menuBtn`, `menu` | nothing |
| **init** | 3092–3173 | `init`: open the DB, load, seed, migrate `hlCardsV1`, `applyLang`, `initSide`, theme, **the global click dispatcher**, key and selection listeners, scroll, activity logger, print, `hashchange`, then `route()` | everything |

**Summary of the dependency direction today:** `utils` and `db` are clean leaves. Everything else is densely coupled, mostly through shared `let` state (see e.) and through `route()` and the click dispatcher, which reach into every group.

---

## c. Data

### IndexedDB

The database is **`maktabati`**, at **version 1**. It is opened with a 2.5s timeout. If opening fails, the app runs in memory only (`mem`) and shows a warning in the library footer.

Every read happens once at init, into `mem` (Maps). Writes update `mem` first, then do a fire-and-forget IDB `put`. No write is awaited and no write error is reported.

| Store | keyPath | Records |
|---|---|---|
| `items` | `id` | Library items (below) |
| `annos` | `id` | Annotations (below) |
| `kv` | `k` | `{ k, v }` generic key/value |

**Item** (`items`). The format is documented in the comment at lines 9–42:

```
{ id, type: "book"|"article"|"explainer"|"notes", title, subtitle?, author?, originalTitle?, whyRead?, lang?,
  intro?: { opening?, body?: [str], blocks?: [Block] },
  chapters: [{ title, question?, minutes?, overview?: [str],
               sections: [{ title, blocks: [Block], recall?: { q, a } }],
               review?: [{ q, a, applied? }], terms?: [{ ar, en, def }], notes?: [{ id, text }] }],
  conclusion?: { ideas: [str], applyPrompt? },
  createdAt, progress (0..1), lastOpened? }
```

A Block is one of these:
- `{type:"p", text}`
- `{type:"h4", text}`
- `{type:"list", items}`
- `{type:"box", kind, title?, en?, text | html}`
- `{type:"figure", src?, alt, caption?}`
- `{type:"diagram", steps, loop?, caption?}`
- `{type:"html", html}`, produced by the Markdown, EPUB, and PDF importers

Any block may carry `by:"ai"`. A text may contain `[^id]` footnote markers.

A block address (`bk`) is a string, `"ci-si-bi"` for chapter blocks or `"i-bi"` for intro blocks. **Highlights, bookmarks, terms, and quotes are anchored by this index plus the exact text.** So if you reorder or split blocks, they lose their anchor.

**Annotation** (`annos`):

| kind | Fields |
|---|---|
| `hl` | `id, kind, hk: "imp"\|"unc"\|"q" (missing = imp), itemId, bk, text, note, links: [annoId \| "term:<norm>"], t` |
| `term` | `id, kind, itemId, bk, ar, en, def, t` |
| `bm` | `id, kind, itemId, bk, t` |
| `quote` | `id, kind, itemId, bk, text, t` |

**kv keys:**

| Key | Value |
|---|---|
| `seeded` | `true` after the demo seed |
| `hlCardsV1` | one-time migration flag |
| `cards` | `{ [cardId]: { stage 0..3, due ms } }`. The cardId is `item\|ci\|r<si>` (recall), `item\|ci\|q<k>` (review question), or `item\|h\|<annoId>` (Important highlight). |
| `log` | `{ "YYYY-MM-DD": seconds }` reading time |
| `rev:YYYY-MM-DD` | number of cards reviewed that day |
| `<itemId>:status` | `{ c0: "none"\|"reading"\|"done", … }` |
| `<itemId>:loc` | `{ s: screen, bk }` (paged books) |
| `<itemId>:pos` | a scroll ratio (non-paged items) |
| `<itemId>:sessions` | `[{ t, m, text }]` |
| `f:<itemId>:c<n>:predict\|summary\|open` | textarea text |
| `f:<itemId>:c<n>:rev:day\|week\|month` | checkbox boolean |
| `f:<itemId>:apply` | textarea text |
| `cc:<itemId>:<ci>` | AI chapter card `{ ideas, terms, topics, t }` |
| `chat:lib` | home conversations `[{ id, t, msgs }]` (up to 30) |
| `chat:b:<itemId>` | book conversations (up to 30) |
| `chatfull:<itemId>` | the "allow whole book" boolean |

A message is `{ role, content, t?, mode?, attach?, where?, cards?, err? }`.

**Existing bug, left as is:** "Delete from library" removes kv keys that start with `<id>:` or `f:<id>:`. It leaves `cc:<id>:*`, `chat:b:<id>`, and `chatfull:<id>` orphaned, and they still get exported.

### localStorage

| Key | Value |
|---|---|
| `reader:theme` | `"light"\|"sepia"\|"dark"` (JSON string) |
| `reader:lite` | the last non-dark theme |
| `reader:fs` | font size delta, −3..5 |
| `reader:font` | `"naskh"\|"amiri"` |
| `reader:lh` | `"normal"\|"wide"` |
| `reader:width` | `"narrow"\|"normal"` |
| `reader:diac` | `"show"\|"hide"` |
| `reader:lang` | `"ar"\|"en"` |
| `reader:side` | `"open"\|"closed"` |
| `reader:selHint` | `true` once the selection hint was seen |
| `maktabati:ai` | `{ base, model, key, vmodel, vbase, vkey }`. **This holds the API key.** |

All values are JSON-encoded. None of them are exported.

### Export and import format

The export is `exportLib`, at line 2204:

```json
{ "app": "maktabati", "v": 1, "exported": "<ISO date>", "items": [Item], "annos": [Anno], "kv": [{ "k": "...", "v": ... }] }
```

- It contains **every** kv entry, including chats and AI chapter cards. It contains no localStorage, so **the API key is never exported.** This is correct.
- The filename is `maktabati-YYYY-MM-DD.json`.

The import is `importLib`, at line 2210:
- If `items` is an array, it upserts items, annos, and kv by id or key. It deletes nothing. **It does not check `v`.**
- Otherwise, if `chapters` is an array, it treats the file as a single item (the format in the top comment) and gives it a new `createdAt`.
- Otherwise it shows "unexpected shape".

---

## d. External resources

| URL | Used for | When loaded | Offline |
|---|---|---|---|
| `https://fonts.googleapis.com`, `https://fonts.gstatic.com` | `<link rel=preconnect>` only | page load | Harmless. The fonts are embedded, so nothing is fetched from them. |
| `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js` | EPUB import | the first EPUB import each session | **EPUB import fails.** A clear message is shown. |
| `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js` plus `pdf.worker.min.js` | PDF import | the first PDF import each session | **PDF import fails.** A clear message is shown. |
| `https://api.deepseek.com/chat/completions` (default, configurable) | chat, chapter cards, PDF structure, vision | on use | **All AI fails.** Local chat commands still work. |
| `https://www.almaany.com/ar/dict/ar-ar/<word>/` | the "Meaning" button (`window.open`) | on click | The new tab fails. |
| `http(s)` image URLs inside Markdown or figures | book content | when rendered | Images break. |

**Works offline:** the app shell, fonts, reading, highlights, review, glossary, map, search, export, and import. The bundle loader needs `DecompressionStream` only for compressed assets, and none are compressed.

---

## e. Risks for splitting

1. **Bundle format.** The source is JSON-in-HTML. Unbundling must be byte-exact: a decode, re-encode round trip must reproduce the same template string, or we cannot trust later diffs.

2. **Storage origin.** The user's library lives in IndexedDB for the origin the page was opened from: `file://` or `http://localhost:8000`. A split build served from another port or path will show an empty library, plus the 2 demo items. **Export the real library before Phase 1**, and after every build verify by importing that export.

3. **Shared mutable state.** These are plain `let`s that live across groups:
   - `RD`: reader state, read by go, chat, selection, session, savePos, and the click handler
   - `CH`: current chat, read by the router, sidebar, and Escape handler
   - `cur`: the current route, read by selection, sheets, PDF, and settings
   - `SEL`, `SESS`, `RV`, `HLF`
   - `LANG`: i18n
   - `idb`, `mem`: db
   - `lastNonRead`, `lastHomeConv`, `pendingBookChat`: router, sidebar, chat
   - `quietUntil`, `modalLock`, `io`, `toastT`, `msgRaf`

   ES module imports are read-only bindings, so another module cannot do `RD = …`. These must move into one shared state object (for example `state.RD`) or behind setters.

4. **Constants mutated at runtime.** `applyLang()` mutates `TYPES` and `STATUS` in place for English. Modules that import them must share the same object, never a copy.

5. **The central click dispatcher** (init, lines 3104–3127) handles `data-href`, `data-go`, `data-add`, `data-open`, `data-close`, `data-ref`, `data-term`, `data-done`, `data-screen`, `data-fn`, `data-bconv`, `data-theme-btn`, `mark.hl`, `.tmark`, and more. Its order matters: the first match returns. It must stay one function and keep its order. Modules should register handlers into it, not add their own document listeners.

6. **Shared DOM elements.** `#sheet.onclick` is reassigned by `hlSheet`, `sessionSheet`, `bookSearch`, and `displaySheet`, and `#modalBox` is rewritten by many features. The last writer wins, and that behavior must be preserved.

7. **Order-dependent initialization:**
   - The `DEMO_*` script must run before the app script, because it provides globals.
   - The theme boot script must run before first paint, so it must stay inline in `<head>` in any build.
   - `const menuBtn = $('#menuBtn')` runs while the script is being evaluated, so the DOM must already exist. Keep the script at the end of the body, or use `defer`.
   - Inside `init()`, `applyLang()` must run before the first render, because its MutationObserver translates DOM as it is added. `route()` must run last.
   - `LANG` is declared at line 3011 but read by `rel()` at line 1423. This works only because the calls happen after evaluation. With modules, a circular import could hit the temporal dead zone.

8. **Circular dependencies.** `route` calls every renderer, and renderers call `go`/`route` and open chat. `go` calls `renderReader`. Chat reads `RD` and `topBlock`. The fix is a small router registry, where views register their render function, plus the shared state object.

9. **i18n is keyed by the Arabic text.** `EN_UI` maps exact Arabic strings to English, and a MutationObserver rewrites the DOM. Any edit to an Arabic UI string silently breaks its English version. **Strings must not change during Phase 1.**

10. **Inline event handlers.** There are none (`on*=` attributes: 0). Handlers are attached in JS through delegation, `onclick` properties, and `addEventListener`. About 90 lines of the markup and strings carry inline `style="…"` attributes, and they must move unchanged.

11. **HTML strings rendered with `innerHTML`.** Imported `{type:"html"}` and `box.html` blocks are inserted as-is, so an imported file can inject markup. This is an existing behavior. Note it for schema validation in the `ExportFile` schema. Do not change it in Phase 1.

12. **Fire-and-forget writes.** A test that reloads immediately after a change may lose the last write. This is the same as today, and not a regression.

---

## Proposed Phase 1 plan

The goal is the same behavior, split into modules, built by Vite into (a) a normal web build and (b) one self-contained HTML file.

### Step 0: Prerequisites (before any code)

- [ ] Export the real library from its current origin (`EXP-01`) and keep the JSON outside git. `exports/` is already in `.gitignore`.
- [ ] Run the full `CHECKLIST.md` once against the original file and record the results. This is the baseline.
- [ ] Approve the dependencies: `vite`, `vite-plugin-singlefile`, and `vitest` (dev only). Dexie and zod were proposed Phase 1 items in the superseded plan, but I suggest adding them **after** the split is verified. They change storage and validation code, and that is behavior risk.

### Step 1: Unbundle, with no code changes

- Write a small script, `tools/unbundle.py` or a Node equivalent. It extracts:
  - the template into `apps/web/index.html`;
  - the 26 fonts into `apps/web/public/fonts/*.woff2`, rewriting the uuid `url(...)` values to real paths.
- Verify: the decoded template string must equal the extracted file exactly. Also compare the re-encoded bytes. The original encoder escapes some characters, for example `</`, so byte equality may need a custom encoder. String equality is the real test. Also, serving `apps/web/index.html` with the plain Python server must pass the **[SMOKE]** set.
- This removes the Claude Design loader. It is the only runtime change, and the checklist catches regressions ("Unpacking…" disappears, which is expected).

### Step 2: Vite shell, still one script

- Move the CSS to `src/ui/styles.css` and the app IIFE to `src/main.js` unchanged, as a classic script or a single module.
- Set up Vite plus the singlefile build. Keep the theme boot inline in `<head>`.
- Verify: [SMOKE] on both `npm run dev` and the single-file output, then import the real export and spot-check highlights.

### Step 3: Extraction order, lowest risk first

Each step moves one group, makes it a module with explicit imports and exports, rebuilds, and runs the checks listed.

| # | Module | Why this position | Checks |
|---|---|---|---|
| 1 | `core/util.js` (esc, arr, norm, stripD, strip, uid, dayKey, short, hash, colorOf, plain, bkPos, byPos) | Pure, no DOM, no state | Unit tests for `norm`, `stripD`, `bkPos`. [SMOKE] |
| 2 | `packages/ingest/markdown.js` (mdParse, inline, mdToItem …) | Pure | Snapshot of `mdToItem(DEMO_MD)` taken from the original before moving. ADD-01, ADD-02 |
| 3 | `packages/ingest/epub.js`, `pdf-clean.js` (cleanPages, pdfQuality, linesToParas) | Pure or near-pure | Fixture tests. ADD-05, PDF-01 |
| 4 | `core/i18n.js` (EN_UI, tx, applyLang) | Data plus one observer. `LANG` goes behind a getter | SETT-06, SETT-07 |
| 5 | `core/state.js` (one object for RD, CH, cur, SEL, …) and `core/db.js` (mem, openDB, put, del, kv, pref) | Central. Every write goes through db | SET-04, EXP-01, EXP-02, IMP-01 |
| 6 | `chat/ai-client.js` (aiCfg, aiCall, parseJSON) | Leaf with network | HOME-06, SETT-03, SETT-05 (SETT-04 with a key) |
| 7 | `ui/` (toast, modal, sheet, theme, menu, tooltip, sidebar) | DOM helpers used by everyone | NAV-*, NAV-10 |
| 8 | `study/` (cards, schedule, review, hk helpers) | Small, and testable with fake time | Unit tests for due and stage logic. REV-* |
| 9 | `library/` (lib, search, glossary, map, quotes, hlall, hls, add/import/export, quote card) | Views | LIB-*, GL-*, MAP-*, QT-01, HLA-01, HLS-*, IMP-* |
| 10 | `reader/` (render, screens, selection, highlights, session, bookmarks, search, display, footnotes) | Largest and most coupled | RD-*, TB-*, SEL-*, FN-* |
| 11 | `chat/` (context, companion, chapter cards) | Depends on reader and study | HOME-*, AI-* |
| 12 | `core/router.js` and `main.js` (route, the click dispatcher, init) | Touches everything, so it goes last | Full checklist |

### How we verify no behavior change after each step

1. **HTML snapshot tests.** Most renderers are pure functions of `(item, kv)` that return HTML strings: `readerHTML`, `chapterHTML`, `screenHTML`, `card`, `mapHTML`, `bookMemory`, `buildMessages`. Before moving a group, record their output for the demo data plus your exported library, and fail the build if it changes. This catches most regressions without clicking.
2. **Data round trip.** Import your export, then export again. The two files must be equal apart from `exported` and ordering.
3. **Manual checks.** Run the [SMOKE] items after every step, and the rows listed for the module you moved. Run the full `CHECKLIST.md` at the end of Phase 1. This also meets the original phase-plan success criterion: the single-file build works like the original, with the library, highlights, and cards all present.
4. **One commit per step**, so any regression can be reverted on its own.

**Time box.** The original phase plan set 2 weeks. If step 10 (reader) goes beyond that, stop, and ship with the reader still a single module.
