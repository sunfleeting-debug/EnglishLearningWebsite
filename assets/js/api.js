/* 后端 API 客户端：地址解析、登录态、请求封装
   后端地址优先级：localStorage 覆盖 > assets/js/config.js 的 TW_CONFIG.apiBase
   登录态（token / 用户）也放 localStorage，请求时带 Authorization: Bearer <token>。 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};

  var K_TOKEN = 'typingcet.token';
  var K_USER = 'typingcet.user';
  var K_BASE = 'typingcet.apiBase';
  var TIMEOUT = 15000;
  /* 2026-10-18 起后端默认走自定义域 api.sunfleeting.website（workers.dev 国内被墙）。
     老用户 localStorage 里存的旧地址就地升级，避免「覆盖值优先级高」把人留在坏地址上。 */
  var LEGACY_BASE = 'https://cet-words-api.sunfleeting.workers.dev';
  var DEFAULT_BASE = 'https://api.sunfleeting.website';

  function lsGet(k) { try { return window.localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) {
    try {
      if (v == null || v === '') window.localStorage.removeItem(k);
      else window.localStorage.setItem(k, v);
    } catch (e) { /* 隐私模式下可能写不进去，忽略 */ }
  }

  /* ---------------- 地址 ---------------- */
  function base() {
    var b = lsGet(K_BASE);
    if (b && b.replace(/\/+$/, '') === LEGACY_BASE) {   // 旧地址迁移到自定义域
      b = DEFAULT_BASE; lsSet(K_BASE, b);
    }
    return String(b || (window.TW_CONFIG && window.TW_CONFIG.apiBase) || '').trim().replace(/\/+$/, '');
  }
  function setBase(url) {
    var v = String(url || '').trim().replace(/\/+$/, '');
    lsSet(K_BASE, v);
    emit();
  }
  function configured() { return !!base(); }

  /* ---------------- 登录态 ---------------- */
  function token() { return lsGet(K_TOKEN); }
  function user() {
    var raw = lsGet(K_USER);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function isAdmin() { var u = user(); return !!(u && u.admin); }
  function setSession(t, u) { lsSet(K_TOKEN, t || ''); lsSet(K_USER, u ? JSON.stringify(u) : ''); emit(); }
  function clearSession() { setSession('', null); }

  var listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  /* ---------------- 请求 ---------------- */
  function request(method, path, body, opts) {
    opts = opts || {};
    if (!configured()) {
      var e0 = new Error('还没有配置后端地址');
      e0.noBackend = true;
      return Promise.reject(e0);
    }
    var headers = {};
    if (body != null) headers['Content-Type'] = 'application/json';
    if (token()) headers['Authorization'] = 'Bearer ' + token();

    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.timeout || TIMEOUT) : null;

    return fetch(base() + path, {
      method: method,
      headers: headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.text().then(function (text) {
        if (opts.raw) {
          if (!res.ok) throw makeErr(text, res.status);
          return text;
        }
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) throw makeErr((data && data.error) || ('请求失败（HTTP ' + res.status + '）'), res.status);
        return data;
      });
    }, function (err) {
      if (timer) clearTimeout(timer);
      var e = new Error(err && err.name === 'AbortError' ? '请求超时，稍后自动重试' : '网络不可用，稍后自动重试');
      e.offline = true;
      throw e;
    });
  }

  function makeErr(msg, status) {
    var e = new Error(msg || '请求失败');
    e.status = status;
    return e;
  }

  TW.api = {
    base: base, setBase: setBase, configured: configured,
    token: token, user: user, isAdmin: isAdmin,
    setSession: setSession, clearSession: clearSession,
    onChange: onChange, emit: emit,
    request: request,

    health: function () { return request('GET', '/api/health'); },

    register: function (email, password, name) {
      return request('POST', '/api/register', { email: email, password: password, name: name || '' })
        .then(function (r) { setSession(r.token, r.user); return r.user; });
    },
    login: function (email, password) {
      return request('POST', '/api/login', { email: email, password: password })
        .then(function (r) { setSession(r.token, r.user); return r.user; });
    },
    logout: function () {
      if (!configured() || !token()) { clearSession(); return Promise.resolve(); }
      return request('POST', '/api/logout', {}).catch(function () {}).then(function () { clearSession(); });
    },
    me: function () {
      return request('GET', '/api/me').then(function (r) { setSession(token(), r.user); return r.user; });
    },

    /* 同步：推送增量，服务端合并后回传权威全量 */
    sync: function (delta) { return request('POST', '/api/me/sync', delta, { timeout: 30000 }); },

    /* AI 配置（含 Key）的云端存证：服务端 AES-GCM 加密后落库，取回时解密返回 */
    aiCfgGet: function () { return request('GET', '/api/me/ai', null, { timeout: 20000 }); },
    aiCfgPut: function (cfg, at) {
      var payload = { cfg: cfg, at: at };
      /* 正常走 PUT；万一浏览器把「旧 CORS 头里没有 PUT」的预检结果缓存住了，
         PUT 会直接报 CORS 错而请求根本没出门 —— 这时改用 POST（服务端同义）兜底 */
      return request('PUT', '/api/me/ai', payload, { timeout: 20000 }).then(null, function (e) {
        if (e && e.status) throw e;                       // 服务端明确回了状态码：照实报
        return request('POST', '/api/me/ai', payload, { timeout: 20000 });
      });
    },

    /* 小数据块（做题记录等）：服务端只存「JSON + 时间戳」，合并由客户端做 */
    blobsGet: function () { return request('GET', '/api/me/blobs', null, { timeout: 20000 }); },
    blobsPut: function (k, data, ts) {
      var payload = { k: k, data: data, ts: ts };
      return request('POST', '/api/me/blobs', payload, { timeout: 20000 }).then(null, function (e) {
        if (e && e.status) throw e;
        return request('PUT', '/api/me/blobs', payload, { timeout: 20000 });
      });
    },

    /* 管理看板 */
    adminUsers: function () { return request('GET', '/api/admin/users').then(function (r) { return r.users || []; }); },
    adminUser: function (id) { return request('GET', '/api/admin/users/' + encodeURIComponent(id)); },
    adminExportCsv: function (id) {
      return request('GET', '/api/admin/users/' + encodeURIComponent(id) + '/export', null, { raw: true });
    },
    adminResetPassword: function (id, password) {
      return request('POST', '/api/admin/users/' + encodeURIComponent(id) + '/password', { password: password });
    }
  };
})();
