/* 学习状态：localStorage 持久化 + 简单事件订阅
   含两套队列：
     1) progress —— 每个词的学习流水（对/错/收藏/掌握），驱动「生词本」与统计；
     2) srs      —— 艾宾浩斯遗忘曲线复习队列，答错的词自动进入，按 1/2/4/7/15/30/60 天
                    的间隔滚动复习（答对升档、答错归零）。
*/
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};

  var KEY = 'typingcet.state.v1';

  var DEFAULT_SETTINGS = {
    theme: 'light',        // light | dark
    order: 'seq',          // seq 顺序 | random 随机
    sessionSize: 20,       // 每轮练习词数
    autoPronounce: true,   // 出题时自动发音
    showPhonetic: true,    // 显示音标
    accent: 'us',          // 发音口音 us | uk
    speakMode: 'auto',     // 发音通道 auto 在线音频优先(失败回退系统语音) | audio 只用在线音频 | tts 只用系统语音
    keySound: true,        // 键盘音效
    autoNext: true,        // 答对后自动进入下一词
    srsAuto: true          // 答错的词自动加入复习队列
  };

  var state = {
    settings: Object.assign({}, DEFAULT_SETTINGS),
    progress: {},          // wordKey -> {w,r,seen,fav,master,ts,word,src,brief}
    daily: {},             // 'YYYY-MM-DD' -> {done, right}
    lastBook: null,
    srs: {},               // wordLower -> {w,s,m,b,d,ts,ok,bad,lapses}
    srsInit: false,        // 是否已把历史错词导入复习队列
    recentWrong: []        // 最近答错的词 id（最新的在前），只用于错词组排序，见 noteWrong()
  };

  /* ---------- 云同步的「脏标记」 ----------
     store 只负责记「哪些 id 变过」，不关心怎么发。TW.sync 在防抖后按键取出当前值发给后端，
     因此不必把整份 progress 反复上传。 */
  var dirty = newDirty();
  function newDirty() {
    return { progress: {}, daily: {}, srs: {}, delProgress: {}, delSrs: {}, clear: {} };
  }
  function touchProgress(id) { dirty.progress[id] = 1; }
  function touchDaily(day) { dirty.daily[day] = 1; }
  function touchSrs(key) { dirty.srs[key] = 1; }

  /* ---------- 存取 ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        state.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});
        state.progress = d.progress || {};
        state.daily = d.daily || {};
        state.lastBook = d.lastBook || null;
        state.srs = d.srs || {};
        state.srsInit = !!d.srsInit;
        state.recentWrong = Array.isArray(d.recentWrong) ? d.recentWrong : [];
      }
    } catch (e) { /* 数据损坏时使用默认值 */ }
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    }, 120);
  }

  /* ---------- 事件 ---------- */
  var listeners = {};
  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
  function emit(evt, payload) { (listeners[evt] || []).forEach(function (fn) { fn(payload); }); }

  /* ---------- 日期 ---------- */
  function ymd(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function today() { return ymd(new Date()); }
  function addDays(base, n) {
    var p = String(base).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return ymd(d);
  }
  /** b - a，单位天（用于「还剩几天到期」） */
  function diffDays(a, b) {
    var pa = String(a).split('-'), pb = String(b).split('-');
    var da = new Date(+pa[0], +pa[1] - 1, +pa[2]);
    var db = new Date(+pb[0], +pb[1] - 1, +pb[2]);
    return Math.round((db - da) / 86400000);
  }

  /* ---------- 进度读写 ---------- */
  function rec(id) {
    return state.progress[id] || (state.progress[id] = { w: 0, r: 0, seen: 0, fav: false, master: false, ts: 0 });
  }

  function get(id) { return state.progress[id] || null; }

  /* 进度记录自带「词面快照」：词典是懒加载的，生词本/复习页不加载词典也要能显示单词。
     新增字段只写一次，之后不再覆盖（同一 id 的词面不会变）。 */
  function snapshot(r, id) {
    if (r.word) return;
    var w = (TW.data && TW.data.byId) ? TW.data.byId(id) : null;
    if (!w) return;
    r.word = w.word;
    r.src = w.book || '';
    r.brief = (TW.data.brief ? TW.data.brief(w) : '');
  }

  /** 把历史遗留的 progress 记录补上词面快照（老数据只有数字 id） */
  function migrate() {
    Object.keys(state.progress).forEach(function (id) { snapshot(state.progress[id], id); });
    if (!state.srsInit) {
      // 首次启用复习队列：把练习中答错过、且还没掌握的词全部导进来
      var n = 0;
      Object.keys(state.progress).forEach(function (id) {
        var p = state.progress[id];
        if (p && p.w > 0 && !p.master && p.word) { enrollRaw(p.word, p.src, p.brief); n++; }
      });
      state.srsInit = true;
      if (n) save();
    }
  }

  function markRight(id) {
    var r = rec(id);
    r.r++; r.seen++; r.ts = Date.now();
    snapshot(r, id);
    var d = state.daily[today()] || (state.daily[today()] = { done: 0, right: 0 });
    d.done++; d.right++;
    save(); emit('progress');
  }

  /* ---------- 「最近答错」顺序（纯本地，不参与云同步）----------
     错词组（完成页「复习错词」/ 生词本「待攻克错词」）以前一律按**词表顺序**取词：
     于是很久以前错的词永远排在最前，而**刚刚答错的那个**可能排在第 20 个。
     sunfleeting 的要求是「错了应该就从这个开始」——所以记一份最近答错的顺序，
     错词组按它排：刚错的排最前，越久越靠后；不在这个列表里的（老数据）按原顺序排在后面。
     🔴 它只影响**排序**，不是业务数据，所以故意不进同步协议：换台设备退回词表顺序也无所谓。 */
  var RECENT_WRONG_MAX = 300;

  function noteWrong(id) {
    var i = state.recentWrong.indexOf(id);
    if (i === 0) return;                       // 已经是最新，不用动
    if (i > 0) state.recentWrong.splice(i, 1);
    state.recentWrong.unshift(id);
    if (state.recentWrong.length > RECENT_WRONG_MAX) state.recentWrong.length = RECENT_WRONG_MAX;
  }

  function markWrong(id) {
    var r = rec(id);
    r.w++; r.seen++; r.ts = Date.now();
    snapshot(r, id);
    noteWrong(id);
    var d = state.daily[today()] || (state.daily[today()] = { done: 0, right: 0 });
    d.done++;
    save(); emit('progress');
  }

  function toggleFav(id) {
    var r = rec(id); r.fav = !r.fav; snapshot(r, id); save(); emit('progress');
    return r.fav;
  }

  function toggleMaster(id) {
    var r = rec(id); r.master = !r.master; snapshot(r, id); save(); emit('progress');
    return r.master;
  }

  /** 重置某个单词的全部学习记录 */
  function resetWord(id) {
    delete state.progress[id];
    var i = state.recentWrong.indexOf(id);
    if (i >= 0) state.recentWrong.splice(i, 1);
    save(); emit('progress');
  }

  /** 清空全部学习数据（保留设置与复习队列） */
  function resetAll() {
    state.progress = {}; state.daily = {}; state.recentWrong = [];
    resetHooks.forEach(function (fn) { try { fn(); } catch (e) {} });   // 练习页等据此作废会话续接快照
    save(); emit('progress');
  }

  /* 进度重置钩子：resetAll 时通知（练习页的「会话续接」快照要作废） */
  var resetHooks = [];
  function onReset(fn) { if (resetHooks.indexOf(fn) < 0) resetHooks.push(fn); }

  /* ---------- 设置 ---------- */
  function setSetting(k, v) { state.settings[k] = v; save(); emit('settings', k); }

  /* ---------- 聚合统计 ---------- */
  function counts() {
    var ids = Object.keys(state.progress);
    var wrong = 0, fav = 0, master = 0, touched = 0;
    ids.forEach(function (id) {
      var p = state.progress[id];
      if (p.w > 0 && !p.master) wrong++;
      if (p.fav) fav++;
      if (p.master) master++;
      if (p.seen > 0) touched++;
    });
    return { total: TW.WORDS ? TW.WORDS.length : 0, touched: touched, wrong: wrong, fav: fav, master: master };
  }

  /** 按「来源」（周计划 / 某本词典）统计 —— 无需加载词典，靠进度里的快照即可 */
  function srcStats(src) {
    var touched = 0, master = 0, wrong = 0;
    Object.keys(state.progress).forEach(function (id) {
      var p = state.progress[id];
      if (!p || p.src !== src) return;
      if (p.seen > 0) touched++;
      if (p.master) master++;
      if (p.w > 0 && !p.master) wrong++;
    });
    return { touched: touched, master: master, wrong: wrong };
  }

  /* ================= 艾宾浩斯复习队列 ================= */

  /* 7 档间隔（天）：答对一次升一档，答错直接归零、当天重新回到队列 */
  var INTERVALS = [1, 2, 4, 7, 15, 30, 60];

  function srsKey(word) { return String(word == null ? '' : word).toLowerCase(); }

  function enrollRaw(word, src, brief) {
    var k = srsKey(word);
    if (!k) return null;
    var r = state.srs[k];
    if (r) {
      if (src && !r.s) r.s = src;
      if (brief && !r.m) r.m = brief;
      touchSrs(k);
      return r;
    }
    touchSrs(k);
    return (state.srs[k] = {
      w: word, s: src || '', m: brief || '',
      b: 0, d: today(), ts: Date.now(), ok: 0, bad: 0, lapses: 0
    });
  }

  /** 手动把单词加入复习队列 */
  function enroll(word, src, brief) {
    var r = enrollRaw(word, src, brief);
    save(); emit('progress');
    return r;
  }

  /** 练习判分后调用：答错的词自动入队（可在设置里关闭），答对升级间隔 */
  function onResult(word, ok, src, brief) {
    var k = srsKey(word);
    if (!k) return;
    var r = state.srs[k];
    if (!r) {
      if (ok) return;                     // 一次就答对的词不打扰
      if (!state.settings.srsAuto) return;
      r = enrollRaw(word, src, brief);
    }
    if (!r) return;
    if (ok) {
      var idx = Math.min(r.b, INTERVALS.length - 1);
      r.d = addDays(today(), INTERVALS[idx]);
      r.b = Math.min(r.b + 1, INTERVALS.length);
      r.ok++;
    } else {
      r.b = 0;
      r.d = today();                      // 今天再来
      r.bad++; r.lapses++;
    }
    r.ts = Date.now();
    touchSrs(k);
    save(); emit('progress');
  }

  /** 到期（含逾期）的词，按逾期天数从多到少排序 */
  function dueList() {
    var t = today();
    return Object.keys(state.srs).map(function (k) {
      return state.srs[k];
    }).filter(function (r) {
      return r.d <= t;
    }).sort(function (a, b) {
      return (a.d < b.d ? -1 : a.d > b.d ? 1 : 0) || a.ts - b.ts;
    });
  }

  function dueCount() { return dueList().length; }

  /** 未来 n 天每天到期的数量（用于复习页的排期条） */
  function upcoming(days) {
    var out = [], t = today();
    for (var i = 0; i < days; i++) {
      var d = addDays(t, i);
      var n = Object.keys(state.srs).filter(function (k) { return state.srs[k].d === d; }).length;
      out.push({ date: d, count: n });
    }
    return out;
  }

  function srsStats() {
    var keys = Object.keys(state.srs);
    var due = 0, learning = 0, mastered = 0, total = keys.length;
    var t = today();
    keys.forEach(function (k) {
      var r = state.srs[k];
      if (r.d <= t) due++;
      if (r.b >= INTERVALS.length) mastered++; else learning++;
    });
    return { total: total, due: due, learning: learning, mastered: mastered };
  }

  function srsRemove(word) {
    var k = srsKey(word);
    delete state.srs[k];
    dirty.delSrs[k] = 1;
    delete dirty.srs[k];
    save(); emit('progress');
  }
  function srsReset() {
    state.srs = {}; state.srsInit = true;
    dirty = newDirty();
    dirty.clear.srs = 1;
    save(); emit('progress');
  }

  /* ================= 云同步支撑 ================= */

  /** 取出并清空脏标记（发送失败时用 restore 放回） */
  function takeDirty() {
    var d = dirty;
    dirty = newDirty();
    return d;
  }

  /** 发送失败：把没发出去的标记合并回来 */
  function restoreDirty(d) {
    if (!d) return;
    ['progress', 'daily', 'srs', 'delProgress', 'delSrs', 'clear'].forEach(function (k) {
      Object.keys(d[k] || {}).forEach(function (id) { dirty[k][id] = 1; });
    });
  }

  /** 脏标记是否为空 */
  function dirtyEmpty(d) {
    d = d || dirty;
    return !Object.keys(d.progress).length && !Object.keys(d.daily).length &&
      !Object.keys(d.srs).length && !Object.keys(d.delProgress).length &&
      !Object.keys(d.delSrs).length && !Object.keys(d.clear).length;
  }

  /** 把脏标记翻译成发给后端的增量包（只发当前值，删掉的只在 deleted 里报 id） */
  function buildDelta(d) {
    d = d || dirty;
    var out = { progress: {}, daily: {}, srs: {}, deleted: { progress: [], srs: [] }, clear: [] };
    Object.keys(d.progress).forEach(function (id) {
      if (state.progress[id]) out.progress[id] = state.progress[id];
    });
    Object.keys(d.daily).forEach(function (day) {
      if (state.daily[day]) out.daily[day] = state.daily[day];
    });
    Object.keys(d.srs).forEach(function (k) {
      if (state.srs[k]) out.srs[k] = state.srs[k];
    });
    out.deleted.progress = Object.keys(d.delProgress);
    out.deleted.srs = Object.keys(d.delSrs);
    out.clear = Object.keys(d.clear);
    return out;
  }

  /** 整份本地数据（用于「首次登录 / 手动立即同步 / 页面重载后」兜底一次性上送） */
  function buildAll() {
    return {
      progress: state.progress, daily: state.daily, srs: state.srs,
      deleted: { progress: [], srs: [] }, clear: []
    };
  }

  /**
   * 用服务端返回的权威数据覆盖本地。
   *  - 服务端有 ⇒ 采用服务端（服务端已按合并规则算过）。
   *  - 服务端没有、本地有、且本地没有待上传改动 ⇒ 其他设备删过，本地也删。
   *  - 本地还有未上传的改动（在当前 dirty 里）⇒ 先保留，等下一轮同步再合。
   */
  function applyRemote(remote) {
    if (!remote) return;
    var active = dirty;

    function isActiveProgress(id) { return !!(active.progress[id] || active.delProgress[id]); }

    function mergeMap(local, incoming, isActive) {
      var out = {};
      Object.keys(incoming || {}).forEach(function (k) {
        if (isActive(k)) { if (local[k]) out[k] = local[k]; return; }
        out[k] = incoming[k];
      });
      Object.keys(local).forEach(function (k) {
        if (out[k] !== undefined) return;
        if (isActive(k) && local[k]) out[k] = local[k];
      });
      return out;
    }

    state.progress = mergeMap(state.progress, remote.progress, isActiveProgress);
    state.daily = mergeMap(state.daily, remote.daily, function (day) { return !!active.daily[day]; });
    state.srs = mergeMap(state.srs, remote.srs, function (k) { return !!(active.srs[k] || active.delSrs[k]); });

    state.srsInit = true;   // 云端已有权威数据，别再按本地历史进度重复入队
    save();
    emit('remote');
  }

  TW.store = {
    state: state,
    get settings() { return state.settings; },
    load: load, save: save, on: on, emit: emit, migrate: migrate,
    get: get, markRight: markRight, markWrong: markWrong,
    toggleFav: toggleFav, toggleMaster: toggleMaster,
    resetWord: resetWord, resetAll: resetAll, onReset: onReset,
    recentWrong: function () { return state.recentWrong.slice(); },
    setSetting: setSetting, counts: counts, srcStats: srcStats, today: today,
    addDays: addDays, diffDays: diffDays,
    applyRemote: applyRemote,
    dirty: {
      peek: function () { return dirty; },
      take: takeDirty,
      restore: restoreDirty,
      empty: dirtyEmpty,
      build: buildDelta,
      buildAll: buildAll
    },
    srs: {
      INTERVALS: INTERVALS,
      enroll: enroll,
      onResult: onResult,
      dueList: dueList,
      dueCount: dueCount,
      upcoming: upcoming,
      stats: srsStats,
      remove: srsRemove,
      reset: srsReset,
      get: function (word) { return state.srs[srsKey(word)] || null; },
      has: function (word) { return !!state.srs[srsKey(word)]; }
    }
  };
})();
