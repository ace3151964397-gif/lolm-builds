// 把 data/ + lib/zh.json 编译成纯静态文件（public/api/），
// 这样 GitHub Pages / 任何静态托管都能直接用，不需要 Node 服务器。
// 用法：node build-static.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setZh, championPublic, championDetail } from './lib/model.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data');
const OUT = path.join(ROOT, 'public', 'api');

const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
};

export async function buildStatic({ silent = false } = {}) {
  const log = silent ? () => {} : (...a) => console.log('[static]', ...a);

  const zh = await readJson(path.join(ROOT, 'lib', 'zh.json'), null);
  if (!zh) throw new Error('lib/zh.json 不存在，先运行 node tools/gen-zh.mjs');
  setZh(zh);

  const champions = await readJson(path.join(DATA, 'champions.json'), []);
  const meta = await readJson(path.join(DATA, 'meta.json'), {});
  if (!champions.length) throw new Error('data/champions.json 为空，先运行 node refresh.mjs');

  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(path.join(OUT, 'champion'), { recursive: true });

  // 1) /api/meta.json
  const metaOut = {
    patch: meta.patch || null,
    dataDate: meta.dataDate || null,
    refreshedAt: meta.refreshedAt || null,
    source: meta.source || 'https://www.wildriftmeta.com',
    championCount: champions.length,
    failed: meta.failed || 0,
    champions: champions.length,
    static: true,
  };
  await fs.writeFile(path.join(OUT, 'meta.json'), JSON.stringify(metaOut));

  // 2) /api/champions.json
  const list = champions.map(championPublic);
  await fs.writeFile(path.join(OUT, 'champions.json'), JSON.stringify(list));

  // 3) /api/champion/<slug>.json
  let n = 0;
  for (const c of champions) {
    const full = await readJson(path.join(DATA, 'builds', c.slug + '.json'), c);
    await fs.writeFile(path.join(OUT, 'champion', c.slug + '.json'), JSON.stringify(championDetail(full)));
    n++;
  }

  log(`版本 ${metaOut.patch} · ${metaOut.dataDate} · 英雄 ${champions.length} · 详情 ${n} · 输出 ${path.relative(ROOT, OUT)}`);
  return metaOut;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-static.mjs')) {
  buildStatic().catch((e) => {
    console.error('[static] 失败:', e.message);
    process.exit(1);
  });
}
