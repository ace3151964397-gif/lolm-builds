// 轻量抓取工具：带 UA、重试、并发池
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const SITE = 'https://www.wildriftmeta.com';

export async function getText(url, { retries = 3, timeout = 25000 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeout);
      const res = await fetch(url, {
        headers: { 'user-agent': UA, referer: SITE + '/', 'accept-language': 'en-US,en;q=0.9' },
        redirect: 'follow',
        signal: ac.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        lastErr = new Error('HTTP ' + res.status + ' ' + url);
        if (res.status === 404) return null; // 不存在就当没有
        await sleep(600 * (i + 1));
        continue;
      }
      return await res.text();
    } catch (e) {
      lastErr = e;
      await sleep(600 * (i + 1));
    }
  }
  throw lastErr;
}

export async function getBuffer(url, { retries = 3, timeout = 25000 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeout);
      const res = await fetch(url, {
        headers: { 'user-agent': UA, referer: SITE + '/', accept: 'image/*,*/*' },
        signal: ac.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('HTTP ' + res.status);
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
      await sleep(400 * (i + 1));
    }
  }
  throw lastErr;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 简单并发池：workers 个并发，返回结果数组
export async function pool(items, workers, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(workers, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        out[i] = await fn(items[i], i);
      } catch (e) {
        out[i] = { __error: e.message };
      }
    }
  });
  await Promise.all(runners);
  return out;
}
