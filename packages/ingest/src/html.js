// Tolerant (X)HTML tokenizer and block extractor. Pure: no DOM (DOMParser is not available in
// Web Workers). Good enough for EPUB content documents; not a general HTML5 parser.

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '', zwnj: '‌', zwj: '‍', lrm: '‎', rlm: '‏', mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', middot: '·', bull: '•' };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(cp); } catch (x) { return m; } }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Tokens: { t:'open', name, attrs, self } | { t:'close', name } | { t:'text', text } */
export function tokenize(html) {
  const out = [];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<\/\s*([\w:-]+)\s*>|<([\w:-]+)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)|</g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) out.push({ t: 'text', text: m[1] });
    else if (m[2]) out.push({ t: 'close', name: m[2].toLowerCase().replace(/^.*:/, '') });
    else if (m[3]) {
      const attrs = {};
      const ar = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let a;
      while ((a = ar.exec(m[4] || ''))) attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
      out.push({ t: 'open', name: m[3].toLowerCase().replace(/^.*:/, ''), attrs, self: !!m[5] });
    } else if (m[6] !== undefined) out.push({ t: 'text', text: decodeEntities(m[6]) });
  }
  return out;
}

const VOID = new Set(['br', 'img', 'hr', 'meta', 'link', 'input', 'col', 'area', 'base', 'wbr', 'source', 'image']);
const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'figcaption', 'td', 'th', 'dt', 'dd', 'section', 'article', 'aside', 'header', 'footer', 'figure', 'tr', 'ul', 'ol', 'table', 'body', 'nav']);
const SKIP = new Set(['script', 'style', 'head', 'svg', 'math', 'title']);
const NOTE_TYPES = /\b(footnote|endnote|rearnote|note)\b/;

/**
 * Extract blocks from one content document.
 * Returns { blocks, anchors, notes } where
 *   blocks: [{ kind:'h', level, text } | { kind:'p', text, list? } | { kind:'img', src, alt } | { kind:'caption', text } | { kind:'anchor', id }]
 *   notes:  Map(id -> text) for elements marked as notes (epub:type or linked note targets)
 * Note references become the token <target id> inside text.
 */
export function htmlBlocks(html, noteTargets = new Set()) {
  const toks = tokenize(html);
  const blocks = [], notes = new Map();
  const stack = [];
  let buf = '', bufKind = 'p', bufLevel = 0, inList = 0, skip = 0, noteDepth = -1, noteId = null, noteBuf = '';
  let refDepth = -1, refTarget = null;
  const flush = () => {
    const text = buf.replace(/\s+/g, ' ').trim();
    if (text) blocks.push(bufKind === 'h' ? { kind: 'h', level: bufLevel, text } : bufKind === 'caption' ? { kind: 'caption', text } : { kind: 'p', text, list: inList > 0 && bufKind === 'li' });
    buf = ''; bufKind = 'p';
  };
  for (const tk of toks) {
    if (tk.t === 'open') {
      const n = tk.name;
      if (SKIP.has(n)) { if (!tk.self) skip++; continue; }
      if (skip) continue;
      const id = tk.attrs.id;
      const etype = (tk.attrs['epub:type'] || tk.attrs.type || '') + ' ' + (tk.attrs.role || '') + ' ' + (tk.attrs.class || '');
      if (noteDepth < 0 && id && (noteTargets.has(id) || (NOTE_TYPES.test(etype) && /aside|section|div|li|p/.test(n) && !/noteref/.test(etype)))) {
        flush(); noteDepth = stack.length; noteId = id; noteBuf = '';
      }
      if (n === 'a' && (/noteref/.test(etype) || (tk.attrs.href && noteTargets.has(tk.attrs.href.replace(/^.*#/, ''))))) {
        refDepth = stack.length; refTarget = tk.attrs.href.replace(/^.*#/, '');
      }
      if (!VOID.has(n) && !tk.self) stack.push(n);
      if (noteDepth >= 0) { if (n === 'br' || BLOCK.has(n)) noteBuf += ' '; continue; }
      if (refDepth >= 0) continue;
      if (id && (BLOCK.has(n) || /^h[1-6]$/.test(n) || !buf.trim())) { flush(); blocks.push({ kind: 'anchor', id }); }
      if (n === 'br') { buf += ' '; continue; }
      if (n === 'img' || n === 'image') { flush(); blocks.push({ kind: 'img', src: tk.attrs.src || tk.attrs['xlink:href'] || tk.attrs.href || '', alt: tk.attrs.alt || '' }); continue; }
      if (/^h[1-6]$/.test(n)) { flush(); bufKind = 'h'; bufLevel = +n[1]; continue; }
      if (n === 'ul' || n === 'ol') { flush(); inList++; continue; }
      if (n === 'li') { flush(); bufKind = 'li'; continue; }
      if (n === 'figcaption') { flush(); bufKind = 'caption'; continue; }
      if (BLOCK.has(n)) flush();
    } else if (tk.t === 'close') {
      const n = tk.name;
      if (SKIP.has(n)) { if (skip) skip--; continue; }
      if (skip) continue;
      const k = stack.lastIndexOf(n);
      if (k >= 0) stack.length = k;
      if (refDepth >= 0 && stack.length <= refDepth) {
        if (noteDepth < 0) buf += '' + refTarget + '';
        else noteBuf += '';
        refDepth = -1; refTarget = null;
        continue;
      }
      if (noteDepth >= 0 && stack.length <= noteDepth) {
        const t = noteBuf.replace(/\s+/g, ' ').replace(/^\s*[\[(]?\d+[\])]?[.\s]*/, '').trim();
        if (t) notes.set(noteId, t);
        noteDepth = -1; noteId = null; noteBuf = '';
        continue;
      }
      if (noteDepth >= 0) continue;
      if (n === 'ul' || n === 'ol') { flush(); inList = Math.max(0, inList - 1); continue; }
      if (BLOCK.has(n) || /^h[1-6]$/.test(n)) flush();
    } else {
      if (skip) continue;
      if (noteDepth >= 0) { noteBuf += tk.text; continue; }
      if (refDepth >= 0) continue;
      buf += tk.text;
    }
  }
  flush();
  return { blocks, notes };
}

/** Collect note-reference targets: epub:type="noteref" links and <a href="#x"><sup>n</sup></a> patterns. */
export function noteTargetsOf(html) {
  const out = new Set();
  const toks = tokenize(html);
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    if (tk.t !== 'open' || tk.name !== 'a' || !tk.attrs.href || !tk.attrs.href.includes('#')) continue;
    const etype = (tk.attrs['epub:type'] || '') + ' ' + (tk.attrs.class || '') + ' ' + (tk.attrs.role || '');
    let text = '', sup = false;
    for (let j = i + 1; j < toks.length && j < i + 8; j++) {
      const t = toks[j];
      if (t.t === 'close' && t.name === 'a') break;
      if (t.t === 'open' && t.name === 'sup') sup = true;
      if (t.t === 'text') text += t.text;
    }
    if (/noteref|footnote/.test(etype) || (sup && /^\s*[\[(]?[0-9٠-٩*]{1,3}[\])]?\s*$/.test(text))) out.add(tk.attrs.href.replace(/^.*#/, ''));
  }
  return out;
}
