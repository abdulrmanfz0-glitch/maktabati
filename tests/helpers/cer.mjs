// Character error rate with a banded Levenshtein distance (memory O(band), time O(n * band)).
// If the true distance exceeds the band, the result is a lower bound and `bounded` is true.
import { matchForm, RE_MARKS_G } from '../../packages/ingest/src/text.js';

export const normForCer = s => matchForm(String(s).replace(RE_MARKS_G, '')).replace(/\[\^\w+\]/g, '').replace(/[^\p{L}\p{Nd}]+/gu, ' ').trim();

export function bandedDistance(a, b, band) {
  const n = a.length, m = b.length;
  if (Math.abs(n - m) > band) return { d: Math.abs(n - m), bounded: true };
  const INF = 1e9;
  let prev = new Array(2 * band + 1).fill(INF), cur = new Array(2 * band + 1).fill(INF);
  // cell (i, j) stored at index j - i + band
  for (let j = 0; j <= Math.min(m, band); j++) prev[j + band] = j;
  for (let i = 1; i <= n; i++) {
    cur.fill(INF);
    const lo = Math.max(0, i - band), hi = Math.min(m, i + band);
    for (let j = lo; j <= hi; j++) {
      const k = j - i + band;
      if (j === 0) { cur[k] = i; continue; }
      const sub = prev[k] + (a[i - 1] === b[j - 1] ? 0 : 1);
      const del = k + 1 <= 2 * band ? prev[k + 1] + 1 : INF;
      const ins = k - 1 >= 0 ? cur[k - 1] + 1 : INF;
      cur[k] = Math.min(sub, del, ins);
    }
    [prev, cur] = [cur, prev];
  }
  const d = prev[m - n + band];
  return { d, bounded: d >= band };
}

export function cer(ref, hyp, bandShare = 0.05) {
  const a = normForCer(ref), b = normForCer(hyp);
  if (!a.length) return { cer: b.length ? 1 : 0, bounded: false };
  const band = Math.max(50, Math.ceil(Math.max(a.length, b.length) * bandShare));
  const { d, bounded } = bandedDistance(a, b, band);
  return { cer: d / a.length, bounded };
}
