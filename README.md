# LOLM 出装 / 天赋 查询站

一个本地运行的英雄联盟手游（Wild Rift）出装查询站：输入英雄名（支持中文名、外号、拼音、英文名、错别字模糊搜索），
即时显示当前版本每个分路的**出装顺序、出门装、鞋子与附魔、召唤师技能、符文天赋、技能加点顺序**，全部带图标。

## 启动

双击 **`start.bat`**，会打开 http://127.0.0.1:5178 。

手机同 Wi-Fi 下访问：**http://192.168.1.57:5178**（IP 变了以 start.bat 窗口提示为准；IP 可用 `ipconfig` 查）。

关闭 start.bat 窗口即停止服务。

## 功能

- **模糊搜索**：中文名 / 外号 / 拼音 / 英文名 / 常见错字都能命中，例如
  - `小火龙`、`斯摩德`、`smold` → 斯莫德
  - `yasuo` → 亚索；`瞎子`、`盲僧` → 李青；`女枪`、`赏金` → 厄运小姐
- **分路切换**：一个英雄有多个分路时，详情页顶部可切换（单人路 / 打野 / 中路 / 双人路 / 辅助）
- **首页按分路筛选**：全部 142 / 单人路 / 打野 / 中路 / 双人路 / 辅助
- 装备、符文、召唤师技能、技能全部显示图标；出装带 1-N 顺序号
- 显示版本号（如 7.3d）与数据日期

## 装成 App（PWA）

站点本身就是一个 PWA：部署到 HTTPS 后可直接「添加到主屏幕」，有独立图标、全屏打开、**断网也能看缓存的数据**。

- Android / Chrome：菜单 → 安装应用
- iOS / Safari：分享 → 添加到主屏幕

> 想在电脑关机时也每天更新？见 **[DEPLOY.md](DEPLOY.md)**：推到 GitHub，用 Actions 每天 06:00 云端抓取并发布，0 成本。

## 数据来源与更新

- 数据源：[wildriftmeta.com](https://www.wildriftmeta.com)（英文站，聚合各服对局统计的当前版本主流出装与符文）
- 中文名：Riot 官方 Data Dragon `zh_CN` 词典 + 少量手写外号（`lib/zh-manual.json`），因此装备 / 符文 / 技能名与国服一致
- **自动更新**：
  - 站点运行时每天 **06:00** 自动重新抓取；
  - 启动时若数据超过 12 小时会自动在后台刷新；
  - 顶栏右侧 ⟳ 按钮可手动刷新；
  - 也可以双击 `update.bat` 单独更新数据（约 15 秒）。
- 抓取结果写入 `data/`，图标缓存到 `public/icons/`（已缓存的不重复下载）。

## 目录结构

```
lolm-site/
├─ start.bat          启动站点（双击）
├─ update.bat         手动更新一次数据（双击）
├─ server.mjs         零依赖 HTTP 服务 + API + 每日定时刷新
├─ refresh.mjs        抓取 wildriftmeta.com → data/
├─ lib/
│  ├─ http.mjs        抓网页 / 图片（带重试）
│  ├─ parse.mjs       解析英雄列表页与出装页
│  ├─ zh.json         中文词典（由官方 Data Dragon 生成）
│  ├─ zh-manual.json  手工补充/覆盖（外号、Wild Rift 独有装备）
│  └─ ...
├─ tools/gen-zh.mjs   重新生成中文词典
├─ data/              champions.json、meta.json、builds/<英雄>.json
└─ public/            index.html / app.js / style.css / icons/
```

## API（可选）

| 接口 | 说明 |
| --- | --- |
| `GET /api/meta` | 版本号、数据日期、英雄数、上次刷新时间 |
| `GET /api/champions` | 全部英雄（含中文名、外号、分路、胜率） |
| `GET /api/champion/:slug` | 单个英雄完整出装（含中文名） |
| `POST /api/refresh` | 立即后台刷新数据 |
| `GET /api/debug/names` | 列出未翻译的词条，用于补词典 |

## 说明

- 出装与符文来自第三方统计站的当前版本主流方案，**仅供参考**，实战请按对局调整。
- 站点不依赖任何 npm 包，只用 Node.js 内置模块；需要 Node.js 18 以上（本机已自带 node，start.bat 会自动使用）。
