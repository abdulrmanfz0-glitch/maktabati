"""Screen a recording for human sounds before it becomes an ambient loop.

  python tools/sounds/screen.py <file> [start end]

Decodes to mono 16 kHz with ffmpeg, then reports per 1 s window:
  voiced  share of 40 ms frames (after a 150 Hz high-pass) with strong periodicity at 80-400 Hz pitch (voices, singing, most music)
  syl     envelope modulation at 3-6 Hz in the 300-3400 Hz band, relative to 0.5-20 Hz (speech syllable rhythm)
  tone    strongest persistent narrow peak 40-2000 Hz above the local median, in dB (engines, hum, instruments)
Natural rain, fire, wind, waves and thunder score low on all three. Flags are hints for a human ear, not proof.
"""
import subprocess, sys
import numpy as np

SR = 16000
def load(path, a=None, b=None, hp=None):
    cmd = ['ffmpeg', '-v', 'error']
    if a is not None: cmd += ['-ss', str(a)]
    if b is not None: cmd += ['-to', str(b)]
    cmd += ['-i', path, '-ac', '1', '-ar', str(SR)] + (['-af', f'highpass=f={hp}:poles=2,highpass=f={hp}:poles=2'] if hp else []) + ['-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).copy()

def voiced_share(x):
    n, hop = 640, 320; lo, hi = SR // 400, SR // 80; hits = tot = 0
    for i in range(0, len(x) - n, hop):
        f = x[i:i + n] - x[i:i + n].mean(); e = float(f @ f)
        if e < 1e-7: continue
        ac = np.correlate(f, f, 'full')[n - 1:]; ac /= ac[0]
        tot += 1; hits += ac[lo:hi].max() > 0.6
    return hits / tot if tot else 0.0

def band_env(x, f0, f1, win=512, hop=160):
    w = np.hanning(win); fr = np.fft.rfftfreq(win, 1 / SR); m = (fr >= f0) & (fr <= f1)
    return np.array([np.sqrt((np.abs(np.fft.rfft(w * x[i:i + win])[m]) ** 2).sum()) for i in range(0, len(x) - win, hop)]), SR / hop

def syl(x):
    env, fs = band_env(x, 300, 3400); env = env - env.mean()
    if len(env) < 16 or not env.any(): return 0.0
    P = np.abs(np.fft.rfft(env * np.hanning(len(env)))) ** 2; f = np.fft.rfftfreq(len(env), 1 / fs)
    return float(P[(f >= 3) & (f <= 6)].sum() / max(P[(f >= .5) & (f <= 20)].sum(), 1e-12))

def tone(x):
    n = 8192; w = np.hanning(n); S = []
    for i in range(0, len(x) - n, n // 2): S.append(np.abs(np.fft.rfft(w * x[i:i + n])) ** 2)
    if not S: return 0.0
    m = 10 * np.log10(np.median(np.array(S), axis=0) + 1e-15); f = np.fft.rfftfreq(n, 1 / SR); k = (f >= 40) & (f <= 2000)
    loc = np.array([np.median(m[max(0, j - 40):j + 40]) for j in range(len(m))])
    d = (m - loc)[k]; j = int(d.argmax()); return float(d[j]), float(f[k][j])

if __name__ == '__main__':
    p = sys.argv[1]; a = float(sys.argv[2]) if len(sys.argv) > 2 else None; b = float(sys.argv[3]) if len(sys.argv) > 3 else None
    x = load(p, a, b); xh = load(p, a, b, hp=150); flags = []  # periodicity on >150 Hz only: wind and thunder rumble below it is quasi-periodic
    print(p, f'{len(x) / SR:.1f}s')
    for s in range(0, int(len(x) / SR)):
        v = voiced_share(xh[s * SR:(s + 1) * SR])
        seg3 = x[max(0, s - 1) * SR:(s + 2) * SR]; sy = syl(seg3)
        if v > .25 or sy > .35: flags.append((s + (a or 0), round(v, 2), round(sy, 2)))
    t, tf = tone(x)
    rms = 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-12)
    print(f'  overall voiced {voiced_share(xh):.3f}  rms {rms:.1f} dBFS  strongest tone {t:.1f} dB at {tf:.0f} Hz')
    print('  flagged seconds (t, voiced, syl):', flags[:40] if flags else 'none', ('... +' + str(len(flags) - 40)) if len(flags) > 40 else '')
