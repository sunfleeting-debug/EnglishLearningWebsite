/*
 * 英语学习站 · Windows 桌面壳（Electron）
 * 原理：进程内起一个支持 Range 的静态服务器（音频拖动需要），
 * 再用 BrowserWindow 加载 127.0.0.1 地址。站点本身零构建，直接复用仓库根目录文件。
 * 打包由 electron-builder 完成（见 desktop/package.json 的 build 字段），
 * 静态资源随 asar 一起进 exe。
 */
'use strict';

const { app, BrowserWindow, shell, Menu } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 开发态=仓库根（desktop/..）；打包态=asar 内随包携带的 app/ 目录
// （desktop/build.mjs 打包前把站点白名单资源拷到 desktop/app/）
const ROOT = fs.existsSync(path.join(__dirname, 'app', 'index.html'))
  ? path.join(__dirname, 'app')
  : path.join(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.lrc': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serve(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  // 防目录穿越：解析后必须仍在 ROOT 内
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      // SPA 兜底：未命中交给 index.html（哈希路由其实用不到，保险起见）
      const fallback = path.join(ROOT, 'index.html');
      return fs.readFile(fallback, (e2, buf) => {
        if (e2) { res.writeHead(404); return res.end('Not Found'); }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(buf);
      });
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    // Range 支持：音频/视频拖动进度条必需（与 tools/serve.py 行为对齐）
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (isNaN(start) || start > end || end >= st.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
      });
      return fs.createReadStream(filePath, { start, end }).pipe(res);
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function createWindow(port) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    title: '英语学习站',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  Menu.setApplicationMenu(null);
  // 外部链接（PDF、在线词典等）走系统浏览器，不在应用内跳走
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  win.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(() => {
  const server = http.createServer(serve);
  server.listen(0, '127.0.0.1', () => {
    createWindow(server.address().port);
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const server2 = http.createServer(serve);
      server2.listen(0, '127.0.0.1', () => createWindow(server2.address().port));
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
