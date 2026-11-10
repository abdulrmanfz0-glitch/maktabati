# Roadmap

Maktabati is a local-first Arabic reading environment. This roadmap is
deliberately small: fix the reading/study loop first, then make the project
easier to maintain, then consider a server only where it is actually needed.

## Now (0.1.x)

- **Reliability:** real-device passes for iOS Safari, Android Chrome, and
  Firefox; automatic recovery checks after interrupted imports/writes.
- **Import quality:** more Arabic PDFs, footnotes, tables, and RTL EPUBs;
  golden fixtures that can be shared legally.
- **Performance:** measure on a low-end Android profile; verify that the
  large-map iteration reduction still reads well on dense cross-book graphs.
- **Accessibility:** screen-reader passes for the reader, chat, map, and wizard;
  keyboard-only focus order.
- **Docs:** keep `CHECKLIST.md`, `docs/first-issues.md`, and the provider
  compatibility table current.

## Next

- **PWA:** manifest, install flow, and a service worker that caches the shell
  and fonts without caching books or AI requests.
- **Storage resilience:** export reminder, storage-quota meter, and a restore
  path for a failed IndexedDB upgrade. The export format stays versioned and
  backward compatible.
- **AI providers:** a thin adapter layer so Anthropic/Gemini differences do not
  leak into the app; optional BYO proxy for users who cannot use CORS. No keys
  in a server unless the user explicitly opts into a hosted mode.
- **Study loop:** better review scheduling and a compare-two-concepts view,
  without points, streaks, or consumption rewards.
- **Import scale:** move more JSON validation/planning off the main thread and
  add a resumable import for very large libraries.
- **Testing:** deterministic fixtures for the ingest engine and a failure-
  injection suite for storage, tabs, and AI streams in CI.

## Later / exploratory

- Encrypted cross-device sync where the server stores ciphertext only.
- Hosted AI proxy with user accounts, spending limits, and a real privacy
  policy. This is optional; the local/BYOK app remains usable without it.
- Word/DOCX import if a dependency-free parser is practical.
- OCR/vision for scanned PDFs, only with an explicit user choice and a clear
  cost/data-sharing explanation.

## Non-goals

- Server-side book storage.
- Telemetry, ads, or tracking.
- Points, streaks, leaderboards, or rewards for reading volume.
- Rewriting the author's text with AI.
- Breaking the existing export format without a versioned migration.
