/*
 * 英语学习站 · Windows 桌面壳（Electron）
 * 原理：进程内起一个支持 Range 的静态服务器（音频拖动需要），
 * 再用 BrowserWindow 加载 127.0.0.1 地址。站点本身零构建，直接复用仓库根目录文件。
 * 打包由 electron-builder 完成（见 desktop/package.json 的 build 字段），
 * 静态资源随 asar 一起进 exe。
 */
'use strict';

const { app, BrowserWindow, shell, Menu, session, ipcMain } = require('electron');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

// 开发态=仓库根（desktop/..）；打包态=asar 内随包携带的 app/ 目录
// （desktop/build.mjs 打包前把站点白名单资源拷到 desktop/app/）
const ROOT = fs.existsSync(path.join(__dirname, 'app', 'index.html'))
  ? path.join(__dirname, 'app')
  : path.join(__dirname, '..');

const API_HOST = 'cet-words-api.sunfleeting.workers.dev';
const PAGE_ORIGIN = 'https://sunfleeting-debug.github.io';

/* 后端 CORS 白名单只认 Pages 域名，而桌面版的源是 http://127.0.0.1:<随机端口>，
   直接 fetch 会被 CORS 拦下（症状：账号页「连接失败：网络不可用」）。
   在发往后端的请求上把 Origin/Referer 重写成 Pages 域名，worker 零改动、白名单安全模型不变。 */
function patchApiOrigin() {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: [`https://${API_HOST}/*`] },
    (details, callback) => {
      const headers = Object.assign({}, details.requestHeaders);
      headers['Origin'] = PAGE_ORIGIN;
      headers['Referer'] = PAGE_ORIGIN + '/';
      callback({ requestHeaders: headers });
    }
  );
}

/* 国内直连 *.workers.dev 常常超时，而系统代理（Windows 设置）经常是关的——
   浏览器靠自己的分流插件能连，Electron 不行。这里启动时探测常见本地代理端口，
   探活成功就装一个 PAC：仅 workers.dev 域名走代理，其余全部直连。 */
const PROXY_CANDIDATES = ['127.0.0.1:7897', '127.0.0.1:7890', '127.0.0.1:10809', '127.0.0.1:1080'];

function detectLocalProxy() {
  return new Promise((resolve) => {
    let i = 0;
    function next() {
      if (i >= PROXY_CANDIDATES.length) return resolve(null);
      const [host, port] = PROXY_CANDIDATES[i++].split(':');
      const sock = net.connect({ host, port: parseInt(port, 10) });
      const done = (r) => { try { sock.destroy(); } catch (e) {} resolve(r); };
      sock.setTimeout(500, () => done(null));
      sock.on('connect', () => done(`${host}:${port}`));
      sock.on('error', () => done(null));
    }
    next();
  });
}

async function setupNetwork() {
  patchApiOrigin();
  const proxy = await detectLocalProxy();
  if (proxy) {
    const pac =
      'function FindProxyForURL(url, host) {' +
      ' if (shExpMatch(host, "*.workers.dev")) return "PROXY ' + proxy + '; DIRECT";' +
      ' return "DIRECT"; }';
    await session.defaultSession.setProxy({
      proxyBypassRules: '<local>',
      pacScript: 'data:application/x-ns-proxy-autoconfig;base64,' +
        Buffer.from(pac).toString('base64'),
    });
    console.log('[net] workers.dev -> local proxy', proxy);
  }
}
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
  // 登录页跟随 main.js 所在目录（开发态=desktop/，打包态=asar 内），不在站点根
  const filePath = urlPath === '/login.html'
    ? path.join(__dirname, 'login.html')
    : path.normalize(path.join(ROOT, urlPath));
  // 防目录穿越：解析后必须仍在 ROOT 或 __dirname 内
  if (!filePath.startsWith(ROOT) && !filePath.startsWith(__dirname)) {
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
  return win;
}

/* ---------- 启动流程：登录窗（可跳过）→ 主窗 ----------
   login.html 与主窗同源（127.0.0.1 随机端口），所以它写进 localStorage 的
   typingcet.token/user 直接被站点的 api.js/sync.js 认领，无需 IPC。
   已有登录态时 login.html 自动关闭（秒过）⇒ 效果等同「记住我自动登录」。 */
let mainWin = null;

function createLoginWindow(port) {
  const win = new BrowserWindow({
    width: 440,
    height: 720,
    resizable: false,
    center: true,
    title: '登录 · 英语学习站',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'login-preload.js'),
    },
  });
  Menu.setApplicationMenu(null);
  win.loadURL(`http://127.0.0.1:${port}/login.html`);
  win.on('closed', () => { if (!mainWin) openMain(); });
  return win;
}

ipcMain.on('login-window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

function openMain() {
  if (mainWin) return;
  const server = http.createServer(serve);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    mainWin = createWindow(port);
    mainWin.on('closed', () => { mainWin = null; app.quit(); });
  });
  server.on('error', (e) => console.error('[main] server error', e));
}

app.whenReady().then(async () => {
  await setupNetwork();
  const server = http.createServer(serve);
  server.listen(0, '127.0.0.1', () => {
    createLoginWindow(server.address().port);
  });
  app.on('activate', () => {
    if (!mainWin && BrowserWindow.getAllWindows().length === 0) openMain();
  });
});

app.on('window-all-closed', () => {
  // 关闭动作统一走 mainWin 'closed' → app.quit()；这里不重复退，
  // 避免「登录窗关了、主窗还没建」的瞬间被当成全部关闭
});
