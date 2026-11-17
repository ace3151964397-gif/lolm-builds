// 用 PWABuilder CloudAPK 服务把线上 PWA 打成签名的 TWA APK。
//   node tools/build-apk.mjs
// 产物：dist/android-package.zip（含 signed.apk、signing.keystore、assetlinks.json 等）
import fs from 'node:fs/promises';
import path from 'node:path';

const SVC = 'https://pwabuilder-cloudapk.azurewebsites.net';
const SITE = 'https://ace3151964397-gif.github.io/lolm-builds/';
const NAME = 'LOLM 出装天赋';
const LAUNCHER = 'LOLM出装';
const PACKAGE_ID = 'com.ace3151964397.lolm';

const options = {
  additionalTrustedOrigins: [],
  appVersion: '1.0.0.0',
  appVersionCode: 1,
  backgroundColor: '#0a0e17',
  display: 'standalone',
  enableSiteSettingsShortcut: true,
  enableNotifications: false,
  includeSourceCode: false,
  fallbackType: 'customtabs',
  features: { locationDelegation: { enabled: false }, playBilling: { enabled: false } },
  host: 'ace3151964397-gif.github.io',
  iconUrl: SITE + 'icon-512.png',
  launcherName: LAUNCHER,
  name: NAME,
  maskableIconUrl: SITE + 'icon-512.png',
  navigationColor: '#0a0e17',
  navigationColorDark: '#0a0e17',
  navigationDividerColor: '#0a0e17',
  navigationDividerColorDark: '#0a0e17',
  orientation: 'default',
  packageId: PACKAGE_ID,
  pwaUrl: SITE,
  shortcuts: [],
  signingMode: 'new',
  signing: {
    file: null,
    alias: 'lolm-key',
    fullName: 'LOLM Builds',
    organization: 'ace3151964397',
    organizationalUnit: 'Personal',
    countryCode: 'CN',
    keyPassword: 'Lolm2026Key!',
    storePassword: 'Lolm2026Store!',
  },
  splashScreenFadeOutDuration: 300,
  startUrl: '/lolm-builds/',
  themeColor: '#0a0e17',
  themeColorDark: '#0a0e17',
  webManifestUrl: SITE + 'manifest.webmanifest',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const res = await fetch(SVC + '/enqueuePackageJob', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'platform-identifier': 'ServerUI',
    'platform-identifier-version': '1.0.0',
  },
  body: JSON.stringify(options),
});
const raw = await res.text();
console.log('enqueue', res.status, raw.slice(0, 300));
if (!res.ok) process.exit(1);
const { id: jobId, accessToken } = JSON.parse(raw);
console.log('job', jobId);

let job = null;
for (let i = 0; i < 120; i++) {
  await sleep(3000);
  const r = await fetch(`${SVC}/getPackageJob?id=${encodeURIComponent(jobId)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  job = await r.json();
  const logs = (job.logs || []).slice(-3);
  console.log(`[${i}] ${job.status}` + (logs.length ? ' | ' + logs.join(' | ').slice(0, 200) : ''));
  if (job.status === 'Completed' || job.status === 'Failed') break;
}
if (!job || job.status !== 'Completed') {
  console.log('not completed:', JSON.stringify(job).slice(0, 800));
  process.exit(1);
}

const zipRes = await fetch(`${SVC}/downloadPackageZip?id=${encodeURIComponent(jobId)}`, {
  headers: { authorization: `Bearer ${accessToken}` },
  cache: 'no-store',
});
if (!zipRes.ok) {
  console.log('zip download failed', zipRes.status);
  process.exit(1);
}
const buf = Buffer.from(await zipRes.arrayBuffer());
const outDir = path.resolve('dist');
await fs.mkdir(outDir, { recursive: true });
const zipPath = path.join(outDir, 'android-package.zip');
await fs.writeFile(zipPath, buf);
console.log('saved', zipPath, buf.length, 'bytes');
