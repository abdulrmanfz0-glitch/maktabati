// Arabic search folding with an original-index map, so a highlighted match
// does not drift when the text contains tashkeel or tatweel.

export function foldChar(ch) {
  return ch
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
}

export function foldArabic(text) {
  let out = '';
  for (const ch of String(text == null ? '' : text)) out += foldChar(ch);
  return out;
}

/** Find a query in folded text and map the match back to original indices. */
export function findNormalizedRange(text, query) {
  const src = String(text == null ? '' : text);
  const q = foldArabic(query);
  if (!q) return null;
  let folded = '', map = [];
  for (let i = 0; i < src.length; i++){
    const f = foldChar(src[i]);
    if (!f) continue;
    for (const c of f){ folded += c; map.push(i); }
  }
  const at = folded.indexOf(q);
  if (at < 0) return null;
  let end = map[at + q.length - 1] + 1;
  while (end < src.length && /[\u064B-\u065F\u0670\u06D6-\u06ED]/.test(src[end])) end++;
  return { start: map[at], end };
}
