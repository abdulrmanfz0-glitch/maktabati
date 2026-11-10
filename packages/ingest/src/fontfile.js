// Embedded font glyph names, read from the PDF bytes. pdf.js reads glyph names internally but
// does not export them (it rebuilds the `post` table without names), so this is a small,
// independent reader. Pure: the only I/O is the injected `inflate` (FlateDecode).
//
// Scope (what is read, everything else is skipped):
//  - objects in the file body and inside object streams (/ObjStm)
//  - Type0 fonts with a CIDFontType2 descendant (TrueType, FontFile2): charcode = CID with
//    Identity-H/V, CID -> GID by /CIDToGIDMap (Identity or a stream), GID -> name from `post`
//    format 2 (custom names only; the 258 standard Macintosh names are Latin)
//  - simple TrueType fonts: code -> GID through the font's own (3,0)/(1,0) cmap
// CFF (FontFile3) CID-keyed fonts carry no glyph names by design and are reported as such.

const latin1 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return s; };

/** Index every indirect object: number -> { dict, streamStart, streamLen } or { text } (object stream member). */
export async function indexObjects(bytes, inflate) {
  const raw = latin1(bytes);
  const objs = new Map();
  const re = /(?:^|[\r\n\s>])(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(raw))) {
    const num = +m[1], start = m.index + m[0].length;
    const end = raw.indexOf('endobj', start);
    if (end < 0) break;
    const sIdx = raw.indexOf('stream', start);
    if (sIdx >= 0 && sIdx < end && raw.slice(start, sIdx).trim().startsWith('<<')) {
      let s = sIdx + 6;
      if (raw[s] === '\r') s++;
      if (raw[s] === '\n') s++;
      const eIdx = raw.lastIndexOf('endstream', end);
      objs.set(num, { dict: raw.slice(start, sIdx), streamStart: s, streamEnd: eIdx > s ? eIdx : end });
    } else objs.set(num, { text: raw.slice(start, end) });
    re.lastIndex = end + 6;
  }
  const reader = { raw, bytes, objs, inflate, cache: new Map() };
  // Object streams: members are not in the body.
  for (const [num, o] of [...objs]) {
    if (!o.dict || !/\/Type\s*\/ObjStm/.test(o.dict)) continue;
    const data = await streamData(reader, num);
    if (!data) continue;
    const s = latin1(data);
    const n = +(/\/N\s+(\d+)/.exec(o.dict) || [])[1] || 0, first = +(/\/First\s+(\d+)/.exec(o.dict) || [])[1] || 0;
    const head = s.slice(0, first).trim().split(/\s+/).map(Number);
    for (let k = 0; k < n; k++) {
      const on = head[2 * k], off = first + head[2 * k + 1];
      const next = k + 1 < n ? first + head[2 * k + 3] : s.length;
      if (!objs.has(on)) objs.set(on, { text: s.slice(off, next) });
    }
  }
  return reader;
}

/** Decoded stream bytes of object `num` (FlateDecode or no filter), or null. */
export async function streamData(reader, num) {
  if (reader.cache.has(num)) return reader.cache.get(num);
  const o = reader.objs.get(num);
  if (!o || !o.dict) return null;
  let len = null;
  const direct = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(o.dict), ind = /\/Length\s+(\d+)\s+\d+\s+R/.exec(o.dict);
  if (ind) { const lo = reader.objs.get(+ind[1]); if (lo && lo.text) len = +(/\d+/.exec(lo.text) || [])[0]; }
  else if (direct) len = +direct[1];
  const end = len !== null && isFinite(len) ? o.streamStart + len : o.streamEnd;
  let data = reader.bytes.subarray(o.streamStart, end);
  const filter = (/\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(o.dict) || [])[1] || '';
  let out = null;
  try {
    if (!filter) out = data;
    else if (/^(\/FlateDecode|\[\s*\/FlateDecode\s*\])$/.test(filter.trim())) out = await reader.inflate(data);
  } catch (e) { out = null; }
  reader.cache.set(num, out);
  return out;
}

const bodyOf = (reader, num) => { const o = reader.objs.get(num); return o ? (o.dict || o.text || '') : ''; };
const ref = (s, key) => { const m = new RegExp('/' + key + '\\s+(\\d+)\\s+\\d+\\s+R').exec(s); return m ? +m[1] : null; };
const nameVal = (s, key) => { const m = new RegExp('/' + key + '\\s*/([^\\s/<>\\[\\]()]+)').exec(s); return m ? m[1] : null; };

/** TrueType tables directory. */
function ttTables(f) {
  if (f.length < 12) return null;
  const dv = new DataView(f.buffer, f.byteOffset, f.byteLength);
  const n = dv.getUint16(4), t = {};
  for (let i = 0; i < n; i++) {
    const o = 12 + 16 * i;
    if (o + 16 > f.length) return null;
    t[String.fromCharCode(f[o], f[o + 1], f[o + 2], f[o + 3])] = { off: dv.getUint32(o + 8), len: dv.getUint32(o + 12) };
  }
  return { dv, t };
}

/** GID -> custom glyph name from a TrueType `post` table (format 2). Empty map when absent. */
export function postNames(f) {
  const out = new Map();
  const tt = ttTables(f);
  if (!tt || !tt.t.post) return out;
  const { dv } = tt, p = tt.t.post.off;
  if (p + 34 > f.length || dv.getUint32(p) !== 0x20000) return out;
  const n = dv.getUint16(p + 32);
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(dv.getUint16(p + 34 + 2 * i));
  const custom = [];
  let q = p + 34 + 2 * n;
  const end = Math.min(f.length, p + tt.t.post.len);
  while (q < end) { const L = f[q]; custom.push(String.fromCharCode(...f.subarray(q + 1, q + 1 + L))); q += 1 + L; }
  idx.forEach((j, gid) => { if (j >= 258 && custom[j - 258]) out.set(gid, custom[j - 258]); });
  return out;
}

/** code -> GID from the font's own cmap ((3,0) symbol or (1,0) Mac), formats 0, 4, 6. */
function builtinCmap(f) {
  const tt = ttTables(f);
  const out = new Map();
  if (!tt || !tt.t.cmap) return out;
  const { dv } = tt, c = tt.t.cmap.off;
  const n = dv.getUint16(c + 2);
  let sub = null;
  for (let i = 0; i < n; i++) {
    const pid = dv.getUint16(c + 4 + 8 * i), eid = dv.getUint16(c + 6 + 8 * i), off = dv.getUint32(c + 8 + 8 * i);
    if ((pid === 3 && eid === 0) || (!sub && pid === 1 && eid === 0)) sub = c + off;
  }
  if (sub === null) return out;
  const fmt = dv.getUint16(sub);
  if (fmt === 0) for (let k = 0; k < 256; k++) out.set(k, f[sub + 6 + k]);
  else if (fmt === 6) { const first = dv.getUint16(sub + 6), cnt = dv.getUint16(sub + 8); for (let k = 0; k < cnt; k++) out.set(first + k, dv.getUint16(sub + 10 + 2 * k)); }
  else if (fmt === 4) {
    const seg = dv.getUint16(sub + 6) / 2, ends = sub + 14, starts = ends + 2 * seg + 2, deltas = starts + 2 * seg, ranges = deltas + 2 * seg;
    for (let s = 0; s < seg; s++) {
      const e = dv.getUint16(ends + 2 * s), st = dv.getUint16(starts + 2 * s), d = dv.getInt16(deltas + 2 * s), ro = dv.getUint16(ranges + 2 * s);
      if (st === 0xFFFF) break;
      for (let code = st; code <= e && code - st < 4096; code++) {
        let g;
        if (!ro) g = (code + d) & 0xFFFF;
        else { const a = ranges + 2 * s + ro + 2 * (code - st); g = a + 2 <= f.length ? dv.getUint16(a) : 0; if (g) g = (g + d) & 0xFFFF; }
        // (3,0) symbol cmaps put codes at F000+code
        out.set(code >= 0xF000 && code <= 0xF0FF ? code - 0xF000 : code, g);
      }
    }
  }
  return out;
}

/**
 * Glyph names of the embedded fonts: BaseFont (with subset prefix) -> { format, names: Map<charcode, name> }.
 * `format` is 'truetype' | 'cff' | 'type1' | 'none'. `names` is empty when the font carries none.
 */
export async function embeddedGlyphNames(bytes, inflate) {
  const reader = await indexObjects(bytes, inflate);
  const out = new Map();
  for (const [num, o] of reader.objs) {
    const d = o.dict || o.text || '';
    if (!/\/Type\s*\/Font\b/.test(d)) continue;
    const sub = nameVal(d, 'Subtype');
    if (sub !== 'Type0' && sub !== 'TrueType') continue;
    const base = nameVal(d, 'BaseFont') || String(num);
    let desc = d, codeToGid = null;
    if (sub === 'Type0') {
      const enc = nameVal(d, 'Encoding');
      let dn = (/\/DescendantFonts\s*\[\s*(\d+)\s+\d+\s+R/.exec(d) || [])[1];
      if (!dn) { const r = ref(d, 'DescendantFonts'); if (r !== null) dn = (/(\d+)\s+\d+\s+R/.exec(bodyOf(reader, r)) || [])[1]; }
      if (!dn) continue;
      desc = bodyOf(reader, +dn);
      if (nameVal(desc, 'Subtype') !== 'CIDFontType2' || (enc && !/^Identity-[HV]$/.test(enc))) { out.set(base, { format: nameVal(desc, 'Subtype') === 'CIDFontType0' ? 'cff' : 'none', names: new Map() }); continue; }
      const map = ref(desc, 'CIDToGIDMap');
      if (map !== null) {
        const data = await streamData(reader, map);
        if (data) { codeToGid = new Map(); for (let k = 0; k + 1 < data.length; k += 2) { const g = (data[k] << 8) | data[k + 1]; if (g) codeToGid.set(k / 2, g); } }
      }
    }
    const fdn = ref(desc, 'FontDescriptor');
    const fd = fdn !== null ? bodyOf(reader, fdn) : '';
    const ff2 = ref(fd, 'FontFile2');
    if (ff2 === null) { out.set(base, { format: ref(fd, 'FontFile3') !== null ? 'cff' : ref(fd, 'FontFile') !== null ? 'type1' : 'none', names: new Map() }); continue; }
    const font = await streamData(reader, ff2);
    const names = new Map();
    if (font) {
      const gidNames = postNames(font);
      if (gidNames.size) {
        if (sub === 'TrueType') { for (const [code, g] of builtinCmap(font)) if (gidNames.has(g)) names.set(code, gidNames.get(g)); }
        else if (codeToGid) { for (const [code, g] of codeToGid) if (gidNames.has(g)) names.set(code, gidNames.get(g)); }
        else for (const [g, n] of gidNames) names.set(g, n); // Identity CIDToGIDMap: code = CID = GID
      }
    }
    out.set(base, { format: 'truetype', names });
  }
  return out;
}
