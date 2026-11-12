# E2E scripts

These scripts use the local CDP helper and a fresh browser profile. They are
not a Playwright suite and do not need a browser driver package.

## Common requirements

- Node 22.13+.
- Chrome/Edge; set `CHROME_PATH` if the browser is not found.
- A dev server for scripts that use `window.__rt`:

```bash
npm run dev -- --host 127.0.0.1
node tests/e2e/smoke.mjs http://127.0.0.1:5173/
```

`window.__rt` and `window.__bench` exist only in Vite dev mode. Running a
script against `dist/web` or `dist/single` will fail those assertions by design.

## Scripts

| Script | Needs dev server | Notes |
|---|---|---|
| `smoke.mjs` | yes | Navigation, reader, selection, export/import, delete, mobile widths |
| `ai-failure.mjs` | yes | Starts its own fake provider; 429, abort, delete, idle, empty answers, two tabs, IndexedDB failure |
| `ai-background.mjs` | yes | Starts its own fake provider; reply keeps streaming after the chat closes, toast + unread, stop/delete abort |
| `ai-providers.mjs` | yes | Starts its own fake provider; key detection, provider switching, picker, /models fallback, custom reload |
| `ai-gemini-fallback.mjs` | yes | Starts its own fake provider; Gemini 503 fallback note, all-busy message, 404 and model filtering |
| `upload.mjs` | yes | PDF/EPUB/text/paste; needs local fixtures |
| `ingest-app.mjs` | yes | PDF/EPUB fixture comparisons |
| `reader-imported.mjs` | yes | Imported-book reader checks; needs fixtures |
| `roundtrip.mjs` | yes | Large export/import round trip; needs fixtures |
| `mixer.mjs`, `sounds.mjs`, `bookmarks.mjs`, `rt-tools.mjs` | no* | Browser audio/layout checks; some may use demo data |

`*` They may still be run against the dev server for consistency.

## Fixtures

`tests/fixtures/pdf/` and other book fixtures are intentionally not
distributed: they may be copyrighted, large, or both. Put local fixtures there
and do not commit them. `docs/first-issues.md` lists the fixture-policy task.

## Adding a test

- Use `tools/lib/cdp.mjs` and a fresh profile.
- Assert user-visible behavior, not internal function names.
- Remove or mask API keys and book text from logs/screenshots.
- For AI tests, start `tools/fake-ai-server.mjs` and close it in `finally`.
