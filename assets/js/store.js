/* 学习状态：localStorage 持久化 + 简单事件订阅 */
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
    autoNext: true         // 答对后自动进入下一词
  };

  var state = {
    settings: Object.assign({}, DEFAULT_SETTINGS),
    progress: {},          // wordId -> {w,r,seen,fav,master,ts}
    daily: {},             // 'YYYY-MM-DD' -> {done, right}
    lastBook: null
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
  function today() {
    var d = new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  /* ---------- 进度读写 ---------- */
  function rec(id) {
    return state.progress[id] || (state.progress[id] = { w: 0, r: 0, seen: 0, fav: false, master: false, ts: 0 });
  }

  function get(id) { return state.progress[id] || null; }

  function markRight(id) {
    var r = rec(id);
    r.r++; r.seen++; r.ts = Date.now();
    var d = state.daily[today()] || (state.daily[today()] = { done: 0, right: 0 });
    d.done++; d.right++;
    save(); emit('progress');
  }

  function markWrong(id) {
    var r = rec(id);
    r.w++; r.seen++; r.ts = Date.now();
    var d = state.daily[today()] || (state.daily[today()] = { done: 0, right: 0 });
    d.done++;
    save(); emit('progress');
  }

  function toggleFav(id) {
    var r = rec(id); r.fav = !r.fav; save(); emit('progress');
    return r.fav;
  }

  function toggleMaster(id) {
    var r = rec(id); r.master = !r.master; save(); emit('progress');
    return r.master;
  }

  /** 重置某个单词的全部学习记录 */
  function resetWord(id) { delete state.progress[id]; save(); emit('progress'); }

  /** 清空全部学习数据（保留设置） */
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

  TW.store = {
    state: state,
    get settings() { return state.settings; },
    load: load, save: save, on: on, emit: emit,
    get: get, markRight: markRight, markWrong: markWrong,
    toggleFav: toggleFav, toggleMaster: toggleMaster,
    resetWord: resetWord, resetAll: resetAll,
    setSetting: setSetting, counts: counts, today: today
  };
})();
