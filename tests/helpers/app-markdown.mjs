// VERBATIM copy of the app's Markdown importer from "My Library.html" (decoded template,
// lines 1139-1146, 1156, 1220-1312). Used only to test that the ingest renderer's output
// imports correctly in the app. Do not edit: re-copy if the app changes.
/* eslint-disable */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr = v => Array.isArray(v) ? v : (v ? [v] : []);
const stripD = s => String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '');
const norm = s => stripD(s).replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase();
const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const uid = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const dayKey = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const short = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const ALERT = { KEY:'key', IMPORTANT:'key', NOTE:'term', TERM:'term', TIP:'example', EXAMPLE:'example', WARNING:'myth', CAUTION:'myth', MYTH:'myth', LINK:'link', SEE:'link', EXPLAIN:'explain', SIMPLE:'explain' };
function inline(s){
  const codes = [];
  s = String(s == null ? '' : s).replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (m, a, u) => /^https?:/i.test(u) ? '<img src="' + u + '" alt="' + a + '" loading="lazy">' : a);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (m, t, u) => /^(https?:|mailto:)/i.test(u) ? '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>' : t);
  s = s.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (m, a, b) => '<strong>' + (a || b) + '</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  s = s.replace(/ {2,}\n|\\\n/g, '<br>').replace(/\n/g, ' ');
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => '<code>' + esc(codes[+i]) + '</code>');
  return s;
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
function parseList(L, i){
  const m0 = L[i].match(LIST_RE); const ind = m0[1].length; const ordered = /\d/.test(m0[2]); const items = [];
  while (i < L.length){
    const l = L[i];
    if (!l.trim()){ const nx = L[i + 1] && L[i + 1].match(LIST_RE); if (nx && nx[1].length >= ind){ i++; continue; } break; }
    const m = l.match(LIST_RE);
    if (m && m[1].length === ind){ items.push({ text:m[3], sub:'' }); i++; continue; }
    if (m && m[1].length > ind && items.length){ const r = parseList(L, i); items[items.length - 1].sub += r[0]; i = r[1]; continue; }
    if (!m && /^\s+\S/.test(l) && items.length){ items[items.length - 1].text += '\n' + l.trim(); i++; continue; }
    break;
  }
  const tag = ordered ? 'ol' : 'ul';
  return ['<' + tag + '>' + items.map(it => '<li>' + inline(it.text.replace(/^\[( |x)\]\s*/i, (m, c) => c.trim() ? '☑ ' : '☐ ')) + it.sub + '</li>').join('') + '</' + tag + '>', i];
}
function mdParse(src){
  const L = String(src).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'); const out = []; let i = 0;
  const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
  const isStart = l => /^\s*(#{1,6}\s|```|~~~|>)/.test(l) || LIST_RE.test(l) || HR.test(l);
  while (i < L.length){
    const l = L[i]; let m;
    if (!l.trim()){ i++; continue; }
    if ((m = l.match(/^\s*(```|~~~)/))){ const f = m[1]; const buf = []; i++; while (i < L.length && !L[i].trim().startsWith(f)){ buf.push(L[i]); i++; } i++; out.push({ html:'<pre dir="ltr"><code>' + esc(buf.join('\n')) + '</code></pre>' }); continue; }
    if ((m = l.match(/^\s*(#{1,6})\s+(.*?)\s*#*\s*$/))){ out.push({ h:m[1].length, text:m[2] }); i++; continue; }
    if (HR.test(l)){ out.push({ html:'<div class="orn" aria-hidden="true">۞</div>' }); i++; continue; }
    if (l.includes('|') && i + 1 < L.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(L[i + 1])){
      const row = r => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const head = row(l); i += 2; const rows = [];
      while (i < L.length && L[i].includes('|') && L[i].trim()){ rows.push(row(L[i])); i++; }
      out.push({ html:'<div class="tbl"><table><thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(r => '<tr>' + head.map((_, k) => '<td>' + inline(r[k] || '') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' });
      continue;
    }
    if (/^\s*>/.test(l)){
      const buf = []; while (i < L.length && /^\s*>/.test(L[i])){ buf.push(L[i].replace(/^\s*>\s?/, '')); i++; }
      const am = buf[0] && buf[0].match(/^\[!(\w+)\]\s*(.*)$/i);
      if (am){ const rest = buf.slice(1); if (am[2]) rest.unshift(am[2]); out.push({ box:{ kind:ALERT[am[1].toUpperCase()] || 'key', html:mdParse(rest.join('\n')).map(bHtml).join('') } }); }
      else out.push({ html:'<blockquote>' + mdParse(buf.join('\n')).map(bHtml).join('') + '</blockquote>' });
      continue;
    }
    if (LIST_RE.test(l)){ const r = parseList(L, i); out.push({ html:r[0] }); i = r[1]; continue; }
    const buf = []; while (i < L.length && L[i].trim() && !(buf.length && isStart(L[i]))){ buf.push(L[i]); i++; }
    out.push({ html:'<p>' + inline(buf.join('\n')) + '</p>' });
  }
  return out;
}
function bHtml(b){ if (b.h) return '<h4>' + inline(b.text) + '</h4>'; if (b.box) return b.box.html; return b.html; }
const toBlock = b => b.h ? { type:'h4', text:b.text } : b.box ? { type:'box', kind:b.box.kind, html:b.box.html } : { type:'html', html:b.html };
const words = bl => bl.reduce((n, b) => n + strip(b.html || (b.box && b.box.html) || b.text || '').split(/\s+/).filter(Boolean).length, 0);

function mdToItem(text, type, title){
  let bl = mdParse(text);
  const it = { id:uid(), type, title:title || '', subtitle:'', author:'', chapters:[], createdAt:Date.now(), progress:0 };
  const hs = bl.filter(b => b.h);
  if (hs.length){
    const top = Math.min(...hs.map(b => b.h));
    const tops = hs.filter(b => b.h === top);
    if (tops.length === 1 && bl.find(b => b.h) === tops[0]){ if (!it.title) it.title = tops[0].text; bl = bl.filter(b => b !== tops[0]); }
  }
  const levels = [...new Set(bl.filter(b => b.h).map(b => b.h))].sort((a, b) => a - b);
  let chL = null, secL = null;
  if (levels.length === 1){ if (type === 'book') chL = levels[0]; else secL = levels[0]; }
  else if (levels.length >= 2){ chL = levels[0]; secL = levels[1]; }
  const pre = []; let ch = null, sec = null;
  const newCh = t => { ch = { title:t, sections:[] }; it.chapters.push(ch); sec = null; };
  const newSec = t => { if (!ch) newCh(''); sec = { title:t, blocks:[] }; ch.sections.push(sec); };
  bl.forEach(b => {
    if (b.h && b.h === chL){ newCh(b.text); return; }
    if (b.h && b.h === secL){ newSec(b.text); return; }
    if (!ch && !sec){ pre.push(b); return; }
    if (!sec) newSec('');
    sec.blocks.push(toBlock(b));
  });
  if (!it.chapters.length){ it.chapters.push({ title:'', sections:[{ title:'', blocks:pre.map(toBlock) }] }); pre.length = 0; }
  if (pre.length === 1 && pre[0].html && /^<p>/.test(pre[0].html) && strip(pre[0].html).length < 220){ it.subtitle = strip(pre[0].html); }
  else if (pre.length) it.intro = { blocks:pre.map(toBlock) };
  it.chapters.forEach(c => { c.minutes = Math.max(1, Math.round(c.sections.reduce((n, s) => n + words(s.blocks), 0) / 200)); });
  if (!it.title){ const first = strip(bl.map(bHtml).join(' ')); it.title = short(first, 40) || 'بدون عنوان'; }
  return it;
}
export { mdParse, mdToItem, inline, strip };
