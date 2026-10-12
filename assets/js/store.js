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
    srsInit: false         // 是否已把历史错词导入复习队列
  };

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

  function markWrong(id) {
    var r = rec(id);
    r.w++; r.seen++; r.ts = Date.now();
    snapshot(r, id);
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
  function resetWord(id) { delete state.progress[id]; save(); emit('progress'); }

  /** 清空全部学习数据（保留设置与复习队列） */
  function resetAll() {
    state.progress = {}; state.daily = {}; save(); emit('progress');
  }

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
      return r;
    }
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

  function srsRemove(word) { delete state.srs[srsKey(word)]; save(); emit('progress'); }
  function srsReset() { state.srs = {}; state.srsInit = true; save(); emit('progress'); }

  TW.store = {
    state: state,
    get settings() { return state.settings; },
    load: load, save: save, on: on, emit: emit, migrate: migrate,
    get: get, markRight: markRight, markWrong: markWrong,
    toggleFav: toggleFav, toggleMaster: toggleMaster,
    resetWord: resetWord, resetAll: resetAll,
    setSetting: setSetting, counts: counts, srcStats: srcStats, today: today,
    addDays: addDays, diffDays: diffDays,
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
