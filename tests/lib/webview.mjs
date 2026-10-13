/**
 * Drives the notebook UI through the Chrome DevTools Protocol.
 *
 * The same scenarios run against two targets:
 *  - by default, a headless Chrome started on this machine, loading `assets/` from a small local
 *    static server;
 *  - the real WebView on the console when `CARNET_DEVTOOLS` holds the address of its DevTools
 *    port forwarded by adb (e.g. `http://127.0.0.1:39115`, see scripts/forward-devtools.sh).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const ASSETS_DIR = resolve(process.env.CARNET_ASSETS || join(REPO_ROOT, 'assets'));

/** CSS size of the AYN Thor's bottom screen, which the layout is designed for. */
export const THOR_VIEWPORT = { width: 538, height: 469 };

const MIME_TYPES = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
};

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

/** Puts the UI back to its starting point once the notebook has been restored. */
const RESET_UI = `
  for (const id of ['battleHelp', 'progress', 'editor']) document.getElementById(id)?.close();
  worldSnapshot = null; worldSignature = ''; hereScope = 'current';
  nearbyMapActive = true; contextMapActive = false;
  catalogLegacy = false; catalogScope = 'gen4'; catalogQuery = '';
  catalogSelectedDex = null; catalogMapDex = null; catalogMapPlace = null;
  questMode = 'here'; tab = 'now'; detailMon = null; configure = false; mapZoom = 1;
  render(); window.scrollTo(0, 0);
`;

function findChrome() {
  const chrome = process.env.CHROME_PATH || CHROME_CANDIDATES.find(existsSync);
  assert(chrome, 'Chrome not found: set CHROME_PATH, or CARNET_DEVTOOLS to test on the console');
  return chrome;
}

/** Serves `assets/` the way `MainActivity` does on the `sinnoh.local` origin. */
async function serveAssets() {
  const server = createServer(async (request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    const file = join(ASSETS_DIR, path);
    if (!file.startsWith(ASSETS_DIR + sep)) return response.writeHead(403).end();
    try {
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': MIME_TYPES[extname(file)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

async function launchChrome(url) {
  const profile = await mkdtemp(join(tmpdir(), 'carnet-sinnoh-'));
  const chrome = spawn(findChrome(), [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    `--window-size=${THOR_VIEWPORT.width},${THOR_VIEWPORT.height}`,
    url,
  ]);
  const devtools = await new Promise((found, failed) => {
    let log = '';
    chrome.stderr.on('data', (chunk) => {
      log += chunk;
      const match = log.match(/DevTools listening on ws:\/\/([^/\s]+)/);
      if (match) found(`http://${match[1]}`);
    });
    chrome.once('exit', (code) => failed(Error(`Chrome exited (code ${code})\n${log}`)));
    chrome.once('error', failed);
  });
  const stop = async () => {
    const exited = new Promise((done) => chrome.once('exit', done));
    chrome.kill();
    await exited;
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  return { devtools, stop };
}

async function findPage(devtools, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const pages = await (await fetch(`${devtools}/json/list`)).json();
    const page = pages.find((p) => p.type === 'page' && p.url.endsWith('/index.html'));
    if (page) return page;
    assert(Date.now() < deadline, `No notebook page found on ${devtools}`);
    await new Promise((retry) => setTimeout(retry, 100));
  }
}

/** Minimal CDP client: numbered commands matched with their replies. */
async function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((opened, failed) => {
    socket.onopen = opened;
    socket.onerror = failed;
  });
  let serial = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method) listeners.get(message.method)?.(message.params);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve: done, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(Error(message.error.message));
    else done(message.result);
  };
  const command = (method, params = {}) =>
    new Promise((done, reject) => {
      const id = ++serial;
      pending.set(id, { resolve: done, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  return { command, on: (method, listener) => listeners.set(method, listener), close: () => socket.close() };
}

/**
 * Opens a session on the notebook.
 * @returns {Promise<{evaluate, check, reload, close, device: boolean, checks: number}>}
 */
export async function openCarnet() {
  const device = Boolean(process.env.CARNET_DEVTOOLS);
  const cleanups = [];
  let devtools = process.env.CARNET_DEVTOOLS;
  if (!device) {
    const { server, origin } = await serveAssets();
    cleanups.push(() => new Promise((done) => server.close(done)));
    const chrome = await launchChrome(`${origin}/index.html`);
    cleanups.push(chrome.stop);
    devtools = chrome.devtools;
  }
  const page = await findPage(devtools);
  const cdp = await connect(page.webSocketDebuggerUrl);
  cleanups.push(cdp.close);

  async function evaluate(expression) {
    const reply = await cdp.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (reply.exceptionDetails) {
      const { exception, text } = reply.exceptionDetails;
      throw Error(`${exception?.description || text}\n  in: ${expression}`);
    }
    return reply.result.value;
  }

  async function waitUntilReady() {
    const ready = "document.readyState === 'complete' && typeof render === 'function'";
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(ready).catch(() => false)) return;
      await new Promise((retry) => setTimeout(retry, 50));
    }
    throw Error('The notebook did not finish loading');
  }

  const session = {
    device,
    checks: 0,
    evaluate,
    /** Raw DevTools command, for what `evaluate` cannot do (screenshots, emulation). */
    command: cdp.command,
    /** Asserts that an expression evaluated in the page is truthy; promises are awaited. */
    async check(expression) {
      assert.equal(await evaluate(`(async () => !!(await (${expression})))()`), true, expression);
      session.checks++;
    },
    /** Reloads the page: only `localStorage` is expected to survive. */
    async reload() {
      await cdp.command('Page.reload');
      await new Promise((settle) => setTimeout(settle, 150));
      await waitUntilReady();
    },
    async close() {
      for (const cleanup of cleanups.reverse()) await cleanup();
    },
  };

  if (!device) {
    await cdp.command('Page.enable');
    // A `confirm()` dialog would block a headless browser forever.
    cdp.on('Page.javascriptDialogOpening', () => cdp.command('Page.handleJavaScriptDialog', { accept: true }));
    await cdp.command('Emulation.setDeviceMetricsOverride', { ...THOR_VIEWPORT, deviceScaleFactor: 1, mobile: true });
    await session.reload();
  }
  await waitUntilReady();
  return session;
}

/** Pauses the real memory reader while scenarios feed simulated snapshots. */
async function pauseBridge({ evaluate }) {
  if (!(await evaluate("battleSnapshot.status !== 'off'"))) return false;
  await evaluate("tab = 'battle'; render(); document.querySelector('.bridge-toggle').click()");
  await evaluate(`(async () => {
    for (let i = 0; i < 30 && battleSnapshot.status !== 'off'; i++) await new Promise((r) => setTimeout(r, 100));
    if (battleSnapshot.status !== 'off') throw Error('The bridge must be stopped before running scenarios');
  })()`);
  return true;
}

/**
 * Runs a scenario, then restores the original notebook even if the scenario failed. On the
 * console this is the player's real notebook: it must come out of a test run unchanged.
 * @returns {Promise<number>} how many checks passed
 */
export async function withCarnet(scenario) {
  const session = await openCarnet();
  try {
    const carnet = await session.evaluate('JSON.stringify(state)');
    const battle = await session.evaluate('JSON.stringify(battleSnapshot)');
    const bridgeWasOn = await pauseBridge(session);
    try {
      await scenario(session);
    } finally {
      await session.evaluate(`
        state = validate(JSON.parse(${JSON.stringify(carnet)})); save();
        battleSnapshot = JSON.parse(${JSON.stringify(battle)});
        ${RESET_UI}
      `);
      if (bridgeWasOn) {
        await session.evaluate(
          "receiveBattleSnapshot({ status: 'off' }); render(); document.querySelector('.bridge-toggle').click()",
        );
      }
    }
    return session.checks;
  } finally {
    await session.close();
  }
}
