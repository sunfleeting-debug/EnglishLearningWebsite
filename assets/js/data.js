/* 词库访问层：对构建产出的 TW.WORDS / TW.BOOKS / TW.DECKS_META 做包装
   三份数据的定位：
     TW.WORDS      —— 六级词汇周计划（9 个 book，首屏静态加载）
     TW.DECKS_META —— 搬运自 qwerty-learner 的 12 本常用词典目录（很小，静态加载）
     data/dicts/<id>.js —— 每本词典的实际词条，按需注入（单本 100~450KB）
*/
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};

  var WORDS = TW.WORDS || [];
  var BOOKS = TW.BOOKS || [];
  var DECKS_META = TW.DECKS_META || [];
  // 词典卡与扩展词条体积大（dict.js 约 3.9MB、dict-ext.js 约 1MB）。
  // 为照顾移动端首屏，这两份**不在 index.html 里静态引入**，而是打开单词详情页时才按需注入
  // <script>（经典脚本不受 CORS 限制，file:// 下同样可用）。
  var DICT = {};
  var DICT_EXT = {};
  var dictLoading = null, dictReady = false;
  var extLoading = null, extReady = false;
  var byId = {};
  var byWordMap = {};              // 小写单词 -> 词条（跨词跳转用）
  var byBookMap = {};

  /* ---------- 已加载的词典词条 ---------- */
  var DECK_WORDS = {};             // deckId -> [word objects]
  var deckWaiting = {};            // deckId -> [callback]

  WORDS.forEach(function (w) {
    byId[w.id] = w;
    var k = String(w.word).toLowerCase();
    if (!byWordMap[k]) byWordMap[k] = w;   // 同形词只取最先出现的
    (byBookMap[w.book] = byBookMap[w.book] || []).push(w);
  });

  function metaOf(id) {
    for (var i = 0; i < DECKS_META.length; i++) if (DECKS_META[i].id === id) return DECKS_META[i];
    return null;
  }

  /** 紧凑数组 [单词, 美音, 英音, "释义\n释义"] 展开成与 TW.WORDS 同构的词对象 */
  function expandDeck(id, rows) {
    var out = [];
    rows.forEach(function (r, i) {
      var trans = r[3] ? String(r[3]).split('\n').filter(Boolean) : [];
      out.push({
        id: id + ':' + r[0],        // 全局唯一：词典 id + 单词
        word: r[0], raw: r[0], note: '',
        book: id, idx: i, time: 0,
        us: r[1] || '', uk: r[2] || '',
        trans: trans, deck: true
      });
    });
    return out;
  }

  function registerDeck(id, list) {
    DECK_WORDS[id] = list;
    byBookMap[id] = list;
    list.forEach(function (w) {
      byId[w.id] = w;
      var k = String(w.word).toLowerCase();
      if (!byWordMap[k]) byWordMap[k] = w;   // 主词书优先（它有有道词典卡）
    });
  }

  function injectOnce(src, onDone, onFail) {
    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = onDone;
    s.onerror = onFail;
    document.head.appendChild(s);
  }

  /** 按需加载一本词典；已加载则同步回调 */
  function loadBook(id, cb) {
    if (DECK_WORDS[id]) { if (cb) cb(true); return; }
    var meta = metaOf(id);
    if (!meta) { if (cb) cb(false); return; }
    if (deckWaiting[id]) { if (cb) deckWaiting[id].push(cb); return; }
    deckWaiting[id] = cb ? [cb] : [];
    var settle = function (ok) {
      var q = deckWaiting[id]; delete deckWaiting[id];
      (q || []).forEach(function (f) { if (f) f(ok); });
    };
    injectOnce(meta.file, function () {
      var rows = (TW.DECKS && TW.DECKS[id]) || [];
      registerDeck(id, expandDeck(id, rows));
      settle(true);
    }, function () { settle(false); });
  }

  /** 依次加载多本词典 */
  function ensureBooks(ids, cb) {
    var queue = (ids || []).filter(function (id, i, a) { return id && a.indexOf(id) === i && !DECK_WORDS[id]; });
    if (!queue.length) { if (cb) cb(); return; }
    var left = queue.length;
    queue.forEach(function (id) {
      loadBook(id, function () { if (--left === 0 && cb) cb(); });
    });
  }

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

  function searchIn(list, q) {
    q = (q || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter(function (w) {
      if (w.word.toLowerCase().indexOf(q) >= 0) return true;
      if (w.trans && w.trans.join(' ').toLowerCase().indexOf(q) >= 0) return true;
      return false;
    });
  }

  function search(q) { return searchIn(WORDS, q); }

  /** 按学习状态汇总「所有来源」的词（周计划 + 已练过的词典词）
   *  词典是懒加载的，所以不在词表里的记录回退到进度快照（只有单词与一条简释）。
   *  tab: wrong | fav | master | all(已练过) */
  function progressItems(tab) {
    var out = [];
    var P = (TW.store && TW.store.state && TW.store.state.progress) || {};
    Object.keys(P).forEach(function (id) {
      var p = P[id];
      if (!p) return;
      if (tab === 'wrong' && !(p.w > 0 && !p.master)) return;
      if (tab === 'fav' && !p.fav) return;
      if (tab === 'master' && !p.master) return;
      if (tab === 'touched' && !(p.seen > 0)) return;
      if (tab === 'learned' && !(p.seen > 0)) return;   // 复习页「自由复习已学的词」（同 touched）
      var w = byId[id];
      var word = (w && w.word) || p.word;
      if (!word) return;
      out.push(w || {
        id: id, word: word, raw: word, note: '', book: p.src || '',
        idx: 0, time: 0, us: '', uk: '',
        trans: p.brief ? [p.brief] : [], snap: true
      });
    });
    return out;
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

  /* ---------- 按需加载大文件：词典卡 ---------- */

  /** 加载 data/dict.js（词典卡） */
  function loadDict(cb) {
    if (dictReady) { if (cb) cb(); return; }
    if (dictLoading) { if (cb) dictLoading.push(cb); return; }
    dictLoading = cb ? [cb] : [];
    injectOnce('data/dict.js', function () {
      DICT = TW.DICT || {};
      dictReady = true;
      var q = dictLoading; dictLoading = null;
      q.forEach(function (f) { if (f) f(); });
    }, function () {
      var q = dictLoading; dictLoading = null;
      q.forEach(function (f) { if (f) f(); });
    });
  }

  /** 加载 data/dict-ext.js（扩展词条：非本词书的近义/反义词） */
  function loadDictExt(cb) {
    if (extReady) { if (cb) cb(); return; }
    if (extLoading) { if (cb) extLoading.push(cb); return; }
    extLoading = cb ? [cb] : [];
    injectOnce('data/dict-ext.js', function () {
      DICT_EXT = TW.DICT_EXT || {};
      extReady = true;
      var q = extLoading; extLoading = null;
      q.forEach(function (f) { if (f) f(); });
    }, function () {
      var q = extLoading; extLoading = null;
      q.forEach(function (f) { if (f) f(); });
    });
  }

  /* ---------- 统一的书目列表（周计划 + 词典） ---------- */

  /** 全部可选词书：主词书（9 个周计划/认知词汇）+ 12 本常用词典 */
  function allBooks() {
    return BOOKS.map(function (b) {
      return { id: b.id, name: b.name, desc: b.desc, count: b.count, group: '六级词汇周计划', main: true };
    }).concat(DECKS_META.map(function (d) {
      return { id: d.id, name: d.name, desc: d.desc, count: d.count, group: d.group, deck: true };
    }));
  }

  function totalWords() {
    var n = WORDS.length;
    DECKS_META.forEach(function (d) { n += d.count; });
    return n;
  }

  TW.data = {
    words: WORDS,
    books: BOOKS,
    decks: DECKS_META,
    totalWords: totalWords,
    allBooks: allBooks,
    loadDict: loadDict,
    loadDictExt: loadDictExt,
    loadBook: loadBook,
    ensureBooks: ensureBooks,
    isDeck: function (id) { return !!metaOf(id); },
    deckMeta: metaOf,
    decksLoaded: function () { return Object.keys(DECK_WORDS); },
    dictReady: function () { return dictReady; },
    extReady: function () { return extReady; },
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
    searchIn: searchIn,
    progressItems: progressItems,
    filterByStatus: filterByStatus,
    getAudioUrl: function (bookId) {
      var b = BOOKS.find(function (x) { return x.id === bookId; });
      return b ? b.audio : null;
    },
    getBook: function (bookId) {
      var b = BOOKS.find(function (x) { return x.id === bookId; });
      if (b) return b;
      var d = metaOf(bookId);
      return d ? { id: d.id, name: d.name, desc: d.desc, count: d.count, deck: true } : null;
    }
  };
})();
