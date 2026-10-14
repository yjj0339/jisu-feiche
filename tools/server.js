// 极速飞车 · 本地静态服务器（局域网预览用）
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 8940;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  // 白名单：只允许直接根下静态目录
  const allowedDirs = ['css', 'js', 'vendor', 'models'].map(d => path.join(ROOT, d));
  const file = path.resolve(ROOT, '.' + url.replace(/\\/g, '/'));
  const inRoot = file === ROOT || file.startsWith(ROOT + path.sep);
  const inAllowed = file === path.join(ROOT, 'index.html') || allowedDirs.some(d => file === d || file.startsWith(d + path.sep));
  if (!inRoot || !inAllowed) { res.writeHead(403); res.end('403'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`极速飞车 本地服务: http://127.0.0.1:${PORT}`);
});
