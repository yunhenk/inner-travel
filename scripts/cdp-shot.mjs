import { writeFile } from 'node:fs/promises';

const url = process.argv[2] ?? 'http://127.0.0.1:5173/';
const out = process.argv[3] ?? '.tmp/shot.png';
const waitMs = Number(process.argv[4] ?? 6000);
const postWait = Number(process.env.POST_WAIT ?? 800);
const port = Number(process.env.CDP_PORT ?? 9222);

const bust = (url.includes('?') ? '&' : '?') + '_r=' + Date.now();
const target = await (
  await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url + bust)}`, {
    method: 'PUT',
  })
).json();
if (!target?.webSocketDebuggerUrl) throw new Error('cannot create page target');

const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;
const logs = [];

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push(`console.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push(`EXCEPTION: ${msg.params.exceptionDetails.text} ${msg.params.exceptionDetails.exception?.description ?? ''}`);
  }
  if (msg.method === 'Log.entryAdded') {
    logs.push(`log.${msg.params.entry.level}: ${msg.params.entry.text}`);
  }
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await new Promise((r) => setTimeout(r, waitMs));

if (process.env.EVAL) {
  const res = await send('Runtime.evaluate', {
    expression: process.env.EVAL,
    returnByValue: true,
    awaitPromise: true,
  });
  console.log('EVAL', JSON.stringify(res.result?.value ?? res.exceptionDetails ?? null));
  await new Promise((r) => setTimeout(r, postWait));
}

const probe = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    ready: !!window.__SCENE_READY__,
    hasScene: !!window.__SCENE__,
    canvas: (() => { const c = document.querySelector('canvas'); return c ? { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight } : null; })(),
    fps: document.querySelector('.panel-foot')?.textContent?.trim() ?? null,
    cam: window.__SCENE__ ? window.__SCENE__.rig.camera.position.toArray().map((v) => +v.toFixed(4)) : null,
    target: window.__SCENE__ ? window.__SCENE__.rig.controls.target.toArray().map((v) => +v.toFixed(4)) : null,
    mode: window.__SCENE__ ? window.__SCENE__.rig.mode : null,
    bodyVisible: window.__SCENE__ ? window.__SCENE__.layers.body.group.visible : null,
    pressActive: window.__SCENE__ ? window.__SCENE__.pressActive : null,
    pressStrength: window.__SCENE__ ? +window.__SCENE__.pressStrength.toFixed(2) : null,
    vis: window.__SCENE__ ? window.__SCENE__.visibility : null,
    sceneMode: window.__SCENE__ ? window.__SCENE__.mode : null,
    gl: (() => { try { const c = document.querySelector('canvas'); const gl = c?.getContext('webgl2'); return gl ? gl.getParameter(gl.VERSION) : 'no-gl'; } catch (e) { return String(e); } })()
  })`,
  returnByValue: true,
});
console.log('PROBE', probe.result.value);
if (logs.length) console.log('LOGS\n' + logs.join('\n'));

const shot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(out, Buffer.from(shot.data, 'base64'));
console.log('saved', out);
ws.close();
await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {});
