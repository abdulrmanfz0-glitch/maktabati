// Minimal Unicode Bidi Algorithm (UAX #9) for plain paragraphs without explicit embeddings.
// Used in two ways:
//  1. Character level: reorder a run between visual and logical order (the L2 reversal is
//     its own inverse for the two-level texts found in books) and mirror paired brackets
//     at odd (right-to-left) levels.
//  2. Item level: order the text items of one line (each already internally logical)
//     from their visual x order into logical reading order.
// Pure: no DOM, no I/O.

const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«', '‹': '›', '›': '‹', '﴾': '﴿', '﴿': '﴾' };

/** Bidi class of one code point (subset sufficient for Arabic/Latin books). */
export function bidiClass(ch) {
  const c = ch.codePointAt(0);
  if (c === undefined) return 'ON';
  if (c >= 0x30 && c <= 0x39) return 'EN';
  if (c >= 0x06F0 && c <= 0x06F9) return 'EN';
  if ((c >= 0x0660 && c <= 0x0669) || c === 0x066B || c === 0x066C) return 'AN';
  if ((c >= 0x064B && c <= 0x065F) || c === 0x0670 || (c >= 0x06D6 && c <= 0x06ED && c !== 0x06DD && c !== 0x06DE && c !== 0x06E5 && c !== 0x06E6 && c !== 0x06E9) || (c >= 0x0300 && c <= 0x036F) || (c >= 0x0610 && c <= 0x061A)) return 'NSM';
  if (c === 0x060C) return 'CS';
  if (c === 0x066A) return 'ET';
  if ((c >= 0x0590 && c <= 0x05FF) || (c >= 0xFB1D && c <= 0xFB4F)) return 'R';
  if ((c >= 0x0600 && c <= 0x07BF) || (c >= 0x0860 && c <= 0x08FF) || (c >= 0xFB50 && c <= 0xFDFF) || (c >= 0xFE70 && c <= 0xFEFE)) return 'AL';
  if (c === 0x20 || c === 0x09 || c === 0xA0 || (c >= 0x2000 && c <= 0x200A)) return 'WS';
  if (c === 0x2B || c === 0x2D || c === 0x2212) return 'ES';
  if (c === 0x23 || c === 0x24 || c === 0x25 || c === 0xB0 || c === 0x2030 || c === 0x20AC || c === 0xA3) return 'ET';
  if (c === 0x2C || c === 0x2E || c === 0x3A || c === 0x2F || c === 0xA0) return 'CS';
  if (c < 0x20 || c === 0x200B || c === 0x200C || c === 0x200D || c === 0xFEFF) return 'BN';
  if (c === 0x200E) return 'L';
  if (c === 0x200F) return 'R';
  if (/\p{L}/u.test(ch)) return 'L';
  return 'ON';
}

/**
 * Resolve embedding levels for a sequence of bidi classes (rules W1-W7, N1-N2, I1-I2).
 * @param {string[]} types  one class per unit
 * @param {number} base     0 = LTR paragraph, 1 = RTL paragraph
 * @param {string[]} [chars] the characters, when units are characters (enables rule N0)
 */
export function resolveLevels(types, base, chars) {
  const n = types.length, t = types.slice();
  const sor = base & 1 ? 'R' : 'L';
  // W1: NSM takes the type of the previous unit
  for (let i = 0; i < n; i++) if (t[i] === 'NSM') t[i] = i ? t[i - 1] : sor;
  // W2: EN after AL becomes AN; W3: AL becomes R
  let strong = sor;
  for (let i = 0; i < n; i++) {
    if (t[i] === 'R' || t[i] === 'L' || t[i] === 'AL') strong = t[i];
    else if (t[i] === 'EN' && strong === 'AL') t[i] = 'AN';
  }
  for (let i = 0; i < n; i++) if (t[i] === 'AL') t[i] = 'R';
  // W4: single separators between numbers
  for (let i = 1; i < n - 1; i++) {
    if (t[i] === 'ES' && t[i - 1] === 'EN' && t[i + 1] === 'EN') t[i] = 'EN';
    else if (t[i] === 'CS' && t[i - 1] === t[i + 1] && (t[i - 1] === 'EN' || t[i - 1] === 'AN')) t[i] = t[i - 1];
  }
  // W5: ET adjacent to EN
  for (let i = 0; i < n; i++) {
    if (t[i] !== 'EN') continue;
    for (let j = i - 1; j >= 0 && t[j] === 'ET'; j--) t[j] = 'EN';
    for (let j = i + 1; j < n && t[j] === 'ET'; j++) t[j] = 'EN';
  }
  // W6: remaining separators and terminators are neutral
  for (let i = 0; i < n; i++) if (t[i] === 'ES' || t[i] === 'ET' || t[i] === 'CS' || t[i] === 'BN') t[i] = 'ON';
  // W7: EN after L becomes L
  strong = sor;
  for (let i = 0; i < n; i++) {
    if (t[i] === 'R' || t[i] === 'L') strong = t[i];
    else if (t[i] === 'EN' && strong === 'L') t[i] = 'L';
  }
  // N0: paired brackets take the direction of their content (or of their context)
  const dirOf = x => (x === 'L' ? 'L' : x === 'R' || x === 'EN' || x === 'AN' ? 'R' : null);
  if (chars) {
    const e = sor;
    for (const [o, c] of bracketPairs(chars)) {
      let hasE = false, hasOpp = false;
      for (let k = o + 1; k < c; k++) { const d = dirOf(t[k]); if (d === e) hasE = true; else if (d) hasOpp = true; }
      let d = null;
      if (hasE) d = e;
      else if (hasOpp) {
        let before = sor;
        for (let k = o - 1; k >= 0; k--) { const x = dirOf(t[k]); if (x) { before = x; break; } }
        d = before === e ? e : before;
      }
      if (d) { t[o] = d; t[c] = d; }
    }
  }
  // N1/N2: neutrals between same-direction strongs take it, else the embedding direction
  for (let i = 0; i < n; i++) {
    if (t[i] !== 'ON' && t[i] !== 'WS') continue;
    let j = i; while (j < n && (t[j] === 'ON' || t[j] === 'WS')) j++;
    const before = i ? dirOf(t[i - 1]) : sor, after = j < n ? dirOf(t[j]) : sor;
    const d = before === after ? before : sor;
    for (let k = i; k < j; k++) t[k] = d;
    i = j - 1;
  }
  // I1/I2
  return t.map(x => {
    if (base & 1) return x === 'L' || x === 'EN' || x === 'AN' ? base + 1 : base;
    return x === 'R' ? base + 1 : x === 'AN' || x === 'EN' ? base + 2 : base;
  });
}

/** BD16: bracket pairs as [openIndex, closeIndex], sorted by opening position. */
export function bracketPairs(chars) {
  const OPEN = { '(': ')', '[': ']', '{': '}' };
  const stack = [], pairs = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (OPEN[ch]) { if (stack.length >= 63) break; stack.push([OPEN[ch], i]); }
    else if (ch === ')' || ch === ']' || ch === '}') {
      for (let k = stack.length - 1; k >= 0; k--) if (stack[k][0] === ch) { pairs.push([stack[k][1], i]); stack.length = k; break; }
    }
  }
  return pairs.sort((a, b) => a[0] - b[0]);
}

/** Rule L2: reverse every maximal run at level >= k, from the highest level down to the lowest odd level. */
export function reorderByLevels(units, levels) {
  const out = units.slice(), lv = levels.slice();
  const hi = Math.max(...lv, 0);
  const lowOdd = Math.min(...lv.filter(l => l & 1), 99);
  for (let k = hi; k >= lowOdd && k > 0; k--) {
    for (let i = 0; i < out.length;) {
      if (lv[i] < k) { i++; continue; }
      let j = i; while (j < out.length && lv[j] >= k) j++;
      reverseRange(out, i, j); reverseRange(lv, i, j);
      i = j;
    }
  }
  return out;
}

function reverseRange(a, i, j) { for (j--; i < j; i++, j--) { const x = a[i]; a[i] = a[j]; a[j] = x; } }

/** Strong direction of a string: 'R', 'L', or 'N' (no strong character). */
export function strongDir(s) {
  let r = 0, l = 0;
  for (const ch of s) { const c = bidiClass(ch); if (c === 'R' || c === 'AL') r++; else if (c === 'L') l++; }
  return r === 0 && l === 0 ? 'N' : r >= l ? 'R' : 'L';
}

/**
 * Convert one line from visual order (left to right, as drawn) to logical order.
 * Characters at odd levels are mirrored (paired brackets).
 * @param {string} s
 * @param {number} [base] 1 = RTL (default for Arabic), 0 = LTR
 */
export function visualToLogical(s, base = 1) {
  const chars = [...s];
  const levels = resolveLevels(chars.map(bidiClass), base, chars);
  const mirrored = chars.map((c, i) => (levels[i] & 1) && MIRROR[c] ? MIRROR[c] : c);
  return reorderByLevels(mirrored, levels).join('');
}

/** logicalToVisual is the same involution; exported for tests and synthetic fixtures. */
export const logicalToVisual = visualToLogical;

/**
 * pdf.js reorders right-to-left chunks but never mirrors brackets. Given text that is already
 * in logical order, mirror paired brackets that sit at odd levels.
 */
export function mirrorRtlBrackets(s, base = 1) {
  const chars = [...s];
  if (!chars.some(c => MIRROR[c])) return s;
  const levels = resolveLevels(chars.map(bidiClass), base, chars);
  return chars.map((c, i) => (levels[i] & 1) && MIRROR[c] ? MIRROR[c] : c).join('');
}

/** True when paired brackets in s are balanced and open before they close (a quality signal). */
export function bracketOrder(s) {
  let good = 0, bad = 0;
  const pairs = [['(', ')'], ['[', ']'], ['«', '»']];
  for (const [o, c] of pairs) {
    const io = s.indexOf(o), ic = s.indexOf(c);
    if (io >= 0 && ic >= 0) { if (io < ic) good++; else bad++; }
  }
  return { good, bad };
}

/**
 * Order the items of one line from visual (x) order into logical order.
 * Each item: { s, x, w, ... } whose own text is already logical.
 * Items are classed by their strong direction; digits-only items are EN.
 */
export function orderLineItems(items, base = 1) {
  const vis = items.slice().sort((a, b) => a.x - b.x);
  const types = vis.map(it => {
    const d = strongDir(it.s);
    if (d === 'R') return 'R';
    if (d === 'L') return 'L';
    if (/[0-9۰-۹]/.test(it.s)) return 'EN';
    if (/[٠-٩]/.test(it.s)) return 'AN';
    return 'ON';
  });
  const levels = resolveLevels(types, base);
  return reorderByLevels(vis, levels);
}
