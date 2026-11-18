// Built CSP allows exactly one third-party script origin: Cloudflare Web Analytics.
// Builds the real web output with the project's vite config and inspects the
// injected Content-Security-Policy meta tag.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('built production CSP', () => {
  it('allows only Cloudflare Web Analytics as a third-party script origin', async () => {
    await build({ configFile: path.join(ROOT, 'apps', 'web', 'vite.config.mjs'), logLevel: 'error' });
    const html = fs.readFileSync(path.join(ROOT, 'dist', 'web', 'index.html'), 'utf8');
    const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"\s*>/);
    expect(m, 'CSP meta must exist in the built index.html').toBeTruthy();
    const csp = m[1].replace(/&#39;/g, "'"); // HTML attribute escapes quotes
    const script = csp.split(';').map(s => s.trim()).find(d => d.startsWith('script-src'));
    expect(script).toBeTruthy();
    // the only origin in script-src is the Cloudflare Web Analytics beacon
    expect(script.match(/https?:\/\/[^\s']+/g)).toEqual(['https://static.cloudflareinsights.com']);
    expect(script).toContain("'self'");
    expect(script).toContain("'wasm-unsafe-eval'");
    expect(script).not.toContain("'unsafe-eval'");
  }, 180000);
});
