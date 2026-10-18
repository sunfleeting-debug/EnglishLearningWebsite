/* 后端地址配置（可选）
   ------------------------------------------------------------------
   留空 = 纯本地模式：所有数据只存在当前浏览器，换设备/清了浏览器数据就没了，
   但功能完全可用，不需要联网。

   填上 Cloudflare Worker 的地址（见 worker/README.md）之后，就能在「账号」页
   用邮箱注册/登录，进度会自动同步到云端。

   这个值也可以在页面上改：「账号」→「后端地址」，改完存在浏览器里，
   优先级高于本文件（localStorage 键 typingcet.apiBase）。 */
window.TW_CONFIG = {
  /* api.sunfleeting.website：Cloudflare Worker 自定义域（2026-10-18 起）。
     workers.dev 在国内被 DNS 污染 + SNI 阻断，自定义域走橙云代理国内可直连。 */
  apiBase: (['127.0.0.1', 'localhost'].includes(location.hostname) && location.port === '5173')
    ? 'http://127.0.0.1:8791'
    : 'https://api.sunfleeting.website'
};
