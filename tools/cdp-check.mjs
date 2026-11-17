// 用 CDP 驱动无头 Edge：移动端截图 + 搜索/详情功能自检
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const BASE = 'http://127.0.0.1:5178';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--disable-crash-reporter',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=D:\\deepseek work\\lolm-site\\.chrome-tmp2',
    'about:blank',
  ],
  { stdio: 'ignore', windowsHide: true }
);

async function waitTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(300);
  }
  throw new Error('CDP 未就绪');
}

const main = async () => {
  const page = await waitTarget();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result?.result?.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  await send('Page.navigate', { url: BASE + '/' });
  await sleep(2500);

  console.log('PAGE TITLE:', await evaluate('document.title'));
  console.log('GRID COUNT:', await evaluate('document.querySelectorAll(".champ-card").length'));
  console.log('FIRST CARDS:', await evaluate('[...document.querySelectorAll(".champ-card .nm")].slice(0,6).map(e=>e.textContent).join(",")'));
  console.log('META:', await evaluate('document.querySelector("#patchPill").textContent + " / " + document.querySelector("#updatedAt").textContent'));

  // 搜索测试
  for (const q of ['小火龙', '斯摩德', 'smold', 'yasuo', '瞎子', '诺拉']) {
    const out = await evaluate(`(() => {
      const q = document.querySelector('#q');
      q.value = ${JSON.stringify(q)};
      q.dispatchEvent(new Event('input', {bubbles:true}));
      return [...document.querySelectorAll('#suggest .sg-item .sg-name')].map(e=>e.textContent).slice(0,3).join(',');
    })()`);
    console.log(`SEARCH "${q}" ->`, out || '(none)');
  }

  // 详情页测试
  await send('Page.navigate', { url: BASE + '/?a=' + Date.now() + '#/c/smolder' });
  await sleep(2200);
  const info = await evaluate(`(() => {
    const secs = [...document.querySelectorAll('.sec-title')].map(e=>e.firstChild.textContent.trim());
    return {
      hero: document.querySelector('.hero-info h1')?.textContent.trim(),
      secs,
      items: [...document.querySelectorAll('.card:nth-of-type(2) .item .nm')].length,
      runes: [...document.querySelectorAll('.rune')].length,
      skills: [...document.querySelectorAll('.skill')].length,
      brokenImgs: [...document.querySelectorAll('#detail img')].filter(i=>!i.complete || i.naturalWidth===0).length,
      orders: [...document.querySelectorAll('.ord')].map(e=>e.textContent).join(','),
      note: document.querySelector('.note').textContent.trim(),
    };
  })()`);
  console.log('DETAIL:', JSON.stringify(info));

  // 移动端截图（详情页）
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync('shot-mobile-detail.png', Buffer.from(shot.result.data, 'base64'));

  // 首页截图
  await send('Page.navigate', { url: BASE + '/?b=' + Date.now() });
  await sleep(1800);
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('shot-mobile-home.png', Buffer.from(shot2.result.data, 'base64'));

  // 桌面宽屏截图
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE + '/#/c/jinx' });
  await sleep(2200);
  const shot3 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync('shot-desktop-detail.png', Buffer.from(shot3.result.data, 'base64'));

  ws.close();
  child.kill();
  console.log('DONE');
};

main().catch((e) => {
  console.error('CDP FAIL', e.message);
  child.kill();
  process.exit(1);
});
