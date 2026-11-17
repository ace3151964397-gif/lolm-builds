// 检查 Chrome 的 PWA 可安装性（manifest 错误 / 安装性错误）
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:5178/';
const PORT = 9341;
const profile = 'D:\\deepseek work\\lolm-site\\.edge-install';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
let ws;
try {
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });

  await send('Page.enable');
  await send('Page.navigate', { url: BASE });
  await sleep(3500);

  const mf = await send('Page.getAppManifest');
  console.log('manifest url:', mf.result?.url);
  console.log('manifest errors:', JSON.stringify(mf.result?.errors ?? []));
  const inst = await send('Page.getInstallabilityErrors');
  console.log('installability errors:', JSON.stringify(inst.result?.installabilityErrors ?? inst.result ?? {}));
  const r = await send('Runtime.evaluate', { expression: `navigator.serviceWorker.getRegistration().then(r => ({scope: r?.scope, active: !!r?.active}))`, awaitPromise: true, returnByValue: true });
  console.log('sw:', JSON.stringify(r.result?.result?.value));
} finally {
  try { ws?.close(); } catch {}
  edge.kill();
  await sleep(300);
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
}
