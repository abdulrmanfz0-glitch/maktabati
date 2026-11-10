// Pure validation and import planning for Maktabati library exports.
// No DOM, IndexedDB, or network. The caller supplies the existing records and,
// when it wants phase-1 figure decoding, a decoder function.

export const EXPORT_VERSION = 1;
export const FIGURE_TYPES = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i;

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string';
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isId = v => isStr(v) && v.length > 0 && v.length < 200;
const isArr = Array.isArray;
const strArr = v => isArr(v) && v.every(isStr);
const BLOCK_TYPES = new Set(['p', 'h4', 'list', 'box', 'figure', 'diagram', 'html']);
const BOX_KINDS = new Set(['key', 'term', 'example', 'myth', 'link', 'explain']);
const ANNO_KINDS = new Set(['hl', 'term', 'bm', 'quote']);
const HK = new Set(['imp', 'unc', 'q']);

const err = (errors, path, message) => errors.push(path ? path + ': ' + message : message);

function checkBlock(b, path, errors) {
  if (!isObj(b)) return err(errors, path, 'الكتلة ليست كائنًا.');
  if (!isStr(b.type) || !BLOCK_TYPES.has(b.type)) return err(errors, path, 'نوع الكتلة غير معروف.');
  if (b.by != null && !isStr(b.by)) err(errors, path, 'حقل by يجب أن يكون نصًا.');
  switch (b.type) {
    case 'p':
    case 'h4':
      if (!isStr(b.text) && !strArr(b.text)) err(errors, path, 'حقل text يجب أن يكون نصًا أو قائمة نصوص.');
      break;
    case 'list':
      if (!strArr(b.items)) err(errors, path, 'حقل items يجب أن يكون قائمة نصوص.');
      break;
    case 'box':
      if (!isStr(b.kind) || !BOX_KINDS.has(b.kind)) err(errors, path, 'نوع الصندوق غير معروف.');
      if (!isStr(b.text) && !strArr(b.text) && !isStr(b.html)) err(errors, path, 'الصندوق يحتاج text أو html.');
      if (b.title != null && !isStr(b.title)) err(errors, path, 'حقل title يجب أن يكون نصًا.');
      if (b.en != null && !isStr(b.en)) err(errors, path, 'حقل en يجب أن يكون نصًا.');
      if (b.html != null && !isStr(b.html)) err(errors, path, 'حقل html يجب أن يكون نصًا.');
      break;
    case 'figure':
      if (b.src != null && !isStr(b.src)) err(errors, path, 'حقل src يجب أن يكون نصًا.');
      if (b.fig != null && !isStr(b.fig)) err(errors, path, 'حقل fig يجب أن يكون نصًا.');
      if (b.alt != null && !isStr(b.alt)) err(errors, path, 'حقل alt يجب أن يكون نصًا.');
      if (b.caption != null && !isStr(b.caption)) err(errors, path, 'حقل caption يجب أن يكون نصًا.');
      if (b.src == null && b.fig == null && b.alt == null) err(errors, path, 'الشكل يحتاج src أو fig أو alt.');
      break;
    case 'diagram':
      if (!strArr(b.steps)) err(errors, path, 'حقل steps يجب أن يكون قائمة نصوص.');
      if (b.loop != null && typeof b.loop !== 'boolean') err(errors, path, 'حقل loop يجب أن يكون منطقيًا.');
      if (b.caption != null && !isStr(b.caption)) err(errors, path, 'حقل caption يجب أن يكون نصًا.');
      break;
    case 'html':
      if (!isStr(b.html)) err(errors, path, 'الكتلة html تحتاج نص html.');
      break;
  }
}

function checkSection(s, path, errors) {
  if (!isObj(s)) return err(errors, path, 'القسم ليس كائنًا.');
  if (!isStr(s.title)) err(errors, path, 'عنوان القسم يجب أن يكون نصًا.');
  if (!isArr(s.blocks)) return err(errors, path, 'حقل blocks يجب أن يكون قائمة.');
  s.blocks.forEach((b, i) => checkBlock(b, path + '.blocks[' + i + ']', errors));
  if (s.recall != null) {
    if (!isObj(s.recall)) err(errors, path, 'حقل recall يجب أن يكون كائنًا.');
    else {
      if (!isStr(s.recall.q)) err(errors, path + '.recall', 'حقل q يجب أن يكون نصًا.');
      if (!isStr(s.recall.a)) err(errors, path + '.recall', 'حقل a يجب أن يكون نصًا.');
    }
  }
}

function checkChapter(c, path, errors) {
  if (!isObj(c)) return err(errors, path, 'الفصل ليس كائنًا.');
  if (!isStr(c.title)) err(errors, path, 'عنوان الفصل يجب أن يكون نصًا.');
  if (!isArr(c.sections)) return err(errors, path, 'حقل sections يجب أن يكون قائمة.');
  c.sections.forEach((s, i) => checkSection(s, path + '.sections[' + i + ']', errors));
  if (c.overview != null && !strArr(c.overview)) err(errors, path, 'حقل overview يجب أن يكون قائمة نصوص.');
  if (c.question != null && !isStr(c.question)) err(errors, path, 'حقل question يجب أن يكون نصًا.');
  if (c.minutes != null && !isNum(c.minutes)) err(errors, path, 'حقل minutes يجب أن يكون رقمًا.');
  if (c.notes != null) {
    if (!isArr(c.notes)) err(errors, path, 'حقل notes يجب أن يكون قائمة.');
    else c.notes.forEach((n, i) => {
      if (!isObj(n) || !isStr(n.id) || !isStr(n.text)) err(errors, path + '.notes[' + i + ']', 'الحاشية تحتاج id و text نصيين.');
    });
  }
  if (c.review != null) {
    if (!isArr(c.review)) err(errors, path, 'حقل review يجب أن يكون قائمة.');
    else c.review.forEach((r, i) => {
      if (!isObj(r) || !isStr(r.q) || !isStr(r.a)) err(errors, path + '.review[' + i + ']', 'سؤال المراجعة يحتاج q و a نصيين.');
      if (r && r.applied != null && typeof r.applied !== 'boolean') err(errors, path + '.review[' + i + ']', 'حقل applied يجب أن يكون منطقيًا.');
    });
  }
  if (c.terms != null) {
    if (!isArr(c.terms)) err(errors, path, 'حقل terms يجب أن يكون قائمة.');
    else c.terms.forEach((t, i) => {
      if (!isObj(t) || !isStr(t.ar) || !isStr(t.def)) err(errors, path + '.terms[' + i + ']', 'المصطلح يحتاج ar و def نصيين.');
      if (t && t.en != null && !isStr(t.en)) err(errors, path + '.terms[' + i + ']', 'حقل en يجب أن يكون نصًا.');
    });
  }
}

function checkIntro(intro, path, errors) {
  if (!isObj(intro)) return err(errors, path, 'المقدمة يجب أن تكون كائنًا.');
  if (intro.opening != null && !isStr(intro.opening)) err(errors, path, 'حقل opening يجب أن يكون نصًا.');
  if (intro.body != null && !strArr(intro.body)) err(errors, path, 'حقل body يجب أن يكون قائمة نصوص.');
  if (intro.blocks != null) {
    if (!isArr(intro.blocks)) err(errors, path, 'حقل blocks يجب أن يكون قائمة.');
    else intro.blocks.forEach((b, i) => checkBlock(b, path + '.blocks[' + i + ']', errors));
  }
}

export function validateItem(it, path, errors) {
  if (!isObj(it)) return err(errors, path, 'العنصر ليس كائنًا.');
  if (!isId(it.id)) err(errors, path, 'المعرّف id مفقود أو غير صالح.');
  if (!isStr(it.title)) err(errors, path, 'العنوان title يجب أن يكون نصًا.');
  if (it.type != null && !isStr(it.type)) err(errors, path, 'حقل type يجب أن يكون نصًا.');
  if (it.chapters != null && !isArr(it.chapters)) err(errors, path, 'حقل chapters يجب أن يكون قائمة.');
  const chapters = it.chapters == null ? [] : it.chapters;
  chapters.forEach((c, i) => checkChapter(c, path + '.chapters[' + i + ']', errors));
  if (it.intro != null) checkIntro(it.intro, path + '.intro', errors);
  if (it.conclusion != null) {
    if (!isObj(it.conclusion)) err(errors, path + '.conclusion', 'الخاتمة يجب أن تكون كائنًا.');
    else {
      if (it.conclusion.ideas != null && !strArr(it.conclusion.ideas)) err(errors, path + '.conclusion', 'حقل ideas يجب أن يكون قائمة نصوص.');
      if (it.conclusion.applyPrompt != null && !isStr(it.conclusion.applyPrompt)) err(errors, path + '.conclusion', 'حقل applyPrompt يجب أن يكون نصًا.');
    }
  }
  if (it.createdAt != null && !isNum(it.createdAt)) err(errors, path, 'حقل createdAt يجب أن يكون رقمًا.');
  if (it.progress != null && (!isNum(it.progress) || it.progress < 0 || it.progress > 1)) err(errors, path, 'حقل progress يجب أن يكون رقمًا بين 0 و1.');
  if (it.lastOpened != null && !isNum(it.lastOpened)) err(errors, path, 'حقل lastOpened يجب أن يكون رقمًا.');
  if (it.hash != null && !isStr(it.hash)) err(errors, path, 'حقل hash يجب أن يكون نصًا.');
  if (it.cover != null && !isStr(it.cover)) err(errors, path, 'حقل cover يجب أن يكون نصًا.');
  if (it.whyRead != null && !isStr(it.whyRead)) err(errors, path, 'حقل whyRead يجب أن يكون نصًا.');
  if (it.author != null && !isStr(it.author)) err(errors, path, 'حقل author يجب أن يكون نصًا.');
  if (it.subtitle != null && !isStr(it.subtitle)) err(errors, path, 'حقل subtitle يجب أن يكون نصًا.');
  if (it.lang != null && !isStr(it.lang)) err(errors, path, 'حقل lang يجب أن يكون نصًا.');
  if (it.ingest != null && !isObj(it.ingest)) err(errors, path, 'حقل ingest يجب أن يكون كائنًا.');
  return errors;
}

export function validateAnno(a, path, errors) {
  if (!isObj(a)) return err(errors, path, 'التظليل ليس كائنًا.');
  if (!isId(a.id)) err(errors, path, 'المعرّف id مفقود أو غير صالح.');
  if (!isStr(a.kind) || !ANNO_KINDS.has(a.kind)) err(errors, path, 'نوع التظليل غير معروف.');
  if (!isId(a.itemId)) err(errors, path, 'حقل itemId مفقود أو غير صالح.');
  if (!isStr(a.bk)) err(errors, path, 'حقل bk يجب أن يكون نصًا.');
  if (a.kind === 'hl') {
    if (!isStr(a.text)) err(errors, path, 'التظليل يحتاج text نصيًا.');
    if (a.hk != null && (!isStr(a.hk) || !HK.has(a.hk))) err(errors, path, 'نوع hk غير معروف.');
    if (a.note != null && !isStr(a.note)) err(errors, path, 'حقل note يجب أن يكون نصًا.');
    if (a.links != null && !strArr(a.links)) err(errors, path, 'حقل links يجب أن يكون قائمة نصوص.');
  }
  if (a.kind === 'quote' && !isStr(a.text)) err(errors, path, 'الاقتباس يحتاج text نصيًا.');
  if (a.kind === 'term') {
    if (!isStr(a.ar)) err(errors, path, 'المصطلح يحتاج ar نصيًا.');
    if (a.en != null && !isStr(a.en)) err(errors, path, 'حقل en يجب أن يكون نصًا.');
    if (a.def != null && !isStr(a.def)) err(errors, path, 'حقل def يجب أن يكون نصًا.');
  }
  if (a.kind === 'bm') {
    if (a.ex != null && !isStr(a.ex)) err(errors, path, 'حقل ex يجب أن يكون نصًا.');
    if (a.pi != null && !isNum(a.pi)) err(errors, path, 'حقل pi يجب أن يكون رقمًا.');
    if (a.ch != null && !isNum(a.ch)) err(errors, path, 'حقل ch يجب أن يكون رقمًا.');
  }
  if (a.t != null && !isNum(a.t)) err(errors, path, 'حقل t يجب أن يكون رقمًا.');
  return errors;
}

function checkCards(v, path, errors) {
  if (!isObj(v)) return err(errors, path, 'بطاقات المراجعة يجب أن تكون كائنًا.');
  Object.keys(v).forEach(k => {
    const c = v[k];
    if (!isObj(c) || !isNum(c.stage) || !isNum(c.due)) err(errors, path + '.' + k, 'البطاقة تحتاج stage و due رقميين.');
  });
}

function checkChat(v, path, errors) {
  if (!isArr(v)) return err(errors, path, 'المحادثات يجب أن تكون قائمة.');
  v.forEach((c, i) => {
    const p = path + '[' + i + ']';
    if (!isObj(c) || !isId(c.id) || !isNum(c.t) || !isArr(c.msgs)) return err(errors, p, 'المحادثة تحتاج id و t و msgs.');
    c.msgs.forEach((m, j) => {
      if (!isObj(m) || (m.role !== 'user' && m.role !== 'assistant') || !isStr(m.content)) err(errors, p + '.msgs[' + j + ']', 'الرسالة تحتاج role و content.');
      if (m.mode != null && !isStr(m.mode)) err(errors, p + '.msgs[' + j + ']', 'حقل mode يجب أن يكون نصًا.');
      if (m.attach != null && !isStr(m.attach)) err(errors, p + '.msgs[' + j + ']', 'حقل attach يجب أن يكون نصًا.');
      if (m.where != null && !isStr(m.where)) err(errors, p + '.msgs[' + j + ']', 'حقل where يجب أن يكون نصًا.');
      if (m.err != null && !isStr(m.err)) err(errors, p + '.msgs[' + j + ']', 'حقل err يجب أن يكون نصًا.');
      if (m.cards != null && !strArr(m.cards)) err(errors, p + '.msgs[' + j + ']', 'حقل cards يجب أن يكون قائمة نصوص.');
    });
  });
}

function checkKv(kv, path, errors) {
  if (!isArr(kv)) return err(errors, path, 'حقل kv يجب أن يكون قائمة.');
  const seen = new Set();
  kv.forEach((x, i) => {
    const p = path + '[' + i + ']';
    if (!isObj(x) || !isStr(x.k) || !x.k) return err(errors, p, 'مدخل kv يحتاج k نصيًا.');
    if (seen.has(x.k)) err(errors, p, 'مفتاح kv مكرر: ' + x.k + '.');
    seen.add(x.k);
    if (x.k === 'cards') checkCards(x.v, p + '.v', errors);
    else if (/^chat:/.test(x.k)) checkChat(x.v, p + '.v', errors);
    else if (/^fig:/.test(x.k) && (!isStr(x.v) || !FIGURE_TYPES.test(x.v))) err(errors, p + '.v', 'الشكل المخزّن ليس صورة data URL صالحة.');
  });
}

export function validateLibrary(data) {
  const errors = [];
  if (!isObj(data)) return { ok: false, errors: ['الملف ليس كائن JSON صالح.'] };
  if (data.app !== 'maktabati') err(errors, 'app', 'الملف ليس ملف تصدير من مكتبتي.');
  const version = data.v == null ? 1 : data.v;
  if (version !== EXPORT_VERSION) err(errors, 'v', 'إصدار ملف التصدير غير مدعوم (وجدت ' + String(version) + '، المدعوم ' + EXPORT_VERSION + ').');
  if (!isArr(data.items)) err(errors, 'items', 'حقل items يجب أن يكون قائمة.');
  if (!isArr(data.annos)) err(errors, 'annos', 'حقل annos يجب أن يكون قائمة.');
  if (!isArr(data.kv)) err(errors, 'kv', 'حقل kv يجب أن يكون قائمة.');
  if (data.exported != null && !isStr(data.exported)) err(errors, 'exported', 'حقل exported يجب أن يكون نصًا.');
  const ids = new Set();
  if (isArr(data.items)) data.items.forEach((it, i) => {
    validateItem(it, 'items[' + i + ']', errors);
    if (isObj(it) && isId(it.id)) {
      if (ids.has(it.id)) err(errors, 'items[' + i + ']', 'معرّف عنصر مكرر: ' + it.id + '.');
      ids.add(it.id);
    }
  });
  const annoIds = new Set();
  if (isArr(data.annos)) data.annos.forEach((a, i) => {
    validateAnno(a, 'annos[' + i + ']', errors);
    if (isObj(a) && isId(a.id)) {
      if (annoIds.has(a.id)) err(errors, 'annos[' + i + ']', 'معرّف تظليل مكرر: ' + a.id + '.');
      annoIds.add(a.id);
    }
  });
  if (isArr(data.kv)) checkKv(data.kv, 'kv', errors);
  return { ok: errors.length === 0, errors, version };
}

/**
 * Phase 1: validate, decode figures, and decide what is new.
 * @param {object} data parsed export
 * @param {{items?: Array, annos?: Array, kv?: Array|Map}} existing current records
 * @param {(dataUrl: string) => any} [decodeFigure] optional decoder; throw or return falsy on failure
 */
export function planLibraryImport(data, existing = {}, decodeFigure = null) {
  const checked = validateLibrary(data);
  if (!checked.ok) return { ok: false, errors: checked.errors, writes: null, skipped: null };
  const errors = [];
  const oldItems = new Map((existing.items || []).map(it => [it.id, it]));
  const oldHashes = new Set((existing.items || []).map(it => it.hash).filter(Boolean));
  const oldAnnos = new Set((existing.annos || []).map(a => a.id));
  const oldKv = existing.kv instanceof Map ? existing.kv : new Map((existing.kv || []).map(x => [x.k, x.v]));
  const items = [], annos = [], kv = [];
  const newHashes = new Set();
  let skipped = 0;

  data.items.forEach(it => {
    if (oldItems.has(it.id) || (it.hash && (oldHashes.has(it.hash) || newHashes.has(it.hash)))) { skipped++; return; }
    if (it.hash) newHashes.add(it.hash);
    items.push(it);
  });
  data.annos.forEach(a => {
    if (oldAnnos.has(a.id)) { skipped++; return; }
    annos.push(a);
  });

  for (const x of data.kv) {
    if (x.k === 'cards' && isObj(x.v)) {
      const cur = oldKv.get('cards');
      const cards = isObj(cur) ? Object.assign({}, cur) : {};
      let added = 0;
      Object.keys(x.v).forEach(k => {
        if (cards[k]) { skipped++; return; }
        cards[k] = x.v[k]; added++;
      });
      if (added) kv.push({ k: 'cards', v: cards });
      continue;
    }
    if (/^chat:/.test(x.k) && isArr(x.v)) {
      const cur = isArr(oldKv.get(x.k)) ? oldKv.get(x.k).slice() : [];
      const ids = new Set(cur.map(c => c && c.id));
      const add = x.v.filter(c => {
        if (c && c.id && ids.has(c.id)) { skipped++; return false; }
        return true;
      });
      if (add.length) kv.push({ k: x.k, v: cur.concat(add).slice(-30) });
      continue;
    }
    if (/^fig:/.test(x.k)) {
      if (oldKv.has(x.k)) { skipped++; continue; }
      let blob = null;
      try { blob = decodeFigure ? decodeFigure(x.v) : x.v; } catch (e) { blob = null; }
      if (!blob) { errors.push(x.k + ': تعذّر فك الصورة من data URL.'); continue; }
      kv.push({ k: x.k, v: blob });
      continue;
    }
    if (oldKv.has(x.k)) { skipped++; continue; }
    kv.push(x);
  }

  if (errors.length) return { ok: false, errors, writes: null, skipped: null };
  return { ok: true, errors: [], writes: { items, annos, kv }, skipped };
}
