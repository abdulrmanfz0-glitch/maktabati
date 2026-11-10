// Minimal Chrome DevTools Protocol driver: launches headless Chrome or Edge with a fresh
// profile and talks to one page over the built-in WebSocket. No dependencies.
//
// Isolation: every launch gets its own new, empty --user-data-dir under out/tmp/ in this repo, so the
// test browser is a separate instance that never sees the normal browser profile, its tabs, cookies or
// the library stored in it. Audio is muted. The browser and its profile folder are removed on close(),
// and also when the test process exits, fails, or is interrupted.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
// throwaway folders live in the repo (out/ is git-ignored), never in the system temp folder
export function scratchDir(prefix) {
  const base = path.join(ROOT, 'out', 'tmp'); fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, prefix));
}
const rmDir = d => { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); } catch {} };

// every running test browser, so none outlives the test process
const LIVE = new Set();
function killTree(proc) {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  else try { proc.kill('SIGKILL'); } catch {}
}
// synchronous (exit handlers cannot await): kill, then retry the delete until Windows releases the profile files
function reapAll() {
  const nap = new Int32Array(new SharedArrayBuffer(4));
  for (const b of LIVE) {
    killTree(b.proc);
    for (let i = 0; i < 50 && fs.existsSync(b.dir); i++) { rmDir(b.dir); if (fs.existsSync(b.dir)) Atomics.wait(nap, 0, 0, 100); }
  }
  LIVE.clear();
}
process.on('exit', reapAll);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { reapAll(); process.exit(130); });
process.on('uncaughtException', e => { console.error(e); reapAll(); process.exit(1); });
process.on('unhandledRejection', e => { console.error(e); reapAll(); process.exit(1); });

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].filter(Boolean);

export function findBrowser() {
  const p = CANDIDATES.find(c => fs.existsSync(c));
  if (!p) throw new Error('no Chrome or Edge found (set CHROME_PATH)');
  return p;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ width = 1280, height = 900, mobile = false } = {}) {
  const dir = scratchDir('mk-cdp-');
  const proc = spawn(findBrowser(), [
    '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir, '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--lang=ar', '--force-device-scale-factor=1', '--window-size=' + width + ',' + height, 'about:blank'
  ], { stdio: 'ignore' });
  const me = { proc, dir }; LIVE.add(me);
  const exited = new Promise(res => proc.once('exit', res));
  try {
    return await connect(proc, dir, exited, me, { width, height, mobile });
  } catch (e) { killTree(proc); rmDir(dir); LIVE.delete(me); throw e; }
}

async function connect(proc, dir, exited, me, { width, height, mobile }) {
  let port;
  for (let i = 0; i < 200 && !port; i++) {
    try { port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { await sleep(50); }
  }
  if (!port) throw new Error('browser did not start');
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let seq = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else if (m.method) listeners.forEach(l => l(m));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  const errors = [];
  listeners.push(m => {
    if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const evaluate = async (expr, awaitPromise = true) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const waitFor = async (expr, timeout = 15000) => {
    const t = Date.now();
    while (Date.now() - t < timeout) { try { if (await evaluate(expr)) return true; } catch {} await sleep(100); }
    throw new Error('timeout waiting for ' + expr);
  };
  const loaded = () => new Promise(res => { const l = m => { if (m.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(l), 1); res(); } }; listeners.push(l); });
  const goto = async url => { const p = loaded(); await send('Page.navigate', { url }); await p; };
  const reload = async () => { const p = loaded(); await send('Page.reload', { ignoreCache: true }); await p; };
  const screenshot = async file => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); };
  // put local files into an <input type=file> (works on hidden inputs) and fire its change event
  const setFiles = async (selector, files) => {
    const { root } = await send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) throw new Error('no element ' + selector);
    await send('DOM.setFileInputFiles', { nodeId, files: files.map(f => path.resolve(f)) });
  };
  const tap = async (x, y) => {
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  };
  const downloadsTo = async d => {
    fs.mkdirSync(d, { recursive: true });
    try { await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: path.resolve(d) }); }
    catch { await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: path.resolve(d) }); }
  };
  // wait for the whole process tree to be gone before deleting the profile (Windows keeps files locked until then)
  const close = async () => { try { ws.close(); } catch {} killTree(proc); await Promise.race([exited, sleep(5000)]); rmDir(dir); LIVE.delete(me); };
  return { send, evaluate, waitFor, goto, reload, screenshot, close, errors, sleep, setFiles, tap, downloadsTo };
}
