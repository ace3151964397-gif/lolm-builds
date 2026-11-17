// LOLM 出装助手 —— 静态站点 + JSON API + 每日自动刷新
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setZh, getZh, championPublic, championDetail } from './lib/model.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const ZH_FILE = path.join(ROOT, 'lib', 'zh.json');

const PORT = Number(process.env.PORT || 5178);
const HOST = process.env.HOST || '0.0.0.0';
const REFRESH_HOUR = Number(process.env.REFRESH_HOUR || 6); // 每天本地时间 6 点更新

let zh = { champions: {}, items: {}, runes: {}, spells: {}, abilities: {} };
let champions = [];
let meta = {};

function loadZh() {
  try {
    zh = JSON.parse(fs.readFileSync(ZH_FILE, 'utf8'));
  setZh(zh);
  } catch (e) {
    console.warn('[server] zh.json 读取失败，使用空字典', e.message);
  }
}
function loadData() {
  try {
    champions = JSON.parse(fs.readFileSync(path.join(DATA, 'champions.json'), 'utf8'));
  } catch {
    champions = [];
  }
  try {
    meta = JSON.parse(fs.readFileSync(path.join(DATA, 'meta.json'), 'utf8'));
  } catch {
    meta = { patch: null, refreshedAt: null };
  }
}
loadZh();
loadData();

// ---------- 中文名 & 数据结构（与 build-static.mjs 共用 lib/model.mjs）----------

// ---------- 刷新 ----------
let refreshing = null;
function startRefresh(extra = []) {
  if (refreshing) return { started: false, reason: 'already-running' };
  const node = process.execPath;
  const child = spawn(node, [path.join(ROOT, 'refresh.mjs'), ...extra], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let out = '';
  child.stdout.on('data', (d) => {
    out += d.toString();
    process.stdout.write('[refresh] ' + d);
  });
  child.stderr.on('data', (d) => process.stderr.write('[refresh:err] ' + d));
  refreshing = new Promise((resolve) => {
    child.on('close', (code) => {
      loadData();
      refreshing = null;
      resolve(code);
      console.log('[server] 刷新结束 code=' + code);
    });
  });
  return { started: true };
}

function scheduleDaily() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(REFRESH_HOUR, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const ms = next - now;
  console.log(`[server] 下次自动刷新：${next.toLocaleString('zh-CN')}`);
  setTimeout(async () => {
    console.log('[server] 开始每日自动刷新');
    startRefresh();
    scheduleDaily();
  }, ms);
}

function isStale(hours = 12) {
  const t = Date.parse(meta.refreshedAt || '');
  if (!t) return true;
  return Date.now() - t > hours * 3600 * 1000;
}

// ---------- HTTP ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, obj, code = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const noCache = ['.html', '.js', '.css'].includes(ext);
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': noCache ? 'no-cache' : 'public, max-age=86400',
    });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);

  try {
    if (p === '/api/meta') {
      return sendJson(res, {
        ...meta,
        refreshing: !!refreshing,
        champions: champions.length,
        nextRefreshHour: REFRESH_HOUR,
      });
    }

    if (p === '/api/champions') {
      return sendJson(res, champions.map(championPublic));
    }

    if (p.startsWith('/api/champion/') && !p.endsWith('.json')) {
      const slug = p.slice('/api/champion/'.length).replace(/\/$/, '');
      const c = champions.find((x) => x.slug === slug);
      if (!c) return sendJson(res, { error: 'not-found' }, 404);
      let full = c;
      try {
        full = JSON.parse(await fsp.readFile(path.join(DATA, 'builds', slug + '.json'), 'utf8'));
      } catch {}
      return sendJson(res, championDetail(full));
    }

    if (p === '/api/refresh' && req.method === 'POST') {
      const r = startRefresh();
      return sendJson(res, { ...r, refreshing: true });
    }

    if (p === '/api/debug/names') {
      // 帮助维护中文词典：列出所有未翻译的名字
      const items = new Set(),
        runes = new Set(),
        spells = new Set(),
        abils = new Set();
      for (const c of champions) {
        let full = c;
        try {
          full = JSON.parse(await fsp.readFile(path.join(DATA, 'builds', c.slug + '.json'), 'utf8'));
        } catch {}
        for (const r of Object.values(full.roles || {})) {
          (r.final || []).concat(r.starter || [], r.enchant || []).forEach((i) => items.add(i.name));
          (r.runes || []).forEach((i) => runes.add(i.name));
          (r.spells || []).forEach((i) => spells.add(i.name));
          (r.skillOrder || []).forEach((i) => abils.add(i.name));
        }
      }
      return sendJson(res, {
        missing: {
          items: [...items].filter((n) => !getZh('items', n)).sort(),
          runes: [...runes].filter((n) => !getZh('runes', n)).sort(),
          spells: [...spells].filter((n) => !getZh('spells', n)).sort(),
          abilities: [...abils].filter((n) => !getZh('abilities', n)).sort(),
          champions: champions.filter((c) => !zh.champions[c.slug]?.name).map((c) => c.slug),
        },
      });
    }

    // 静态资源
    let file = p === '/' ? '/index.html' : p;
    const full = path.join(PUBLIC, path.normalize(file).replace(/^([/\\])+/, ''));
    if (!full.startsWith(PUBLIC)) return sendJson(res, { error: 'forbidden' }, 403);
    return serveFile(res, full);
  } catch (e) {
    console.error(e);
    return sendJson(res, { error: e.message }, 500);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[server] LOLM 出装助手已启动: http://127.0.0.1:${PORT}`);
  console.log(`[server] 英雄 ${champions.length}，版本 ${meta.patch || '?'}`);
  scheduleDaily();
  if (isStale(12)) {
    console.log('[server] 数据超过 12 小时，后台刷新…');
    startRefresh();
  }
});
