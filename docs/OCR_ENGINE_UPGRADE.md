# OCR Engine Upgrade Plan — Maktabati

> Status: Phase 1 + language auto-detect **shipped** (2026-11-14). Phase 2 (engine swap) is **pending dependency approval**. This doc complements the original `docs/OCR_PLAN.md` (which established the local-Tesseract default and the Gemini cloud option).

## Objective

Replace the on-device OCR engine (tesseract.js, previously Arabic-only) with a modern
browser-native engine (PaddleOCR.js / PP-OCRv5), keeping Arabic + English, self-hosted
offline assets, and all hard rules: books stay on-device, no server, OCR text is verbatim
(no AI rewrite), AI additions are labeled, optional fields only (no format migration).

## Shipped (branch `feat/ocr-english`)

| Commit | Change | Verification |
|---|---|---|
| `5587e73` | English support: thread `it.lang -> ara\|eng` through engine + runner; add `eng.traineddata.gz` (fast, 1.9 MB) | 470 tests green, incl. real `eng` load |
| `3d3a76d` | Language auto-detect: page-1 script probe self-corrects `ara<->eng` before the run | 474 tests green |

## Engine options considered (researched 2026-11-14)

| Engine | Runs in browser? | Arabic | License | Verdict |
|---|---|---|---|---|
| tesseract.js 7 (current) | yes | ara (+eng) | Apache-2.0 | keep as fallback |
| **PaddleOCR.js (PP-OCRv5)** | **yes** | **109 langs** | **Apache-2.0** | **adopt** |
| RapidOCR (ONNX) | via `onnxruntime-web` | yes | Apache-2.0 | alternate if PaddleOCR.js is too heavy |
| EasyOCR / DeepSeek-OCR / Unlimited-OCR | no (PyTorch / GPU) | — | — | skip — server-only |

Also reviewed for pipeline ideas (not code): **OCRmyPDF** (sandwich = keep image + overlay
text with coordinates; `--mode skip/redo/force`; error taxonomy) and **Umi-OCR** (layout
post-processing for reading order; ignore-regions). See conversation for the full comparison.

## Decision

Adopt `@paddleocr/paddleocr-js` (PP-OCRv5) behind the existing `ocrPage(canvas)` interface,
with tesseract.js as automatic fallback when Paddle assets fail to load.

### Dependency cost (self-hosted, one-time download)

| Asset | Size |
|---|---|
| `onnxruntime-web` (WASM) | ~1.5–2 MB |
| `opencv.js` (required by PaddleOCR.js) | ~8–10 MB |
| PP-OCRv5 det + rec ONNX (incl. Arabic) | ~10 MB |
| **Total** | **~15–22 MB** vs ~4.5 MB (tesseract today) |

## Phase 2 — implementation steps

1. **Engine registry** — a small module that builds the engine (`{ openPdfDoc, ocrPage, setLang }`)
   and falls back to tesseract when Paddle assets fail to load.
2. **Dependencies** — add `@paddleocr/paddleocr-js` (+ `onnxruntime-web`, `opencv.js`); self-host
   ORT WASM + ONNX models under `public/ocr/paddle/`.
3. **Paddle engine** — implement the same interface: render PDF page -> `ocrPage(canvas)`.
4. **CSP** — already has `wasm-unsafe-eval`; verify `wasmPaths` / `worker-src`.
5. **Flag + measure** — default tesseract, enable Paddle per-book or global; compare CER and page time.

## Phase 3 — quality passes (no new deps)

- **Language auto-detect** — DONE (`3d3a76d`).
- **Reading-order/layout** — tesseract only returns `data.blocks`/`data.paragraphs` when asked
  (`worker.recognize(image, {}, { blocks: true })`); `Paragraph.lines` + `Paragraph.is_ltr` give
  per-paragraph reading order and RTL. Build paragraph-separated text (`\n\n`) for `mergeOcrBook`
  so multi-column pages read in order. Verify before/after on a real two-column Arabic page.

## Risks & mitigations

- **Bundle weight (15–22 MB)** — lazy `import()`, self-host, `cacheMethod` IndexedDB, opt-in flag.
- **Browser verification** — ORT-WASM + OpenCV.js + models must be confirmed in a real tab
  (`pnpm run dev:web`); unit tests cover only the interface + fallback here.
- **Single-file build** — cannot serve `/ocr` assets; Paddle disabled in `--mode single`
  (same as tesseract today, which the UI already hides for scans).
