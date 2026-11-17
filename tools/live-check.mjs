// 线上站点检查 + 截图：node tools/live-check.mjs [url]
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const URL0 = process.argv[2] || 'https://ace3151964397-gif.github.io/lolm-builds/';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9343;
const profile = 'D:\\deepseek work\\lolm-site\\.edge-live';
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
    if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r.result?.result?.value;
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: URL0 });
  await sleep(4000);

  const home = await evaluate(`({
    url: location.href,
    grid: document.querySelectorAll('#champGrid .champ-card').length,
    patch: document.querySelector('#patchPill')?.textContent,
    updated: document.querySelector('#updatedAt')?.textContent,
    iconOk: (() => { const i = document.querySelector('#champGrid img'); return i ? i.complete && i.naturalWidth > 0 : null; })(),
    sw: navigator.serviceWorker?.controller?.state || null,
  })`);
  console.log('home:', JSON.stringify(home));

  const shot1 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await fs.writeFile('shot-live-home.png', Buffer.from(shot1.result.data, 'base64'));

  const search = await evaluate(`(() => {
    const q = document.querySelector('#q');
    q.value = '小火龙';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    return [...document.querySelectorAll('#suggest .sg-item')].map(a => a.textContent.trim().split('\\n')[0].trim()).slice(0, 3);
  })()`);
  console.log('search 小火龙:', JSON.stringify(search));

  await evaluate(`location.hash = '#/c/smolder'`);
  await sleep(2000);
  const detail = await evaluate(`(() => {
    const d = document.querySelector('#detail');
    const imgs = [...d.querySelectorAll('img')];
    return { head: d.innerText.replace(/\\n/g, ' ').slice(0, 60), imgs: imgs.length, broken: imgs.filter(i => i.complete && i.naturalWidth === 0).length, order: [...d.querySelectorAll('.ord')].map(b => b.textContent).join(',') };
  })()`);
  console.log('detail:', JSON.stringify(detail));

  await sleep(3000);
  const states = await evaluate(`(() => { const imgs=[...document.querySelectorAll('#detail img')]; return { total: imgs.length, loaded: imgs.filter(i=>i.complete && i.naturalWidth>0).length, sample: imgs.slice(0,3).map(i=>({src:i.getAttribute('src'), cur:(i.currentSrc||'').slice(-40), complete:i.complete, w:i.naturalWidth})) }; })()`);
  console.log('img-states:', JSON.stringify(states));
  const shot2 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await fs.writeFile('shot-live-detail.png', Buffer.from(shot2.result.data, 'base64'));
  console.log('errors:', errors.length ? errors.slice(0, 4) : 'none');
} finally {
  try { ws?.close(); } catch {}
  edge.kill();
  await sleep(300);
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
}
