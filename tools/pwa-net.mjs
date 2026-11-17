// 观察 pwabuilder.com 实际调用的后端接口（记录 Network 请求到非静态资源）。
//   node tools/pwa-net.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9341;
const TARGET = process.argv[2] || 'https://www.pwabuilder.com/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = 'D:\\deepseek work\\lolm-site\\.edge-pwa-net';
await fs.rm(profile, { recursive: true, force: true });

const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });

const reqs = [];
let ws;
try {
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
  }
  if (!target) throw new Error('CDP 未就绪');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Network.requestWillBeSent') {
      const { url, method } = m.params.request;
      if (!/\.(js|css|png|jpg|svg|woff2?|ico|webmanifest)(\?|$)/.test(url) || /\/api\//.test(url)) {
        reqs.push(`${method} ${url}`);
      }
    }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return r.result?.result?.value;
  };

  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: TARGET });
  await sleep(12000);

  const hosts = await evaluate(`JSON.stringify([...new Set(performance.getEntriesByType('resource').map(e=>new URL(e.name).host))])`);
  console.log('resource hosts:', hosts);
  console.log('requests:');
  for (const r of [...new Set(reqs)]) console.log('  ', r);
  console.log('title:', await evaluate('document.title'));
  console.log('text:', (await evaluate('document.body.innerText') || '').slice(0, 400).replace(/\n+/g, ' | '));
} catch (e) {
  console.error('ERR', e.message);
} finally {
  try { ws?.close(); } catch {}
  edge.kill();
}
