# Design baseline — reference only

This folder is a design reference, not the application.

- It is an unpacked Claude Design export used to compare visual and UX changes.
- It must never be served, deployed, linked as the app, or treated as source of truth.
- The source of truth is `apps/web`.
- `vendor/` contains third-party libraries (pdf.js and JSZip) kept only so the
  reference can be reproduced. They are not part of the application build and
  are not maintained here.
- Do not port logic, data code, or import/export code from this folder.

See `THIRD_PARTY_NOTICES.md` at the repository root for the licenses of the
third-party files kept here.
