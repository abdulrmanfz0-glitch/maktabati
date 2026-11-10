// Arabic word list with frequency ranks, used by the ligature solver, the lossy-mapping repair
// and dictionary coverage.
//
// Interface (what the engine uses; any source can provide it, e.g. a later book-based list):
//   { has(word): boolean, rank(word): number, exactRank(word): number, size: number }
//   ranks are 1-based (1 = most frequent), Infinity when absent.
// Pass one as options.lexicon (null = no word list). In Node, when options.lexicon is not given,
// the bundled list is loaded: packages/ingest/data/ar-words.txt, adapted from hermitdave/
// FrequencyWords ar_50k (CC BY-SA 4.0; see THIRD_PARTY_NOTICES.md). The file is kept as
// published plus one attribution header line. The folding below (diacritics, alef forms, ى/ي)
// happens in memory at load time; the resulting lookup table is an adaptation of that list and
// stays under CC BY-SA 4.0.
import { RE_MARKS_G } from './text.js';

const plain = w => String(w).replace(RE_MARKS_G, '').replace(/ـ/g, '');

/** Lookup key: diacritics and tatweel removed, alef forms folded, final ى folded to ي. */
export const lexKey = w => plain(w).replace(/[آأإٱ]/g, 'ا').replace(/ى/g, 'ي');

/**
 * Build a lexicon from entries, most frequent first. Each entry is a word, or a line
 * "word count" (FrequencyWords format). Lines starting with # and non-Arabic words are skipped.
 * @param {Iterable<string>} entries
 */
export function makeLexicon(entries) {
  const ranks = new Map(), exact = new Map();
  let r = 0;
  for (const line of entries) {
    const s = String(line).trim();
    if (!s || s.startsWith('#')) continue;
    const t = s.split(/\s+/)[0];
    if (!/^[ء-يً-ْٰٱ]+$/.test(t)) continue;
    r++;
    const k = lexKey(t);
    if (!ranks.has(k)) ranks.set(k, r);
    const e = plain(t);
    if (!exact.has(e)) exact.set(e, r);
  }
  return {
    size: ranks.size,
    has: w => ranks.has(lexKey(w)),
    rank: w => ranks.get(lexKey(w)) ?? Infinity,
    exactRank: w => exact.get(plain(w)) ?? Infinity
  };
}

// Resolved lazily (Node only): browser bundles have no usable import.meta.url, and building the
// path from parts keeps web bundlers from copying the file into builds that never read it.
export const bundledList = () => new URL('../data/' + 'ar-words.txt', import.meta.url);

const cache = new Map();
/**
 * Node: load a word list file (default: the bundled list). Returns null when it is missing.
 * @param {URL|string} [source]
 */
export async function loadLexicon(source) {
  if (source === undefined) source = bundledList();
  const key = String(source);
  if (cache.has(key)) return cache.get(key);
  let lex = null;
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    try {
      const fs = await import('node:fs/promises');
      lex = makeLexicon((await fs.readFile(source, 'utf8')).split(/\r?\n/));
    } catch (e) { lex = null; }
  }
  cache.set(key, lex);
  return lex;
}
