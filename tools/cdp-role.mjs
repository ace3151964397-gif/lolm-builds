import fs from 'node:fs';
import { spawn } from 'node:child_process';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const child = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run','--disable-crash-reporter',`--remote-debugging-port=${PORT}`,'--user-data-dir=D:\\deepseek work\\lolm-site\\.chrome-tmp3','about:blank'], { stdio: 'ignore', windowsHide: true });
const main = async () => {
  let page;
  for (let i = 0; i < 40 && !page; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
    if (!page) await sleep(300);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (js) => (await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: `http://127.0.0.1:5178/?t=${Date.now()}#/c/annie` });
  await sleep(2500);
  console.log('role tabs:', await ev(`[...document.querySelectorAll('[data-role]')].map(b=>b.textContent.trim()+(b.classList.contains('on')?':on':'')).join(', ')`));
  console.log('active items:', await ev(`[...document.querySelectorAll('.card.wide .item .nm')].map(e=>e.textContent).join(',')`));
  await ev(`document.querySelector('[data-role="support"]').click()`);
  await sleep(1200);
  console.log('after switch:', await ev(`[...document.querySelectorAll('[data-role]')].map(b=>b.textContent.trim()+(b.classList.contains('on')?':on':'')).join(', ')`));
  console.log('support items:', await ev(`[...document.querySelectorAll('.card.wide .item .nm')].map(e=>e.textContent).join(',')`));
  console.log('note:', await ev(`document.querySelector('.note').textContent.trim()`));
  console.log('spells:', await ev(`[...document.querySelectorAll('.spells .item .nm')].map(e=>e.textContent).join(',')`));
  ws.close(); child.kill();
};
main().catch(e => { console.error('FAIL', e.message); child.kill(); process.exit(1); });
