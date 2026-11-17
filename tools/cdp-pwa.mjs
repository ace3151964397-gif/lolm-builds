// PWA 自检：静态 API、manifest、Service Worker 注册、离线缓存
// 用法：node tools/cdp-pwa.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://127.0.0.1:5178';
const PORT = 9337;
const profile = 'D:\\deepseek work\\lolm-site\\.edge-pwa';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
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
  const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value || a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r.result?.result?.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });

  await send('Page.navigate', { url: BASE + '/' });
  await sleep(3000);

  const report = await evaluate(`(async () => {
    const out = {};
    const m = await fetch('api/meta.json').then(r => r.json());
    out.meta = { patch: m.patch, date: m.dataDate, static: m.static, champions: m.champions };
    out.grid = document.querySelectorAll('#champGrid .champ-card').length;
    out.patchPill = document.querySelector('#patchPill')?.textContent;
    const link = document.querySelector('link[rel=manifest]')?.href;
    out.manifestUrl = link;
    const mf = await fetch(link).then(r => r.json());
    out.manifest = { name: mf.name, display: mf.display, icons: mf.icons?.length, start: mf.start_url };
    out.iconsOk = [];
    for (const ic of mf.icons) {
      const r = await fetch(ic.src);
      out.iconsOk.push(ic.sizes + ':' + r.status);
    }
    const reg = await navigator.serviceWorker.getRegistration();
    out.sw = reg ? { scope: reg.scope, active: !!reg.active, state: reg.active?.state } : null;
    const cacheNames = await caches.keys();
    out.caches = cacheNames;
    const c = await caches.open(cacheNames[0] || 'x');
    out.cached = (await c.keys()).map(r => new URL(r.url).pathname).slice(0, 12);
    return out;
  })()`);

  console.log(JSON.stringify(report, null, 1));

  // 详情页（走静态 champion JSON）
  await evaluate(`location.hash = '#/c/smolder'`);
  await sleep(1500);
  const detail = await evaluate(`(() => {
    const d = document.querySelector('#detail');
    return { text: (d.innerText || '').slice(0, 80).replace(/\\n/g, ' '), imgs: d.querySelectorAll('img').length, broken: [...d.querySelectorAll('img')].filter(i => i.offsetParent && !i.complete).length };
  })()`);
  console.log('detail:', JSON.stringify(detail));
  console.log('page errors:', errors.length ? errors.slice(0, 5) : 'none');

  // 离线：断网后重载，应能从 Service Worker 缓存渲染
  await send('Network.enable');
  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await send('Page.reload', { ignoreCache: false });
  await sleep(2500);
  const offline = await evaluate(`({
    grid: document.querySelectorAll('#champGrid .champ-card').length,
    patch: document.querySelector('#patchPill')?.textContent,
    head: document.body.innerText.replace(/\\n/g, ' ').slice(0, 70)
  })`);
  console.log('offline reload:', JSON.stringify(offline));
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
} finally {
  try { ws?.close(); } catch {}
  edge.kill();
  await sleep(300);
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
}
