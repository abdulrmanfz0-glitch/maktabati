# First issues

Small, self-contained tasks for a first contribution. Read
[`CONTRIBUTING.md`](../CONTRIBUTING.md) first. Do not use real books, exports,
or API keys in tests.

## 1. Article position in page mode

**Area:** reader / pagination · **Size:** small–medium

Articles opened in page mode currently reopen at a fraction of the article
instead of the exact paragraph (see `docs/backlog.md`). Make the position
paragraph-based, matching books.

**Done when:** open an article in page mode, move to a paragraph, reload, and
land on that paragraph in all three templates. Add a smoke assertion.

## 2. Keyboard focus in the idea map

**Area:** accessibility · **Size:** small

The map canvas has a keyboard role, but chips, search, and the detail panel do
not have a documented tab order.

**Done when:** Tab/Shift+Tab reach every map control, Escape closes search or
the panel, and focus returns to the control that opened it. Add a short
CHECKLIST item.

## 3. Empty and error states in the English UI

**Area:** i18n · **Size:** small

Some empty/error strings still fall back to Arabic in the English UI.

**Done when:** the empty library, empty map, failed import, and storage-
unavailable states have English strings and are listed in `CHECKLIST.md`
SETT-07.

## 4. Provider capability table test

**Area:** AI / docs · **Size:** small

The provider table in `README.md` is manual. Add a pure table/data check that
every provider row has a supported/unsupported note and a test URL example.

**Done when:** `npm test` fails if a row loses its status or example.

## 5. Import-worker fallback test

**Area:** import / tests · **Size:** small–medium

The JSON parse/validate worker has a main-thread fallback, but only the happy
path is exercised.

**Done when:** an e2e test makes the worker unavailable and imports a valid
export; the library still updates, and an invalid export still writes nothing.

## 6. Figure-size follow-up

**Area:** ingest / performance · **Size:** medium

Image-heavy PDFs re-encode every figure as PNG (see `docs/backlog.md`). Start
with one fixture: pass JPEG/DCTDecode streams through unchanged and measure the
stored size and export size.

**Done when:** the fixture's stored figures shrink without losing display
correctness, and the ingest benchmark history has a new entry.

## 7. Real-device reading checklist

**Area:** mobile / QA · **Size:** small

Pick three items from `docs/backlog.md` (bottom sheet, long-press selection,
page-swipe vs text selection) and record results for iOS Safari and Android
Chrome.

**Done when:** `CHECKLIST.md` has dated results and any bug has steps.

## 8. Storage-quota estimate

**Area:** storage / UX · **Size:** small

Privacy shows storage used, but not whether the next import will fit.

**Done when:** a pure `formatBytes`/quota helper has Vitest coverage and the
Privacy tab shows used vs estimated quota with no blocking behavior.

## 9. Reduce the first map fit flash

**Area:** performance / map · **Size:** small

On a large map, the first frame shows an unsettled graph before the saved
positions settle. Try drawing only after the first fit or fading in the canvas.

**Done when:** a 600+ node map has no visible jump, and the map benchmark does
not regress by more than 10%.

## 10. Document the fixture policy

**Area:** docs / tests · **Size:** small

`tests/fixtures/pdf/` is intentionally not distributed. Write down how a
maintainer runs PDF/EPUB e2e with local fixtures and what may be committed.

**Done when:** `CONTRIBUTING.md` and `tests/e2e/README.md` agree on the policy.

## How to claim one

Open an issue with the title `first issue: <number and name>` and say which
files/tests you plan to touch. Small PRs are easier to review than broad ones.
