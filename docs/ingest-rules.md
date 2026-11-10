# Ingest rules

Every repair and structure rule is listed in `packages/ingest/src/rules.js`, with what the
pipeline does when the rule is off. This file records the evidence for each rule.

## Evidence base

- 6 PDF fixtures in rounds 1–2; 7 since round 3, when 74b4b9e2 returned to `tests/fixtures/pdf`.
  All come from **one publisher** (profile `hindawi`, producer iTextSharp).
- Metrics only, no text reading: see `tools/lib/metrics.mjs` for the list and direction.
- Everything below describes these files. It is not evidence about Arabic PDFs in general.

## Ablation (`node tools/ablate.mjs`)

Each rule is switched off alone, and every metric is compared with the all-rules run.
"Files worse" is the number of files where at least one metric got worse beyond noise
tolerance. Run on 2026-09-30 at d5ac533 (before iterations 1 and 2); the two rules added
afterwards were ablated at their own commits (last two rows).

| Rule | Stage | Files worse | Examples of metrics worse when off | Metrics better when off |
|---|---|---|---|---|
| strip-controls | normalize | 2 | 007572a7:score 0.939->0.729; 007572a7:fw 217.9->162.2 (+10) | 0 |
| order-items | reorder | 6 | 007572a7:score 0.939->0.906; 007572a7:fw 217.9->197.7 (+25) | 3 |
| mirror-brackets | reorder | 6 | 007572a7:bracketBad 0.064->0.936; 007572a7:paraTerm 0.941->0.903 (+14) | 0 |
| stat-reverse | normalize | 0 | - | 0 |
| attach-marks | normalize | 0 | - | 0 |
| nfkc-forms | normalize | 6 | 007572a7:score 0.939->0.373; 007572a7:fw 217.9->43.8 (+38) | 0 |
| strip-tatweel | normalize | 0 | - | 0 |
| gap-space | normalize | 2 | 007572a7:score 0.939->0.73; 007572a7:fw 217.9->162.1 (+10) | 0 |
| sup-markers | normalize | 4 | 007572a7:notesLinked 27->0; 007572a7:linkRate 1->0 (+11) | 2 |
| columns | layout | 0 | - | 0 |
| paragraphs | layout | 6 | 007572a7:paraTerm 0.941->0.291; 007572a7:major 0->1 (+12) | 1 |
| relative-indent | layout | 4 | 007572a7:paraTerm 0.941->0.893; 0f1b65bc:paraTerm 0.853->0.823 (+2) | 0 |
| verse | layout | 3 | 007572a7:paraTerm 0.941->0.604; 007572a7:major 0->1 (+6) | 0 |
| page-numbers | clean | 0 | - | 0 |
| running-headers | clean | 6 | 007572a7:fw 217.9->214.7; 007572a7:residual 0->110 (+19) | 2 |
| title-echo-headers | clean | 2 | 0f1b65bc:residual 12->25; 0f1b65bc:paraTerm 0.853->0.842 (+1) | 0 |
| footnotes | structure | 5 | 007572a7:notesLinked 27->0; 007572a7:paraTerm 0.941->0.936 (+11) | 4 |
| endnotes | structure | 1 | 5150ac47:notesLinked 157->0; 5150ac47:linkRate 0.4373->0 | 1 |
| endnote-align | structure | 1 | 5150ac47:notesLinked 157->55; 5150ac47:linkRate 0.4373->0.1532 | 0 |
| headings | structure | 6 | 007572a7:chaptersOk 1->0; 007572a7:paraTerm 0.941->0.824 (+20) | 6 |
| merge-heading-lines | structure | 0 | - | 0 |
| outline-chapters | structure | 0 | - | 0 |
| spaceless-keys | structure | 0 | - | 0 |
| toc-anagram | structure | 0 | - | 0 |
| toc-titles | structure | 0 | - | 0 |
| toc-chapters | structure | 5 | 007572a7:paraTerm 0.941->0.933; 0f1b65bc:paraTerm 0.853->0.839 (+3) | 0 |
| heading-chapters | structure | 1 | 35590259:chaptersOk 1->0; 35590259:major 0->1 (+1) | 1 |
| drop-front-matter | assemble | 2 | f42c7b4f:paraTerm 1->0.994; f692654d:paraTerm 0.75->0.74 | 6 |
| cross-page-paragraphs | assemble | 6 | 007572a7:paraTerm 0.941->0.878; 0f1b65bc:paraTerm 0.853->0.8 (+6) | 1 |
| figures | assemble | 1 | 5150ac47:paraTerm 0.447->0.438; 5150ac47:figures 162->0 (+1) | 0 |
| captions | assemble | 1 | 5150ac47:paraTerm 0.447->0.435; 5150ac47:captions 115->0 | 0 |
| cover-pages | score | 6 | 007572a7:vision 0->1; 0f1b65bc:vision 0->1 (+4) | 0 |
| hyphen-join | assemble | 0 | - | 0 |
| endnote-continuity | structure | 1 | 5150ac47: notesLinked 275→157; linkRate 0.955→0.437 (+1) | 0 |
| diagram-labels | clean | 1 | 5150ac47: paraTerm 0.472→0.447; residual 0→3 (+2) | 1 (captions 113→115) |
| raw-ligatures | extract | 7 | 007572a7: fwCorrect 0.998→0.797, major 0→1, success 1→0; 74b4b9e2: fwCorrect 1.000→0.698 (all 7 files) | 2 (doc score +0.002…+0.009) |
| reversed-multi | glyphs | 7 | 74b4b9e2: fwCorrect 1.000→0.968, fw 240.9→234.1; 5150ac47: fwCorrect 0.999→0.962 (all 7 files) | 2 (doc score +0.002) |
| glyph-names | glyphs | 1 | 5150ac47: unresolved 0→0.0001, vision pages 0→17, major 1→2 | 0 |
| ligature-solver | glyphs | 0 | - (no unknown glyph left after glyph-names) | 0 |
| lossy-repair | normalize | 0 | - (document-level gate never opens; see round 3) | 0 |
| pair-order | normalize | 0 | - (document-level guard; see round 3) | 0 |

The last six rows were ablated on 2026-10-01 over **7 fixtures** (74b4b9e2 is back in
`tests/fixtures/pdf`). ligature-solver, lossy-repair, reversed-multi and glyph-names were rerun
with the word list (raw-ligatures and pair-order do not use it). With the list, reversed-multi
also lowers dictionary coverage in all 7 files when off (e.g. 74b4b9e2 0.858→0.800). "Better when off" for raw-ligatures and
reversed-multi is the self-calibrated document score, which rises slightly on broken text: that
score cannot see reversed ligatures, which is why the correct-form check was added (round 3).

## Rules with no measured effect (11)

The project rule is: a rule whose removal worsens nothing must be removed or justified.
None has been removed yet; this is the justification, or the removal proposal.

| Rule | Status | Reason |
|---|---|---|
| stat-reverse | keep (guard) | No fixture page is stored in visual order. Guards other producers. [UNVERIFIED] on real input. |
| attach-marks | keep (guard) | No fixture has separated diacritic items. [UNVERIFIED] on real input. |
| strip-tatweel | keep (guard) | Fixtures contain no tatweel. Cheap and safe. |
| columns | keep (guard) | No fixture has two-column pages. [UNVERIFIED] on real input. |
| page-numbers | keep (guard) | Probably redundant here because running-headers also catches repeated page-number lines. [UNVERIFIED]. It may matter for books with fewer repeats. |
| merge-heading-lines | keep (guard) | No two-line heading changes a metric here. [UNVERIFIED]. |
| outline-chapters | keep (guard) | No fixture has a PDF outline. [UNVERIFIED] on real input. |
| hyphen-join | keep (guard) | Latin-only rule; the fixtures are Arabic. |
| toc-titles | keep | Changes chapter titles, which no metric measures. [UNVERIFIED]. |
| spaceless-keys | **propose removal** | Added for the step-10 investigation. No effect alone, and no effect with toc-anagram also off: 0f1b65bc still starts at p7 with 0 dropped pages. It loosens matching, so it can cause false matches. |
| toc-anagram | **propose removal** | Same as above: step 10's recovery of 102 pages came from the other step-10 changes, not from this rule. |

## Rules tried in this round (general, not file-specific)

1. **Endnote continuity** (kept). In a notes section, a leading number starts a new entry
   only if it continues the numbering (last+1 to last+3) or restarts at 1. Earlier findings
   said 5150ac47's notes were "keyed by page range". That was wrong: the notes are numbered,
   but wrapped citation lines that start with a page range or a year were being read as new
   entries, which split the notes into 73 broken sequences (now 20).
2. **Diagram labels** (kept). A short line that touches neither edge of the text frame (by at
   least 15% of its width) and is off-center is a label of a vector diagram. The first
   version (margin 1.5 × body size) also removed bullet lists and indented verse in 4 files,
   so it was tightened. It now touches only the file with diagrams.
3. **Paragraph recovery for unindented text** (not added). In f692654d, paragraph-final
   lines are full width with no indent, so geometry has no paragraph signal. The only
   candidate, "a line ending in punctuation ends the paragraph", splits at sentences and
   would raise the paragraph metric without recovering real paragraphs. Most of the
   remaining non-terminal "paragraphs" in f692654d and 5150ac47 are table cells and list
   items (1–8 words). That needs table/list detection, which is a separate rule family.

## Round 3 (2026-10-01): broken text layer, ligatures

Trigger: 74b4b9e2 (returned to the fixtures) copied out of a PDF viewer showed reversed ligature
pairs, boxes, lossy mappings and reversed guillemets, yet the engine routed it `ok 0.88`.

**Measured cause (glyph level, `node tools/inspect-pdf.mjs`, `tools/audit-text.mjs`).** Not the
font data: 74b4b9e2 has no glyph with a missing or PUA mapping, and its 12 embedded TrueType
subsets carry no glyph names (no `post` or `cmap` table). The damage is made by pdf.js:
1. Its text content expands ligature glyphs (U+FC00–FD3D, e.g. U+FC32 = في, U+FC86/FC43 = لى)
   into separate letters **before** reversing right-to-left chunks, so the letters come out
   reversed: في as يف, على as عىل, إلى as إىل. Fix: read text with `disableNormalization` and map
   presentation forms after reordering (`raw-ligatures`).
2. A glyph whose ToUnicode entry is several letters (ين, لم, ير) is reversed with the chunk
   (`reversed-multi`). Ordinary glyphs in these fonts map to presentation forms, so the reversed
   base-letter sequence only arises from those glyphs; the swap is applied per font, only when
   known words become far more frequent (at least 5, and 3× the count before).

**All 7 fixtures had both defects** (في reversed in ~99% of occurrences), including the files the
benchmark counted as successes: no metric measured it. The boxes and lossy forms in the report
come from the viewer's own copy function; pdf.js reads those glyphs correctly in 74b4b9e2.

| Rule | Evidence on the fixtures | Status |
|---|---|---|
| raw-ligatures | all 7 files; top function words correct share 0.64–0.80 → ≥0.989 | kept |
| reversed-multi | all 7 files; 713–6,036 glyph sequences restored per file | kept |
| glyph-names | 5150ac47: 25 glyph codes in simple-font subsets have no ToUnicode entry; pdf.js emitted their raw codes as ASCII (`$`, `K`, `7`). Their /Differences names (`uni06440645.init`, `uni064A0631.fina`, …) now give the letters | kept |
| ligature-solver | no fixture has an unknown glyph left after glyph-names | kept (guard), **[UNVERIFIED]** on real input; synthetic tests only |
| lossy-repair | no fixture has lossy mappings through pdf.js (lossy function-word forms: 0–2 per file) | kept (gated guard), **[UNVERIFIED]**; synthetic tests only |
| pair-order | guillemets are already mirrored by mirror-brackets on all fixtures | kept (guard), **[UNVERIFIED]** |

**pair-order was first written per line and was wrong.** A line may legitimately close one quote
and open the next (» … «). The per-line version "improved" the bracket metric in 6 files while
turning such lines into nested quotes (7 paragraphs changed in two files, all well-formed before).
It is now decided per document: a pair type is mirrored only when closing-first lines are at least
5 and more than twice the opening-first lines.

**Glyph classes** (`glyphs.js`): *missing* (empty, control, or pdf.js's raw-charcode fallback for a
code absent from ToUnicode), *pua*, *multi* (≥2 Arabic letters), *empty* (no usable mapping, but
the glyph is not in the font program, so nothing is drawn: 007572a7 and 0f1b65bc have 17,176 and
130,600 such NUL glyphs), *ok*. Unknown = missing or pua. Unknown glyphs not resolved by name or
by the solver (confidence below 0.6) are *unresolved*: their pages are routed to vision.

**Ligature solver** (`ligsolver.js`): one variable per (font, glyph code), a fixed candidate list
(`LIGATURES` in `text.js`), scored over every token containing the glyph: dictionary coverage +
0.1 × character-trigram likelihood (model trained on the document's clean tokens) + small
exact-spelling and frequency terms. Confidence = margin to the best candidate with a different
folded spelling / 0.2, × min(1, tokens/5) × min(1, coverage/0.5). Coordinate ascent, 3 passes.

**lossy-repair as first specified fired 96–708 times per file, all false.** The rule "not a known
word, and one inserted ى/ا gives a very common word" repaired correct rare words that the 50k
subtitle list does not contain, and (a bug) letter runs between diacritics inside vowelled words.
These files have no lossy mappings (the lossy forms of the top function words occur 0–2 times),
so every one of those repairs was wrong. Now: whole tokens only, and only in a document whose
top function words show lossy forms (at least 10, and at least 5% of those words' occurrences).
Note: عل and إل are themselves in the list (ranks 7,036 and 299), so the rule, which never
repairs a known word, cannot fix على/إلى read as عل/إل; it fixes lossy forms that are not in the list.

**Dictionary coverage** (Arabic tokens found in the list): 0.69–0.86 on the 7 fixtures after the
repairs, 0.65–0.77 with raw-ligatures off. The `low-dictionary-coverage` issue fires below 0.6,
a floor for garbage text layers. On these files coverage alone does not separate broken from
repaired text (gap 0.04–0.09); the function-word check does.

**Word list.** `packages/ingest/data/ar-words.txt`: hermitdave/FrequencyWords `ar_50k`
(OpenSubtitles 2018), commit `525f9b56`, **CC BY-SA 4.0**, attribution to Hermit Dave and
OpenSubtitles. Kept as published plus one header line. The in-memory folding (diacritics, alef
forms, ى/ي) is an adaptation and stays under CC BY-SA 4.0. Full notice: `THIRD_PARTY_NOTICES.md`.
Loaded behind `lexicon.js` (`{ has, rank, exactRank, size }`), so it can be swapped for a
book-based list. Backlog: the app's About screen must show the attribution (`docs/backlog.md`).

## Generalization (`node tools/generalize.mjs`)

**Single publisher: weak evidence.** All fixtures share one fingerprint, so the split is by
file (3 and 3), not by publisher. Four numeric parameters were grid-tuned on one half and
tested on the other, both ways.

| Split | Set | Success | Mean score | Link rate | Para-terminal |
|---|---|---|---|---|---|
| tune A → test B | test, defaults | 1/3 | 0.946 | 0.812 | 0.683 |
| tune A → test B | test, tuned | 1/3 | 0.946 | 0.812 | 0.685 |
| tune B → test A | test, defaults | 3/3 | 0.933 | 1.000 | 0.977 |
| tune B → test A | test, tuned | 3/3 | 0.932 | 1.000 | 0.977 |

Tuning moves nothing beyond noise on either side, so the defaults are not overfitted to
either half. This says nothing about other publishers. (Run at d5ac533, before iterations 1
and 2.)
