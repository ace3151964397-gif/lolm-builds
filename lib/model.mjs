// 中文词典注入 + 对外数据结构（server.mjs 与 build-static.mjs 共用，避免两套逻辑走样）

let zh = { champions: {}, items: {}, runes: {}, spells: {}, abilities: {} };

export function setZh(next) {
  zh = next || zh;
}

export const getZh = (map, key) => (key && zh[map] ? zh[map][key] || null : null);

export const LANE_ZH = { baron: '单人路', jungle: '打野', mid: '中路', dragon: '双人路', support: '辅助' };
export const laneZh = (k) => LANE_ZH[k] || k;

const decorate = (list, map) => list.map((it) => ({ ...it, zh: getZh(map, it.name) }));

/** 英雄列表项（给首页搜索用） */
export function championPublic(c) {
  const z = zh.champions[c.slug] || {};
  return {
    slug: c.slug,
    name: c.name,
    zh: z.name || c.name,
    py: z.py || '',
    aliases: z.aliases || [],
    title: c.title,
    titleZh: z.titleZh || null,
    classes: c.classes,
    lanes: c.lanes,
    winrate: c.winrate,
    icon: c.icon,
    hasBuild: c.hasBuild,
  };
}

/** 单英雄详情（带中文名与分路中文标签） */
export function championDetail(c) {
  const z = zh.champions[c.slug] || {};
  const base = {
    slug: c.slug,
    name: c.name,
    zh: z.name || c.name,
    py: z.py || '',
    aliases: z.aliases || [],
    title: c.title,
    titleZh: z.titleZh || null,
    classes: c.classes,
    winrate: c.winrate,
    icon: c.icon,
    patch: c.patch,
    dataDate: c.dataDate,
    roles: {},
  };
  for (const [k, r] of Object.entries(c.roles || {})) {
    base.roles[k] = {
      key: r.key,
      label: r.label,
      labelZh: laneZh(r.key || r.label),
      dataDate: r.dataDate,
      starter: decorate(r.starter || [], 'items'),
      final: decorate(r.final || [], 'items'),
      enchant: decorate(r.enchant || [], 'items'),
      spells: decorate(r.spells || [], 'spells'),
      runes: decorate(r.runes || [], 'runes'),
      skillOrder: decorate(r.skills || r.skillOrder || [], 'abilities'),
    };
  }
  return base;
}
