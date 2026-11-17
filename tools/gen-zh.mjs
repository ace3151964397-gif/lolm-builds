// 生成 lib/zh.json：用 Riot Data Dragon 官方中文名（英雄/装备/符文/召唤师技能/技能）
// 匹配我们抓到的英文名。Wild Rift 独有内容（PC 没有的）保留英文，
// 之后用 lib/zh-manual.json 手工补充（会覆盖生成结果）。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const LIB = path.join(ROOT, 'lib');
const DD = 'https://ddragon.leagueoflegends.com';

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');

async function j(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
}

async function pool(items, workers, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    })
  );
  return out;
}

// ---- 拼音 / 外号 / 兜底中文名（slug: "拼音|中文|外号1,外号2"）----
const MANUAL = {
  aatrox: 'yatuokesi|亚托克斯|剑魔',
  ahri: 'ali|阿狸|狐狸,阿离',
  akali: 'akali|阿卡丽|',
  akshan: 'akeshang|阿克尚|',
  alistar: 'alishita|阿利斯塔|牛头,牛头人',
  ambessa: 'anbeisa|安蓓萨|',
  amumu: 'amumu|阿木木|木乃伊',
  annie: 'anni|安妮|火女',
  ashe: 'aixi|艾希|寒冰,寒冰射手',
  'aurelion-sol': 'aoruiliansuoer|奥瑞利安·索尔|龙王,索尔',
  aurora: 'aoluola|阿萝拉|',
  bard: 'bade|巴德|',
  blitzcrank: 'bulici|布里茨|机器人',
  brand: 'bulande|布兰德|火男',
  braum: 'bulong|布隆|',
  caitlyn: 'kaitelin|凯特琳|女警',
  camille: 'kamier|卡蜜尔|青钢影',
  chogath: 'kejiasi|科加斯|大虫子',
  corki: 'kuqi|库奇|飞机',
  darius: 'delaiosi|德莱厄斯|诺手,诺克萨斯之手',
  diana: 'daianna|黛安娜|皎月',
  'dr-mundo': 'mengduo|蒙多|蒙多医生,医生',
  draven: 'delaiven|德莱文|',
  ekko: 'aike|艾克|',
  evelynn: 'yifulin|伊芙琳|寡妇',
  ezreal: 'yizairuier|伊泽瑞尔|ez,探险家',
  fiddlesticks: 'feidetike|费德提克|稻草人',
  fiora: 'feiaona|菲奥娜|剑姬',
  fizz: 'feizi|菲兹|小鱼人',
  galio: 'jialiao|加里奥|',
  garen: 'gailun|盖伦|德玛,德玛西亚之力',
  gnar: 'naer|纳尔|',
  gragas: 'gulajiasi|古拉加斯|酒桶',
  graves: 'geileifusi|格雷福斯|男枪',
  gwen: 'gewen|格温|',
  hecarim: 'hekalimu|赫卡里姆|人马',
  heimerdinger: 'heimodingge|黑默丁格|大头,大发明家',
  hwei: 'hui|彗|画师',
  irelia: 'airuiliya|艾瑞莉娅|刀妹',
  janna: 'jiana|迦娜|风女',
  'jarvan-iv': 'jiawensishi|嘉文四世|皇子',
  jax: 'jiakesi|贾克斯|武器,武器大师',
  jayce: 'jiesi|杰斯|',
  jhin: 'jin|烬|戏命师',
  jinx: 'jinkesi|金克丝|爆爆',
  ksante: 'kesangte|奎桑提|',
  kaisa: 'kasha|卡莎|',
  kalista: 'kalisita|卡莉丝塔|滑板鞋',
  karma: 'kaerma|卡尔玛|',
  kassadin: 'kasadin|卡萨丁|',
  katarina: 'katelinna|卡特琳娜|卡特',
  kayle: 'kaier|凯尔|天使',
  kayn: 'kaiyin|凯隐|',
  kennen: 'kainan|凯南|',
  khazix: 'kacike|卡兹克|螳螂',
  kindred: 'qianjue|千珏|',
  kogmaw: 'kegemo|克格莫|大嘴',
  'lee-sin': 'liqing|李青|瞎子,盲僧',
  leona: 'leiouna|蕾欧娜|日女,曙光',
  lillia: 'liliya|莉莉娅|',
  lissandra: 'lisangzhuo|丽桑卓|冰女',
  lucian: 'luxian|卢锡安|奥巴马',
  lulu: 'lulu|璐璐|',
  lux: 'lakesi|拉克丝|光辉,光辉女郎',
  malphite: 'mofeite|墨菲特|石头人',
  maokai: 'maokai|茂凯|大树',
  'master-yi': 'yidashi|易大师|剑圣,易',
  mel: 'meier|梅尔|',
  milio: 'miliou|米利欧|',
  'miss-fortune': 'eyunxiaojie|厄运小姐|赏金,女枪,mf',
  mordekaiser: 'modekaisa|莫德凯撒|铁男',
  morgana: 'moganna|莫甘娜|',
  nami: 'namei|娜美|',
  nasus: 'neisesi|内瑟斯|狗头',
  nautilus: 'nuotileisi|诺提勒斯|泰坦',
  nidalee: 'naideli|奈德丽|豹女',
  nilah: 'nila|尼菈|',
  nocturne: 'moteng|魔腾|梦魇',
  norra: 'nuola|诺拉|',
  'nunu-and-willump': 'nunu|努努和威朗普|雪人,努努',
  olaf: 'aolafu|奥拉夫|狂战士',
  orianna: 'aoliana|奥莉安娜|发条',
  ornn: 'aoen|奥恩|',
  pantheon: 'pansen|潘森|',
  poppy: 'bobi|波比|',
  pyke: 'paike|派克|',
  rakan: 'luo|洛|',
  rammus: 'lamosi|拉莫斯|龙龟',
  rell: 'ruier|芮尔|',
  renekton: 'leikedun|雷克顿|鳄鱼',
  rengar: 'leienjiaer|雷恩加尔|狮子狗',
  riven: 'ruiwen|锐雯|放逐之刃',
  rumble: 'lanbo|兰博|',
  ryze: 'ruizi|瑞兹|流浪法师',
  samira: 'shamila|莎弥拉|',
  senna: 'saina|赛娜|',
  seraphine: 'salefenni|萨勒芬妮|',
  sett: 'seti|瑟提|腕豪',
  shen: 'shen|慎|',
  shyvana: 'xiwana|希瓦娜|龙女',
  singed: 'xinjide|辛吉德|炼金',
  sion: 'saien|塞恩|亡灵',
  sivir: 'xiweier|希维尔|轮子妈',
  skarner: 'sikana|斯卡纳|蝎子',
  smolder: 'simode|斯莫德|小火龙,斯摩德,小斯',
  sona: 'suona|娑娜|琴女',
  soraka: 'suolaka|索拉卡|奶妈,星妈',
  swain: 'siweiyin|斯维因|乌鸦',
  syndra: 'xindela|辛德拉|球女',
  taliyah: 'taliya|塔莉垭|岩雀',
  talon: 'tailong|泰隆|男刀',
  teemo: 'timo|提莫|提百万',
  thresh: 'chuishi|锤石|魂锁典狱长',
  tristana: 'cuisitana|崔丝塔娜|小炮',
  tryndamere: 'taidamier|泰达米尔|蛮王',
  'twisted-fate': 'cuisite|崔斯特|卡牌,卡牌大师',
  twitch: 'tuqi|图奇|老鼠',
  urgot: 'ejiate|厄加特|螃蟹',
  varus: 'weilusi|韦鲁斯|',
  vayne: 'weien|薇恩|暗夜猎手',
  veigar: 'weijia|维迦|小法',
  velkoz: 'weikezi|维克兹|大眼睛',
  vex: 'weigusi|薇古丝|',
  vi: 'wei|蔚|',
  viego: 'foyego|佛耶戈|破败王',
  viktor: 'weiketuo|维克托|三只手',
  vladimir: 'fulajimier|弗拉基米尔|吸血鬼',
  volibear: 'wolibeier|沃利贝尔|狗熊',
  warwick: 'wolike|沃里克|狼人',
  wukong: 'wukong|悟空|猴子,齐天大圣',
  xayah: 'xia|霞|',
  'xin-zhao': 'zhaoxin|赵信|菊花信',
  yasuo: 'yasuo|亚索|疾风剑豪',
  yone: 'yongen|永恩|',
  yunara: 'younala|芸阿娜|',
  yuumi: 'youmi|悠米|猫',
  zed: 'jie|劫|',
  zeri: 'zeli|泽丽|',
  ziggs: 'jigesi|吉格斯|炸弹人',
  zilean: 'jilan|基兰|时光,时光守护者',
  zoe: 'zuoyi|佐伊|',
  zyra: 'jiela|婕拉|花女',
};

const main = async () => {
  const versions = await j(DD + '/api/versions.json');
  const v = versions[0];
  console.log('Data Dragon 版本', v);

  const [zhChamps, enChamps] = await Promise.all([
    j(`${DD}/cdn/${v}/data/zh_CN/champion.json`),
    j(`${DD}/cdn/${v}/data/en_US/champion.json`),
  ]);
  const zhById = zhChamps.data;
  const enList = Object.values(enChamps.data);
  const enToZhId = new Map(enList.map((c) => [norm(c.name), c.id]));

  // 我们抓到的英雄
  const ours = JSON.parse(fs.readFileSync(path.join(DATA, 'champions.json'), 'utf8'));

  // 收集用到的名字
  const used = { items: new Set(), runes: new Set(), spells: new Set(), abilities: new Set() };
  for (const c of ours) {
    let b;
    try {
      b = JSON.parse(fs.readFileSync(path.join(DATA, 'builds', c.slug + '.json'), 'utf8'));
    } catch {
      continue;
    }
    for (const r of Object.values(b.roles || {})) {
      for (const it of [...(r.starter || []), ...(r.final || []), ...(r.enchant || [])]) used.items.add(it.name);
      for (const it of r.runes || []) used.runes.add(it.name);
      for (const it of r.spells || []) used.spells.add(it.name);
      for (const it of [...(r.skills || []), ...(r.skillOrder || [])]) used.abilities.add(it.name);
    }
  }

  // DDragon 各类中文名（en norm -> zh）
  const itemEn = await j(`${DD}/cdn/${v}/data/en_US/item.json`);
  const itemZh = await j(`${DD}/cdn/${v}/data/zh_CN/item.json`);
  const items = new Map();
  for (const [id, it] of Object.entries(itemEn.data)) {
    const z = itemZh.data[id];
    if (z && it.name) items.set(norm(it.name), z.name);
  }

  const runeEn = await j(`${DD}/cdn/${v}/data/en_US/runesReforged.json`);
  const runeZh = await j(`${DD}/cdn/${v}/data/zh_CN/runesReforged.json`);
  const runes = new Map();
  runeEn.forEach((tree, ti) => {
    const zt = runeZh[ti];
    if (!zt) return;
    for (const slot of tree.slots) {
      for (const r of slot.runes) {
        const z = (zt.slots.flatMap((s) => s.runes).find((x) => x.id === r.id) || {}).name;
        if (z) runes.set(norm(r.name), z);
      }
    }
  });

  const spellEn = await j(`${DD}/cdn/${v}/data/en_US/summoner.json`);
  const spellZh = await j(`${DD}/cdn/${v}/data/zh_CN/summoner.json`);
  const spells = new Map();
  for (const [id, s] of Object.entries(spellEn.data)) {
    const z = spellZh.data[id];
    if (z) spells.set(norm(s.name), z.name);
  }

  // 英雄 + 技能（逐英雄抓 en/zh 详情，按 spells 索引配对）
  const champs = {};
  const abilities = new Map();
  const matched = [];
  let disagree = 0;
  for (const c of ours) {
    const id = enToZhId.get(norm(c.name));
    const manual = (MANUAL[c.slug] || '').split('|');
    const zc = id ? zhById[id] : null;
    // 注意：DDragon zh_CN 的 champion.json 里 name/title 与 en_US 相反，
    // name 放的是称号（九尾妖狐），title 才是英雄名（阿狸）。
    const offName = zc?.title || null;
    if (offName && manual[1] && offName !== manual[1]) disagree++;
    champs[c.slug] = {
      name: offName || manual[1] || c.name,
      // zh_CN 的 name 是称号（炽炎雏龙），正好当英雄卡片上的中文副标题用
      titleZh: zc?.name || null,
      py: manual[0] || '',
      aliases: manual[2] ? manual[2].split(',').filter(Boolean) : [],
    };
    if (id) matched.push({ slug: c.slug, id });
  }
  console.log(`英雄官方名与手写名不一致 ${disagree} 个（以官方为准）`);

  console.log(`英雄匹配 ${matched.length}/${ours.length}，开始抓技能名…`);
  await pool(matched, 10, async ({ id }) => {
    try {
      const [ze, zz] = await Promise.all([
        j(`${DD}/cdn/${v}/data/en_US/champion/${id}.json`),
        j(`${DD}/cdn/${v}/data/zh_CN/champion/${id}.json`),
      ]);
      const en = ze.data[id];
      const zh = zz.data[id];
      if (!en || !zh) return;
      const pairs = [...en.spells.map((s, i) => [s.name, zh.spells[i]?.name]), [en.passive?.name, zh.passive?.name]];
      for (const [a, b] of pairs) if (a && b) abilities.set(norm(a), b);
    } catch (e) {
      console.warn('技能抓取失败', id, e.message);
    }
  });

  // 组装：只保留实际用到 & 能翻译的
  const pick = (set, map) => {
    const out = {};
    for (const n of set) {
      const t = map.get(norm(n));
      if (t) out[n] = t;
    }
    return out;
  };

  const result = {
    generatedAt: new Date().toISOString(),
    source: `Riot Data Dragon ${v} zh_CN`,
    champions: champs,
    items: pick(used.items, items),
    runes: pick(used.runes, runes),
    spells: pick(used.spells, spells),
    abilities: pick(used.abilities, abilities),
  };

  // 手工补充（Wild Rift 独有内容），优先级最高
  const manualPath = path.join(LIB, 'zh-manual.json');
  if (fs.existsSync(manualPath)) {
    const extra = JSON.parse(fs.readFileSync(manualPath, 'utf8'));
    for (const k of ['items', 'runes', 'spells', 'abilities']) {
      Object.assign(result[k], extra[k] || {});
    }
    for (const [slug, info] of Object.entries(extra.champions || {})) {
      result.champions[slug] = { ...(result.champions[slug] || {}), ...info };
    }
  }

  fs.writeFileSync(path.join(LIB, 'zh.json'), JSON.stringify(result, null, 1));
  const missing = (set, map) => [...set].filter((n) => !map.get(norm(n)));
  const gaps = {
    items: missing(used.items, items),
    runes: missing(used.runes, runes),
    spells: missing(used.spells, spells),
    abilities: missing(used.abilities, abilities),
  };
  fs.writeFileSync(path.join(LIB, 'zh-gaps.json'), JSON.stringify(gaps, null, 1));
  console.log('翻译覆盖:', {
    items: `${result.items ? Object.keys(result.items).length : 0}/${used.items.size}`,
    runes: `${Object.keys(result.runes).length}/${used.runes.size}`,
    spells: `${Object.keys(result.spells).length}/${used.spells.size}`,
    abilities: `${Object.keys(result.abilities).length}/${used.abilities.size}`,
    champions: `${matched.length}/${ours.length}`,
  });
  console.log('未翻译已写入 lib/zh-gaps.json');
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
