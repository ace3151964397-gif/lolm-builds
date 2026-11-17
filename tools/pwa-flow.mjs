// 驱动 pwabuilder.com 首页输入网址 → 观察后续接口调用与页面状态。
//   node tools/pwa-flow.mjs [网址]
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9342;
const SITE = process.argv[2] || 'https://ace3151964397-gif.github.io/lolm-builds/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = 'D:\\deepseek work\\lolm-site\\.edge-pwa-flow';
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
      if (!/msecnd|data\.microsoft/.test(url)) reqs.push(`${method} ${url}`);
    }
    if (m.method === 'Network.responseReceived' && /pwabuilder|azurewebsites/.test(m.params.response.url)) {
      const u = m.params.response.url;
      if (!/\.(js|css|png|jpg|webp|svg|ttf)(\?|$)/.test(u)) reqs.push(`  ← ${m.params.response.status} ${m.params.response.mimeType} ${u}`);
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
  await send('Page.navigate', { url: 'https://www.pwabuilder.com/' });
  await sleep(6000);

  console.log('inputs:', await evaluate(`JSON.stringify([...document.querySelectorAll('input')].map(i=>({type:i.type,ph:i.placeholder,id:i.id,cls:i.className})))`));

  const filled = await evaluate(`(() => {
    const i = document.querySelector('input[type="url"], input[placeholder*="http"], input[placeholder*="https"]') || document.querySelector('input');
    if (!i) return 'no-input';
    i.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(i, ${JSON.stringify(SITE)});
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
    return i.value;
  })()`);
  console.log('filled:', filled);

  const pressed = await evaluate(`(() => {
    const i = document.querySelector('input[type="url"], input[placeholder*="http"]') || document.querySelector('input');
    const form = i && i.closest('form');
    const btn = [...document.querySelectorAll('button, a')].find(b => /start|报告|report|begin|submit/i.test(b.textContent || ''));
    if (form) { form.requestSubmit ? form.requestSubmit() : form.submit(); return 'form-submit'; }
    if (btn) { btn.click(); return 'btn:' + btn.textContent.trim().slice(0, 20); }
    return 'nothing';
  })()`);
  console.log('pressed:', pressed);
  await sleep(15000);

  console.log('url:', await evaluate('location.href'));
  console.log('text:', (await evaluate('document.body.innerText') || '').slice(0, 700).replace(/\n+/g, ' | '));
  console.log('requests:');
  for (const r of [...new Set(reqs)]) console.log('  ', r.slice(0, 160));
} catch (e) {
  console.error('ERR', e.message);
} finally {
  try { ws?.close(); } catch {}
  edge.kill();
}
