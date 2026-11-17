# 部署成「电脑关机也能每天更新」的在线站点

目标：把站点放到 GitHub Pages 上，由 **GitHub Actions 每天北京时间 06:00** 在云端抓取最新出装，
再发布成静态网站 + PWA。全程 0 成本，你的电脑可以不打开。

---

## 一、上传到 GitHub

在本目录（`lolm-site`）打开 CMD 或 PowerShell，执行：

```bat
git init -b main
git add -A
git commit -m "feat: LOLM 出装天赋查询 PWA"
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

> 仓库建议设为 **Public**（Pages 免费要求公开仓库）。
> 首次 `git push` 会弹出浏览器让你登录 GitHub 授权。

如果还没有仓库：先到 https://github.com/new 建一个空仓库（不要勾选 README），再执行上面的命令。

## 二、开启 Pages

1. 打开仓库 **Settings → Pages**
2. **Build and deployment → Source** 选 **GitHub Actions**
3. 回到 **Actions** 标签，点一次 `refresh-and-deploy` 的 **Run workflow** 立即跑一遍
4. 跑完（约 1-2 分钟）后，站点地址是：

```
https://<你的用户名>.github.io/<仓库名>/
```

之后每天 06:00（北京时间）自动重新抓取并发布，也可以在 Actions 里手动触发。

## 三、手机上装成 App（PWA）

- **Android / Chrome**：打开上面的网址 → 右上角菜单 → **安装应用 / 添加到主屏幕**
- **iOS / Safari**：打开网址 → 分享按钮 → **添加到主屏幕**

装好后有独立图标、全屏打开、断网也能看上次的数据（缓存）。

> iOS 的 PWA 需要 HTTPS，GitHub Pages 默认满足；本地 `http://192.168.x.x:5178` 只能普通浏览，不能安装。

## 四、工作流做了什么

`.github/workflows/daily.yml`：

1. 用 Node 20 跑 `node refresh.mjs --concurrency 6`
   - 抓 wildriftmeta.com 的 142 个英雄最新出装 → 写入 `data/`
   - 下载新图标到 `public/icons/`（`actions/cache` 缓存，通常命中）
   - 编译静态接口 `public/api/*.json`
2. 把 `public/` 作为 Pages 产物上传并发布

## 五、想换成自己的域名

Settings → Pages → Custom domain 填域名，然后在域名服务商加一条 CNAME 指向
`<你的用户名>.github.io`，开启 HTTPS 即可。

## 六、常见问题

**Q：抓取失败会不会把站点搞挂？**
不会。工作流失败时 Pages 保留上一次成功的版本，站点继续用旧数据。

**Q：能量产 APK 吗？**
可以。先按上面部署出 HTTPS 站点，然后用
[PWABuilder](https://www.pwabuilder.com/) 输入站点地址打包 APK（Trusted Web Activity），
数据仍由站点每天更新，APK 本身不用重装。

**Q：数据源改版了怎么办？**
需要更新 `lib/parse.mjs` 的解析规则后推送；这是唯一需要你手动介入的情况。
