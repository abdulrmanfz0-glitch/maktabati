#!/usr/bin/env node
// Repeatable UI performance probe. Run against the Vite dev server:
//   node tools/bench-ui.mjs http://127.0.0.1:5173/ [N]
// It seeds synthetic library data, then measures library render, idea-map render
// (through the dev __mapGen hook), and library-context assembly.
import { launch } from './lib/cdp.mjs';

const page = process.argv[2] || 'http://127.0.0.1:5173/';
const N = Math.max(20, Math.min(300, +(process.argv[3] || 80)));
const b = await launch({ width: 1280, height: 900 });
const ev = x => b.evaluate(x);
const sleep = ms => b.sleep(ms);

const words = 'الكتاب المعرفة الفكرة المعنى السياق التاريخ اللغة القراءة الفهم'.split(' ');
const text = i => Array.from({ length: 30 }, (_, k) => words[(i + k) % words.length]).join(' ') + '.';
const items = Array.from({ length: N }, (_, i) => ({
  id:'bench-' + i, type:'book', title:'كتاب تجريبي ' + (i + 1), author:'مؤلف',
  createdAt:Date.now() - i * 1000, progress:(i % 10) / 10, lastOpened:Date.now() - i * 500,
  chapters:Array.from({ length: 4 }, (_, ci) => ({
    title:'الفصل ' + (ci + 1),
    sections:Array.from({ length: 2 }, (_, si) => ({
      title:'قسم ' + (si + 1),
      blocks:[{ type:'p', text:text(i + ci + si) }, { type:'p', text:text(i + ci + si + 1) }]
    }))
  }))
}));
const annos = [];
for (let i = 0; i < N; i++) for (let k = 0; k < 8; k++) annos.push({
  id:'bench-a-' + i + '-' + k, kind:'hl', hk:k % 3 === 0 ? 'unc' : k % 3 === 1 ? 'q' : 'imp',
  itemId:'bench-' + i, bk:'0-0-0', text:'تظليل رقم ' + k + ' في الكتاب ' + (i + 1), note:'', links:[], t:Date.now() - k
});

async function seed(){
  const payload = JSON.stringify({ items, annos });
  await ev(`new Promise((res, rej) => {
    const req = indexedDB.open('maktabati');
    req.onerror = () => rej(req.error);
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction(['items','annos'], 'readwrite');
      tx.objectStore('items').clear(); tx.objectStore('annos').clear();
      const d = ${payload};
      d.items.forEach(x => tx.objectStore('items').put(x));
      d.annos.forEach(x => tx.objectStore('annos').put(x));
      tx.oncomplete = () => { db.close(); res(true); };
      tx.onerror = () => rej(tx.error);
    };
  })`);
  await b.reload();
  await b.waitFor(`!!document.querySelector('#v-home #chIn')`, 20000);
}

async function route(hash, sel){
  return ev(`(async () => {
    const t = performance.now();
    location.hash = ${JSON.stringify(hash)};
    await new Promise(r => {
      let n = 0;
      const f = () => { if (document.querySelector(${JSON.stringify(sel)})) return r(); if (++n > 300) return r(); requestAnimationFrame(f); };
      requestAnimationFrame(f);
    });
    return performance.now() - t;
  })()`);
}

async function median(fn, runs = 3){
  const a = [];
  for (let i = 0; i < runs; i++) a.push(await fn());
  a.sort((x, y) => x - y);
  return Math.round(a[Math.floor(a.length / 2)] * 10) / 10;
}

try{
  await b.goto(page);
  await b.waitFor(`!!document.querySelector('#v-home #chIn')`, 20000);
  await seed();
  await route('#/', '#v-home');
  const lib = await median(() => route('#/lib', '#v-lib .card'), 2);
  const map = await median(async () => {
    await ev(`window.__mapGen = ${N * 8}`);
    await route('#/', '#v-home');
    return route('#/map', '#mapcv');
  }, 3);
  const ctx = await median(async () => {
    const r = await ev(`window.__bench.context()`);
    return r.ms;
  }, 3);
  const ctxInfo = await ev(`window.__bench.context()`);
  console.log(JSON.stringify({ profile:'vite-dev', items:N, annos:annos.length, mapNodes:N * 8, libraryMs:lib, mapMs:map, contextMs:ctx, contextChars:ctxInfo.chars, contextMessages:ctxInfo.messages }));
} finally { await b.close(); }
