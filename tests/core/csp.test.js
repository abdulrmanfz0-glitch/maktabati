// Built CSP must allow no third-party script origin and no analytics beacon.
// Builds the real web output with the project's vite config and inspects the
// injected Content-Security-Policy meta tag.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('built production CSP', () => {
  it('contains no third-party origins and no analytics beacon', async () => {
    await build({ configFile: path.join(ROOT, 'apps', 'web', 'vite.config.mjs'), logLevel: 'error' });
    const html = fs.readFileSync(path.join(ROOT, 'dist', 'web', 'index.html'), 'utf8');
    const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"\s*>/);
    expect(m, 'CSP meta must exist in the built index.html').toBeTruthy();
    const csp = m[1].replace(/&#39;/g, "'"); // HTML attribute escapes quotes
    expect(csp).not.toMatch(/cloudflareinsights|beacon|analytics/i);
    const script = csp.split(';').map(s => s.trim()).find(d => d.startsWith('script-src'));
    expect(script).toBeTruthy();
    // no third-party script origin: only 'self' (plus hash/unsafe-wasm keywords)
    expect(script).not.toMatch(/https?:\/\//);
    expect(script).toContain("'self'");
    expect(script).toContain("'wasm-unsafe-eval'");
    expect(script).not.toContain("'unsafe-eval'");
  }, 180000);
});
