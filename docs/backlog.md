# Backlog

Items to do later, with the reason they exist.

- **About screen: word list attribution.** When the ingest engine is integrated into the app,
  the app's About screen must show the attribution for the Arabic word list (hermitdave/
  FrequencyWords `ar_50k`, CC BY-SA 4.0, built from OpenSubtitles 2018). The exact text and
  source are in `THIRD_PARTY_NOTICES.md`. Reason: CC BY-SA 4.0 requires attribution wherever the
  list (or its adaptation, the engine's lookup table) is distributed. Added 2026-10-01.
- **Book-based word list.** The bundled list is from subtitles; dictionary coverage on books is
  0.69–0.86 on the fixtures. A list built from openly licensed books would fit better. The
  lexicon interface (`packages/ingest/src/lexicon.js`) is the swap point. Added 2026-10-01.
- **Reading templates on real phones.** Not verified at 390px or on real phones: the bottom
  sheet, inline note marks, swipes, ribbon pull, long-press, text selection versus page swipe,
  swipe-down exit versus pull-to-refresh, and rotation. Added 2026-10-01.
- **Fullscreen.** Fullscreen and the iPhone home-screen fallback are untested on real browsers.
  Added 2026-10-01.
- **Pagination in other engines.** Firefox and Safari pagination are untested. Added 2026-10-01.
- **Screen readers.** Untested. Added 2026-10-01.
- **Article position in page mode.** Articles in page mode reopen at a fraction instead of the
  exact paragraph. Added 2026-10-01.
- **Lamp lighting option.** The lamp idea as a lighting option in dark themes. Added 2026-10-01.
- **Notebook.** The notebook idea as a cross-template feature tied to the understanding loop.
  Added 2026-10-01.
- **Figure size.** The engine decodes each PDF image to pixels and re-encodes it as PNG, so
  photos grow: one fixture (43 MB PDF, 162 figures) stores 67.5 MB of figures, and its library
  export is 91 MB (figures travel as data: URLs). Pass JPEG (DCTDecode) streams through unchanged,
  or re-encode photos as WebP/JPEG, before many image-heavy books reach phones. Added 2026-10-02.
- **Offline web build.** The single file works fully offline. The web build loads the importer
  (pdf.js, engine, word list) from its own server on first use, so offline use of the web build
  needs a service worker (PWA, not built yet). Added 2026-10-02.
- **Service worker: cache the sounds.** When the PWA service worker is built, cache
  `sounds/*.webm` and `sounds/*.m4a` on first use (cache-first, one format per browser), so sounds
  play offline after the first listen. Added 2026-10-03.
- **Wind recording.** The wind loop uses the alternative candidate (sleepCircle, a hollow narrow-band
  wind) because the first candidate (keweldog, breeze through pines,
  https://freesound.org/people/keweldog/sounds/181801/) was not downloaded. To swap: put it in
  `sounds-src/`, change `wind` in `tools/sounds/build.mjs`, rerun, and update the credits and notices. Added 2026-10-03.
