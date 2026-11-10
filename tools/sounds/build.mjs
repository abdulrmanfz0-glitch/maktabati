#!/usr/bin/env node
// Builds the ambient sound files from the originals in sounds-src/ (downloaded by hand, not committed).
//
//   node tools/sounds/build.mjs
//
// Needs ffmpeg with libopus on PATH. For each sound:
//   1. cut a section, clean it (high-pass, and for thunder a low-pass and gentle compression)
//   2. loops: fold the tail over the head with an equal-power crossfade, so the loop has no seam
//      thunder: 2 or 3 short rumbles with soft fades, played one-shot by the app at random gaps
//   3. pad each loop with PAD seconds of its own continuation on both sides; the app loops between
//      PAD and PAD + length, so any decoder delay (Opus pre-skip, AAC priming) cannot click
//   4. set every file to the same integrated loudness (a static gain; a limiter only if peaks need it)
//   5. encode Opus in WebM (Chrome, Firefox, Android) and AAC in M4A (Safari)
// Output: apps/web/public/sounds/ (web build only; the single-file build does not include them).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const SRC = path.join(ROOT, 'sounds-src'), OUT = path.join(ROOT, 'apps/web/public/sounds');
const SR = 48000, PAD = 0.5, TARGET = -26, TP_MAX = -1.5; // LUFS, dBTP
const OPUS_KBPS = 72, AAC_KBPS = 96;

// a = start (s), len = loop length (s), x = crossfade (s); the section used is [a, a + len + x]
const SOUNDS = [
  { id: 'rain', file: '200273__jmbphilmes__rain-light-2-rural.wav', a: 15, len: 54, x: 6, ch: 1, af: 'highpass=f=40' },
  { id: 'fire', file: '414767__samarobryn__crackling-fire.wav', a: 2, len: 48, x: 6, ch: 2, af: 'highpass=f=40' },
  { id: 'wind', file: '22331__sleepcircle__wind.ogg', a: 1, len: 30, x: 3, ch: 2, af: 'highpass=f=40' },
  // 0-50 s only: after ~51 s wind hits the microphone (low rumble)
  { id: 'waves', file: '531015__noted451__ocean-waves.wav', a: 1.5, len: 42, x: 6, ch: 2, af: 'highpass=f=40' },
  // the low band is wind on the microphone, not part of the scene
  { id: 'desert', file: '454361__kyles__wind-light-desert-day-steady-eerie-with-crickets.flac', a: 20, len: 55, x: 5, ch: 2, af: 'highpass=f=60:poles=2,highpass=f=60:poles=2' },
];
// rolling sections only; 10-40 s of this recording has sharp claps (10-15 dB jumps within 50 ms) and is skipped
const THUNDER = { file: '367222__bluedelta__thunder-rain-low-frequencies-4-channel-48khz.wav', ch: 2,
  pre: 'pan=stereo|c0=0.5*c0+0.5*c2|c1=0.5*c1+0.5*c3,highpass=f=25,lowpass=f=900,lowpass=f=900,acompressor=threshold=-30dB:ratio=3:attack=200:release=1500:makeup=1',
  cuts: [[38, 14], [54, 16], [72, 18]], fadeIn: 2.5, fadeOut: 4 };

function ff(args, input) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', ...args], { input, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error('ffmpeg ' + args.join(' ') + '\n' + r.stderr);
  return r;
}
const decode = (file, a, dur, ch, af) => {
  const out = ff(['-ss', String(a), '-t', String(dur), '-i', path.join(SRC, file), '-af', af + ',aresample=' + SR, '-ac', String(ch), '-f', 'f32le', '-']).stdout;
  return new Float32Array(out.buffer, out.byteOffset, out.length / 4).slice();
};
// interleaved frames
const frames = (buf, ch) => buf.length / ch;
const sub = (buf, ch, s, e) => buf.subarray(s * ch, e * ch);

function loop(buf, ch, len, x) {
  const L = Math.round(len * SR), X = Math.round(x * SR), out = new Float32Array(L * ch);
  if (frames(buf, ch) < L + X) throw new Error('section too short');
  for (let i = 0; i < L; i++) for (let c = 0; c < ch; c++) {
    const v = buf[i * ch + c];
    if (i < X){ const t = (i + .5) / X * Math.PI / 2; out[i * ch + c] = v * Math.sin(t) + buf[(L + i) * ch + c] * Math.cos(t); }
    else out[i * ch + c] = v;
  }
  return out;
}
function pad(lp, ch) {
  const P = Math.round(PAD * SR), L = frames(lp, ch), out = new Float32Array((L + 2 * P) * ch);
  out.set(sub(lp, ch, L - P, L), 0); out.set(lp, P * ch); out.set(sub(lp, ch, 0, P), (P + L) * ch);
  return out;
}
function fades(buf, ch, fi, fo) {
  const n = frames(buf, ch), A = Math.round(fi * SR), B = Math.round(fo * SR);
  for (let i = 0; i < n; i++){ let g = 1; if (i < A) g = Math.sin((i / A) * Math.PI / 2) ** 2; if (i > n - B) g = Math.min(g, Math.sin(((n - i) / B) * Math.PI / 2) ** 2); for (let c = 0; c < ch; c++) buf[i * ch + c] *= g; }
  return buf;
}
const raw = (buf, ch) => ['-f', 'f32le', '-ar', String(SR), '-ac', String(ch), '-i', '-'];
// integrated loudness and true peak, measured on the loop played twice so the seam is included
function measure(buf, ch, twice) {
  const b = twice ? Buffer.concat([Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength), Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)]) : Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...raw(buf, ch), '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { input: b, maxBuffer: 1 << 30 });
  const e = String(r.stderr), k = e.lastIndexOf('{'), j = JSON.parse(e.slice(k, e.indexOf('}', k) + 1));
  return { I: +j.input_i, TP: +j.input_tp };
}
// static gain to TARGET; if peaks would pass TP_MAX, limit then regain, a few rounds until both hold.
// Loops are limited as a wrapped copy (tail + loop + head) with latency compensation, so the seam stays intact.
function limit(buf, ch, lin, wrap) {
  const n = frames(buf, ch), E = wrap ? Math.min(n, SR) : 0, ext = new Float32Array((n + 2 * E) * ch);
  if (E){ ext.set(sub(buf, ch, n - E, n), 0); ext.set(sub(buf, ch, 0, E), (E + n) * ch); }
  ext.set(buf, E * ch);
  const o = ff([...raw(ext, ch), '-af', 'alimiter=limit=' + lin.toFixed(5) + ':attack=1:release=150:level=false:latency=true', '-f', 'f32le', '-'], Buffer.from(ext.buffer)).stdout;
  const r = new Float32Array(o.buffer, o.byteOffset, o.length / 4);
  return r.slice(E * ch, (E + n) * ch);
}
function level(buf, ch, loopy) {
  const before = measure(buf, ch, loopy); let m = before, lim = false, limDb = TP_MAX - 1.5;
  for (let round = 0; round < 8; round++) {
    const g = Math.pow(10, (TARGET - m.I) / 20);
    for (let i = 0; i < buf.length; i++) buf[i] *= g;
    const tp = m.TP + (TARGET - m.I);
    if (tp <= TP_MAX && Math.abs(TARGET - m.I) < .2) break;
    // sample-peak limiter; sharp crackles overshoot between samples (fire: ~3 dB), so the threshold follows the measured true peak
    if (tp > TP_MAX){ if (lim) limDb -= tp - TP_MAX + .3; buf = limit(buf, ch, Math.pow(10, limDb / 20), loopy); lim = true; }
    m = measure(buf, ch, loopy);
    if (m.TP <= TP_MAX && Math.abs(TARGET - m.I) < .2) break;
  }
  return { buf, before, after: measure(buf, ch, loopy), lim };
}
function encode(buf, ch, name) {
  const inp = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength), kb = k => String(ch === 1 ? Math.round(k * .6) : k) + 'k';
  ff([...raw(buf, ch), '-c:a', 'libopus', '-b:a', kb(OPUS_KBPS), '-vbr', 'on', '-application', 'audio', '-map_metadata', '-1', '-y', path.join(OUT, name + '.webm')], inp);
  ff([...raw(buf, ch), '-c:a', 'aac', '-b:a', kb(AAC_KBPS), '-movflags', '+faststart', '-map_metadata', '-1', '-y', path.join(OUT, name + '.m4a')], inp);
  return ['webm', 'm4a'].map(e => fs.statSync(path.join(OUT, name + '.' + e)).size);
}

fs.mkdirSync(OUT, { recursive: true });
const rows = [];
for (const s of SOUNDS) {
  const lp = loop(decode(s.file, s.a, s.len + s.x + .05, s.ch, s.af), s.ch, s.len, s.x);
  const lv = level(lp, s.ch, true);
  rows.push([s.id, s.len, lv, encode(pad(lv.buf, s.ch), s.ch, s.id)]);
}
THUNDER.cuts.forEach(([a, d], i) => {
  const b = fades(decode(THUNDER.file, a, d, THUNDER.ch, THUNDER.pre), THUNDER.ch, THUNDER.fadeIn, THUNDER.fadeOut);
  const lv = level(b, THUNDER.ch, false);
  rows.push(['thunder-' + (i + 1), d, lv, encode(lv.buf, THUNDER.ch, 'thunder-' + (i + 1))]);
});
const kb = n => (n / 1024).toFixed(0) + ' KB';
let tw = 0, ta = 0;
console.log('sound        length  LUFS before -> after   dBTP after  limiter  webm     m4a');
for (const [id, len, lv, [w, m]] of rows) {
  tw += w; ta += m;
  console.log(id.padEnd(12) + (len + ' s').padStart(6) + '  ' + lv.before.I.toFixed(1).padStart(6) + ' -> ' + lv.after.I.toFixed(1).padStart(6) + '   ' + lv.after.TP.toFixed(1).padStart(9) + '  ' + (lv.lim ? 'yes' : 'no ').padEnd(7) + '  ' + kb(w).padStart(7) + '  ' + kb(m).padStart(7));
}
console.log('total'.padEnd(52) + kb(tw).padStart(7) + '  ' + kb(ta).padStart(7) + '   (a browser loads one format: webm or m4a)');
