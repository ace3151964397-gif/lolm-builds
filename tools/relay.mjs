// 本地 CONNECT/HTTP 代理：把被污染 DNS 的 github.com 指向可用 IP，其余域名正常解析
// 用法：node tools/relay.mjs [port]（默认 8899）
import net from 'node:net';
import http from 'node:http';

const PORT = Number(process.argv[2] || 8899);

// 只覆盖确实需要的主机；可用 IP 会随网络变化，失败时可在 PROXY_MAP 里加别的
const PROXY_MAP = {
  'github.com': process.env.GH_IP || '20.205.243.166',
};

function targetFor(host) {
  const key = host.toLowerCase();
  if (PROXY_MAP[key]) return { host: PROXY_MAP[key], viaMap: true };
  return { host, viaMap: false };
}

const server = http.createServer((req, res) => {
  // 普通 HTTP 转发
  let url;
  try { url = new URL(req.url); } catch { res.writeHead(400); return res.end('bad url'); }
  const t = targetFor(url.hostname);
  const up = http.request({
    host: t.host, port: url.port || 80, path: url.pathname + url.search, method: req.method,
    headers: { ...req.headers, host: url.host },
  }, (ur) => { res.writeHead(ur.statusCode || 502, ur.headers); ur.pipe(res); });
  up.on('error', (e) => { res.writeHead(502); res.end('proxy error: ' + e.code); });
  req.pipe(up);
});

server.on('connect', (req, clientSocket, head) => {
  const [host, port] = req.url.split(':');
  const t = targetFor(host);
  const upstream = net.connect(Number(port) || 443, t.host, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head?.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.on('error', (e) => { clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); console.error('[relay]', host, e.code); });
  clientSocket.on('error', () => upstream.destroy());
  if (t.viaMap) console.log('[relay]', host, '→', t.host);
});

server.listen(PORT, '127.0.0.1', () => console.log(`[relay] listening on http://127.0.0.1:${PORT}`, JSON.stringify(PROXY_MAP)));
