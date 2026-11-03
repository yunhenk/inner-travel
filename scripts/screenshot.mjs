import { execFile, spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const chrome = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = Number(process.env.CDP_PORT ?? 9333);
const base = process.env.APP_URL ?? 'http://127.0.0.1:5173/';

await mkdir('docs/screenshots', { recursive: true });
await mkdir('.tmp/chrome-shot', { recursive: true });

const server = spawn(
  chrome,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    `--user-data-dir=${process.cwd()}/.tmp/chrome-shot`,
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--hide-scrollbars',
    `--remote-debugging-port=${port}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForChrome() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Chrome 调试端口未就绪');
}

await waitForChrome();

const shots = [
  ['observe', '?mode=observe&labels=1'],
  ['fly', '?mode=fly'],
  ['dwell', '?mode=dwell'],
  ['body-context', '?mode=observe&body=1&labels=1'],
  ['clean-fly', '?mode=fly&ui=0'],
];

try {
  for (const [name, query] of shots) {
    const url = `${base}${query}`;
    await run('node', ['scripts/cdp-shot.mjs', url, `docs/screenshots/${name}.png`, '7000'], {
      env: { ...process.env, CDP_PORT: String(port) },
      stdio: 'inherit',
    });
  }
} finally {
  server.kill('SIGTERM');
}
