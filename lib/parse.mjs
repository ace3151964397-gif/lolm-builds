// 解析 wildriftmeta 页面。页面是服务端渲染的静态 HTML，结构稳定，用轻量正则切块即可。

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#x27': "'", '#39': "'", nbsp: ' ' };
export function decode(s = '') {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, k) => ENT[k])
    .trim();
}

function iconPath(src) {
  // /assets/item/icon/item-kraken-slayer-icon.png -> { dir:'item', file:'item-kraken-slayer-icon.png' }
  const m = /\/assets\/([a-z_]+)\/icon\/([^"]+)$/.exec(src || '');
  if (!m) return null;
  return { dir: m[1], file: m[2], path: `${m[1]}/${m[2]}` };
}

/** 从一段 HTML 里抽取所有图片条目（装备 / 符文 / 召唤师技能 / 技能） */
function extractChips(html) {
  const out = [];
  const re = /(?:<span class="order-badge">(\d+)<\/span>\s*)?<img class="table-icon" src="([^"]+)" alt="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const ic = iconPath(m[2]);
    if (!ic) continue;
    out.push({
      order: m[1] ? +m[1] : null,
      name: decode(m[3].replace(/\s*icon$/i, '')),
      icon: ic.path,
      kind: ic.dir,
    });
  }
  return out;
}

/** 解析 /champions/ 列表页 */
export function parseChampionIndex(html) {
  const cards = [];
  const re = /<a class="champion-card" href="\/champions\/([a-z0-9-]+)\/">([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const slug = m[1];
    const body = m[2];
    const icon = iconPath((/class="avatar" src="([^"]+)"/.exec(body) || [])[1] || '');
    const name = decode((/class="card-main">\s*<strong>([\s\S]*?)<\/strong>/.exec(body) || [])[1] || '');
    const title = decode((/<\/strong>\s*<span>([\s\S]*?)<\/span>/.exec(body) || [])[1] || '');
    const lanes = [...body.matchAll(/class="badge lane lane-([a-z]+)">([^<]+)</g)].map((x) => ({
      key: x[1],
      label: decode(x[2]),
    }));
    const classes = [...body.matchAll(/class="badge role-badge role-[a-z]+">([^<]+)</g)].map((x) => decode(x[1]));
    const wr = (/class="card-stat">[\s\S]*?<strong>([\d.]+%)<\/strong>/.exec(body) || [])[1] || null;
    cards.push({ slug, name, title, lanes, classes, winrate: wr, icon: icon?.path || null });
  }
  return cards;
}

/** 解析某个英雄某个分路的出装页 /champions/<slug>/builds/<lane>/ */
export function parseBuildPage(html) {
  const patch = (/(?:Patch|patch)\s*(\d+\.\d+[a-z]?)/.exec(html) || [])[1] || null;
  const dataDate = (/class="source-pill">([\d-]{6,10})</.exec(html) || [])[1] || null;
  const roleLabel = decode((/<h2[^>]*>([A-Za-z]+) build<\/h2>/.exec(html) || [])[1] || '') || null;

  // 切出 build-panel 区块
  const panels = html.split('<div class="build-panel').slice(1);
  const groups = [];
  for (const panel of panels) {
    const head = decode((/<h3[^>]*>([\s\S]*?)<\/h3>/.exec(panel) || [])[1] || '');
    for (const g of panel.split('<div class="build-group">').slice(1)) {
      // 组内容到下一个 build-group / panel 结束
      const label = decode((/<span class="filter-label">([\s\S]*?)<\/span>/.exec(g) || [])[1] || '');
      const chips = extractChips(g);
      if (label || chips.length) groups.push({ panel: head, label, chips });
    }
  }

  const pick = (labels) =>
    groups
      .filter((g) => labels.includes(g.label.toLowerCase()) || labels.includes(g.label))
      .flatMap((g) => g.chips);

  const starter = pick(['Starter', 'starter']).map((c) => ({ ...c, order: null }));
  const final = pick(['Final', 'final']).sort((a, b) => (a.order || 0) - (b.order || 0));
  const enchant = pick(['Enchant', 'enchant']);
  const spells = pick(['Summoner Spells', 'summoner spells']);
  const runes = pick(['Runes', 'runes']);
  const skillOrder = pick(['Skill order', 'skill order']);

  return {
    patch,
    dataDate,
    roleLabel,
    starter,
    final,
    enchant,
    spells,
    runes,
    skillOrder,
    groups, // 原始分组，前端/后续可用于“局势装”等
  };
}
