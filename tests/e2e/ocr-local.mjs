#!/usr/bin/env node
// Local OCR engine e2e: the dev check page OCRs known Arabic text drawn with the
// bundled font. Asserts key words and CER, and — by watching CDP network events,
// which include worker-initiated fetches — that every request hits our own origin
// and zero requests go anywhere else.
import path from 'node:path';
import { launch } from '../../tools/lib/cdp.mjs';
import { serve } from '../../tools/lib/static-server.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const KNOWN = 'قال المعلم للطلاب إن العلم نور يضيء طريق الحياة، وإن القراءة باب واسع يدخل منه العاقل إلى المعرفة والفهم.';
const fold = s => String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[\s\d.,:;!?؟«»"\-–—\[\]{}*#_/\\|]/g, '');

const rows = [];
const row = (name, ok, note) => rows.push([ok ? 'PASS' : 'FAIL', name, note || '']);
// Serve dist/web as the site root: OCR assets live at absolute /ocr/<version>/ paths.
const srv = await serve(path.join(ROOT, 'dist', 'web'));
const url = srv.url + '/ocr-check.html';
const origin = new URL(srv.url).origin;
const reqs = [];
const b = await launch({ width: 1280, height: 900 });
const off = b.on('Network.requestWillBeSent', p => reqs.push(p.request.url));
await b.send('Network.enable');
// Worker sessions need their own Network.enable so worker fetches/importScripts show up.
const offT = b.on('Target.attachedToTarget', async p => { if (p.targetInfo.type === 'worker') await b.send('Network.enable', {}, p.sessionId); });
await b.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
try {
  await b.goto(url);
  await b.waitFor(`!!window.__ocrCheck`);
  const r = await b.evaluate(`window.__ocrCheck.run(${JSON.stringify(KNOWN)})`);
  row('OCR ran', !!r && typeof r.ms === 'number' && r.ms > 0, JSON.stringify(r && { ms: r.ms, conf: r.confidence, px: r.px, chars: r.text.length }));
  const folded = fold(r.text);
  const found = ['العلم', 'القراءة', 'المعرفة'].filter(w => folded.includes(fold(w)));
  row('key Arabic words found', found.length === 3, found.join(','));
  row('CER under 15%', typeof r.cer === 'number' && r.cer <= 0.15, 'cer=' + (r.cer * 100).toFixed(1) + '%');
  const bad = reqs.filter(u => /^https?:/.test(u) && !u.startsWith(origin));
  row('zero requests to other origins', bad.length === 0, bad.slice(0, 5).join(' | '));
  row('assets load from own origin', ['worker.min.js', 'ara.traineddata.gz', 'tesseract-core'].every(x => reqs.some(u => u.startsWith(origin + '/ocr/7.0.0/') && u.includes(x))), reqs.filter(u => u.includes('/ocr/')).join(' | '));
  console.log('ms/page: ' + r.ms + ' at ' + r.px);
} catch (e) { row('run', false, e.message); }
finally { offT(); off(); await b.close(); await srv.close(); }
for (const r of rows) console.log(r[0].padEnd(4), r[1].padEnd(48), String(r[2]).slice(0, 200));
const fail = rows.filter(r => r[0] === 'FAIL').length;
console.log(rows.length - fail + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
