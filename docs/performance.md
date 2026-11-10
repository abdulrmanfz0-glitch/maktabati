# UI performance notes

Measurement harness: `tools/bench-ui.mjs`.

```bash
npm run dev -- --host 127.0.0.1
node tools/bench-ui.mjs http://127.0.0.1:5173/ 80
node tools/bench-ui.mjs http://127.0.0.1:5173/ 150
```

The harness seeds a synthetic library into IndexedDB, then measures:

- **library render**: navigate to `#/lib`, wait for the first card; median of 2.
- **idea map**: set the dev-only `window.__mapGen` hook, navigate to `#/map`,
  wait for the canvas; median of 3.
- **library context**: call the dev-only `window.__bench.context()`, which runs
  `buildMessages()` for a library-scope question; median of 3.

## Results (Vite dev, desktop 1280×900, Windows)

| Library | Annotations | Map nodes | Library render | Map render | Context |
|---:|---:|---:|---:|---:|---:|
| 80 | 640 | 640 | 145.2 → **126.1 ms** | 772.2 → **289.6 ms** | 10.2 → **5.5 ms** |
| 150 | 1200 | 1200 | 262.4 → **198.5 ms** | 1090.6 → **376.9 ms** | 13.9 → **6.9 ms** |

Median of repeated runs; numbers are relative, not production absolutes. Dev
mode includes HMR/transform overhead and the machine is not CPU-throttled.

## What changed

1. **Idea map settling** — the initial O(n²) physics loop always ran 320
   iterations. It now uses 220 / 140 / 90 iterations above 180 / 400 / 800
   nodes. The layout still settles; the pair loop is the dominant cost at large
   node counts.
2. **Library context** — `libraryMap` builds full per-book memory only until the
   24,000-character budget is reached, instead of building full memory for every
   book and then rebuilding compact memory when it overflows. `buildMessages`
   computes `searchHits` once and shares it with both the map and passages.
3. **Cover fitting** — `fitCovers` used up to 30 layout reads per cover. It now
   checks the initial size once and binary-searches the font size in 6 steps.
   `fitSoon` waits for fonts once instead of fitting, then fitting again after
   every font load.
4. **Writes** — the Day 2 `batchWrite` transaction covers purge/cleanup/seed and
   the remaining init writes; see the Day 2 report.

## Not measured / next

- Real low-end Android and Safari.
- Map quality after fewer iterations on unusually dense cross-book graphs.
- IndexedDB batch timings on a large real library.
- AI context on a real 64k-token request (the estimator is pure and tested
  separately).
