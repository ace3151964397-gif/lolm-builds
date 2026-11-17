// 模拟 GitHub Pages 的子路径托管（http://127.0.0.1:5199/lolm-site/），验证相对路径、SW scope、静态接口
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIC = path.join(ROOT, 'public');
const PREFIX = '/lolm-site/';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!p.startsWith(PREFIX)) { res.writeHead(404); return res.end('not found'); }
  p = p.slice(PREFIX.length - 1); // 保留前导 /
  let file = path.join(PUBLIC, p);
  if (p.endsWith('/') || fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(5199, '127.0.0.1', r));

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9339;
const profile = path.join(ROOT, '.edge-sub');
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
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
  };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.text, desc: r.result.exceptionDetails.exception?.description };
    return r.result?.result?.value;
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: `http://127.0.0.1:5199${PREFIX}` });
  await sleep(3500);

  const home = await evaluate(`(async () => {
    const meta = await fetch('api/meta.json').then(r => r.json()).catch(e => ({ err: String(e) }));
    return {
      url: location.pathname,
      grid: document.querySelectorAll('#champGrid .champ-card').length,
      patch: document.querySelector('#patchPill')?.textContent,
      meta: { patch: meta.patch, champions: meta.champions, err: meta.err },
      iconSample: document.querySelector('#champGrid img')?.src,
      iconLoaded: document.querySelector('#champGrid img')?.complete && document.querySelector('#champGrid img')?.naturalWidth > 0,
      manifest: document.querySelector('link[rel=manifest]')?.href,
    };
  })()`);
  console.log('home:', JSON.stringify(home));

  // 搜索外号
  const search = await evaluate(`(() => {
    const q = document.querySelector('#q');
    q.value = '小火龙';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    return [...document.querySelectorAll('#suggest .sg-item')].map(a => a.textContent.trim()).slice(0, 3);
  })()`);
  console.log('search 小火龙:', JSON.stringify(search));

  await evaluate(`location.hash = '#/c/smolder'`);
  await sleep(1800);
  const detail = await evaluate(`(() => {
    const d = document.querySelector('#detail');
    const imgs = [...d.querySelectorAll('img')];
    return { head: d.innerText.replace(/\\n/g, ' ').slice(0, 50), imgs: imgs.length, broken: imgs.filter(i => i.complete && i.naturalWidth === 0).length, order: [...d.querySelectorAll('.ord')].map(b => b.textContent).join(',') };
  })()`);
  console.log('detail:', JSON.stringify(detail));

  const sw = await evaluate(`(async () => { const r = await navigator.serviceWorker.getRegistration(); return r ? { scope: r.scope, state: r.active?.state } : null; })()`);
  console.log('sw:', JSON.stringify(sw));
  console.log('errors:', errors.length ? errors.slice(0, 4) : 'none');
} finally {
  try { ws?.close(); } catch {}
  edge.kill();
  server.close();
  await sleep(300);
  fs.rmSync(profile, { recursive: true, force: true });
}
