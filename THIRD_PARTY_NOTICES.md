# Third-party notices

Maktabati itself is licensed under the GNU Affero General Public License,
version 3 only (`AGPL-3.0-only`). See `LICENSE`.

This file covers the third-party components and assets that are bundled with
or distributed alongside the application. Full license texts are kept in
`licenses/` so they travel with the source and with release archives.

## Bundled runtime dependencies

### pdf.js / pdfjs-dist 6.3.289

- **Files in the app:** `node_modules/pdfjs-dist/build/pdf.mjs`,
  `node_modules/pdfjs-dist/build/pdf.worker.mjs`, bundled by Vite into the
  web build and into the ingest Web Worker.
- **Upstream:** Mozilla PDF.js, https://github.com/mozilla/pdf.js
- **Copyright:** Copyright 2024 Mozilla Foundation. The notice appears in
  `node_modules/pdfjs-dist/build/pdf.mjs`.
- **License:** Apache License, Version 2.0.
- **Full text:** `licenses/pdfjs-dist-LICENSE.txt`
- **Reference copy:** `design-baseline/vendor/pdfjs.js` and
  `design-baseline/vendor/pdfworker.js` vendor pdf.js 3.11.174 for the design
  reference only. They are not part of the application build. The same
  Apache-2.0 terms apply.

### JSZip 3.10.2

- **Files in the app:** `node_modules/jszip`, bundled into the ingest worker
  for EPUB import.
- **Upstream:** JSZip, https://github.com/Stuk/jszip
- **Copyright:** Copyright (c) 2009-2016 Stuart Knightley, David Duponchel,
  Franz Buchinger, António Afonso.
- **License:** JSZip is dual licensed under MIT or GPLv3. This project uses
  the **MIT** option only.
- **Full text:** `licenses/jszip-LICENSE.markdown` (contains both the MIT and
  GPLv3 texts; the MIT text is the one that applies here).
- **Reference copy:** `design-baseline/vendor/jszip.js` vendors JSZip 3.10.1
  for the design reference only. The same dual license applies; this project
  uses the MIT option.

### Development-only packages

`vite`, `vite-plugin-singlefile`, `vitest`, and their transitive dependencies
are development tools. They are not part of the application bundle or the
release archive. Their license metadata is in `package-lock.json` and in
`node_modules/*/LICENSE*`. The optional `@napi-rs/canvas` package is pulled in
only by pdf.js's Node tooling and is not part of the browser build.

## Fonts

The app self-hosts the following font families in
`apps/web/src/ui/fonts/*.woff2` and declares them in
`apps/web/src/ui/styles/fonts.css`. The design reference keeps a copy under
`design-baseline/fonts/`.

All four families are licensed under the **SIL Open Font License, Version
1.1**. Each family's upstream OFL file, including its copyright line and the
full license text, is stored in `licenses/fonts/`.

| Family | Files in `apps/web/src/ui/fonts/` | Copyright line | Upstream OFL |
|---|---|---|---|
| Amiri | `amiri-400-*.woff2`, `amiri-700-*.woff2` | Copyright 2010-2022 The Amiri Project Authors (https://github.com/aliftype/amiri). | `ofl/amiri/OFL.txt` |
| Aref Ruqaa | `aref-ruqaa-700-*.woff2` | Copyright 2015-2020 The Aref Ruqaa Project Authors (https://github.com/alif-type/aref-ruqaa), with Reserved Font Name EURM10. | `ofl/arefruqaa/OFL.txt` |
| IBM Plex Sans Arabic | `ibm-plex-sans-arabic-400-*.woff2`, `-500-*.woff2`, `-600-*.woff2` | Copyright © 2017 IBM Corp. with Reserved Font Name "Plex" | `ofl/ibmplexsansarabic/OFL.txt` |
| Noto Naskh Arabic | `noto-naskh-arabic-400-700-*.woff2` | Copyright 2022 The Noto Project Authors (https://github.com/notofonts/arabic) | `ofl/notonaskharabic/OFL.txt` |

Source for each OFL file: the Google Fonts repository,
`https://github.com/google/fonts/tree/main/ofl/<family>/OFL.txt`, retrieved
2026-11-10. The local copies are:

- `licenses/fonts/amiri-OFL.txt`
- `licenses/fonts/aref-ruqaa-OFL.txt`
- `licenses/fonts/ibm-plex-sans-arabic-OFL.txt`
- `licenses/fonts/noto-naskh-arabic-OFL.txt`

The font files are unmodified subsets as produced by Google Fonts; the OFL
allows redistribution and embedding under its terms. Font names may be
trademarks of their owners; the OFL does not grant trademark rights.

**UNVERIFIED:** none. All four font families have a confirmed OFL 1.1 file
with an explicit copyright line.

## Arabic word frequency list

- **File:** `packages/ingest/data/ar-words.txt`
- **Source:** hermitdave/FrequencyWords, `content/2018/ar/ar_50k.txt`,
  https://github.com/hermitdave/FrequencyWords/blob/525f9b560de45753a5ea01069454e72e9aa541c6/content/2018/ar/ar_50k.txt
  (commit `525f9b560de45753a5ea01069454e72e9aa541c6`, retrieved 2026-10-01;
  SHA-256 of the upstream file `bbe98b4b92902b392bdefa2e555a108fdb42a5dd79d261674be5ab666229e19f`).
- **Author / attribution:** Hermit Dave, FrequencyWords. Built from the
  OpenSubtitles 2018 corpus (http://opus.nlpl.eu/OpenSubtitles2018.php), whose
  data originates from www.opensubtitles.org.
- **License:** Creative Commons Attribution-ShareAlike 4.0 International
  (CC BY-SA 4.0), https://creativecommons.org/licenses/by-sa/4.0/. The
  FrequencyWords code is MIT; only the word list is used here.
- **Full text:** `licenses/CC-BY-SA-4.0.txt`
- **Changes:** one header line with source, commit, license and attribution was
  added; the 50,000 entries (`word count`) are unchanged. At load time the
  engine folds each word (diacritics and tatweel removed, alef forms unified,
  ى/ي unified) into an in-memory lookup table (`packages/ingest/src/lexicon.js`).
  That table is an adaptation of the list and is likewise under CC BY-SA 4.0.
- **Scope of the share-alike terms:** the word list and adaptations of it. The
  engine code is a separate work that reads the list.
- **Display:** the app's About screen (`#/profile/about`) shows this
  attribution and a link to the CC BY-SA 4.0 license. See
  `apps/web/src/legacy/app.js` in the About tab.

## Ambient sound recordings

- **Files:** `apps/web/public/sounds/*.webm` and `*.m4a` (web build only; the
  single-file build has none).
- **Source:** Freesound (https://freesound.org). Originals are downloaded by
  hand into `sounds-src/` (not committed) and turned into the app files by
  `tools/sounds/build.mjs`.
- **License:** every recording is Creative Commons 0 (CC0 1.0 Universal Public
  Domain Dedication), https://creativecommons.org/publicdomain/zero/1.0/.
  Commercial use is allowed and attribution is not required. We credit the
  recordists anyway, in Profile → About.
- **Full text:** `licenses/CC0-1.0.txt`
- **License verified:** 2026-10-03, on each sound's Freesound page (the page
  shows "Creative Commons 0").
- **Changes (all files):** a section was cut. Loops have an equal-power
  crossfade at the seam and a 0.5 s pad on each side. Low rumble was removed
  with a high-pass filter. Every file was set to the same loudness (-26 LUFS
  integrated). Fire also went through a peak limiter. Files were encoded to
  Opus in WebM (72 kbps stereo, 43 kbps mono) and AAC in M4A (96 kbps stereo,
  58 kbps mono).

| App file | Sound | Author | Page | Original | SHA-256 of the original |
|---|---|---|---|---|---|
| `rain` | Rain light 2 (rural) | jmbphilmes | https://freesound.org/people/jmbphilmes/sounds/200273/ | WAV, 1:35, mono | `fa1c5f7a7c89b1d841399045286ba58bb70c14b3774f8a57483ed1befa0edba5` |
| `fire` | Crackling Fire | samarobryn | https://freesound.org/people/samarobryn/sounds/414767/ | WAV, 1:00, stereo | `0adade5e9632415475c124e47a7a924f6719b94a9034875ef70ce045b1195836` |
| `wind` | wind.ogg | sleepCircle | https://freesound.org/people/sleepCircle/sounds/22331/ | Ogg Vorbis, 0:34, stereo | `efbbe4da6452cc3bd637ad2f95ef65b2ac9adb2a4cf41cd90890db37cde2ffa9` |
| `waves` | Ocean Waves.wav | Noted451 | https://freesound.org/people/Noted451/sounds/531015/ | WAV, 1:11, stereo (0-50 s used) | `400b0ce64c0d6fddde21e61bbcc4c5cfeb9cbd2247886081b90f5c5abd96a4b3` |
| `desert` | wind light desert day steady eerie with crickets.flac | kyles | https://freesound.org/people/kyles/sounds/454361/ | FLAC, 1:59, stereo | `8819932cd0c98ea9cca4ed483dcd0d56b643516e0f9cfbaa3c47ee65500f8bec` |
| `thunder-1..3` | THUNDER / Rain low frequencies 4-CHANNEL-48kHz.wav | BlueDelta | https://freesound.org/people/BlueDelta/sounds/367222/ | WAV, 2:02, 4 channels | `d0a7341b4c3db80c53b6826f6d9b9b221b5b63e63042c521c1573d9465afc4fd` |

- **Thunder:** three rolling rumbles (38-52 s, 54-70 s, 72-90 s of the
  original). The section with sharp claps (10-40 s) is not used. The 4 channels
  are mixed to stereo, low-passed at 900 Hz, and gently compressed.
