# Ingest benchmark log

**Single publisher.** All 7 fixtures are Hindawi (iTextSharp + Yakout Linotype). Every number below describes these files only, not Arabic PDFs in general.

Rerun with `node tools/bench-ingest.mjs --label "..."`. The full per-file metrics of every run are in `docs/ingest-bench-history.jsonl`.

"Success" means all three of:
- the document score is at least 0.8;
- at least 2 chapters were found;
- there is no major issue.

| Step | Change | Auto-success | Main measured effect |
|---|---|---|---|
| 0 | Baseline (012af39) | 7/7 | The criterion was too lenient: unlinked notes and broken paragraphs went unflagged. |
| 1 | Honest structural issues: notes-unlinked, markers-unlinked, paragraphs-suspect, toc-partial | 2/7 | Evaluation change only, no rule changed. |
| 2 | Cover pages: an image-only first or last page is routed as `cover`, not `vision` | 2/7 | Vision pages 7 → 0. Two files move to `ok`. |
| 3 | TOC-partial check ignores page-number-only lines | 2/7 | 4 false toc-partial alarms removed. |
| 4 | Verse blocks: runs of centered lines become one paragraph with line breaks | 3/7 | Terminal-punctuation share: 007572a7 0.49 → 0.89, 0f1b65bc 0.21 → 0.83. |
| 5 | Relative indent: an indent is measured against the neighbouring lines | 3/7 | Share 0.441 → 0.503 (5150ac47) and 0.894 → 0.929 (007572a7). f42c7b4f loses 131 paragraph starts, fixed in step 6. |
| 6 | Justification measured only on lines that start at the text edge | 3/7 | f42c7b4f paragraphs 411 → 536. All 7 files now measured as justified. |
| 7 | Space-insensitive header keys | 3/7 | **No effect: reverted.** |
| 7b | Title-echo running headers: a small zone line repeating a heading counts as a header at 2 repeats | 3/7 | Residual repeats in 0f1b65bc 25 → 12. |
| 8 | Bracket mirroring per whole line instead of per item | 3/7 | Bracket errors better in 4 files (0f1b65bc 0.030 → 0.020), worse in 1 (5150ac47 0.0246 → 0.027), unchanged in 2. |
| 9 | Endnotes: notes-section pages, sequences split where numbering restarts | 3/7 | Linked notes: 74b4b9e2 0 → 22 of 40, 5150ac47 0 → 55. |
| 9b | Endnote sequence alignment by dynamic programming | 4/7 | Linked notes: 74b4b9e2 → 39/40, 5150ac47 → 157. |
| 10 | Five changes (see below) | **5/7** | 0f1b65bc: first chapter p103 → p7, which recovers **102 wrongly dropped pages**. Notes 6/10 → 10/10. |

Step 10 bundled these changes:
- The TOC page test counts only lines with letters.
- TOC entries match headings word by word, allowing letters in a different order inside a word (ligature-order damage in heading runs).
- Chapter titles come from the TOC line.
- Headings on endnote pages are never chapter candidates.
- A new `front-matter-large` issue.

Rules still to validate by ablation: `spaceless-keys` (added in step 10's investigation, not yet shown to help).

## Round 2 (2026-09-30): 6 fixtures

The 7th fixture (74b4b9e2, a success at step 10) is no longer in `tests/fixtures/pdf`, so
step 10 on the current set is **4/6**, not 5/7. The loop was capped at 3 iterations.

| Step | Change | Auto-success | Main measured effect |
|---|---|---|---|
| 10 | Same code, 6 fixtures | 4/6 | Baseline for this round. |
| 11 | Page-coverage invariant; unlinked endnotes kept in the book | 4/6 | 5150ac47: 31 notes pages were silently missing from the book; now 0 dropped pages in all 6 files. |
| 12 | Iteration 1: endnote numbering continuity | 4/6 | 5150ac47: linked notes 157/359 → 275/288; notes-unlinked and markers-unlinked cleared. |
| 13 | Iteration 2: diagram-label filter | 4/6 | 5150ac47: paragraph-terminal share 0.447 → 0.472. Other files unchanged. |
| 14 | Iteration 3: paragraph recovery for unindented text | 4/6 | Not added: no geometric signal (see `docs/ingest-rules.md`). |

### Current table (step 13)

| File | Pages | Score | Chapters | Notes | Issues | Recommendation | Success |
|---|---|---|---|---|---|---|---|
| 007572a7 | 116 | 0.939 | 3 toc | 27/27 | minor isolated-letters(2) | ok 0.84 | yes |
| 0f1b65bc | 368 | 0.942 | 25 toc | 10/10 | minor isolated-letters(2) | ok 0.85 | yes |
| 35590259 | 88 | 0.937 | 3 headings | 0/0 | - | ok 0.83 | yes |
| 5150ac47 | 284 | 0.930 | 21 toc | 275/288 | paragraphs-suspect | review 0.76 | no |
| f42c7b4f | 56 | 0.922 | 4 toc | 0/0 | - | ok 0.79 | yes |
| f692654d | 192 | 0.969 | 4 toc | 99/99 | paragraphs-suspect | review 0.84 | no |

### Page coverage (step 13)

Every page is assigned to chapter, front, cover, blank, or dropped with a reason
(`report.coverage`). The issue `coverage-low` (major) fires above 5% dropped.

| File | Chapter | Front | Cover | Blank | Dropped |
|---|---|---|---|---|---|
| 007572a7 | 108 | 5 | 1 | 2 | 0 |
| 0f1b65bc | 349 | 5 | 1 | 13 | 0 |
| 35590259 | 84 | 1 | 1 | 2 | 0 |
| 5150ac47 | 263 | 5 | 1 | 15 | 0 |
| f42c7b4f | 47 | 5 | 1 | 3 | 0 |
| f692654d | 181 | 5 | 1 | 5 | 0 |

Coverage is per page. Lines removed inside a covered page are counted separately: 5150ac47
has 101 diagram-label lines removed (`metrics.diagramLabels`); the other files have 0.

## Remaining failures

- **5150ac47** and **f692654d**: paragraphs-suspect. Most non-terminal "paragraphs" are table
  cells and list items (1–8 words each). In f692654d, paragraph ends are also full-width
  lines, so real paragraph breaks cannot be recovered from geometry.

## Next candidates (not started)

- Table and list detection (would address both remaining failures).
- Remove `spaceless-keys` and `toc-anagram` (no measured effect; see `docs/ingest-rules.md`).

## Round 3 (2026-10-01): ligatures, 7 fixtures

74b4b9e2 is back in `tests/fixtures/pdf` (7 fixtures). Cause, rules and ablation:
`docs/ingest-rules.md`, round 3. The success criterion did not change.

| Step | Change | Auto-success | Main measured effect |
|---|---|---|---|
| 15 | raw-ligatures, reversed-multi, glyph-names, ligature-solver, lossy-repair (gated), pair-order (document level); word list; correct-form check, dictionary coverage, unresolved-glyph routing | 5/7 | Top function words in correct form: 0.64–0.80 → ≥0.989 in **all 7 files** (the defect was in every file, and no earlier metric saw it). 5150ac47: TOC chapters 21 → 23 (all 23 TOC lines). |

### Current table (step 15, `--label "ligatures"`, commit ad11251)

| File | Pages | Score | Chapters | Notes | Issues | Recommendation | Success |
|---|---|---|---|---|---|---|---|
| 007572a7 | 116 | 0.928 | 3 toc | 27/27 | minor isolated-letters(2) | ok 0.81 | yes |
| 0f1b65bc | 368 | 0.945 | 25 toc | 10/10 | minor isolated-letters(2) | ok 0.86 | yes |
| 35590259 | 88 | 0.938 | 3 headings | 0/0 | - | ok 0.83 | yes |
| 5150ac47 | 284 | 0.930 | 23 toc | 275/288 | paragraphs-suspect | review 0.76 | no |
| 74b4b9e2 | 220 | 0.961 | 18 toc | 39/40 | - | ok 0.88 | yes |
| f42c7b4f | 56 | 0.924 | 4 toc | 0/0 | - | ok 0.79 | yes |
| f692654d | 192 | 0.970 | 4 toc | 99/99 | paragraphs-suspect | review 0.84 | no |

### Text-layer metrics, before → after (before = step 13, or step 10 for 74b4b9e2)

| File | Function words /1000 tokens | Correct-form share | Dictionary coverage | Multi-letter glyphs restored | Glyphs from names |
|---|---|---|---|---|---|
| 007572a7 | 217.9 → 270.5 | 0.797 → 0.998 | 0.723 → 0.782 | 2,112 | 0 |
| 0f1b65bc | 178.4 → 216.9 | 0.792 → 0.989 | 0.651 → 0.692 | 3,023 | 0 |
| 35590259 | 181.7 → 237.9 | 0.744 → 0.998 | 0.762 → 0.831 | 1,672 | 0 |
| 5150ac47 | 127.7 → 200.0 | 0.642 → 0.999 | 0.739 → 0.826 | 4,806 | 25 |
| 74b4b9e2 | 167.7 → 240.9 | 0.698 → 1.000 | 0.768 → 0.858 | 6,074 | 0 |
| f42c7b4f | 146.6 → 212.3 | 0.658 → 0.995 | 0.742 → 0.811 | 713 | 0 |
| f692654d | 186.4 → 258.4 | 0.692 → 0.999 | 0.732 → 0.813 | 4,117 | 0 |

"Before" for the share and coverage columns is the same code with raw-ligatures off (ablation,
with the word list). Unchanged elsewhere: notes, bracket errors,
isolated letters, paragraph metrics except 0f1b65bc (paraTerm 0.853 → 0.860, residual repeats
12 → 9) and 74b4b9e2 (paraTerm 0.908 → 0.924).

**The document score barely moves** (−0.011 to +0.003). It is self-calibrated on the document's own
best pages, so a defect present on every page does not lower it. The correct-form check is what
now routes such a file: with the new rules off, 74b4b9e2 is `review 0.82` with the major issue
`reversed-ligatures` (it was `ok 0.88` before this round).

### 74b4b9e2 per failure type (`node tools/audit-text.mjs`), all new rules off → on

| Failure type | Before | After |
|---|---|---|
| Reversed ligature pairs, top function words | 4,592 broken / 9,197 correct | 3 / 13,786 |
| Reversed pairs, general (not in the list; one pair swap gives a word of rank ≤ 2000) | 4,608 tokens | 10 |
| Examples (correct/broken): بين, في, المعتقدات, وغير, على, إلى | 0/219, 0/2163, 0/1, 0/13, 0/1363, 0/629 | 219/0, 2163/0, 1/0, 13/0, 1363/0, 629/0 |
| الحرية | 106/0 | 106/0 (never broken in this file) |
| Unmapped glyphs (boxes, PUA, U+FFFD, controls) | 0 | 0 |
| Lossy forms of top function words (عل, إل, …) | 2 | 2 (both are words in the list, so not repaired) |
| Lossy, general (not in the list; one ى/ا gives a word of rank ≤ 2000) | 44 | 45 (an upper bound: mostly correct rare words, see rules round 3) |
| Guillemets / quotes in wrong order | 0 of 140 / 0 of 9 | 0 of 141 / 0 of 9 |
| Recommendation | review 0.82 (reversed-ligatures) | ok 0.88 |

### Timing

Per-file times went up in this run (e.g. 0f1b65bc 4.6s → 13.6s), but they are noisy on this
machine: two direct reruns of 0f1b65bc took 6.0s and 8.6s, and an earlier history run took 8.1s.
Measured stage costs: glyph stage about 0.2s, scoring about +0.2s on 0f1b65bc. Extraction now also
exports font properties and builds the glyph census; its extra cost is **[UNVERIFIED]** (within the
noise). Peak memory: +0 to +100 MB (5150ac47 406 → 506 MB, which is also noisy between runs).

### [UNVERIFIED]

- ligature-solver, lossy-repair and pair-order change nothing on these fixtures; they are backed
  by synthetic tests only.
- The viewer-copy failures in the original report (boxes, عل/إل, »…«) were not reproduced through
  pdf.js; whether other viewers or other files produce them through pdf.js is untested.
- All 7 files come from one publisher. The reversed-ligature defect is a pdf.js behaviour and
  should occur in any visual-order PDF with ligature glyphs, but only this publisher was tested.
- The dictionary-coverage floor (0.6) is set from these 7 files only.
