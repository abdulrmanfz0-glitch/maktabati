// PDF pipeline orchestrator: extract -> glyphs -> reorder -> normalize -> layout -> clean -> structure
// -> assemble, then scoring and routing. Async generator: yields progress events and a
// final { type: 'result', book, report, assets }.
//
// pdf.js is injected: options.openPdf(bytes) -> PDFDocumentProxy and options.pdfjs (for OPS).
// When absent and running in Node, the Node adapter is loaded.
import { IngestError, makeReport } from './model.js';
import { extractPage, imageCoverage } from './stages/extract.js';
import { reorderPage } from './stages/reorder.js';
import { normalizePage, MARK_OPEN, MARK_CLOSE, pairOrderVotes, decidePairOrder, mirrorPairs, lossyEvidence, repairLossy } from './stages/normalize.js';
import { docStats, layoutPage } from './stages/layout.js';
import { cleanPages, residualRepeats } from './stages/clean.js';
import { detectFootnotes, detectEndnotes, alignSequences, detectHeadings, detectChapters } from './stages/structure.js';
import { on } from './rules.js';
import { assemble } from './stages/assemble.js';
import { scorePages, docIssues, route, structuralIssues, textLayerIssues, coverage } from './score.js';
import { fingerprint, selectProfile, paramsFor } from './profiles.js';
import { textMetrics } from './text.js';
import { bracketOrder } from './bidi.js';
import { runVision, abortError } from './vision.js';
import { repairGlyphs } from './stages/glyphfix.js';
import { embeddedGlyphNames } from './fontfile.js';
import { censusHasUnknown } from './glyphs.js';
import { loadLexicon } from './lexicon.js';
import { functionWordCheck, plainForm, tokens as tokenize } from './text.js';

async function defaultPdfjs() {
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    const m = await import('./adapters/pdfjs-node.js');
    return { openPdf: m.openPdf, pdfjs: await m.loadPdfjs(), inflate: m.inflate };
  }
  throw new IngestError('no-pdfjs', 'Pass options.openPdf and options.pdfjs (pdf.js) in this environment.');
}

/** FlateDecode in the browser (DecompressionStream). */
async function webInflate(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('no-inflate');
  const ds = new DecompressionStream('deflate');
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const RE_MARK_G = new RegExp(MARK_OPEN + '(\\d+)' + MARK_CLOSE, 'g');

async function resolveOutline(doc) {
  const outline = await doc.getOutline().catch(() => null);
  if (!outline || !outline.length) return [];
  const out = [];
  for (const o of outline) {
    try {
      const dest = typeof o.dest === 'string' ? await doc.getDestination(o.dest) : o.dest;
      if (!dest || !dest[0]) continue;
      const idx = typeof dest[0] === 'number' ? dest[0] : await doc.getPageIndex(dest[0]);
      out.push({ title: String(o.title || ''), page: idx + 1 });
    } catch (e) { /* unresolvable entry */ }
  }
  return out;
}

export async function* ingestPdf(bytes, options = {}) {
  const t0 = now();
  const signal = options.signal;
  const check = () => { if (signal && signal.aborted) throw abortError(); };
  if (!bytes || !bytes.length) throw new IngestError('empty', 'The file is empty.');
  const env = options.openPdf ? { openPdf: options.openPdf, pdfjs: options.pdfjs, inflate: options.inflate } : await defaultPdfjs();
  const OPS = env.pdfjs && env.pdfjs.OPS;
  let doc;
  try { doc = await env.openPdf(bytes.slice ? bytes.slice() : bytes); }
  catch (e) {
    if (e && e.name === 'PasswordException') throw new IngestError('encrypted', 'This PDF is password-protected. Open it with its password in another program, save an unprotected copy, and import that.');
    throw new IngestError('invalid-pdf', 'This file could not be read as a PDF (it may be damaged).');
  }
  const report = makeReport('pdf');
  const timings = report.timings;
  try {
    check();
    const meta = await doc.getMetadata().catch(() => ({ info: {} }));
    if (meta.info && meta.info.EncryptFilterName && options.allowOwnerEncrypted === false) throw new IngestError('encrypted', 'This PDF is encrypted.');
    const outline = await resolveOutline(doc);
    const N = doc.numPages;
    report.pages = N;
    yield { type: 'progress', stage: 'open', page: 0, pages: N };

    // --- extract (streamed page by page) ---
    // options.extractCache (a Map) + options.cacheKey let tools reuse extraction across runs;
    // extraction does not depend on any rule, and later stages never mutate `raws`.
    let tA = now();
    const cache = options.extractCache && options.cacheKey ? options.extractCache : null;
    let raws = cache ? cache.get(options.cacheKey) : null;
    if (!raws) {
      raws = [];
      raws.census = new Map();
      for (let i = 1; i <= N; i++) {
        check();
        const page = await doc.getPage(i);
        raws.push(await extractPage(page, OPS, { images: options.images !== false, census: raws.census }));
        page.cleanup();
        if (i % 5 === 0 || i === N) yield { type: 'progress', stage: 'extract', page: i, pages: N };
      }
      if (cache) cache.set(options.cacheKey, raws);
    }
    const fontChars = new Map();
    let itemCount = 0, itemChars = 0;
    for (const raw of raws) for (const it of raw.items) { fontChars.set(it.font, (fontChars.get(it.font) || 0) + it.s.length); itemCount++; itemChars += it.s.length; }
    timings.extract = now() - tA;

    // --- profile ---
    const fp = fingerprint({
      producer: meta.info?.Producer, creator: meta.info?.Creator,
      fonts: [...fontChars.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f),
      pageSize: raws.length ? Math.round(raws[0].width) + 'x' + Math.round(raws[0].height) : '',
      charsPerItem: itemCount ? itemChars / itemCount : 0
    });
    const profile = options.profile ? { id: options.profile.id || 'custom', params: options.profile.params || {} } : selectProfile(fp);
    const opts = Object.assign({}, options, { params: paramsFor(profile, options.params) });
    report.fingerprint = fp; report.profile = profile.id;

    // --- glyphs ---
    // The word list: options.lexicon (null = none); in Node, the bundled data file when present.
    tA = now();
    const lexicon = options.lexicon !== undefined ? options.lexicon : await loadLexicon();
    opts.lexicon = lexicon;
    let names = null;
    const hasUnknown = censusHasUnknown(raws.census);
    if (hasUnknown && on(opts, 'glyph-names')) {
      try { names = await embeddedGlyphNames(bytes, env.inflate || webInflate); } catch (e) { names = null; }
    }
    const gl = repairGlyphs(raws, raws.census, { names, lexicon }, opts);
    report.glyphs = gl.report;
    timings.glyphs = now() - tA;
    if (!cache) for (const r of raws) r.items = null; // the repaired copies are used from here on

    // --- reorder + normalize ---
    tA = now();
    const pages = [];
    let reversedPages = 0, lossyRepaired = 0, pairsFixed = 0;
    for (const raw of gl.raws) {
      check();
      const lines = reorderPage(raw, opts);
      const norm = normalizePage(lines, opts);
      if (norm.reversed) reversedPages++;
      lossyRepaired += norm.lossy || 0;
      pages.push({ index: raw.index, width: raw.width, height: raw.height, lines: norm.lines, images: raw.images, itemCount: raw.items.length, coverage: imageCoverage(raw) });
      if (!cache) raw.items = null;
    }
    // Lossy mappings, only in a document that shows them (lossy-repair).
    let lossyEv = null;
    if (lexicon && on(opts, 'lossy-repair')) {
      lossyEv = lossyEvidence(pages.map(p => p.lines.map(l => l.text).join('\n')).join('\n'));
      if (lossyEv.damaged) for (const p of pages) for (const l of p.lines) { const r = repairLossy(l.text, lexicon); l.text = r.text; lossyRepaired += r.n; }
    }
    // Guillemet / quote order, decided on the whole document (pair-order).
    if (on(opts, 'pair-order')) {
      let votes;
      for (const p of pages) for (const l of p.lines) if (l.base === 1) votes = pairOrderVotes(l.text, votes);
      const which = votes ? decidePairOrder(votes) : [];
      if (which.some(Boolean)) for (const p of pages) for (const l of p.lines) if (l.base === 1) { const t = mirrorPairs(l.text, which); if (t !== l.text) { l.text = t; pairsFixed++; } }
    }
    timings.normalize = now() - tA;
    yield { type: 'progress', stage: 'normalize', page: N, pages: N };

    // --- layout ---
    tA = now();
    const stats = docStats(pages);
    let twoCol = 0, unresolvedCols = 0;
    for (const p of pages) { const r = layoutPage(p, stats, opts); p.columns = r.columns; p.unresolved = r.unresolved; if (r.columns === 2) twoCol++; if (r.unresolved) unresolvedCols++; }
    timings.layout = now() - tA;

    // --- clean ---
    tA = now();
    const cleaned = cleanPages(pages, stats, opts);
    timings.clean = now() - tA;

    // --- structure ---
    tA = now();
    let notesFound = 0;
    const endnotes = detectEndnotes(pages, stats, opts);
    const endPages = new Set(endnotes.pages);
    pages.forEach((p, i) => { p.notes = endPages.has(i) ? [] : detectFootnotes(p, stats, opts); notesFound += p.notes.filter(n => n.n !== null).length; });
    notesFound += endnotes.entries;
    const groups = detectHeadings(pages, stats, opts);
    const chapters = detectChapters(pages, groups, { outline, exclude: endnotes.pages }, opts);
    timings.structure = now() - tA;
    yield { type: 'progress', stage: 'structure', page: N, pages: N };

    // --- assemble ---
    tA = now();
    const title = String(meta.info?.Title || '').trim() || (groups.length ? groups.slice().sort((a, b) => b.size - a.size || a.page - b.page).find(g => g.page < 5)?.text : '') || '';
    const author = String(meta.info?.Author || '').trim();
    // Endnotes: marker sequences in reading order (markers not claimed by a same-page footnote),
    // aligned to the endnote sequences.
    if (endnotes.sequences.length) {
      const firstCh = chapters.chapters.length ? chapters.chapters[0].page : 0;
      const seqs = []; let lastN = Infinity;
      pages.forEach((p, i) => {
        if (i < firstCh || endPages.has(i)) return;
        const local = new Set((p.notes || []).map(n => n.n));
        for (const l of p.lines) if (!l.removed && l.role !== 'note' && l.role !== 'endnote') for (const mm of l.text.matchAll(RE_MARK_G)) {
          if (local.has(mm[1])) { local.delete(mm[1]); continue; }
          if (+mm[1] <= lastN) seqs.push([]);
          lastN = +mm[1]; seqs[seqs.length - 1].push(+mm[1]);
        }
      });
      endnotes.map = on(opts, 'endnote-align') ? alignSequences(seqs, endnotes.sequences) : new Map(seqs.map((_, i) => [i, i]));
    }
    const asm = assemble(pages, stats, chapters, groups, { title, author, endnotes }, opts);
    timings.assemble = now() - tA;

    // --- score ---
    tA = now();
    const pageTexts = pages.map(p => ({
      page: p.index,
      text: p.lines.filter(l => !l.removed).map(l => l.text.replace(RE_MARK_G, '')).join('\n'),
      noText: p.itemCount === 0,
      image: p.coverage,
      edge: p.index === 1 || p.index === N,
      unresolvedGlyphs: gl.unresolvedByPage.get(p.index) || 0,
      columnsUnresolved: p.unresolved
    }));
    const sc = scorePages(pageTexts, opts);
    let markersTotal = 0;
    for (const p of pages) for (const l of p.lines) if (!l.removed && l.role !== 'note') markersTotal += (l.text.match(RE_MARK_G) || []).length;
    const tocLines = chapters.toc ? chapters.toc.pages.reduce((n, i) => n + pages[i].lines.filter(l => !l.removed && l.role !== 'heading' && /\p{L}/u.test(l.text)).length, 0) : 0;
    const diag = {
      notesFound, notesLinked: asm.metrics.linked, markersTotal, unlinkedMarkers: asm.metrics.unlinkedMarkers,
      paragraphs: asm.metrics.paragraphs, paraTerminalShare: asm.metrics.paragraphs ? asm.metrics.terminal / asm.metrics.paragraphs : 1,
      tocLines, tocEntries: chapters.toc ? chapters.toc.entries.length : 0, method: chapters.method, chapters: chapters.chapters.length,
      frontMatterPages: asm.metrics.frontMatterPages, pages: N
    };
    const extra = structuralIssues(diag);
    // Text-layer checks: top function words in their correct form, dictionary coverage.
    const allText = pageTexts.map(p => p.text).join('\n');
    const fwc = functionWordCheck(allText);
    let dict = null;
    if (lexicon) {
      let ar = 0, known = 0;
      for (const t of tokenize(plainForm(allText))) if (/^[ء-ي]+$/.test(t)) { ar++; if (lexicon.has(t)) known++; }
      dict = ar ? known / ar : null;
    }
    extra.push(...textLayerIssues({ fw: fwc, dictCoverage: dict }));
    if (chapters.chapters.length < 2) extra.push({ code: 'no-chapters', pages: 0, severity: 'major' });
    // --- page coverage ---
    const rowByPage = new Map(sc.pages.map(r => [r.page, r]));
    const tocSet = new Set(chapters.toc ? chapters.toc.pages : []);
    const frontSkipped = new Set(asm.metrics.frontSkipped);
    const book = asm.book;
    const assigned = pages.map((p, pi) => {
      const page = p.index, r = rowByPage.get(page);
      const kept = p.lines.filter(l => !l.removed);
      const placed = asm.metrics.placed.get(pi) || 0;
      if (r && r.route === 'cover') return { page, kind: 'cover' };
      if (tocSet.has(pi)) return { page, kind: 'front' };
      // Endnote entries are always kept (linked, or appended unlinked), so the page is covered.
      if (endPages.has(pi)) return { page, kind: book.chapters.length ? 'chapter' : 'dropped', reason: book.chapters.length ? undefined : 'no-chapter-for-notes' };
      if (frontSkipped.has(pi)) {
        const bodyLines = kept.filter(l => l.role !== 'heading' && l.role !== 'note' && l.size >= 0.9 * stats.bodySize).length;
        return bodyLines >= 12 ? { page, kind: 'dropped', reason: 'pre-chapter-text' } : { page, kind: 'front' };
      }
      if (placed) return { page, kind: first(chapters) !== null && pi >= first(chapters) ? 'chapter' : 'front' };
      if (p.itemCount === 0) return (p.coverage || 0) >= 0.5 ? { page, kind: 'dropped', reason: 'no-text-layer' } : { page, kind: 'blank' };
      if (!kept.length) return { page, kind: 'blank' };
      // Kept lines that are all consumed as notes of this page still count as placed content.
      if (kept.every(l => l.role === 'note')) return { page, kind: 'chapter' };
      return { page, kind: 'dropped', reason: 'unplaced' };
    });
    const cov = coverage(assigned);
    if (cov.issue) extra.push(cov.issue);
    const issues = docIssues(sc.pages, extra);
    const rt = route(sc.pages, sc.score, issues, chapters.chapters.length, opts);
    timings.score = now() - tA;

    // --- report (metrics only) ---
    report.score = round(sc.score);
    report.pageScores = sc.pages.map(r => ({ page: r.page, score: r.score === null ? null : round(r.score), tokens: r.tokens, issues: r.issues, route: r.route }));
    report.chapters = { count: chapters.chapters.length, method: chapters.method, tocPages: chapters.toc ? chapters.toc.pages.map(i => pages[i].index) : [], items: chapters.chapters.map((c, i) => ({ index: i + 1, method: c.method, startPage: pages[c.page].index })) };
    report.footnotes = { found: notesFound, linked: asm.metrics.linked, placed: asm.metrics.notes, unlinkedMarkers: asm.metrics.unlinkedMarkers, endnotePages: endnotes.pages.length, endnoteSequences: endnotes.sequences.length, endnotesLinked: asm.metrics.endLinked };
    report.figures = asm.metrics.figures;
    report.coverage = cov.coverage;
    report.issues = issues.map(({ pageList, ...i }) => i);
    report.recommendation = rt.recommendation;
    report.confidence = round(rt.confidence);
    report.visionPages = rt.visionPages;
    const all = pageTexts.map(p => p.text).join('\n');
    const tm = textMetrics(all);
    const br = all.split('\n').reduce((a, l) => { const b = bracketOrder(l); a.good += b.good; a.bad += b.bad; return a; }, { good: 0, bad: 0 });
    report.metrics = {
      fwPer1000: round(tm.fwPer1000, 1), isolatedRatio: round(tm.isolatedRatio, 4), presRatio: round(tm.presRatio, 4),
      bracketBad: br.good + br.bad ? round(br.bad / (br.good + br.bad), 4) : 0,
      reversedPages, twoColumnPages: twoCol, unresolvedColumnPages: unresolvedCols,
      pageNumbersRemoved: cleaned.pageNumbers, headersRemoved: cleaned.headers, diagramLabels: cleaned.diagramLabels, residualRepeats: residualRepeats(pages),
      headings: groups.length, sections: asm.metrics.sections,
      paragraphs: asm.metrics.paragraphs, paraTerminalShare: asm.metrics.paragraphs ? round(asm.metrics.terminal / asm.metrics.paragraphs, 3) : 0,
      megaParagraphs: asm.metrics.mega, verseBlocks: asm.metrics.verse, nonTerminalEnd: asm.metrics.nonTerminalEnd, captions: asm.metrics.captions, frontMatterPages: asm.metrics.frontMatterPages,
      bodySize: stats.bodySize, leading: stats.leading, lmTrainPages: sc.lm.trainPages,
      markersTotal, tocLines, tocEntries: diag.tocEntries, justified: stats.justified,
      fwCorrectShare: round(fwc.share, 4), fwSwapped: fwc.swapped, dictCoverage: dict === null ? null : round(dict, 4),
      unresolvedGlyphShare: gl.report.unresolvedShare, lossyRepaired, pairsFixed
    };
    timings.total = now() - t0;
    for (const k in timings) timings[k] = Math.round(timings[k]);

    let vision = null;
    if (options.vision && rt.visionPages.length) vision = await runVision(options.vision, options.renderPage, rt.visionPages, signal);

    yield { type: 'result', book: asm.book, report, assets: asm.assets, vision };
  } finally {
    await (doc.loadingTask && doc.loadingTask.destroy ? doc.loadingTask.destroy() : doc.destroy()).catch(() => {}); // pdf.js 6 dropped PDFDocumentProxy.destroy
  }
}

const first = ch => (ch.chapters.length ? ch.chapters[0].page : null);
const round = (x, d = 3) => (x === null || x === undefined || !isFinite(x) ? x : Math.round(x * 10 ** d) / 10 ** d);
