// 用无头 Edge + CDP 打开指定 hash 路由，打印详情区摘要。用法：
//   node tools/cdp-one.mjs '#/champion/hwei' '#/champion/annie'
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://127.0.0.1:5178';
const PORT = 9334;
const routes = process.argv.slice(2);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = 'D:\\deepseek work\\lolm-site\\.edge-cdp-one';
const edge = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
    } catch {}
  }
  if (!target) throw new Error('CDP 未就绪');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return r.result?.result?.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });

  for (const route of routes) {
    await send('Page.navigate', { url: BASE + '/' + route });
    await sleep(1800);
    const out = await evaluate(`(() => {
      const d = document.querySelector('#detail');
      const tabs = [...document.querySelectorAll('#detail .lane-tab')].map(b => b.textContent.trim() + (b.classList.contains('on') ? '(on)' : ''));
      const secs = [...document.querySelectorAll('#detail .card h3, #detail h2, #detail .card .sec-title')].map(h => h.textContent.trim()).filter(Boolean);
      return { hash: location.hash, text: (d?.innerText || '').slice(0, 300), tabs, secs, imgs: d ? d.querySelectorAll('img').length : 0 };
    })()`);
    console.log(route, '=>', JSON.stringify(out));
  }
} finally {
  try { ws?.close(); } catch {}
  edge.kill();
  await sleep(300);
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
}
