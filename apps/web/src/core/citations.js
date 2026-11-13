// Inline web citations: turn DeepSeek/Gemini citation ranges into superscript
// markers that match the collapsible source list, and produce a clean plain copy.
// Pure: no DOM, fetch, or storage.

const PUNCT = new Set(['،', '.', '؛', ':', '!', '؟', ',', ';', '?', '。']);
const WORD = /[\p{L}\p{N}_]/u;

const clamp = (n, max) => Math.max(0, Math.min(max, Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0));

function codePoints(text) {
  return [...String(text == null ? '' : text)];
}

/** Convert a UTF-8 byte offset (Gemini groundingSupports) to a code-point index. */
export function byteIndexToCodePoint(text, byteIndex) {
  const cps = codePoints(text);
  const enc = new TextEncoder();
  let byte = 0;
  const starts = [];
  for (const cp of cps) {
    starts.push(byte);
    byte += enc.encode(cp).length;
  }
  const target = clamp(byteIndex, byte);
  let lo = 0, hi = cps.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function citationItems(citation) {
  if (!citation || !Array.isArray(citation.items)) return [];
  const kind = citation.kind === 'gemini' ? 'gemini' : 'deepseek';
  return citation.items.map(item => {
    const c = kind === 'deepseek' ? (item && item.url_citation) || item : item;
    if (!c || !c.url) return null;
    return {
      kind,
      url:String(c.url),
      title:String(c.title == null ? '' : c.title),
      end:kind === 'gemini' ? (item && item.endIndex) : (c.end_index != null ? c.end_index : c.endIndex)
    };
  }).filter(Boolean);
}

function protectedRanges(text, cps) {
  const ranges = [];
  const cpAt = unit => codePoints(text.slice(0, unit)).length;
  for (const re of [/`[^`]+`/g, /\[[^\]]+\]\([^)]*\)/g]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const start = cpAt(m.index);
      const end = start + codePoints(m[0]).length;
      ranges.push([start, end]);
    }
  }
  return ranges;
}

function adjustAnchor(cps, anchor, protectedRanges) {
  let a = clamp(anchor, cps.length);
  for (const [start, end] of protectedRanges) {
    if (a >= start && a < end) a = end;
  }
  while (a < cps.length && WORD.test(cps[a])) a++;
  return a;
}

function resolvePunctuation(cps, anchor) {
  const n = cps.length;
  if (anchor < n && PUNCT.has(cps[anchor])) {
    const del = anchor > 0 && cps[anchor - 1] === ' ' ? anchor - 1 : -1;
    return { insert:anchor + 1, del };
  }
  if (anchor + 1 < n && PUNCT.has(cps[anchor + 1])) {
    const del = cps[anchor] === ' ' ? anchor : -1;
    return { insert:anchor + 2, del };
  }
  return { insert:anchor, del:-1 };
}

/**
 * Build inline-citation text, plain copy, and the numbered source list.
 * citation = { kind:'deepseek'|'gemini', items:[...] }.
 * DeepSeek url_citation indices are Unicode code points; Gemini groundingSupports
 * indices are UTF-8 byte offsets.
 */
export function buildInlineCitations(text, citation) {
  const raw = String(text == null ? '' : text);
  const cps = codePoints(raw);
  const protectedRangesList = protectedRanges(raw, cps);
  const items = citationItems(citation);
  const urlToNum = new Map();
  const rawSources = [];
  const deletions = new Set();
  const insertBefore = new Map();

  for (const item of items) {
    const anchorRaw = item.kind === 'gemini' ? byteIndexToCodePoint(raw, item.end) : clamp(item.end, cps.length);
    const anchor = adjustAnchor(cps, anchorRaw, protectedRangesList);
    const resolved = resolvePunctuation(cps, anchor);
    if (resolved.del >= 0) deletions.add(resolved.del);
    let num = urlToNum.get(item.url);
    if (num == null) {
      rawSources.push({ url:item.url, title:item.title });
      num = rawSources.length;
      urlToNum.set(item.url, num);
    }
    const at = insertBefore.get(resolved.insert) || [];
    at.push(num);
    insertBefore.set(resolved.insert, at);
  }

  let html = '', plain = '';
  const flush = at => (insertBefore.get(at) || []).slice().sort((a, b) => a - b).map(n => '[[cite:' + n + ']]').join('');
  for (let i = 0; i <= cps.length; i++) {
    if (i < cps.length) {
      html += flush(i);
      if (!deletions.has(i)) {
        html += cps[i];
        plain += cps[i];
      }
    } else {
      html += flush(i);
    }
  }

  const sources = uniqueSources(rawSources);
  if (sources.length) {
    plain += '\n\n' + sources.map((s, i) => (i + 1) + '. ' + s.url).join('\n');
  }
  return { text:html, plain, sources };
}

function uniqueSources(list) {
  const seen = new Set();
  const out = [];
  for (const s of list) {
    if (!s || !s.url || seen.has(s.url)) continue;
    seen.add(s.url);
    out.push({ url:s.url, title:s.title || '', domain:domainOf(s.url) });
  }
  return out;
}

function domainOf(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) { return ''; }
}
