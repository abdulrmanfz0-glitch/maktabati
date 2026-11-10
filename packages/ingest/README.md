# ingest

Pure functions that convert PDF, EPUB, Markdown, and plain text into the
application's book format. Word/DOCX is not supported.

The engine runs in the browser Web Worker used by `apps/web`, and in Node for
the tools and tests. It is not a separate server.
