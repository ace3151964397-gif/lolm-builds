// 生成交付用截图：移动端首页/详情、桌面端首页/详情
// 用法：node tools/cdp-shots.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://127.0.0.1:5178';
const PORT = 9335;
const profile = 'D:\\deepseek work\\lolm-site\\.edge-shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
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

  await send('Page.enable');

  const shoot = async ({ route, width, height, dpr = 2, mobile, file, fullPage }) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
    await send('Page.navigate', { url: BASE + '/' + route });
    await sleep(2200);
    const params = { format: 'png' };
    if (fullPage) {
      const m = await send('Page.getLayoutMetrics');
      const cs = m.result.cssContentSize || m.result.contentSize;
      params.captureBeyondViewport = true;
      params.clip = { x: 0, y: 0, width: css(cs.width), height: css(cs.height), scale: 1 };
    }
    const r = await send('Page.captureScreenshot', params);
    await fs.writeFile(file, Buffer.from(r.result.data, 'base64'));
    const { width: w, height: h } = params.clip || { width, height };
    console.log('saved', file, `${Math.round(w)}x${Math.round(h)}`);
  };

  const css = (v) => Math.min(Math.round(v), 6000);

  await shoot({ route: '', width: 430, height: 932, mobile: true, file: 'shot-mobile-home.png' });
  await shoot({ route: '#/c/smolder', width: 430, height: 932, mobile: true, file: 'shot-mobile-detail.png', fullPage: true });
  await shoot({ route: '', width: 1280, height: 900, mobile: false, dpr: 1, file: 'shot-desktop-home.png' });
  await shoot({ route: '#/c/jinx', width: 1280, height: 900, mobile: false, dpr: 1, file: 'shot-desktop-detail.png', fullPage: true });
} finally {
  try { ws?.close(); } catch {}
  edge.kill();
  await sleep(400);
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
}
