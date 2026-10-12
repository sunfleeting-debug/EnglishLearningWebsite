/* 词库访问层：对构建产出的 TW.WORDS / TW.BOOKS 做包装 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};

  var WORDS = TW.WORDS || [];
  var BOOKS = TW.BOOKS || [];
  var DICT = TW.DICT || {};        // 单词 -> 词典卡（搭配/派生/辨析/近义/反义/例句/词源）
  var DICT_EXT = TW.DICT_EXT || {}; // 单词 -> 轻量扩展词条（音标+释义），用于近义/反义跳转
  var byId = {};
  var byWordMap = {};              // 小写单词 -> 词条（跨词跳转用）
  var byBookMap = {};
  WORDS.forEach(function (w) {
    byId[w.id] = w;
    var k = String(w.word).toLowerCase();
    if (!byWordMap[k]) byWordMap[k] = w;   // 同形词只取最先出现的
    (byBookMap[w.book] = byBookMap[w.book] || []).push(w);
  });

  /** 生成一个英文词的候选基础词形（用于把例句/近义词里的变形对回词库） */
  function baseForms(raw) {
    var w = String(raw || '').toLowerCase().replace(/[^a-z'\-]/g, '');
    if (!w) return [];
    var out = [w];
    function add(x) { if (x && x.length >= 2 && out.indexOf(x) < 0) out.push(x); }
    if (/ies$/.test(w)) add(w.slice(0, -3) + 'y');       // studies -> study
    if (/es$/.test(w)) add(w.slice(0, -2));              // boxes -> box
    if (/s$/.test(w) && !/ss$/.test(w)) add(w.slice(0, -1));  // measures -> measure
    if (/ing$/.test(w)) { add(w.slice(0, -3)); add(w.slice(0, -3) + 'e'); } // making -> make
    if (/ed$/.test(w)) { add(w.slice(0, -2)); add(w.slice(0, -1)); }        // forced -> force
    if (/ly$/.test(w)) add(w.slice(0, -2));              // drastically -> drastic
    if (/er$/.test(w)) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
    if (/est$/.test(w)) add(w.slice(0, -3));
    return out;
  }

  /** 把 "n. 账户，户头；..." 拆成 {pos, text} */
  function parseTrans(line) {
    var m = /^([a-zA-Z]+\.(?:\s*&\s*[a-zA-Z]+\.)*)\s*(.*)$/.exec(line);
    if (m) return { pos: m[1].trim(), text: m[2].trim() };
    return { pos: '', text: line };
  }

  /** 取单词的首条中文简释（用于列表与提示） */
  function brief(word) {
    if (!word || !word.trans || !word.trans.length) return '';
    var t = parseTrans(word.trans[0]);
    return (t.pos ? t.pos + ' ' : '') + t.text;
  }

  function byBook(bookId) { return byBookMap[bookId] || []; }

  function search(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) return WORDS;
    return WORDS.filter(function (w) {
      if (w.word.toLowerCase().indexOf(q) >= 0) return true;
      if (w.trans && w.trans.join(' ').toLowerCase().indexOf(q) >= 0) return true;
      return false;
    });
  }

  /** 按学习状态筛选：all / new / wrong / fav / master / unmaster */
  function filterByStatus(list, status, store) {
    if (!status || status === 'all') return list;
    return list.filter(function (w) {
      var p = store.get(w.id);
      switch (status) {
        case 'new': return !p || p.seen === 0;
        case 'wrong': return p && p.w > 0 && !p.master;
        case 'fav': return p && p.fav;
        case 'master': return p && p.master;
        case 'unmaster': return !p || !p.master;
        default: return true;
      }
    });
  }

  /** 按单词（字符串）取词条，支持简单词形还原 */
  function byWord(word) {
    var cands = baseForms(word);
    for (var i = 0; i < cands.length; i++) {
      if (byWordMap[cands[i]]) return byWordMap[cands[i]];
    }
    return null;
  }

  /** 单词是否存在于本地词库（用于决定是否渲染为可跳转链接） */
  function hasWord(word) { return !!byWord(word) || !!extWord(word); }

  /** 取扩展词条（非本地词：音标+释义），无则 null */
  function extWord(word) {
    if (!word) return null;
    var cands = baseForms(word);
    for (var i = 0; i < cands.length; i++) {
      if (DICT_EXT[cands[i]]) return DICT_EXT[cands[i]];
    }
    return null;
  }

  /** 取单词的词典卡（若无则 null） */
  function card(word) {
    if (!word) return null;
    return DICT[String(word).toLowerCase()] || null;
  }

  TW.data = {
    words: WORDS,
    books: BOOKS,
    dict: DICT,
    byId: function (id) { return byId[id]; },
    byWord: byWord,
    hasWord: hasWord,
    ext: extWord,
    card: card,
    baseForms: baseForms,
    byBook: byBook,
    brief: brief,
    parseTrans: parseTrans,
    search: search,
    filterByStatus: filterByStatus,
    getAudioUrl: function (bookId) {
      var b = BOOKS.find(function (x) { return x.id === bookId; });
      return b ? b.audio : null;
    },
    getBook: function (bookId) { return BOOKS.find(function (x) { return x.id === bookId; }); }
  };
})();
