# Maktabati (مكتبتي)

An Arabic-first reading environment. Bring your own PDF, EPUB, Markdown, or
plain-text book, read it in a comfortable reader, highlight and annotate it,
review what you read, play ambient sounds, and discuss the book with an AI
companion that knows your library.

<!-- Screenshot placeholder: add docs/screenshot.png before publishing. -->
> **Screenshot placeholder:** add `docs/screenshot.png` (desktop library or
> reader view) before publishing this repository.

## What it does

- Imports PDF, EPUB, Markdown, and plain text locally; PDF/EPUB conversion runs
  in a Web Worker and never uploads the book to a server.
- Reads in three templates: Modern, The Book, and Manuscript, with scroll or
  paged reading, Arabic RTL/LTR support, font size, line spacing, text width,
  and diacritics controls.
- Saves highlights, notes, quotes, bookmarks, glossary terms, chapter cards,
  reading sessions, and spaced-review cards in the browser.
- Provides a canvas idea map, quote-card export, in-book search, and library
  search.
- Plays recorded rain, thunder, wind, fire, waves, and desert wind, plus a
  calm brown-noise fallback, through Web Audio.
- Talks to an OpenAI-compatible Chat Completions provider with your own key.

Everything is local-first: books and study data live in IndexedDB on the
device. The AI provider receives only the context needed for a request.

## Requirements

- Node.js **22.13 or newer** (see `.nvmrc`; `pdfjs-dist` requires
  `>=22.13`).
- npm.
- A modern browser. Chrome/Edge is the best-tested target. Firefox and Safari
  are not fully verified.

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The dev server uses Vite; there is no separate
backend. The first load creates two demo items so the library is not empty.

The old single-file `My Library.html` is no longer part of the repository.

## Add a DeepSeek key

1. Create a key in the DeepSeek console. Use a key with a spending limit.
2. Open **Profile → AI** (`#/profile/ai`).
3. Keep the default base URL `https://api.deepseek.com` and model
   `deepseek-chat`, or enter another OpenAI-compatible base URL and model.
4. Paste the key and press **Save**, then **Test connection**.

The key is stored only in this browser's `localStorage` under
`maktabati:ai`. It is never included in library exports. See
[`SECURITY.md`](SECURITY.md).

## AI providers that work from the browser

The app sends a browser `fetch` request directly to the provider. That means
the provider must allow **CORS** from the app's origin.

| Provider | From the browser |
|---|---|
| DeepSeek | Works (default base URL and model) |
| OpenRouter | Works with its OpenAI-compatible base URL |
| Any OpenAI-compatible endpoint with CORS (Groq, Together, Fireworks, LM Studio, vLLM, Ollama with `OLLAMA_ORIGINS` configured) | Works when it accepts `Authorization: Bearer` and the OpenAI Chat Completions request/response shape |
| OpenAI official API | Does **not** work directly from a browser (CORS) |
| Anthropic API | Does **not** work directly; it uses a different endpoint, headers, and streaming format |
| Google Gemini API | Does **not** work directly; it uses a different request shape |

There is no server-side AI proxy in this repository. If you need OpenAI,
Anthropic, Gemini, or a key that never reaches the browser, you need to add a
proxy (planned in `apps/api`, not implemented).

## Build

```bash
npm run build          # dist/web (needs a server) + dist/single (one file)
npm run build:single   # worker, then the self-contained dist/single/index.html
npm run preview        # preview the web build
```

The single-file build inlines scripts, fonts, and the ingest worker, so it can
be opened by double-clicking `dist/single/index.html`. Its limitations:

- it has no recorded nature sounds; only the calm brown-noise option;
- AI requests from a `file://` page can be blocked by the provider's CORS
  policy, so serve the file from a local server if AI does not connect;
- PDF/EPUB import works offline, from the embedded worker.

Production builds receive a Content Security Policy. Dev mode does not, so Vite
HMR keeps working. The normal web build uses a SHA-256 hash for its one inline
theme script; the single-file build uses `'unsafe-inline'` for scripts because
the whole app is inlined by `vite-plugin-singlefile`.

## Privacy

- The API key stays in the browser's `localStorage` on this device. It is not
  sent anywhere except the provider base URL you configure, and it is not part
  of library exports.
- The book, highlights, notes, quotes, chats, and chapter cards are stored in
  IndexedDB on this device. There is no Maktabati server.
- When you ask the AI a question, the relevant book text, highlights, notes,
  and chat messages are sent to the provider you configured. If you enable
  "allow the whole book", the whole book is sent. Review the provider's privacy
  and data-retention terms.
- There is no telemetry, analytics, or tracking script.
- Remote images in imported Markdown, imported HTML, and AI replies are not
  loaded. They are shown as plain links or alt text. Local `data:image/...` and
  `blob:` images are displayed.
- Exported JSON is not encrypted. Treat exports as private files.

## Known limitations

- **PDF extraction is heuristic.** The engine is tested on seven Arabic PDFs
  from a single publisher; it is not a guarantee for every PDF. Scanned/image-
  only PDFs are not supported: the preview is disabled and nothing is saved.
  Table-heavy and multi-column layouts can still come out imperfectly.
- **Large books are memory-hungry.** A 43 MB image-heavy PDF produced 67.5 MB
  of figures and a 91 MB export in testing; peak PDF-import memory reached
  about 506 MB on one 284-page file. Mobile devices may run out of storage or
  memory. The library export/import cap is 250 MB.
- **No OCR/vision.** There is no image-reading model in the app.
- **No Word/DOCX import.** Only PDF, EPUB, Markdown, and plain text.
- **No PWA/offline web build yet.** There is no service worker or manifest. The
  single-file HTML is the offline option, with the limits above.
- **No accounts, sync, or server proxy.** Data does not move between devices
  unless you export/import JSON.
- **Settings, the idea-map layout, and sound mixes are not included in
  library exports.** They are stored in `localStorage`, not in the export
  format.
- **Browser coverage is incomplete.** Real iOS/Android devices, Firefox,
  Safari, fullscreen, and screen readers are not fully verified.
- **Remote images are blocked by design.** External images in books or AI
  replies render as links/alt text.
- **The AI key is visible to JavaScript on the same origin.** Use a
  spending-limited key and a dedicated origin; see `SECURITY.md`.

## License

Maktabati is licensed under **AGPL-3.0-only**. See [`LICENSE`](LICENSE).
Third-party components and assets are listed in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md); full license texts are in
[`licenses/`](licenses/).

---

## العربية

«مكتبتي» بيئة قراءة عربية محلية: تستورد PDF أو EPUB أو Markdown أو نصًا،
وتقرأه في ثلاثة قوالب، وتظلّل وتدوّن وتلخّص وتراجع، وتشغّل أصواتًا محيطة،
وتناقش الكتاب مع رفيق ذكاء اصطناعي.

- **التشغيل:** Node.js 22.13 أو أحدث، ثم `npm install` و`npm run dev`، وافتح
  <http://localhost:5173>.
- **المفتاح:** من **الملف ← الرفيق الذكي** (`#/profile/ai`). الافتراضي
  DeepSeek، ويمكن استخدام أي مزوّد متوافق مع OpenAI Chat Completions يدعم
  CORS. مفتاح OpenAI الرسمي وAnthropic وGemini لا تعمل مباشرةً من المتصفح.
- **الخصوصية:** الكتب والتظليلات في IndexedDB على جهازك، والمفتاح في
  `localStorage`. عند السؤال تُرسل المقاطع ذات الصلة إلى مزوّد الذكاء الذي
  اخترته. لا يوجد تتبّع. الصور الخارجية محجوبة وتظهر كروابط أو نص بديل.
- **البناء:** `npm run build` ينتج `dist/web` و`dist/single`؛ نسخة الملف
  الواحد تعمل بلا سيرفر لكن أصواتها الطبيعية غير مضمّنة.
- **الترخيص:** AGPL-3.0-only، مع إشعارات الطرف الثالث في
  `THIRD_PARTY_NOTICES.md`.
- **ملاحظة:** المشروع ليس PWA بعد، ولا يدعم الكتب الممسوحة (OCR)، ولا
  Word/DOCX، ولا المزامنة بين الأجهزة.
