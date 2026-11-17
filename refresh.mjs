// 抓取 + 解析 + 落盘。用法：
//   node refresh.mjs                全量刷新
//   node refresh.mjs --only ashe,annie   只刷指定英雄
//   node refresh.mjs --limit 5      只刷前 5 个（调试）
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, getText, getBuffer, pool, sleep } from './lib/http.mjs';
import { parseChampionIndex, parseBuildPage } from './lib/parse.mjs';
import { buildStatic } from './build-static.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data');
const BUILDS = path.join(DATA, 'builds');
const ICONS = path.join(ROOT, 'public', 'icons');

const args = process.argv.slice(2);
const argv = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : null;
};
const ONLY = argv('--only')?.split(',').map((s) => s.trim()).filter(Boolean) || null;
const LIMIT = Number(argv('--limit') || 0) || 0;
const CONC = Number(argv('--concurrency') || 5) || 5;

const log = (...a) => console.log('[refresh]', ...a);

async function main() {
  const t0 = Date.now();
  await fs.mkdir(BUILDS, { recursive: true });

  log('拉取英雄列表…');
  const indexHtml = await getText(SITE + '/champions/');
  if (!indexHtml) throw new Error('英雄列表拉取失败');
  let champions = parseChampionIndex(indexHtml);
  log('英雄数:', champions.length);

  if (ONLY) champions = champions.filter((c) => ONLY.includes(c.slug));
  if (LIMIT) champions = champions.slice(0, LIMIT);

  const iconJobs = new Map(); // remote path -> local rel
  const addIcon = (p) => {
    if (p && !iconJobs.has(p)) iconJobs.set(p, p);
  };

  let done = 0;
  const results = await pool(champions, ONLY ? 2 : CONC, async (c) => {
    const lanes = (c.lanes && c.lanes.length ? c.lanes : []).slice(0, 3).filter((l) => l.key);
    const roles = {};
    let patch = null;
    let dataDate = null;

    const collect = (html, key, label) => {
      const b = parseBuildPage(html);
      if (!b.final.length && !b.spells.length) return false;
      patch = patch || b.patch;
      dataDate = dataDate || b.dataDate;
      roles[key] = {
        key,
        label: label || b.roleLabel || key,
        starter: b.starter,
        final: b.final,
        enchant: b.enchant,
        spells: b.spells,
        runes: b.runes,
        skillOrder: b.skillOrder,
        dataDate: b.dataDate,
      };
      for (const grp of [b.starter, b.final, b.enchant, b.spells, b.runes, b.skillOrder]) {
        for (const it of grp) addIcon(it.icon);
      }
      return true;
    };

    // 逐个分路抓专属页面。某个分路 404 = 该站没有这个分路的数据，直接跳过；
    // 不能回退到默认页，否则两个分路内容完全一样（假数据）。
    for (const lane of lanes) {
      const html = await getText(`${SITE}/champions/${c.slug}/builds/${lane.key}/`);
      if (html) collect(html, lane.key, lane.label);
      await sleep(120);
    }

    // 一个分路都没拿到（无分路标记，或分路子页全部 404）时，才用默认页兜底一次
    if (!Object.keys(roles).length) {
      const html = await getText(`${SITE}/champions/${c.slug}/builds/`);
      if (html) {
        const b = parseBuildPage(html);
        collect(html, (b.roleLabel || 'default').toLowerCase(), b.roleLabel);
      }
    }

    addIcon(c.icon);
    done++;
    if (done % 10 === 0) log(`已处理 ${done}/${champions.length}`);

    if (!Object.keys(roles).length) return { ...c, roles: null, patch, dataDate };
    return { slug: c.slug, name: c.name, title: c.title, classes: c.classes, winrate: c.winrate, icon: c.icon, patch, dataDate, roles };
  });

  const failed = results.filter((r) => !r || r.__error);
  const ok = results.filter((r) => r && !r.__error);

  // 写入每个英雄
  for (const c of ok) {
    await fs.writeFile(path.join(BUILDS, c.slug + '.json'), JSON.stringify(c));
  }

  // 英雄索引（精简版，给前端搜索用）；--only 时与已有索引合并，避免只刷几个英雄把列表冲掉
  let prev = [];
  try {
    prev = JSON.parse(await fs.readFile(path.join(DATA, 'champions.json'), 'utf8'));
  } catch {}
  const fresh = ok.map((c) => ({
    slug: c.slug,
    name: c.name,
    title: c.title,
    classes: c.classes,
    winrate: c.winrate,
    icon: c.icon,
    lanes: Object.values(c.roles || {}).map((r) => ({ key: r.key, label: r.label })),
    hasBuild: !!c.roles,
  }));
  const freshSlugs = new Set(fresh.map((c) => c.slug));
  const champs = ONLY ? [...prev.filter((c) => !freshSlugs.has(c.slug)), ...fresh] : fresh;

  const meta = {
    patch: ok.find((c) => c.patch)?.patch || null,
    dataDate: ok.find((c) => c.dataDate)?.dataDate || null,
    refreshedAt: new Date().toISOString(),
    source: SITE,
    championCount: champs.length,
    failed: failed.length,
  };
  await fs.writeFile(path.join(DATA, 'champions.json'), JSON.stringify(champs));
  await fs.writeFile(path.join(DATA, 'meta.json'), JSON.stringify(meta, null, 2));

  // 图标
  log(`下载图标 ${iconJobs.size} 个…`);
  let iconOk = 0;
  let iconErr = 0;
  await pool([...iconJobs.keys()], 8, async (p) => {
    const dest = path.join(ICONS, p);
    try {
      await fs.access(dest);
      iconOk++;
      return;
    } catch {}
    const [dir, file] = p.split('/');
    const buf = await getBuffer(`${SITE}/assets/${dir}/icon/${file}`);
    if (!buf) {
      iconErr++;
      return;
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buf);
    iconOk++;
  });

  log(`完成：英雄 ${champs.length}，图标 ${iconOk}/${iconJobs.size}，失败 ${failed.length}，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  log('版本:', meta.patch, '数据日期:', meta.dataDate);

  // 生成纯静态版本（public/api/*.json），GitHub Pages 等静态托管直接用
  await buildStatic();
}

main().catch((e) => {
  console.error('[refresh] 失败:', e);
  process.exit(1);
});
