## What changed

<!-- One or two paragraphs. Link the issue if there is one. -->

## Why

<!-- User-visible problem or maintenance reason. -->

## Tests

- [ ] `npm test`
- [ ] `npm run build`
- [ ] `node tests/e2e/smoke.mjs http://127.0.0.1:5173/` (if UI changed)
- [ ] `node tests/e2e/ai-failure.mjs http://127.0.0.1:5173/` (if AI/storage changed)

## Safety

- [ ] No API keys, real books, exports, `sounds-src/`, `out/`, or `dist/` added.
- [ ] Export format unchanged, or a versioned migration is included.
- [ ] CSP, remote-image blocking, and the local-first storage model preserved.
- [ ] New pure logic has Vitest coverage.
- [ ] `README.md` / `CHECKLIST.md` / `CHANGELOG.md` updated when behavior changes.
