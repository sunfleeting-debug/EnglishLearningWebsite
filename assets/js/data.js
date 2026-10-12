/* 词库访问层：对构建产出的 TW.WORDS / TW.BOOKS 做包装 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};

  var WORDS = TW.WORDS || [];
  var BOOKS = TW.BOOKS || [];
  var byId = {};
  var byBookMap = {};
  WORDS.forEach(function (w) {
    byId[w.id] = w;
    (byBookMap[w.book] = byBookMap[w.book] || []).push(w);
  });

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

  TW.data = {
    words: WORDS,
    books: BOOKS,
    byId: function (id) { return byId[id]; },
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
