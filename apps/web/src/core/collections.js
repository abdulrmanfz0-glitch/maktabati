// Pure collection logic: user-made shelves that group books.
// No DOM, no IndexedDB, no network. The caller supplies kv entries as [key, value] pairs.
//
// A collection is stored in the kv store under "col:<id>" with:
//   { id, name, createdAt, bookIds: [itemId, ...] }
// Membership lives in the collection, so a book can be in any number of collections and
// renaming or regrouping never rewrites the book itself.

export const COL_PREFIX = 'col:';
export const FILTER_ALL = 'all';
export const FILTER_UNFILED = 'none';
export const MAX_NAME = 80;

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string';
const isId = v => isStr(v) && v.length > 0 && v.length < 200;
const isNum = v => typeof v === 'number' && Number.isFinite(v);

export const collectionKey = id => COL_PREFIX + id;
export const isCollectionKey = k => isStr(k) && k.startsWith(COL_PREFIX);
export const idFromKey = k => (isCollectionKey(k) ? k.slice(COL_PREFIX.length) : null);

/** Trim and collapse whitespace, cap the length, and return '' when nothing is left. */
export function cleanName(raw){
  const s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const chars = Array.from(s);
  return chars.length > MAX_NAME ? chars.slice(0, MAX_NAME).join('') : s;
}

function uniqueIds(list){
  const out = [], seen = new Set();
  (Array.isArray(list) ? list : []).forEach(x => {
    if (isId(x) && !seen.has(x)){ seen.add(x); out.push(x); }
  });
  return out;
}

/** Build a new collection document, or null when the id or name is unusable. */
export function makeCollection({ id, name, bookIds = [], createdAt = Date.now() } = {}){
  const n = cleanName(name);
  if (!isId(id) || !n) return null;
  return { id, name: n, createdAt: isNum(createdAt) ? createdAt : Date.now(), bookIds: uniqueIds(bookIds) };
}

export function validateCollection(doc){
  if (!isObj(doc)) return ['not-an-object'];
  const errors = [];
  if (!isId(doc.id)) errors.push('id');
  if (!isStr(doc.name) || !cleanName(doc.name)) errors.push('name');
  if (!isNum(doc.createdAt)) errors.push('createdAt');
  if (!Array.isArray(doc.bookIds) || !doc.bookIds.every(isId)) errors.push('bookIds');
  return errors;
}

/** Read collections out of kv entries, dropping anything malformed. The key is the identity. */
export function collectionsFromKv(entries){
  const out = [];
  for (const [k, v] of entries || []){
    if (!isCollectionKey(k) || !isObj(v)) continue;
    const doc = Object.assign({}, v, { id: idFromKey(k) });
    if (validateCollection(doc).length) continue;
    out.push(Object.assign({}, doc, { name: cleanName(doc.name), bookIds: uniqueIds(doc.bookIds) }));
  }
  return out;
}

export function sortCollections(list, locale = 'ar'){
  return (Array.isArray(list) ? list : []).slice().sort((a, b) =>
    String(a.name).localeCompare(String(b.name), locale) ||
    (a.createdAt || 0) - (b.createdAt || 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export const hasBook = (col, bookId) => !!col && Array.isArray(col.bookIds) && col.bookIds.includes(bookId);

/** Returns the same object when nothing changed, so callers can skip a write. */
export function addBookToCollection(col, bookId){
  if (!col || !isId(bookId) || hasBook(col, bookId)) return col;
  return Object.assign({}, col, { bookIds: col.bookIds.concat(bookId) });
}

/** Returns the same object when nothing changed. */
export function removeBookFromCollection(col, bookId){
  if (!col || !hasBook(col, bookId)) return col;
  return Object.assign({}, col, { bookIds: col.bookIds.filter(x => x !== bookId) });
}

/** Returns the same object when the name is empty or unchanged. */
export function renameCollection(col, name){
  const n = cleanName(name);
  if (!col || !n || n === col.name) return col;
  return Object.assign({}, col, { name: n });
}

/** Count only books that still exist, so a stale id cannot inflate the number. */
export function countCollectionBooks(col, knownIds){
  const set = knownIds instanceof Set ? knownIds : new Set(knownIds || []);
  return uniqueIds(col && col.bookIds).filter(id => set.has(id)).length;
}

export function collectionsOfBook(list, bookId){
  return (Array.isArray(list) ? list : []).filter(c => hasBook(c, bookId));
}

/** filter is FILTER_ALL, FILTER_UNFILED, or a collection id. */
export function filterByCollection(items, list, filter){
  const all = Array.isArray(items) ? items : [];
  if (!filter || filter === FILTER_ALL) return all;
  if (filter === FILTER_UNFILED){
    const filed = new Set();
    (Array.isArray(list) ? list : []).forEach(c => c.bookIds.forEach(id => filed.add(id)));
    return all.filter(it => !filed.has(it.id));
  }
  const col = (Array.isArray(list) ? list : []).find(c => c.id === filter);
  if (!col) return [];
  const ids = new Set(col.bookIds);
  return all.filter(it => ids.has(it.id));
}

/** Every collection that contained the book, with the book removed. Unchanged ones are left out. */
export function removeBookFromAll(list, bookId){
  const changed = [];
  (Array.isArray(list) ? list : []).forEach(c => {
    const next = removeBookFromCollection(c, bookId);
    if (next !== c) changed.push(next);
  });
  return changed;
}
