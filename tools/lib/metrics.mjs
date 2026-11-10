// Flatten an ingest report into comparable metrics (numbers only) and say which direction is better.
import { isSuccess } from '../../packages/ingest/src/score.js';

export function flat(report) {
  const m = report.metrics || {};
  const found = report.footnotes?.found || 0, linked = report.footnotes?.linked || 0;
  return {
    score: report.score,
    fw: m.fwPer1000,
    iso: m.isolatedRatio,
    pres: m.presRatio,
    bracketBad: m.bracketBad,
    chaptersOk: report.chapters.count >= 2 ? 1 : 0,
    chapters: report.chapters.count,
    notesLinked: linked,
    linkRate: found ? linked / found : 1,
    residual: m.residualRepeats,
    paraTerm: m.paraTerminalShare,
    mega: m.megaParagraphs,
    figures: report.figures,
    captions: m.captions,
    vision: report.visionPages.length,
    dropped: report.coverage ? report.coverage.dropped : 0,
    fwCorrect: m.fwCorrectShare ?? 1,
    dict: m.dictCoverage ?? null,
    unresolved: m.unresolvedGlyphShare ?? 0,
    multiFixed: report.glyphs ? report.glyphs.multiReplaced : 0,
    glyphsSolved: report.glyphs ? report.glyphs.namesResolved + report.glyphs.solverResolved : 0,
    lossyFixed: m.lossyRepaired ?? 0,
    pairsFixed: m.pairsFixed ?? 0,
    major: report.issues.filter(i => i.severity === 'major').length,
    success: isSuccess(report) ? 1 : 0
  };
}

// +1: higher is better, -1: lower is better. Metrics absent here are informational.
export const DIRECTION = {
  score: 1, fw: 1, iso: -1, pres: -1, bracketBad: -1, chaptersOk: 1, notesLinked: 1, linkRate: 1,
  residual: -1, paraTerm: 1, fwCorrect: 1, dict: 1, unresolved: -1, mega: -1, figures: 1, captions: 1, vision: -1, dropped: -1, major: -1, success: 1
};

// Changes smaller than this are noise.
export const TOLERANCE = { score: 0.002, fw: 0.5, iso: 0.0005, pres: 0.0005, bracketBad: 0.002, linkRate: 0.005, paraTerm: 0.003, fwCorrect: 0.002, dict: 0.001, unresolved: 0.00001 };

/** Signed improvement of b over a for metric k (positive = better). */
export function delta(a, b, k) {
  const d = (b[k] ?? 0) - (a[k] ?? 0);
  if (Math.abs(d) <= (TOLERANCE[k] ?? 0)) return 0;
  return d * (DIRECTION[k] || 0);
}
