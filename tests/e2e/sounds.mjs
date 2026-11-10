#!/usr/bin/env node
// Recorded ambient sounds: lazy loading, decoding (Opus/WebM and the AAC/M4A fallback), single-file behavior, credits.
//
//   node tests/e2e/sounds.mjs
//
// Runs against dist/web (build first) and dist/single. Headless Chrome cannot be listened to, so this checks that each
// file is requested only when its sound is turned on, decodes to the expected length, and never errors.
import path from 'node:path';
import { launch } from '../../tools/lib/cdp.mjs';
import { serve } from '../../tools/lib/static-server.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const LEN = { rain: 55, fire: 49, wind: 31, waves: 43, desert: 56 }; // loop + 2 x 0.5 s pad
const results = [];

async function run(srv, page, label, { forceM4a = false } = {}) {
  const b = await launch({ width: 390, height: 844, mobile: true });
  const ev = x => b.evaluate(x);
  const settle = async (ms = 500) => { await b.sleep(ms); };
  const item = async (id, fn) => {
    try { results.push([label, id, 'PASS', (await fn()) || '']); } catch (e) { results.push([label, id, 'FAIL', String(e.message || e).slice(0, 220)]); }
    if (b.errors.length) results.push([label, id, 'FAIL', 'JS error: ' + b.errors.splice(0).join(' | ').slice(0, 200)]);
  };
  const assert = (c, m) => { if (!c) throw new Error(m); };
  // record every decode, and optionally pretend the browser cannot play Opus (Safari path)
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__dec = [];
    const d = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function (buf) { return d.call(this, buf).then(r => { __dec.push([r.duration, r.numberOfChannels]); return r; }, e => { __dec.push(['error', String(e)]); throw e; }); };
    ${forceM4a ? `HTMLMediaElement.prototype.canPlayType = t => /webm/.test(t) ? '' : 'probably';` : ''}` });
  const sounds = () => ev(`performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('/sounds/')).map(n => n.split('/sounds/')[1])`);
  try {
    await b.goto(srv.url + '/' + page); await b.waitFor(`!!document.querySelector('main .view:not([hidden])')`, 20000); await settle(1200);
    await ev(`location.hash = '#/book/demo-experience'`); await settle(900);
    await ev(`document.querySelector('#v-book [data-bpa="snd"]').click()`); await settle(400);
    const web = !page.includes('single');

    await item('panel', async () => {
      const rows = await ev(`[...document.querySelectorAll('#sndPanel [data-sn]')].map(x => x.dataset.sn).join(',')`);
      const note = await ev(`!!document.querySelector('#sndPanel .snd-web')`);
      if (web) assert(rows === 'rain,thunder,wind,fire,waves,desert,brown' && !note, 'rows ' + rows + ' note ' + note);
      else assert(rows === 'brown' && note, 'rows ' + rows + ' note ' + note);
      assert((await sounds()).length === 0, 'files requested before any sound was turned on: ' + (await sounds()));
      return rows;
    });
    if (web) {
      await item('lazy-rain', async () => {
        await ev(`document.querySelector('#sndPanel [data-sn="rain"]').click()`); await settle(2500);
        const got = await sounds(), ext = forceM4a ? 'm4a' : 'webm';
        assert(got.length === 1 && got[0] === 'rain.' + ext, 'requested ' + got);
        const dec = await ev('__dec'); assert(dec.length === 1 && Math.abs(dec[0][0] - LEN.rain) < .01, 'decoded ' + JSON.stringify(dec));
        assert(!(await ev(`document.querySelector('#toast').textContent.includes('تعذّر')`)), 'error toast');
        return got[0] + ' ' + dec[0][0].toFixed(3) + ' s, ' + dec[0][1] + ' ch';
      });
      await item('all-loops', async () => {
        for (const id of ['fire', 'wind', 'waves', 'desert']) { await ev(`document.querySelector('#sndPanel [data-sn="${id}"]').click()`); await settle(1500); }
        const dec = await ev('__dec'); const bad = dec.filter(d => d[0] === 'error');
        assert(!bad.length, 'decode errors ' + JSON.stringify(bad));
        const lens = dec.map(d => d[0].toFixed(2)).join(' ');
        assert(dec.length === 5, 'decoded ' + dec.length + ': ' + lens);
        return lens;
      });
      await item('thunder', async () => {
        await ev(`document.querySelector('#sndPanel [data-sn="thunder"]').click()`); await settle(3000);
        const got = (await sounds()).filter(n => n.startsWith('thunder'));
        assert(got.length === 3, 'rumbles requested: ' + got);
        assert((await ev(`document.querySelector('#sndPanel [data-sv="thunder"]').value`)) === '20', 'thunder default volume is not low');
        return got.join(' ');
      });
      await item('credits', async () => {
        await ev(`location.hash = '#/profile/about'`); await settle(800);
        const t = await ev(`document.querySelector('#v-profile').textContent`);
        for (const u of ['jmbphilmes', 'samarobryn', 'sleepCircle', 'Noted451', 'kyles', 'BlueDelta', 'CC0']) assert(t.includes(u), 'missing ' + u);
      });
    } else {
      await item('no-files', async () => {
        await ev(`document.querySelector('#sndPanel [data-sn="brown"]').click()`); await settle(1500);
        assert((await sounds()).length === 0, 'single file requested sound files');
        await ev(`location.hash = '#/profile/about'`); await settle(800);
        assert(!(await ev(`document.querySelector('#v-profile').textContent.includes('Freesound')`)), 'credits shown without recordings');
      });
    }
  } finally { await b.close(); }
}

const srv = await serve(ROOT);
await run(srv, 'dist/web/index.html', 'web');
await run(srv, 'dist/web/index.html', 'web-m4a', { forceM4a: true });
await run(srv, 'dist/single/index.html', 'single');
await srv.close();
for (const r of results) console.log(r[2].padEnd(4) + ' ' + (r[0] + ' ' + r[1]).padEnd(22) + ' ' + r[3]);
const fail = results.filter(r => r[2] === 'FAIL').length;
console.log('\n' + (results.length - fail) + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
