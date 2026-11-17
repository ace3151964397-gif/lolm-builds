// 用已保存的 token 自动完成：建仓库 → 推送 → 开启 Pages(Actions) → 触发首次构建
// 用法：node tools/deploy-github.mjs [repoName]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const TOKEN = fs.readFileSync('.tools/gh_token', 'utf8').trim();
const REPO = process.argv[2] || 'lolm-builds';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, method = 'GET', body, okStatuses = [200, 201, 204]) {
  const r = await fetch('https://api.github.com' + path, {
    method,
    headers: {
      authorization: 'Bearer ' + TOKEN,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'lolm-site',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!okStatuses.includes(r.status)) {
    throw new Error(`API ${method} ${path} → ${r.status}: ${text.slice(0, 300)}`);
  }
  return { status: r.status, json };
}

const me = (await api('/user')).json;
const owner = me.login;
console.log('ACCOUNT=' + owner);

// 1) 建仓库（已存在则复用）
let repoRes = await api('/user/repos', 'POST', {
  name: REPO,
  description: '英雄联盟手游 出装 / 天赋 查询站（静态 PWA，每日云端刷新）',
  homepage: '',
  private: false,
  has_issues: false,
  has_wiki: false,
  auto_init: false,
}, [201, 422]);
console.log('REPO_STATUS=' + repoRes.status);
if (repoRes.status === 422) console.log('（仓库已存在，复用）');

// 2) 推送 main
const remote = `https://x-access-token:${TOKEN}@github.com/${owner}/${REPO}.git`;
try { execFileSync('git', ['remote', 'remove', 'origin'], { stdio: 'ignore' }); } catch {}
execFileSync('git', ['remote', 'add', 'origin', `https://github.com/${owner}/${REPO}.git`], { stdio: 'inherit' });
console.log('PUSHING…');
execFileSync('git', ['push', remote, 'HEAD:refs/heads/main', '--force'], { stdio: 'inherit' });
console.log('PUSH_DONE');

// 3) 开启 Pages，源 = GitHub Actions
let pages = await api(`/repos/${owner}/${REPO}/pages`, 'POST', { build_type: 'workflow' }, [201, 409]);
if (pages.status === 409) {
  pages = await api(`/repos/${owner}/${REPO}/pages`, 'PUT', { build_type: 'workflow' }, [204, 200]);
}
console.log('PAGES_ENABLED=' + pages.status);

// 4) 触发首次构建
await sleep(3000);
await api(`/repos/${owner}/${REPO}/actions/workflows/daily.yml/dispatches`, 'POST', { ref: 'main' }, [204]);
console.log('WORKFLOW_DISPATCHED');

// 5) 轮询构建结果
let run = null;
for (let i = 0; i < 90; i++) {
  await sleep(10000);
  const runs = (await api(`/repos/${owner}/${REPO}/actions/runs?per_page=1`)).json;
  run = runs.workflow_runs?.[0];
  if (!run) continue;
  console.log(`RUN ${run.status} ${run.conclusion || ''} (${Math.round((Date.now() - new Date(run.created_at)) / 1000)}s)`);
  if (run.status === 'completed') break;
}
if (run?.conclusion !== 'success') {
  console.log('RUN_FAILED=' + (run?.conclusion || 'unknown'));
  console.log('LOG=' + (run?.html_url || ''));
  process.exit(2);
}

const site = (await api(`/repos/${owner}/${REPO}/pages`)).json;
console.log('SITE=' + site.html_url);
console.log('OWNER=' + owner);
console.log('REPO=' + REPO);
