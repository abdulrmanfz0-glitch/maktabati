# Manual test checklist: Maktabati

I wrote this list by reading the app source. It is not the result of running the app.
Sections 0 to 18 were written for the original "My Library.html"; line numbers there point to the decoded app source of that time (see `docs/phase1-analysis.md`, section 0) and are now approximate. Sections 19 to 27 cover features added later (updated 2026-10-01).

**Which build to test.** The source is `apps/web`. Run the checks on any of:
- the dev server: `npm run dev`, then open http://localhost:5173/
- the web build: `npm run build:web`, then `npm run preview`
- the single file: `npm run build:single`, then open `dist/single/index.html` by double-clicking it
- the original bundle "My Library.html" (kept as the reference)

Automated: `node tests/e2e/smoke.mjs <page>` runs the [SMOKE] items that can be checked in headless Chrome (see section 27).

Items marked **[UNVERIFIED]** depend on something I could not confirm by reading: visual layout, animation, timing, network, browser APIs, or a real AI key. Check them with extra care.

UI labels are written as `English meaning (Arabic label)`. The Arabic label is the text you will see on screen.

**Smoke set.** After every Phase 1 extraction, run the items tagged **[SMOKE]**. They take about 10 minutes. Run the full list at the end of Phase 1.

---

## 0. Setup

- [ ] **SET-01 [SMOKE]** Open the app (see "Which build to test" above). For the original bundle, run `python -m http.server 8000` and open `http://localhost:8000/My%20Library.html`.
  **Expected:** the app loads in Arabic RTL with no error bar. The original bundle first shows "Unpacking..." at the bottom; the Vite builds do not (expected).
- [ ] **SET-02** On a fresh origin with an empty library (first load on localhost, or a new browser profile), open Library.
  **Expected:** two demo items are created automatically: the book «آلة التجربة» and the explainer «لماذا ننسى، وكيف نتذكّر؟». The sidebar Review badge shows **3**.
  Note: on a new origin the library is **not empty**. It holds these two demo items (`seed()`, line 2224). The seed runs only once per origin (the kv flag `seeded`).
- [ ] **SET-03** Import your real export file (see IMP-01) so that later tests run on real data.
- [ ] **SET-04 [SMOKE]** Reload the page (F5).
  **Expected:** all items, highlights, notes, and settings are still there. Data is saved in IndexedDB database `maktabati`.
- [ ] **SET-05 [UNVERIFIED]** Open the same file by double-clicking it (`file://`).
  **Expected:** it works. The library there is separate from the localhost one, because each origin has its own storage.

## 1. Sidebar and navigation

- [ ] **NAV-01 [SMOKE]** On desktop (window at least 900px wide), the sidebar is visible. Click each item in turn: New chat (محادثة جديدة), Library (المكتبة), My quotes (اقتباساتي), My highlights (تظليلاتي), Today's review (مراجعة اليوم), My glossary (قاموسي), Idea map (خريطة أفكاري), Template gallery (معرض القوالب), and the profile chip at the bottom.
  **Expected:** the URL changes to `#/`, `#/lib`, `#/quotes`, `#/hlall`, `#/review`, `#/glossary`, `#/map`, `#/templates`, `#/profile`. The right view shows and the active item is highlighted. Old links to `#/settings` open `#/profile/ai`.
- [ ] **NAV-02** Click Upload (ارفع) in the sidebar.
  **Expected:** the upload sheet opens (see UP-01).
- [ ] **NAV-03** Click the collapse icon at the top of the sidebar.
  **Expected:** the sidebar hides and the top bar with the ☰ button appears. Click ☰ and the sidebar returns. The state survives a reload (localStorage `reader:side`).
- [ ] **NAV-04 [SMOKE]** At phone width (390px in DevTools), tap ☰.
  **Expected:** the sidebar slides in over a scrim. Tapping the scrim closes it. Tapping any link closes it.
- [ ] **NAV-05 [UNVERIFIED]** On a touch device, swipe the open sidebar toward its edge by more than 60px.
  **Expected:** it closes.
- [ ] **NAV-06** Sidebar "Currently reading" (أقرأ حالياً) section.
  **Expected:** it lists up to 6 items with progress between 1% and 98%, each with a percentage. Clicking one opens it.
- [ ] **NAV-07** Sidebar "Chats" (المحادثات) section.
  **Expected:** it lists recent home chats and book chats (up to 15). Clicking a home chat opens `#/c/<id>`. Clicking a book chat opens that book with its chat panel.
- [ ] **NAV-08** Click the moon/sun button in the sidebar footer.
  **Expected:** dark mode toggles. Toggling back returns to the last light theme (light or sepia).
- [ ] **NAV-09** Open a URL with an unknown id, for example `#/read/nope`.
  **Expected:** it redirects to `#/`.
- [ ] **NAV-10** Press Escape with a modal, the sidebar, the book chat, a sheet, or the drawer open.
  **Expected:** only the topmost one closes, in this order: modal, sidebar (mobile), book chat, sheet, drawer.

## 2. Home chat (`#/`)

- [ ] **HOME-01 [SMOKE]** Open `#/` with no messages.
  **Expected:**
  - The heading "What do you want to read today?" (وش تبي تقرأ اليوم؟) with a composer below it.
  - Suggestion chips: Continue <book> (أكمل) if any item is in progress, Today's review (مراجعة اليوم) with a count if cards are due, and Add book (أضف كتاب).
  - A "Read" (أقرأ) button that goes to `#/lib`.
- [ ] **HOME-02 [SMOKE]** Type `راجع` and press Enter. No AI key is needed.
  **Expected:** the reply "Opening today's review." (أفتح لك مراجعة اليوم.), then about 0.5s later the app navigates to `#/review`.
- [ ] **HOME-03** Type `اضف كتاب` and press Enter.
  **Expected:** a short reply, then the upload sheet opens.
- [ ] **HOME-04** Type `افتح آلة التجربة` and press Enter.
  **Expected:** a book card with a "Continue reading" (أكمل القراءة) button. Clicking it opens the book.
- [ ] **HOME-05** Type a book name that matches more than one book.
  **Expected:** up to 4 book cards under the text "I found more than one book — pick one:" (لقيت أكثر من كتاب، اختر:).
- [ ] **HOME-06 [SMOKE]** With no AI key saved, ask a normal question.
  **Expected:** a warning message with a link to Settings (الإعدادات). No network request is made.
- [ ] **HOME-07** After the first message, check the URL and sidebar.
  **Expected:** the URL becomes `#/c/<id>` and the chat appears in the sidebar under "Chats". Reloading the page restores the conversation.
- [ ] **HOME-08** Press Shift+Enter in the composer.
  **Expected:** a new line is added. Enter alone sends. The Send button is disabled while the box is empty.
- [ ] **HOME-09** Click the paperclip and pick a `.md` or `.txt` file.
  **Expected:** the preview opens (UP-02). After saving, the toast says it was added (انضاف «…» لمكتبتك), and the app goes to Library (because you started on home).
- [ ] **HOME-10 [UNVERIFIED: needs AI key]** Ask a question about your library.
  **Expected:**
  - The reply streams in, with typing dots first.
  - The Send button becomes Stop, and clicking it stops the reply ("(stopped)").
  - The copy icon copies the reply.
  - A `[[book-id|n|label]]` reference shows as a colored chip that opens chapter n.

## 3. Library (`#/lib`)

- [ ] **LIB-01 [SMOKE]** Open Library.
  **Expected:**
  - Shelves: "Continue reading" (أكمل القراءة) for items in progress, then "Rest of the library" (باقي المكتبة) or "Library" (المكتبة).
  - Each card shows a colored cover, the type, the progress % or "Finished" (خلّصته) or "Not started" (ما بدأته), and when it was last opened.
- [ ] **LIB-02** Check the weekly line under the search box.
  **Expected:** "This week you read N min on D days" (هالأسبوع قريت …), or "nothing this week yet" (ما قريت شي هالأسبوع بعد.). Reading time is logged every 15s while the reader is visible and you were active in the last 90s.
- [ ] **LIB-03 [SMOKE]** Type 2 or more letters in the search box, for example `التنبؤ` (without hamza or diacritics).
  **Expected:** grouped results for titles, texts, highlights, and notes. The search ignores diacritics and treats أ/إ/آ = ا, ى = ي, and ة = ه. Clicking a text result opens the reader at that block and flashes it.
- [ ] **LIB-04** Clear the search box.
  **Expected:** the shelves come back.
- [ ] **LIB-05 [UNVERIFIED: animation]** Click a book cover.
  **Expected:** the cover expands to full screen, then the reader opens. With "reduce motion" turned on, it opens with no animation.
- [ ] **LIB-06** Footer links.
  **Expected:** Export library (تصدير المكتبة), Prepare for AI (جهّز للذكاء), Settings (الإعدادات), and Import library (استيراد مكتبة) are all present. See the IMP and AI sections.
- [ ] **LIB-07 [UNVERIFIED]** Open the page in a browser where IndexedDB is blocked.
  **Expected:** a notice in the footer says storage is unavailable and that you should export before leaving.

## 4. Upload (one entry point)

There is one upload action, «ارفع» (Upload). The user never picks a type: the format comes from the file content, and the type, title, author and language are guessed locally and shown in the preview for correction.

- [ ] **UP-01 [SMOKE]** Click «ارفع» in the sidebar (or "+ أضف" in the library, or "Add book" on home).
  **Expected:** a sheet with "Choose a file" (اختر ملف) and a box to paste text. No type choice.
- [ ] **UP-02 [SMOKE]** Upload a PDF book (40+ pages with chapters), a short PDF (under 15 pages, no chapters), an EPUB, a Markdown file, and a text file.
  **Expected:** each opens the preview (section 16 for PDF and EPUB). Guessed type: long PDF with chapters = Book; short PDF without chapters = Article; EPUB = Book unless very short; text and Markdown by length and headings.
- [ ] **UP-03** In the preview, change the type, title, author and language with one tap each, then save.
  **Expected:** the saved item uses the corrected values. Language sets the reading direction (Arabic RTL, English LTR).
- [ ] **UP-04** Title source.
  **Expected:** file metadata first, then the first heading, then the file name.
- [ ] **UP-05 [SMOKE]** Drag a file from the desktop anywhere onto the app.
  **Expected:** a "Drop the file here" (أفلت الملف هنا) overlay, then the same flow.
- [ ] **UP-06** Paste long text (400+ characters) while not typing in a field (outside the reader).
  **Expected:** the preview opens for the pasted text. Short pastes are ignored. Pasting inside a text field works normally.
- [ ] **UP-07** Use the chat paperclip.
  **Expected:** the same flow.
- [ ] **UP-08 [SMOKE]** Upload a «مكتبتي» export file (`maktabati-*.json`).
  **Expected:** a confirmation ("This is an export file with N items. Add them to your library?"), then the normal library import (IMP-01).
- [ ] **UP-09** Upload the same file again.
  **Expected:** "This file is already in your library", with "Open the existing copy" (goes to its book page) and "Add another copy". Books saved before this feature have no content hash and are not detected.
- [ ] **UP-10** Upload a file of another kind (an image, a zip).
  **Expected:** "I cannot read this kind of file…". Nothing is stored.
- [ ] **ADD-07 [UNVERIFIED: needs AI key]** Add an item while an AI key is saved.
  **Expected:** about 0.7s later the "Prepare for AI" modal is offered for that item.

## 5. Reader: layout and navigation

Use the demo book «آلة التجربة» (type book, paged) and the demo explainer (continuous scroll).

- [ ] **RD-01 [SMOKE]** Open the demo book.
  **Expected:**
  - The cover screen shows the title, subtitle, author, original title, and the "Why read it" (ليش أقرأه) line.
  - Below it is the "Chapters" (الفصول) map, with a status for each chapter: Not started (ما بدأت), Reading (أقرأ), or Done (خلّصت).
- [ ] **RD-02 [SMOKE]** Click the "Next" (التالي ←) pager, then "Previous" (→ السابق).
  **Expected:** the app moves between the cover, chapter 1, chapter 2, and the conclusion, one screen at a time. The URL stays `#/read/<id>`.
- [ ] **RD-03** Check a chapter screen.
  **Expected:** in order, it shows:
  1. A divider with the chapter number, question, and minutes.
  2. A "My prediction before reading" (توقّعي قبل القراءة) box.
  3. The chapter map (خريطة الفصل).
  4. Numbered sections, with ۞ between them.
  5. "Recall pause" (وقفة استرجاع) blocks. Tapping "Tap to see the answer" (اضغط لترى الجواب) reveals the answer.
  6. The end block, with my summary, review questions, a terms table, day/week/month checkboxes, my open questions, and the "Mark chapter: done" button.
- [ ] **RD-04 [SMOKE]** Type in the prediction and summary boxes, tick the "after a day" (بعد يوم) checkbox, then reload.
  **Expected:** the text and checkbox are restored. Text saves 300ms after you stop typing.
- [ ] **RD-05** Click "Mark chapter: done" (علّم الفصل: خلّصته).
  **Expected:** the button changes to ✓ "Done with this chapter" and the chapter map shows ● Done. Clicking again sets it back to Reading.
- [ ] **RD-06 [UNVERIFIED: IntersectionObserver]** Scroll a section into the middle of the screen.
  **Expected:** the chapter status becomes Reading if it was Not started. A recall card is scheduled for tomorrow.
- [ ] **RD-07 [SMOKE]** Scroll partway, go to Library, then open the book again.
  **Expected:** you return to the same screen and block. The progress % on the library card increases (it never decreases).
- [ ] **RD-08** Open the demo explainer (not a book).
  **Expected:** one continuous page with no pager. The scroll position is restored on reopen.
- [ ] **RD-09 [UNVERIFIED: visual]** Scroll down, then up.
  **Expected:** the thin progress bar at the top grows with scroll. The toolbar hides on scroll down and shows on scroll up or near the top.
- [ ] **RD-10** Click the back arrow.
  **Expected:** it returns to where you came from. Its label says Back to library (ارجع للمكتبة) or Back to chat (ارجع للشات).
- [ ] **RD-11** Click "↑ Back to the start" (↑ ارجع للبداية) on the last screen.
  **Expected:** it scrolls to the top.
- [ ] **RD-12** Import a book whose text is mostly English.
  **Expected:** the reader content switches to LTR. The UI stays Arabic.

## 6. Reader: toolbar tools

- [ ] **TB-01 [SMOKE]** Click the Contents icon (الفهرس).
  **Expected:** a drawer lists:
  - My highlights (تظليلاتي) with a count
  - Introduction and Book map
  - Chapters with statuses, and their sections
  - My bookmarks (علاماتي) and Key ideas from my sessions (أهم أفكار جلساتي), if any
  - Delete from library (احذف من المكتبة)

  Clicking a chapter or section jumps to it and switches screen if needed.
- [ ] **TB-02 [SMOKE]** In each template, read into the middle of a chapter and press the bookmark tool.
  **Expected:** the toast "Bookmark added" (حطيت علامة هنا). The marked paragraph is your place, not the start of the chapter or block: in scroll mode, the first paragraph whose top is at or below the top quarter of the screen; in page mode, the first paragraph that starts on the page (or the one continuing onto it). Reopening the tools shows the bookmark tool filled. Pressing it again removes the bookmark ("شلت العلامة").
- [ ] **TB-04 [SMOKE]** Open the bookmarks list (علاماتي) in the contents and pick a bookmark.
  **Expected:** each entry shows a short excerpt and its date. Picking one jumps to that exact paragraph and briefly highlights it. In «الكتاب» and «مخطوطة», pages with a bookmark show a small ribbon at the top edge. Bookmarks made before this version still open, at their old place.
- [ ] **TB-03** Click the bookmark icon while only the cover is visible.
  **Expected:** the toast "Scroll into the text to place a bookmark" (انزل للنص وحط العلامة).
- [ ] **TB-04** Click the reading-session icon and pick 15 (دقيقة 15).
  **Expected:** the toast "Started a 15-minute session". The minutes left show next to the icon. Clicking the icon again offers "Stop session" (أوقف الجلسة).
- [ ] **TB-05 [UNVERIFIED: needs a 15-min wait]** Let a session finish.
  **Expected:**
  - A modal asks "What was the key idea you read?" (وش أهم فكرة قريتها؟).
  - The modal cannot be closed by clicking the backdrop.
  - Save is disabled until you type.
  - The saved idea appears in the drawer and in library search.
- [ ] **TB-06 [SMOKE]** Click the search icon in the reader (ابحث في الكتاب) and type 2 or more letters.
  **Expected:** a result count and a list of results. Clicking a result closes the sheet, jumps to the block (switching screen if needed), and marks the match. The last query is remembered while the book is open.
- [ ] **TB-07 [SMOKE]** Click "Aa" (display options).
  **Expected:**
  - Mode: Light, Sepia, Dark (فاتح / ورقي / ليلي).
  - Font: Naskh or Amiri (النسخ / الأميري).
  - Font size: −3 to +5.
  - Line spacing: Normal or Wide.
  - Width: Narrow or Normal.
  - Diacritics: Shown or Hidden (ظاهر / مخفي).

  Each change applies at once. Reload and check that all of them persist (localStorage `reader:*`).
- [ ] **TB-08** Set diacritics to Hidden.
  **Expected:** tashkeel disappears from the book text and footnotes. The reader re-renders at the same block.
- [ ] **TB-09** Delete from library (drawer), and confirm.
  **Expected:** the item, its highlights, notes, statuses, and cards are removed. The toast says "Removed from library" (انحذف من المكتبة) and the app goes to `#/lib`.
- [ ] **TB-10 [UNVERIFIED: hover/long-press]** Hover over a toolbar icon with a mouse, or long-press it on touch.
  **Expected:** a tooltip shows the icon's label.

## 7. Reader: selection tools and highlights

- [ ] **SEL-01** On the first visit to a reader, before selecting anything.
  **Expected:** a hint says "Select any text to bring up highlight and explain tools". Closing it, or making the first selection, hides it for good.
- [ ] **SEL-02 [SMOKE]** Select a phrase inside one paragraph.
  **Expected:** a floating bar shows:
  - Important (مهم)
  - Unclear (ما فهمت)
  - Question (سؤال)
  - Explain this (اشرحها لي)
  - Term (مصطلح)
  - Meaning (معنى)
  - Quote (اقتباس)

  Meaning appears only for 3 words or fewer, Term for 6 or fewer, and Quote for 320 characters or fewer.
- [ ] **SEL-03 [SMOKE]** Click Important.
  **Expected:** the text gets a gold highlight and the toast says it will return in review. The highlight appears in the drawer count, on the book highlights page, and in "My highlights". It returns in review tomorrow.
- [ ] **SEL-04** Highlight with Unclear, then with Question.
  **Expected:** blue and red highlights with matching toasts. No review card is created for these.
- [ ] **SEL-05** Select across two paragraphs and click Important.
  **Expected:** the toast "Select within a single paragraph" (حدّد داخل فقرة وحدة). Nothing is saved.
- [ ] **SEL-06 [SMOKE]** Click an existing highlight.
  **Expected:** a sheet shows the quote, a kind switcher (Important / Unclear / Question), and the buttons Note (ملاحظة), Link to… (اربطه بـ…), Quote card (بطاقة اقتباس), and Delete highlight (احذف التظليل).
- [ ] **SEL-07** In the sheet, switch the kind from Important to Unclear.
  **Expected:** the color changes and the review card is dropped. Switching back reschedules it.
- [ ] **SEL-08** Click Note, type text, and save.
  **Expected:** the highlight gets a note marker and the note shows in the sheet.
- [ ] **SEL-09** Click Link to… and pick another highlight or term.
  **Expected:** the toast "Linked" (ربطتها). A "Linked to" (مربوطة بـ) list appears in both highlights' sheets. A gold line appears on the idea map.
- [ ] **SEL-10** Delete a highlight.
  **Expected:** the mark is removed and the toast says "Highlight removed" (شلت التظليل). Links to it are removed from other highlights.
- [ ] **SEL-11 [UNVERIFIED: clipboard]** Click Explain this with no AI key.
  **Expected:** a ready prompt with the paragraph is copied, and the toast says "Copied — paste it into any AI" (انسخت، الصقه في أي AI).
- [ ] **SEL-12 [UNVERIFIED: needs AI key]** Click Explain this with an AI key saved.
  **Expected:** the book chat opens in Explain mode, with the paragraph attached above the composer.
- [ ] **SEL-13** Click Term.
  **Expected:** an "Add term" modal, pre-filled with the selection. Saving underlines the term in the text, shows the toast "Added to glossary" (انضاف لقاموسي), and adds the term to My glossary.
- [ ] **SEL-14** Click an underlined term.
  **Expected:** a term sheet shows the definition and "Appears in" (ظهر في) chips.
- [ ] **SEL-15 [UNVERIFIED: opens external site]** Select one word and click Meaning.
  **Expected:** almaany.com opens in a new tab for that word, without diacritics.
- [ ] **SEL-16 [UNVERIFIED: canvas + fonts]** Click Quote.
  **Expected:**
  - The quote is saved to My quotes.
  - A modal shows a 1080×1350 PNG card with the book color, the quote, the title, and the author.
  - "Save image" downloads `اقتباس.png`.
  - "Share" appears only where the Web Share API supports files.

## 8. Footnotes and AI-labeled blocks

These need a test item. Save this as `fixture.json` and import it with "Import library":

```json
{"title":"Fixture","type":"book","chapters":[{"title":"One","sections":[{"title":"S","blocks":[{"type":"p","text":"Text with a note[^1]."},{"type":"box","kind":"explain","by":"ai","text":"AI-added explanation."}]}],"notes":[{"id":"1","text":"Footnote body."}]}]}
```

- [ ] **FN-01** Open "Fixture" and click the superscript `1`.
  **Expected:** a popover titled "Footnote 1" (حاشية 1) shows "Footnote body.". It closes when you click outside it, press Escape, or scroll.
- [ ] **FN-02** Look at the second block.
  **Expected:** a dashed frame labeled "Added for explanation" (إضافة للشرح). This is how AI additions are marked apart from the author's text.

## 9. Book highlights page (`#/hls/<id>`)

- [ ] **HLS-01** Open it from the drawer via My highlights (تظليلاتي).
  **Expected:** highlights are grouped by chapter, then by kind (Important, Unclear, Question). Your prediction, summary, and open-question notes show per chapter, and your "what I'll apply" note shows under Conclusion. Clicking any row opens the reader at that spot.
- [ ] **HLS-02 [UNVERIFIED: clipboard]** Click "Copy all" (انسخها كلها).
  **Expected:** plain text grouped by chapter and kind is copied, and the toast says "Copied all highlights".
- [ ] **HLS-03** Click "Explain what I didn't understand" (اشرح لي اللي ما فهمته).
  **Expected:** the button is disabled when there are no Unclear highlights. Otherwise it copies a prompt listing them.

## 10. My quotes and My highlights (all books)

- [ ] **QT-01** Open `#/quotes`.
  **Expected:** saved quotes, newest first, each with its source, chapter, and date. "Open in book" (افتح في الكتاب) jumps to the quote. "Quote card" (بطاقة اقتباس) opens the image modal.
- [ ] **HLA-01** Open `#/hlall`.
  **Expected:** highlights from all books, grouped by book with a total count. The filter chips All / Important / Unclear / Question work. "Book page" (صفحة الكتاب) opens `#/hls/<id>`.

## 11. Today's review (`#/review`)

- [ ] **REV-01 [SMOKE]** On a fresh seed, open Review.
  **Expected:** "Card 1 of 3" (بطاقة 1 من 3) shows the question, its source, and "Tap to see the answer".
- [ ] **REV-02 [SMOKE]** Reveal the answer and click "I remembered" (تذكّرتها).
  **Expected:** the next card appears and the sidebar badge goes down by 1.
- [ ] **REV-03** Reveal an answer and click "I forgot" (ما تذكّرت).
  **Expected:** the card resets and will return tomorrow.
- [ ] **REV-04** Finish all due cards.
  **Expected:** "You're done for today". If more than the daily limit was due, you see how many remain for tomorrow.
- [ ] **REV-05** Review 10 cards in one day.
  **Expected:** the message "You reviewed 10 cards today — that's enough", and the badge shows nothing more.
- [ ] **REV-06** Check where cards come from.
  **Expected:** recall pauses you scroll past, the end-of-chapter review questions, and Important highlights. Intervals are 1, 7, then 30 days. After 3 successful recalls a card retires.

## 12. My glossary (`#/glossary`)

- [ ] **GL-01** Open it.
  **Expected:** terms from the chapter term tables and terms you added, merged by normalized spelling and sorted in Arabic order. Each has English, a definition, and source chips.
- [ ] **GL-02** Type in the search box.
  **Expected:** the list filters by Arabic, English, or definition. When nothing matches, it says "No term by that name".

## 13. Idea map (`#/map`)

- [ ] **MAP-01 [UNVERIFIED: visual layout]** Open it.
  **Expected:**
  - Hubs for each book, dots for highlights and terms, and bigger gold dots for terms shared across books.
  - Dashed lines where a highlight contains a term, and gold lines for your manual links.
  - A legend below.
- [ ] **MAP-02 [UNVERIFIED]** Try + / − / ⤢, the mouse wheel, and drag to pan.
  **Expected:** it zooms, fits, and pans.
- [ ] **MAP-03** Click a highlight dot, a term dot, and a book hub.
  **Expected:** the highlight sheet, the term sheet, and a book sheet with Open (افتح), respectively. Enter or Space on a focused dot does the same.
- [ ] **MAP-04** Open it with no highlights and no terms.
  **Expected:** the text "Highlight ideas as you read and they'll show up here".

## 14. Settings (now Profile → AI, `#/profile/ai`; `#/settings` redirects there)

- [ ] **SETT-01 [SMOKE]** Open Settings.
  **Expected:**
  - An interface language switch.
  - The AI fields: API URL (default `https://api.deepseek.com`), Model (default `deepseek-chat`), and Key (hidden).
  - Save, Test connection, and Clear key buttons.
  - The "Prepare for AI" count: N of M chapters have a card.
- [ ] **SETT-02** Click Show (أظهر) and Hide (أخفِ).
  **Expected:** the key field toggles between password and text.
- [ ] **SETT-03** Enter a dummy key and click Save.
  **Expected:** "Saved. In this browser only." The key is stored in localStorage `maktabati:ai`.
- [ ] **SETT-04 [UNVERIFIED: network]** Click "Test connection" (جرّب الاتصال).
  **Expected:** "Connection works" with the model's reply, or an Arabic error explaining the cause: 401/403 means the key, 404 means the URL or model, and CORS means you should use a local server.
- [ ] **SETT-05** Click "Clear key" (امسح المفتاح).
  **Expected:** the key is emptied and the page says "Key cleared".
- [ ] **SETT-06 [SMOKE]** In Profile → Look (المظهر واللغة), switch the language to English.
  **Expected:**
  - The page reloads.
  - The UI chrome is English and LTR: sidebar, headings, buttons, toasts, and relative dates.
  - Book content and the reader stay untouched.

  Switch back to Arabic afterwards.
- [ ] **SETT-07 [UNVERIFIED]** Walk through every view in English.
  **Expected:** no leftover Arabic UI strings. Some strings are not in the dictionary, for example the delete confirm dialog and some settings hints. Note any leftovers.

## 15. AI features (need a real key) **[UNVERIFIED]**

- [ ] **AI-01** Click "Prepare for AI" in the library footer or Settings.
  **Expected:** a modal shows the number of chapters, requests, and approximate tokens. Start shows progress and Stop aborts. When done: "Prepared X of Y chapters". The demo book's chapter 1 already counts as ready, because it has an overview and terms. Chapter 2 does not.
- [ ] **AI-02** Click "Discuss the book" (ناقش الكتاب) in the reader toolbar.
  **Expected:** the chat panel opens with:
  - Mode chips: Explain, Quiz me, Debate me, Connect (اشرح / اسألني / ناقشني / اربط).
  - The "Allow the whole book" (اسمح بالكتاب كامل) checkbox.
  - History (السابقة), New chat, and Close.
- [ ] **AI-03** Click a mode chip with an empty composer.
  **Expected:** it sends that mode's default prompt.
- [ ] **AI-04** Tick "Allow the whole book", close the panel, and reopen it.
  **Expected:** the checkbox is still ticked for this book only.
- [ ] **AI-05** Ask about a chapter you have not reached, with "Allow the whole book" off.
  **Expected:** the reply stays general and does not spoil it. Only the current chapter's text is sent, plus chapter cards.
- [ ] **AI-06** Click History, then an old conversation, then New chat.
  **Expected:** each works. Close with X, the scrim, or Escape.

## 16. PDF and EPUB import (ingest engine)

PDF and EPUB files are converted by the ingest engine (`packages/ingest`) in a Web Worker. pdf.js and the engine load only when such a file is imported, and work offline (the single file embeds them; the web build serves them as its own files).

- [ ] **PDF-01 [SMOKE]** Import a text-based Arabic PDF.
  **Expected:**
  - A "Converting the file" (تحويل الملف) window shows "Reading pages… i of N" (أقرأ الصفحات…), then "Arranging chapters and notes…".
  - A preview shows the result in plain words: The text looks good / Check the text before relying on it / This file needs image reading (النص سليم / راجع النص قبل ما تعتمد عليه / هالملف يحتاج قراءة بالصور), any issues as a list, and pages that could not be read.
  - Below: type, title, author, language, the chapter list, and the first page of chapter 1. Save stores the book.
- [ ] **PDF-02** A PDF that the engine marks "review".
  **Expected:** saving is allowed, and the book page shows a warning box (تنبيه: هالكتاب محوّل من ملف ويحتاج مراجعة) with the issues.
- [ ] **PDF-03** A scanned PDF (no text layer).
  **Expected:** "This file needs image reading" with an explanation that this is not available yet. Save is disabled; nothing is stored.
- [ ] **PDF-04** A password-protected or damaged PDF.
  **Expected:** a clear message (محمي بكلمة مرور / ما قدرت أفتح الملف). Nothing is stored.
- [ ] **PDF-05** Footnotes and figures in an imported book.
  **Expected:** footnote numbers open the popup (Modern) or appear at the bottom of the page (The Book, Manuscript). Figures show in all templates; they are stored on the device (IndexedDB) and travel inside exports as data URLs.
- [ ] **PDF-06** Cancel during conversion.
  **Expected:** the window closes and nothing is stored.
- [ ] **EPUB-01** Import an EPUB.
  **Expected:** the same preview, with chapters from the EPUB table of contents, notes, and images.

## 17. Export and import

- [ ] **EXP-01 [SMOKE]** Click "Export library" (تصدير المكتبة).
  **Expected:** `maktabati-YYYY-MM-DD.json` downloads and the toast says "Library exported" (صدّرت المكتبة).
- [ ] **EXP-02 [SMOKE]** Open the exported file in a text editor.
  **Expected:**
  - Top-level fields `app:"maktabati"`, `v:1`, `exported`, `items`, `annos`, and `kv`.
  - Search the file for your API key. It must **not** be there.
- [ ] **IMP-01 [SMOKE]** Click "Import library" and pick an export file.
  **Expected:** the toast "Imported N items" (استوردت N عنصر), and the library re-renders. Records with the same id are overwritten. Nothing is deleted.
- [ ] **IMP-02** Import a single-item JSON file (like `fixture.json` in section 8), from Profile → Privacy or through Upload (UP-08).
  **Expected:** the toast says it was added (انضاف «Fixture»).
- [ ] **IMP-03** Import a JSON file with neither `items` nor `chapters`.
  **Expected:** the toast "The file isn't in the expected shape" (الملف مو بالشكل المتوقّع).
- [ ] **IMP-04** Import a non-JSON file renamed to `.json`.
  **Expected:** the toast "Couldn't read the file" (ما قدرت أقرأ الملف).

## 18. Other

- [ ] **OTH-01 [UNVERIFIED]** Print the reader view (Ctrl+P).
  **Expected:** all collapsed answers are expanded in the print. The toolbar, buttons, and pager are hidden, and the page uses print colors.
- [ ] **OTH-02 [UNVERIFIED]** Go offline, then reload.
  **Expected:** the app and fonts still work, because the fonts are embedded. EPUB import, PDF import, AI, and Meaning fail with messages.
- [ ] **OTH-03** Turn on "reduce motion" in the OS.
  **Expected:** the cover animation and smooth scrolling are off.

## 19. Book page (`#/book/<id>`)

- [ ] **BK-01 [SMOKE]** In Library, click a book card.
  **Expected:** the book page opens (not the reader): cover, title, subtitle, author, translator and original title when present, "Why read it" (ليش أقرأه), and the buttons Start reading or Continue reading · Chapter N (ابدأ القراءة / أكمل القراءة), Discuss (ناقش), Sounds (أصوات), and More (⋯).
- [ ] **BK-02** Check the counters and chapter list.
  **Expected:** counts for highlights, notes, quotes, and due reviews (تظليلات / ملاحظات / اقتباسات / مراجعات مستحقة). For books with more than one chapter, a chapter list with a status per chapter (لم يبدأ / أقرأ / خلّصت). Clicking a chapter opens the reader at that chapter.
- [ ] **BK-03** Check the "Reading companion" (رفيق القراءة) card.
  **Expected:** how many chapters have an AI card, and a button that says "Prepare the book" (جهّز الكتاب) with a key, or "Set up the connection first" (اضبط الاتصال أولاً) without one.
- [ ] **BK-04** Click Discuss.
  **Expected:** the book chat opens as a full page at `#/bchat/<id>`.
- [ ] **BK-05** Click More (⋯).
  **Expected:** a sheet with Change cover (غيّر الغلاف), Remove cover (أزل الغلاف, only with a custom cover), and Delete book (احذف الكتاب). Picking an image sets a custom cover (scaled to 400px wide), which shows on the book page, the library, and the sidebar.

## 20. Profile (`#/profile/<tab>`)

- [ ] **PF-01 [SMOKE]** Open each tab: Profile, Reading, AI companion, Privacy and data, Look and language, About (الملف / القراءة / الرفيق الذكي / الخصوصية والبيانات / المظهر واللغة / عن التطبيق).
  **Expected:** each tab has its own URL (`#/profile/profile`, `read`, `ai`, `privacy`, `look`, `about`) and renders without errors.
- [ ] **PF-02** Profile tab: type a display name and pick an avatar color.
  **Expected:** the avatar monogram and the sidebar chip update at once. "Reading since" and calm counts (books, finished chapters, highlights, notes, quotes, terms) show. No points, streaks, or rewards.
- [ ] **PF-03** Reading tab: change the default template, mode, font, size, line spacing, width, diacritics, and default sound mix.
  **Expected:** the sample line updates for diacritics; the settings apply in the reader and persist after reload. The default template is used only for books opened for the first time.
- [ ] **PF-04** AI tab: reply language, length, default mode, "Spoiler protection" (حماية من الحرق), and "Allow the whole book".
  **Expected:** spoiler protection is ON by default. The connection fields work as in section 14.
- [ ] **PF-05** Privacy tab: the five "What the companion sees" switches, Export, Import, storage used, and the three wipe buttons.
  **Expected:** "Delete all data" (احذف كل البيانات) needs the word احذف (or delete) typed before it works. Wiping does not touch the API key. After 30 days without an export, a backup reminder shows.
- [ ] **PF-06** About tab.
  **Expected:** version, a short description, and the font licenses.

## 21. Unified chats

- [ ] **CH-01 [SMOKE]** Start a home chat and a book chat (from the book page Discuss button).
  **Expected:** both appear in the sidebar under "Chats" (المحادثات), grouped by Today, Yesterday, This week, Older (اليوم / أمس / هالأسبوع / أقدم). Book chats show the book's mini cover.
- [ ] **CH-02** In the reader, open the book chat panel, then click the expand icon.
  **Expected:** the panel becomes a full-page chat for that book. History (السابقة) and New chat (محادثة جديدة) work in both forms.
- [ ] **CH-03** Profile → Privacy → Clear chats (امسح المحادثات).
  **Expected:** after confirming, all chats are gone from the sidebar.

## 22. Ambient sounds (sound mixer)

- [ ] **SND-01 [SMOKE]** Open Sounds (أصوات) from the book page or the reader tools.
  **Expected:** web version: a master play button and volume, seven sliders (rain, thunder, wind, fire, waves, desert wind, calm noise), preset mixes, a field to save your own mix, and a timer (15 / 30 / 60 minutes). Single-file version: only calm noise, plus a note that the nature sounds are in the web version.
- [ ] **SND-02 [UNVERIFIED: audio]** Press play and move sliders. Turn on each sound.
  **Expected:** real recordings, no clicks at the loop point, all at a similar loudness for the same slider. Each file downloads only when its sound is first turned on. Thunder plays soft rolling rumbles 20 to 60 s apart, never a sharp clap. The default mix is quiet. A small pill shows while playing. On some phones the sound stops when the screen locks (the panel says so).
- [ ] **SND-04** Turn on a sound with the network off (web version, file not yet loaded).
  **Expected:** a short message that the sound could not load, and the sound turns itself off.
- [ ] **SND-05 [SMOKE]** Open the mixer from the reader tools (all three templates), the book page, and the floating pill, at desktop and phone width. Play, pause, toggle sounds, move sliders, pick a mix, set the timer.
  **Expected:** the mixer stays open through all of it. It closes only on its close button, a tap or click outside, Esc, or the back gesture. Closing never stops or changes the audio, never leaves the page, and a tap on the reading page that closes it does not also turn the page or show the overlay.
- [ ] **SND-03** Save a named mix, reload, and pick it as the default in Profile → Reading.
  **Expected:** the mix is kept.

## 23. Idea map (additions)

- [ ] **MAP-05 [UNVERIFIED: visual]** Click a highlight node.
  **Expected:** a side panel shows it with actions, including "Change kind" (غيّر النوع). Changing the kind recolors the node. Filters and the panel work on phone width.

## 24. Quote card editor and sharing

- [ ] **QC-01 [SMOKE]** From My quotes, click "Quote card" (بطاقة اقتباس).
  **Expected:** an editor with the quote text (max 280), source line, a note line, aspect ratio (1:1 / 4:5 / 9:16), template (paper, dark, gold on dark, plain white), font (Naskh, Amiri, Ruqaa), the «مكتبتي» mark switch, and the companion text with a counter. The preview updates live.
- [ ] **QC-02 [UNVERIFIED: canvas, Web Share]** Save the image and share.
  **Expected:** the PNG matches the preview. Share appears only where the browser can share files. The last template, ratio, and font are remembered.

## 25. Delete a book

- [ ] **DEL-01 [SMOKE]** Book page → More → Delete book.
  **Expected:** a dialog lists what will be removed (highlights, notes, quotes, chats, review cards), with "Export this book first" (صدّر هذا الكتاب أولاً). Delete removes the book and everything tied to it (chapter cards, map links, reading position, template choice), and goes to `#/lib`.
- [ ] **DEL-02** Click "Export this book first".
  **Expected:** `maktabati-book-YYYY-MM-DD.json` downloads; importing it brings the book back with its highlights.

## 26. Reading templates and template gallery

Templates: Modern (حديث), The Book (الكتاب), Manuscript (مخطوطة). «سراج» and «دفتر» are switched off on purpose.

- [ ] **RT-01 [SMOKE]** Open a book for the first time.
  **Expected:** a picker asks "How do you want to read this book?" with a live preview of each template. "Use the default" keeps the default. The choice is remembered per book.
- [ ] **RT-02 [SMOKE]** Read the demo book in each template.
  **Expected:**
  - Modern: scroll or pages (choice in Aa), a floating circle that opens the tools in an arc (a short bottom sheet on narrow screens). Long-press opens the last tool.
  - The Book: paged; two facing pages on wide screens, one on phones; a ribbon at the top that drops the tools; Eastern Arabic page numbers; footnotes at the bottom of the page.
  - Manuscript: paged; Amiri text with Ruqaa headings in red ink, a ruled frame, a catchword at the bottom of each page; a pen in the margin opens the tools; notes show as marginal glosses (inline marks on phones).
- [ ] **RT-03** Use each tool: contents, find, bookmark, Aa (display), sounds, timer, discuss, exit.
  **Expected:** each works as in sections 6 and 22. Aa can switch the template for this book.
- [ ] **RT-04** In a paged template, tap the outer 20% of the page, then the middle.
  **Expected:** edge taps turn the page; a middle tap shows where you are (progress overlay).
- [ ] **RT-05** First use of each template.
  **Expected:** a one-time hint explains the tools. "Reset hints" (أعد التلميحات) in the gallery shows them again.
- [ ] **RT-06 [UNVERIFIED: real phones]** Swipes, ribbon pull, long-press, text selection versus page swipe, swipe-down exit versus pull-to-refresh, rotation, fullscreen, and the iPhone home-screen fallback. See `docs/backlog.md`.
- [ ] **RT-07 [SMOKE]** In «حديث», read, scroll, and tap anywhere on the page.
  **Expected:** the tools circle stays in the bottom end corner (left in Arabic books), small and faded, and never moves or hides. It turns fully opaque on hover or press. No focus ring after a tap or click; a ring after Tab.
- [ ] **RT-08 [SMOKE]** Aa panel in «حديث»: "إخفاء الأدوات أثناء التمرير" (off by default). Turn it on and scroll.
  **Expected:** the circle fades out while scrolling and back when scrolling stops. Off again: it stays.
- [ ] **RT-09 [SMOKE]** In «الكتاب» and «مخطوطة», turn pages and tap the page.
  **Expected:** the ribbon and the pen keep their exact place and size.
- [ ] **TG-01 [SMOKE]** Open the template gallery (`#/templates`).
  **Expected:** one card per enabled template, with a preview, the idea, type, and tools, and the default marked. "Try this template" (جرّب القالب) opens the demo book in it without changing the book's saved choice.

## 27. Automated runs

All run in headless Chrome with audio muted and a new, empty profile inside `out/tmp/` that is deleted when the run ends (also on failure or Ctrl+C), so they never see your normal browser profile or library. They run against a page (a path under the repo, or a URL) and print PASS or FAIL. Items that need real touch, audio, clipboard, a key, or eyes stay manual.

- `node tests/e2e/smoke.mjs <page>`: the DOM-checkable [SMOKE] items at desktop and phone size: SET-01, SET-04, NAV-01, NAV-04, HOME-01, HOME-02, HOME-06, LIB-01, LIB-03, RD-01, RD-02, TB-07 (via Aa), SEL-02, SEL-03, SEL-06, REV-01, REV-02, SETT-01, SETT-06, EXP-01, EXP-02, IMP-01, BK-01, PF-01, CH-01, SND-01, QC-01, DEL-01, RT-01, RT-02, TG-01.
- `node tests/e2e/upload.mjs <page>`: UP-01 to UP-10 with generated files (PDF book and short PDF, scanned PDF, EPUB long and short, Markdown by drag and drop, text by paperclip, English text, pasted text, export file, duplicates, unknown file).
- `node tests/e2e/ingest-app.mjs <page>`: every fixture PDF through the app, compared with the engine's JSON (chapters, notes, markers, figures, blocks).
- `node tests/e2e/reader-imported.mjs <page>`: PDF-02 and PDF-05 in all three templates (footnotes, figures, object URLs released).
- `node tests/e2e/roundtrip.mjs <page>`: export, then import into an empty profile, and compare.
- `node tests/e2e/sounds.mjs`: recorded sounds in dist/web (Opus and the AAC fallback) and dist/single: lazy loading, decode lengths, single-file note, credits.
- `node tests/e2e/mixer.mjs [page]`: SND-05 (default dist/web).
- `node tests/e2e/bookmarks.mjs [page]`: TB-02 and TB-04 in all templates and modes, with the demo book and a generated book of long blocks, plus an old-format bookmark.
- `node tests/e2e/rt-tools.mjs <page>`: RT-07, RT-08, RT-09 (tool affordances stay still; keyboard-only focus ring).
