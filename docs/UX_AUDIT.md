# UX Audit — Maktabati

Date: 2026-11-12 · Branch: `ux/polish-pass` · Method: every flow walked as a first-time and daily
user on a 375px mobile and 1440px desktop viewport, light + dark theme, Arabic + English UI.
Evidence collected with a CDP driver (screenshots in `out/ux-audit/`, geometry/contrast/overflow
dumps, accessibility tree, console log). Findings were confirmed by measuring the rendered DOM,
not by inspection alone.

Summary: **3 high · 6 medium · 5 low**. The app is in good shape: labels, empty states, error
messages, safe-area insets, EN coverage, reduced-motion, and the key-only AI settings are already
solid. The gaps concentrate in destructive-action safety, small tap targets, dialog keyboard
handling, and iOS input zoom.

| # | Area | Problem | Severity | Fix |
|---|---|---|---|---|
| 1 | Highlights | Deleting a highlight is one tap with no confirm and no undo. It also drops the review card and unlinks it from other highlights, so a miss-tap loses note + links + card silently. | high | Undo toast: restore the highlight, its review card, and the links removed from other highlights. |
| 2 | Keyboard / dialogs | Modals, sheets, and the chat panel do not trap focus and do not restore focus on close; Tab walks into the background page. | high | Small shared focus trap (cycle within the open dialog) + remember and restore the previously focused element on close. |
| 3 | Inputs (mobile) | `.inp` and `.search input` use `.95rem` (15.2px) — below the 16px threshold, so iOS auto-zooms the page when a field gains focus. | high | `font-size: max(.95rem, 16px)` on mobile. |
| 4 | Chat | Deleting a conversation confirms but offers no undo; a running reply is aborted and the record is gone for good. | medium | Undo toast that restores the conversation record. |
| 5 | Library | Empty library is text-only; the primary action (+ أضف) sits at the top of the page. | medium | Inline "أضف كتاب" button inside the empty state. |
| 6 | First run | Seeded demo books appear with no explanation; a new reader cannot tell they are samples. | medium | One-line dismissible hint on the library when the demo seed is present. |
| 7 | Tap targets | Measured below 44px: `.read-btn` (40px), `.brand` (39×32), `.ch-full` checkbox label (32px). Chat chips/scope buttons are visually 32px but hit 44px via `::after` — acceptable. | medium | `min-height:44px` for `.read-btn`, `.ch-full`; `min-height:40px` for `.brand`. |
| 8 | Toasts | Fixed 2.2s duration; long messages (storage warnings, errors) disappear before they can be read. | medium | Scale duration with text length, capped at ~5s. |
| 9 | Keyboard / dialogs | Rename-chat and note-on-highlight fields do not submit on Enter. | medium | Wire Enter to the primary button in those two dialogs. |
| 10 | Toasts (mobile) | `#toast` uses `bottom:24px` without the safe-area inset; on phones with a home indicator it sits at the very edge. | low | `bottom: max(24px, calc(12px + env(safe-area-inset-bottom)))`. |
| 11 | Toasts (a11y) | The "وصل الرد" action toast renders a button inside `role="status"`; acceptable, but the button is announced as part of the status text. | low | Keep role but give the button its own label; no structural change. |
| 12 | Chat panel | Mode chips and scope segment are visually 32px on a fullscreen mobile panel; usable but cramped next to 44px controls. | low | Leave as-is (hit area is already 44px); revisit with the next visual refresh. |
| 13 | Library | Search field offers no quick-clear affordance beyond the native `type=search` clear (which varies by browser). | low | Leave as-is. |
| 14 | Reader | Toast during reading can overlap the reading-template bottom overlay (rt-ovb) when it is open. | low | Leave as-is (overlay closes on interaction); toast z-index already wins. |

Verified as already good (no change needed): key-only AI settings with advanced fields hidden,
provider detection hint, first-translation consent, translation progress/cancel/resume,
background chat streaming + "reply arrived" toast + unread dot (PR #7), error messages with a
next step, review-card reveal (44px), reading position resume, safe-area insets on composer and
pills, EN UI switch (LTR + translated strings), reduced-motion support, empty states for
glossary/quotes/map/search, delete-book confirm with export-first, and a clean console on all
walked flows (no errors).

## What will be fixed (Phase 2)

1. Undo toast for highlight deletion (also restores card + links). — high #1
2. Focus trap + focus restore for modals/sheets/chat panel. — high #2
3. iOS input zoom fix for `.inp` / `.search input`. — high #3
4. Undo toast for conversation deletion. — medium #4
5. Inline add action in the empty library. — medium #5
6. Dismissible demo hint on first run. — medium #6
7. Tap-target bumps: `.read-btn`, `.ch-full`, `.brand`. — medium #7
8. Toast duration scaling + safe-area bottom. — medium #8 + low #10
9. Enter-to-submit in rename/note dialogs. — medium #9

## Small additions planned (Phase 3, ≤8)

1. Undo toast after deleting a highlight (restores highlight, note, links, review card).
2. Undo toast after deleting a chat conversation.
3. Inline "أضف كتاب" action in the empty library state.
4. First-run hint that the seeded books are samples.
5. "وصل الرد" toast includes the conversation's title snippet so several background replies are distinguishable.
