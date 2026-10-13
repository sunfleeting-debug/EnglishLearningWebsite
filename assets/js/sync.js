/* 云同步
   ------------------------------------------------------------------
   离线优先：没配后端地址、没登录、断网 —— 全都照常用 localStorage，
   只是不往云端传。登录之后：
     1) 登录成功 → 立刻把本地数据整份推上去，服务端合并后回传权威结果，
        覆盖本地（这样「换设备登录能看到原来的进度」）；
     2) 练习过程中 → store 记脏标记，这里防抖后把增量发出去；
     3) 页面隐藏/关闭 → 用 sendBeacon 把最后一批增量带走（尽力而为）。
   冲突规则见 worker/index.js 的 mergeProgress / mergeDaily / mergeSrs。 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};

  var DEBOUNCE = 3500;    // 练习中连续操作，攒一下再发
  var MIN_GAP = 8000;     // 两次自动同步之间的最小间隔，避免疯狂发请求

  var status = 'off';     // off 未启用 | idle 空闲 | syncing 同步中 | error 出错
  var lastError = '';
  var lastSyncAt = 0;
  var timer = null;
  var inflight = false;
  var listeners = [];

  function enabled() { return TW.api.configured() && !!TW.api.token(); }

  function snapshot() {
    var u = TW.api.user() || {};
    return {
      status: status, error: lastError, at: lastSyncAt,
      base: TW.api.base(), email: u.email || '', admin: !!u.admin
    };
  }
  function notify() { listeners.forEach(function (f) { try { f(snapshot()); } catch (e) {} }); }
  function onChange(fn) { listeners.push(fn); fn(snapshot()); }
  function setStatus(s, err) { status = s; lastError = err || ''; notify(); }

  function hasData(delta) {
    return !!(Object.keys(delta.progress).length || Object.keys(delta.daily).length ||
      Object.keys(delta.srs).length || delta.deleted.progress.length ||
      delta.deleted.srs.length || delta.clear.length);
  }

  /** 手动/登录后：把本地全部数据推上去并取回权威结果（force=true） */
  function flush(force) {
    if (!enabled()) { setStatus('off'); return Promise.resolve(false); }
    if (inflight) return Promise.resolve(false);

    var snap = force ? null : TW.store.dirty.take();
    var delta = force ? TW.store.dirty.buildAll() : TW.store.dirty.build(snap);

    if (!force && !hasData(delta)) {
      TW.store.dirty.restore(snap);
      if (status !== 'idle') setStatus('idle');
      return Promise.resolve(false);
    }

    inflight = true;
    setStatus('syncing');
    return TW.api.sync(delta).then(function (res) {
      inflight = false;
      lastSyncAt = res.syncedAt || Date.now();
      TW.store.applyRemote(res);      // 内部会 emit('remote')
      setStatus('idle');
      return true;
    }).catch(function (err) {
      inflight = false;
      if (snap) TW.store.dirty.restore(snap);   // 没发成功，标记放回，下次再发
      if (err && err.status === 401) {
        TW.api.clearSession();                  // token 失效，退回未登录状态
        setStatus('off', '登录已过期，请重新登录');
      } else {
        setStatus('error', err && err.message);
      }
      return false;
    });
  }

  function schedule(delay) {
    if (!enabled()) return;
    clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      var gap = MIN_GAP - (Date.now() - lastSyncAt);
      if (lastSyncAt && gap > 0) {
        timer = setTimeout(function () { timer = null; flush(false); }, gap);
      } else {
        flush(false);
      }
    }, delay == null ? DEBOUNCE : delay);
  }

  /** 页面要关了：用 sendBeacon 把最后一批增量带走（带 token 走 query，header 发不了） */
  function beacon() {
    if (!enabled() || inflight) return;
    var delta = TW.store.dirty.buildAll();     // 关页面时不做增量判断，直接整份带上，最稳
    if (!hasData(delta)) return;
    var url = TW.api.base() + '/api/me/sync?token=' + encodeURIComponent(TW.api.token());
    try {
      var blob = new Blob([JSON.stringify(delta)], { type: 'application/json' });
      if (navigator.sendBeacon && navigator.sendBeacon(url, blob)) return;
    } catch (e) { /* 退回到同步 fetch */ }
    try {
      fetch(url, {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(delta)
      });
    } catch (e) { /* 尽力而为 */ }
  }

  function init() {
    // 每次改动都记了脏标记，这里只是安排一次发送
    TW.store.on('progress', function () { schedule(); });

    // 登录 / 退出 / 换后端地址：登录立刻全量对齐一次
    TW.api.onChange(function () {
      clearTimeout(timer);
      if (!TW.api.configured()) { setStatus('off'); return; }
      if (!TW.api.token()) { setStatus('off'); return; }
      flush(true);
    });

    window.addEventListener('pagehide', beacon);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') beacon();
    });

    if (!TW.api.configured()) setStatus('off');
    else if (!TW.api.token()) setStatus('off');
    else flush(true);      // 带着会话刷新页面：对齐一次（也补上刷新期间可能漏掉的改动）
  }

  TW.sync = {
    init: init,
    flush: flush,
    schedule: schedule,
    enabled: enabled,
    snapshot: snapshot,
    onChange: onChange,
    label: function () {
      switch (status) {
        case 'syncing': return '同步中…';
        case 'idle': return '已同步';
        case 'error': return '同步失败，稍后重试';
        default: return enabled() ? '未同步' : '仅本机';
      }
    }
  };
})();
