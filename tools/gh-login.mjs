// GitHub OAuth 设备码登录：打开授权页 + 复制验证码到剪贴板，用户点「授权」后自动拿到 token
// 用法：node tools/gh-login.mjs
// token 写入 .tools/gh_token（.gitignore 已忽略），不打印
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const CLIENT_ID = '178c6fc778ccc68e1d6a'; // GitHub CLI 的公开 OAuth client id
const SCOPE = 'repo workflow';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(url, body, attempt = 0) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'lolm-site' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    const text = await r.text();
    try { return JSON.parse(text); } catch { return { error: 'bad_response', raw: text.slice(0, 200) }; }
  } catch (e) {
    if (attempt < 4) { await sleep(2000); return post(url, body, attempt + 1); }
    throw e;
  }
}

const start = await post('https://github.com/login/device/code', { client_id: CLIENT_ID, scope: SCOPE });
if (!start.device_code) {
  console.error('START_FAILED', JSON.stringify(start).slice(0, 300));
  process.exit(1);
}

const code = start.user_code;
try { execFileSync('clip.exe', { input: code }); } catch {}
try { execFileSync('cmd.exe', ['/c', 'start', '', start.verification_uri]); } catch {}

console.log('VERIFY_URL=' + start.verification_uri);
console.log('USER_CODE=' + code);
console.log('EXPIRES_MIN=' + Math.round(start.expires_in / 60));

const interval = Math.max(start.interval || 5, 6) * 1000;
const deadline = Date.now() + start.expires_in * 1000;
let token = null;

while (Date.now() < deadline) {
  await sleep(interval);
  const res = await post('https://github.com/login/oauth/access_token', {
    client_id: CLIENT_ID,
    device_code: start.device_code,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  });
  if (res.access_token) { token = res.access_token; break; }
  if (res.error === 'authorization_pending' || res.error === 'slow_down') continue;
  console.error('AUTH_FAILED', res.error, res.error_description || '');
  process.exit(1);
}

if (!token) { console.error('AUTH_TIMEOUT'); process.exit(1); }

fs.mkdirSync('.tools', { recursive: true });
fs.writeFileSync('.tools/gh_token', token.trim(), { mode: 0o600 });
console.log('TOKEN_SAVED');
