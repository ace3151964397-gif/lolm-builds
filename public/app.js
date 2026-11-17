/* LOLM 出装助手 前端 */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iconUrl = (icon) => (icon ? 'icons/' + String(icon).replace(/^\/+/, '') : '');
  const LANE_ORDER = ['baron', 'jungle', 'mid', 'dragon', 'support'];
  const LANE_ZH = { baron: '单人路', jungle: '打野', mid: '中路', dragon: '双人路', support: '辅助' };
  const CLASS_ZH = {
    Mage: '法师',
    Marksman: '射手',
    Fighter: '战士',
    Tank: '坦克',
    Assassin: '刺客',
    Support: '辅助',
  };
  const classZh = (c) => CLASS_ZH[c] || c;

  const state = {
    champs: [],
    meta: {},
    lane: 'all',
    matches: [],
    active: -1,
    cache: new Map(),
    current: null,
  };

  /* ---------------- 搜索 ---------------- */
  const isSubseq = (hay, needle) => {
    let i = 0;
    for (const ch of hay) if (ch === needle[i]) i++;
    return i >= needle.length;
  };

  function scoreChamp(c, q) {
    const nq = q.trim().toLowerCase();
    if (!nq) return 0;
    const keys = [c.zh, c.py, c.name, ...(c.aliases || [])].filter(Boolean).map((s) => String(s).toLowerCase());
    let best = 0;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const isAlias = i >= 3;
      if (k === nq) best = Math.max(best, isAlias ? 96 : 100);
      else if (k.startsWith(nq)) best = Math.max(best, isAlias ? 86 : 90);
      else if (k.includes(nq)) best = Math.max(best, isAlias ? 72 : 80);
      else if (nq.length >= 2 && k.length <= 24 && isSubseq(k, nq)) best = Math.max(best, isAlias ? 46 : 52);
    }
    // 中文名逐字包含（如“斯莫”）
    if (best === 0 && c.zh) {
      const zi = [...nq].every((ch) => c.zh.includes(ch));
      if (zi && nq.length >= 2) best = 40;
    }
    return best;
  }

  function doSearch(q) {
    if (!q.trim()) {
      state.matches = [];
      state.active = -1;
      renderSuggest();
      return;
    }
    state.matches = state.champs
      .map((c) => ({ c, s: scoreChamp(c, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.c.zh.localeCompare(b.c.zh, 'zh'))
      .slice(0, 9)
      .map((x) => x.c);
    state.active = state.matches.length ? 0 : -1;
    renderSuggest();
  }

  function renderSuggest() {
    const box = $('#suggest');
    const q = $('#q').value;
    if (!q.trim()) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.hidden = false;
    if (!state.matches.length) {
      box.innerHTML = `<div class="sg-empty">没找到「${esc(q)}」，试试中文名、拼音或外号</div>`;
      return;
    }
    box.innerHTML = state.matches
      .map(
        (c, i) => `
      <div class="sg-item ${i === state.active ? 'active' : ''}" data-slug="${esc(c.slug)}">
        <img src="${iconUrl(c.icon)}" alt="" loading="lazy" onerror="this.style.opacity=.25" />
        <span class="sg-name">${esc(c.zh)}</span>
        <span class="sg-en">${esc(c.name)}</span>
        <span class="sg-alias">${esc((c.aliases || []).slice(0, 2).join(' · '))}</span>
      </div>`
      )
      .join('');
  }

  /* ---------------- 首页 ---------------- */
  function renderMeta() {
    const m = state.meta || {};
    $('#patchPill').textContent = m.patch ? `版本 ${m.patch}` : '版本 —';
    const t = m.refreshedAt ? new Date(m.refreshedAt) : null;
    $('#updatedAt').textContent = t
      ? `更新 ${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
      : '数据加载中';
    $('#dataDate').textContent = m.dataDate || '—';
    $('#refreshHour').textContent = String(m.nextRefreshHour ?? 6).padStart(2, '0') + ':00';
  }

  function renderLanes() {
    const counts = {};
    for (const c of state.champs) for (const l of c.lanes || []) counts[l.key] = (counts[l.key] || 0) + 1;
    const lanes = LANE_ORDER.filter((l) => counts[l]);
    $('#laneTabs').innerHTML =
      `<button class="lane-tab ${state.lane === 'all' ? 'on' : ''}" data-lane="all">全部 ${state.champs.length}</button>` +
      lanes.map((l) => `<button class="lane-tab ${state.lane === l ? 'on' : ''}" data-lane="${l}">${LANE_ZH[l]} ${counts[l]}</button>`).join('');
  }

  function renderGrid() {
    const list = state.champs
      .filter((c) => state.lane === 'all' || (c.lanes || []).some((l) => l.key === state.lane))
      .sort((a, b) => a.zh.localeCompare(b.zh, 'zh'));
    $('#champGrid').innerHTML = list
      .map(
        (c) => `
      <div class="champ-card" data-slug="${esc(c.slug)}" title="${esc(c.name)}">
        <img src="${iconUrl(c.icon)}" alt="${esc(c.name)}" loading="lazy" onerror="this.style.opacity=.2" />
        <span class="nm">${esc(c.zh)}</span>
        <span class="en">${esc(c.name)}</span>
      </div>`
      )
      .join('');
  }

  /* ---------------- 详情 ---------------- */
  function itemsBlock(list, opts = {}) {
    if (!list || !list.length) return '<div class="empty-build">该分路暂无数据</div>';
    const ordered = opts.renumber ? list.map((it, i) => ({ ...it, order: i + 1 })) : list;
    return (
      `<div class="items ${opts.cls || ''}">` +
      ordered
        .map(
          (it) => `
        <div class="item" title="${esc(it.name)}">
          ${it.order ? `<span class="ord">${it.order}</span>` : ''}
          <img class="ic" src="${iconUrl(it.icon)}" alt="${esc(it.name)}" loading="lazy" onerror="this.style.opacity=.2" />
          <span class="nm">${esc(it.zh || it.name)}</span>
        </div>`
        )
        .join('') +
      `</div>`
    );
  }

  function runesBlock(runes) {
    if (!runes || !runes.length) return '<div class="empty-build">暂无符文数据</div>';
    return (
      `<div class="runes">` +
      runes
        .map(
          (r, i) => `
        <div class="rune ${i === 0 ? 'key' : ''}" title="${esc(r.name)}">
          <img class="ic" src="${iconUrl(r.icon)}" alt="${esc(r.name)}" loading="lazy" onerror="this.style.opacity=.2" />
          <span class="nm">${esc(r.zh || r.name)}</span>
          ${i === 0 ? '<span class="lv">基石</span>' : ''}
        </div>`
        )
        .join('') +
      `</div>`
    );
  }

  function skillsBlock(list) {
    if (!list || !list.length) return '<div class="empty-build">暂无加点数据</div>';
    return (
      `<div class="skills">` +
      list
        .map(
          (s, i) => `
        <div class="skill" title="${esc(s.name)}">
          <img class="ic" src="${iconUrl(s.icon)}" alt="${esc(s.name)}" loading="lazy" onerror="this.style.opacity=.2" />
          <span class="nm">${esc(s.zh || s.name)}</span>
        </div>${i < list.length - 1 ? '<span class="arrow">›</span>' : ''}`
        )
        .join('') +
      `</div>`
    );
  }

  function renderDetail(d) {
    const roleKeys = Object.keys(d.roles || {});
    if (!roleKeys.length) {
      $('#detail').innerHTML = `<div class="card">该英雄暂无出装数据。</div>`;
      return;
    }
    const wanted = location.hash.split('?role=')[1];
    const roleKey = wanted && d.roles[wanted] ? wanted : roleKeys[0];
    const r = d.roles[roleKey];

    const tabs =
      roleKeys.length > 1
        ? `<div class="role-tabs">${roleKeys
            .map(
              (k) =>
                `<button class="lane-tab ${k === roleKey ? 'on' : ''}" data-role="${esc(k)}">${esc(d.roles[k].labelZh || d.roles[k].label)}</button>`
            )
            .join('')}</div>`
        : '';

    $('#detail').innerHTML = `
      <button class="lane-tab" id="backBtn" style="margin-bottom:12px">‹ 返回英雄列表</button>
      <div class="hero">
        <img class="portrait" src="${iconUrl(d.icon)}" alt="${esc(d.name)}" onerror="this.style.opacity=.2" />
        <div class="hero-info">
          <h1>${esc(d.zh)}<small>${esc(d.name)}</small></h1>
          <div class="hero-tags">
            ${(d.titleZh || d.title) ? `<span class="tag">${esc(d.titleZh || d.title)}</span>` : ''}
            ${(d.classes || []).map((c) => `<span class="tag">${esc(classZh(c))}</span>`).join('')}
            ${d.winrate ? `<span class="tag wr">胜率 ${esc(d.winrate)}</span>` : ''}
            <span class="tag">版本 ${esc(d.patch || state.meta.patch || '')}</span>
          </div>
        </div>
      </div>
      ${tabs}
      <div class="cards">
      <div class="card wide">
        <h3 class="sec-title">核心出装<span class="hint">数字为出装顺序</span></h3>
        ${itemsBlock(r.final, { renumber: true })}
      </div>
      <div class="card">
        <h3 class="sec-title">出门装</h3>
        ${itemsBlock(r.starter)}
      </div>
      <div class="card">
        <h3 class="sec-title">鞋子 / 附魔</h3>
        ${itemsBlock(r.enchant)}
      </div>
      <div class="card">
        <h3 class="sec-title">召唤师技能</h3>
        ${itemsBlock(r.spells, { cls: 'spells' })}
      </div>
      <div class="card">
        <h3 class="sec-title">符文天赋<span class="hint">第一枚为基石符文</span></h3>
        ${runesBlock(r.runes)}
      </div>
      <div class="card wide">
        <h3 class="sec-title">技能加点顺序</h3>
        ${skillsBlock(r.skillOrder)}
      </div>
      </div>
      <p class="note">数据：wildriftmeta.com · ${esc(r.labelZh || r.label || '')} · ${esc(r.dataDate || d.dataDate || '')} · 版本 ${esc(d.patch || '')}</p>
    `;
    $('#backBtn').onclick = () => (location.hash = '');
    $$('[data-role]', $('#detail')).forEach(
      (b) =>
        (b.onclick = () => {
          location.hash = `#/c/${d.slug}?role=${b.dataset.role}`;
        })
    );
  }

  async function loadChampion(slug, role) {
    $('#home').hidden = true;
    $('#detail').hidden = false;
    if (!state.cache.has(slug)) {
      $('#detail').innerHTML = `<div class="card empty-build">加载中…</div>`;
      try {
        const res = await fetch(`api/champion/${encodeURIComponent(slug)}.json`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        state.cache.set(slug, await res.json());
      } catch (e) {
        $('#detail').innerHTML = `<div class="card empty-build">加载失败：${esc(e.message)}</div>`;
        return;
      }
    }
    renderDetail(state.cache.get(slug));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function route() {
    const m = location.hash.match(/^#\/c\/([a-z0-9-]+)/);
    if (m) {
      loadChampion(m[1]);
    } else {
      $('#detail').hidden = true;
      $('#home').hidden = false;
      state.current = null;
    }
  }

  /* ---------------- 事件 ---------------- */
  function bind() {
    const q = $('#q');
    q.addEventListener('input', () => {
      $('#clearBtn').hidden = !q.value;
      doSearch(q.value);
    });
    q.addEventListener('focus', () => {
      if (q.value) doSearch(q.value);
    });
    q.addEventListener('keydown', (e) => {
      if (!state.matches.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.active = (state.active + 1) % state.matches.length;
        renderSuggest();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.active = (state.active - 1 + state.matches.length) % state.matches.length;
        renderSuggest();
      } else if (e.key === 'Enter') {
        const c = state.matches[state.active] || state.matches[0];
        if (c) go(c.slug);
      } else if (e.key === 'Escape') {
        $('#suggest').hidden = true;
      }
    });

    function go(slug) {
      $('#suggest').hidden = true;
      $('#q').value = '';
      $('#clearBtn').hidden = true;
      state.matches = [];
      location.hash = `#/c/${slug}`;
    }

    $('#suggest').addEventListener('click', (e) => {
      const it = e.target.closest('.sg-item');
      if (it) go(it.dataset.slug);
    });
    $('#champGrid').addEventListener('click', (e) => {
      const it = e.target.closest('.champ-card');
      if (it) location.hash = `#/c/${it.dataset.slug}`;
    });
    $('#laneTabs').addEventListener('click', (e) => {
      const b = e.target.closest('.lane-tab');
      if (!b) return;
      state.lane = b.dataset.lane;
      renderLanes();
      renderGrid();
    });
    $('#clearBtn').onclick = () => {
      $('#q').value = '';
      $('#clearBtn').hidden = true;
      state.matches = [];
      renderSuggest();
      $('#q').focus();
    };
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-wrap')) $('#suggest').hidden = true;
    });

    $('#refreshBtn').onclick = async () => {
      const btn = $('#refreshBtn');
      btn.classList.add('spin');
      try {
        const rr = await fetch('api/refresh', { method: 'POST' });
        if (!rr.ok) throw new Error('STATIC');
        toast('已开始更新，约 1~2 分钟…');
        let n = 0;
        const timer = setInterval(async () => {
          n++;
          const m = await fetch('api/meta.json').then((r) => r.json());
          if (!m.refreshing || n > 90) {
            clearInterval(timer);
            btn.classList.remove('spin');
            state.meta = m;
            renderMeta();
            const champs = await fetch('api/champions.json').then((r) => r.json());
            state.champs = champs;
            state.cache.clear();
            renderLanes();
            renderGrid();
            if (location.hash) route();
            toast('更新完成 · 版本 ' + (m.patch || ''));
          }
        }, 4000);
      } catch (e) {
        btn.classList.remove('spin');
        // 静态托管（GitHub Pages）下没有 /api/refresh 接口，数据由云端定时任务每天更新
        toast(
          e.message === 'STATIC'
            ? `静态版：数据每天 06:00 自动更新，当前版本 ${state.meta.patch || ''}`
            : '更新失败：' + e.message,
        );
      }
    };

    window.addEventListener('hashchange', route);
  }

  let toastTimer;
  function toast(msg) {
    let el = $('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  async function boot() {
    try {
      const [meta, champs] = await Promise.all([
        fetch('api/meta.json').then((r) => r.json()),
        fetch('api/champions.json').then((r) => r.json()),
      ]);
      state.meta = meta;
      state.champs = champs;
    } catch (e) {
      $('#champGrid').innerHTML = `<div class="empty-build">数据加载失败：${esc(e.message)}</div>`;
      return;
    }
    renderMeta();
    renderLanes();
    renderGrid();
    bind();
    route();
  }

  boot();
})();
