// Profiles: data plus rule parameters, selected by a fingerprint of the file.
// Never a separate code path, never keyed on a file name, title or content.

export const DEFAULT_PARAMS = {
  spaceGapEm: 0.15,          // normalize: a gap wider than this (in font sizes) is a word space
  minRepeatShare: 0.01,      // clean: never remove a line repeating on fewer than this share of pages
  minRepeatCount: 3,         // clean: ...or on fewer than this many pages
  footnoteSizeRatio: 0.92,   // structure: note lines are at most this size relative to the body
  headingSizeRatio: 1.15,    // structure: heading lines are at least this size relative to the body
  chapterStartsPage: true    // structure: heading-chapters must open a page (top of the page)
};

export const PROFILES = [
  {
    id: 'hindawi',
    description: 'iTextSharp output with Yakout Linotype body text (fixtures in this repo)',
    match: { producer: /iTextSharp/i, font: /YakoutLinotype/i },
    params: {}
  },
  { id: 'generic', description: 'any other file', match: null, params: {} }
];

/** Fingerprint: producer, font families (subset prefix removed), page size, item granularity. */
export function fingerprint({ producer = '', creator = '', fonts = [], pageSize = '', charsPerItem = 0 }) {
  return {
    producer: String(producer).replace(/\s*\(c\).*$/i, '').trim(),
    creator: String(creator).trim(),
    fonts: fonts.slice(0, 6),
    pageSize,
    granularity: charsPerItem >= 30 ? 'line' : charsPerItem >= 4 ? 'fragment' : 'glyph'
  };
}

export function selectProfile(fp, profiles = PROFILES) {
  for (const p of profiles) {
    if (!p.match) continue;
    const okProducer = !p.match.producer || p.match.producer.test(fp.producer);
    const okFont = !p.match.font || fp.fonts.some(f => p.match.font.test(f));
    if (okProducer && okFont) return p;
  }
  return profiles.find(p => p.id === 'generic') || { id: 'generic', params: {} };
}

export function paramsFor(profile, override) {
  return Object.assign({}, DEFAULT_PARAMS, profile ? profile.params : {}, override || {});
}
