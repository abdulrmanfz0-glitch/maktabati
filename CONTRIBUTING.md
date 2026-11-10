# Contributing to Maktabati

Thanks for helping. Maktabati is an Arabic-first, local-first reading app. The
most useful contributions are careful bug reports, PDF/EPUB conversion fixes,
accessibility work, and small, tested changes.

## Before you start

- Read `README.md` and `SECURITY.md`.
- Use Node.js **22.13+** (`nvm use` reads `.nvmrc`).
- Do not commit books, library exports, `sounds-src/`, `out/`, `dist/`, or API
  keys. `.gitignore` covers the usual cases, but check `git status`.
- Discuss large changes in an issue first, especially data-format, storage, or
  provider changes.

## Setup

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. Unit tests:

```bash
npm test
```

Builds (Node 22.13+):

```bash
npm run build
npm run build:single
```

## Code style

- Plain JavaScript, no TypeScript and no new runtime dependencies without a
  clear reason.
- Keep the existing Arabic RTL-first UI and the local-first storage model.
- Do not change the library export format without a versioned migration plan.
- Put reusable logic in `apps/web/src/core/` or `packages/ingest/src/`, not in
  random UI handlers.
- Pure logic needs Vitest coverage. UI changes need a smoke or e2e check when
  practical.
- No points, streaks, or consumption rewards.

## Data and privacy rules

- Books, highlights, chats, and cards stay in IndexedDB on the device.
- The API key stays in `localStorage`; it must never appear in exports, logs,
  error messages, screenshots, or fixtures.
- Do not add telemetry.
- Remote images in books/AI replies stay blocked.
- AI output is untrusted input: sanitize and delimit it.

## Tests

```bash
npm test                    # unit + property tests
node tests/e2e/smoke.mjs http://127.0.0.1:5173/
node tests/e2e/ai-failure.mjs http://127.0.0.1:5173/
```

The e2e scripts need Chrome/Edge (`CHROME_PATH`) and a fresh browser profile.
They use the dev-only `window.__rt` hook, so run them against `npm run dev`,
not a production build. PDF/EPUB e2e scripts need local fixtures under
`tests/fixtures/pdf/`; those files are not distributed.

## Pull requests

- One logical change per commit; explain the user-visible effect and the tests
  you ran.
- Update `README.md`, `CHECKLIST.md`, or `CHANGELOG.md` when behavior changes.
- Keep the CSP, remote-image block, and export version intact unless the PR is
  specifically about them.
- Avoid drive-by formatting changes in `apps/web/src/legacy/app.js`.

## Reporting bugs

Use the issue templates. Include:

- exact commit/version, browser, OS, and whether you used web or single-file;
- steps to reproduce, expected vs actual;
- a minimal sample that does not contain a real book or API key;
- console errors, with secrets removed.

For security issues, follow `SECURITY.md` instead of opening a public issue.
