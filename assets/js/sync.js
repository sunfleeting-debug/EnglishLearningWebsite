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
      /* AI 配置（含 Key）单独走 /api/me/ai：登录后顺手拉一次，
         新设备就能直接用 AI，不用重新填 Key */
      if (TW.ai && TW.ai.syncPull) TW.ai.syncPull();
      syncBlobs();          // 做题记录等「本地键」的云端副本
    });

    window.addEventListener('pagehide', beacon);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') beacon();
    });

    if (!TW.api.configured()) setStatus('off');
    else if (!TW.api.token()) setStatus('off');
    else {
      flush(true);      // 带着会话刷新页面：对齐一次（也补上刷新期间可能漏掉的改动）
      if (TW.ai && TW.ai.syncPull) TW.ai.syncPull();
      syncBlobs();
    }
  }

  /* ---------------- 小数据块同步（做题记录） ----------------
     和学习进度不一样：这块 JSON 的内部结构（results 按套 id、每条自带 ts）只有 quiz.js 懂，
     所以服务端只做「整块 + 时间戳后写覆盖」，合并算法在 quiz.js 的 mergeRemote 里。
     这里只负责编排，且**必须先拉再推** —— 反过来的话，后同步的设备会拿自己的旧块
     把另一台刚写进去的记录整块盖掉（这正是「手机做了题电脑看不到」的成因之一）。 */
  var BLOBS = ['typingcet.quiz.v1'];
  var blobTimer = null;
  var blobBusy = false;
  var blobAgain = false;

  function localBlob(k) {
    if (k === 'typingcet.quiz.v1' && TW.quiz && TW.quiz.raw) return TW.quiz.raw();
    return null;
  }
  function applyBlob(k, data) {
    if (k === 'typingcet.quiz.v1' && TW.quiz && TW.quiz.mergeRemote) return TW.quiz.mergeRemote(data);
    return false;
  }

  function syncBlobs() {
    if (!enabled() || !TW.api.blobsGet) return Promise.resolve(false);
    if (blobBusy) { blobAgain = true; return Promise.resolve(false); }
    blobBusy = true;
    return TW.api.blobsGet().then(function (r) {
      var blobs = (r && r.blobs) || {};
      var chain = Promise.resolve();
      BLOBS.forEach(function (k) {
        var local = localBlob(k);
        if (!local) return;
        var remote = blobs[k];
        var changed = (remote && remote.data) ? applyBlob(k, remote.data) : false;
        var mine = localBlob(k) || local;
        var rts = (remote && remote.ts) || 0;
        if (!remote || changed || (mine.ts || 0) > rts) {
          chain = chain.then(function () {
            return TW.api.blobsPut(k, mine, Math.max(mine.ts || 0, Date.now()))
              .then(null, function () {});
          });
        }
      });
      return chain;
    }).then(function () {
      blobBusy = false;
      if (blobAgain) { blobAgain = false; return syncBlobs(); }
      return true;
    }, function () { blobBusy = false; return false; });
  }

  /** 本地块改动了（quiz.js 的 write 会调）→ 攒 1.5s 再同步 */
  function blobDirty() {
    if (!enabled()) return;
    if (blobTimer) clearTimeout(blobTimer);
    blobTimer = setTimeout(function () { blobTimer = null; syncBlobs(); }, 1500);
  }

  TW.sync = {
    init: init,
    flush: flush,
    schedule: schedule,
    syncBlobs: syncBlobs,
    blobDirty: blobDirty,
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
