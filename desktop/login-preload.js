/* 登录窗 preload：渲染层（contextIsolation）拿不到 window.close 的可靠行为，
   通过 IPC 让主进程关窗。站点 API 全部走页面自己的 fetch，不经这里。 */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopLogin', {
  close: function () { ipcRenderer.send('login-window-close'); },
});
