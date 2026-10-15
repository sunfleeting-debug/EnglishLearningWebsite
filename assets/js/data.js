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
  // 词典卡与扩展词条按**首字母分块**按需加载（data/dict/<字母>.js，生成器
  // tools/build_dict_letters.py）：整本 4MB 在慢网要 96s+，详解页只需要当前词
  // 那一块。分块注入后自动累计合并进 TW.DICT / TW.DICT_EXT，读数据直接看这两处。
  // 不在 index.html 里静态引入，file:// 下同样可用（经典脚本不受 CORS 限制）。
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

  /* 搜索预取的优先级：越靠前越常用，先到先补全（其余按 DECKS_META 顺序追加） */
  var PRELOAD_ORDER = ['cet6', 'cet4', 'kaoyan', 'longman3000', 'gaozhong', 'ielts',
                       'toefl', 'gre', 'tem4', 'gk3500', 'oxford3000', 'bec', 'chuzhong', 'nce2'];

  /** 把全部词典按优先级、限并发（2）地预取进来——首页搜索用。
      与 ensureBooks 的一次性并行不同：并发限 2 不抢用户点击后的带宽（详解页
      的 dict.js 要 4MB，13 个并行会把管道占满，sunfleeting 2026-10-15 实测慢到无法用）；
      每载完一本就回调 onEach(done, total)，首页据此增量补全搜索结果，不等全载完。 */
  function preloadDecks(onEach) {
    var order = [];
    PRELOAD_ORDER.forEach(function (id) {
      if (metaOf(id) && order.indexOf(id) < 0) order.push(id);
    });
    DECKS_META.forEach(function (d) {
      if (order.indexOf(d.id) < 0) order.push(d.id);
    });
    var queue = order.filter(function (id) { return !DECK_WORDS[id]; });
    var total = queue.length, done = 0, i = 0;
    var CONC = 2;
    function next() {
      if (i >= queue.length) return;
      var id = queue[i++];
      loadBook(id, function () {
        done++;
        if (onEach) { try { onEach(done, total); } catch (e) {} }
        next();
      });
    }
    for (var k = 0; k < CONC; k++) next();
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

  /** 首页搜索：在「周计划 + 已加载的词典」里做包含匹配（命中单词或释义）。
      词典是懒加载的，所以这里只搜已加载的部分（主词书永远在）；
      剩下的精确查词由 extWord（dict-ext.js 全量键值）兜底，见首页搜索的实现。
      排序：前缀命中优先（event → eventually 在前），其余保持词表顺序；最多 cap 条。 */
  function searchAll(q, cap) {
    q = (q || '').trim().toLowerCase();
    if (!q) return [];
    cap = cap || 100;   // 默认也给足量：调用方想截断自己传小值
    var pool = WORDS.slice();
    Object.keys(DECK_WORDS).forEach(function (id) { pool = pool.concat(DECK_WORDS[id]); });
    var seen = {}, pre = [], mid = [];
    for (var i = 0; i < pool.length; i++) {
      var w = pool[i], k = String(w.word).toLowerCase();
      if (seen[k]) continue;
      seen[k] = 1;
      var hit = k.indexOf(q);
      if (hit === 0) pre.push(w);
      else if (hit > 0) mid.push(w);
      else if (w.trans && w.trans.join(' ').toLowerCase().indexOf(q) >= 0) mid.push(w);
    }
    return pre.concat(mid).slice(0, cap);
  }

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
      if (tab === 'notes' && !(p.note && p.note.trim())) return;   // 生词本「我的笔记」：写过笔记的词（含 x: 扩展词条）
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
      if (TW.DICT_EXT && TW.DICT_EXT[cands[i]]) return TW.DICT_EXT[cands[i]];
    }
    return null;
  }

  /** 取单词的词典卡（若无则 null） */
  function card(word) {
    if (!word) return null;
    return (TW.DICT || {})[String(word).toLowerCase()] || null;
  }

  /* ---------- 词典词面索引（data/deck-index.js，按需加载）----------
     词典词条本身按本加载（每本 100~450KB），不可能为了搜一个词加载 12 本。
     索引只存「词面 → 哪本词典」（约 400KB），搜到后点结果进详解，详解页会
     loadBook 那一本拿全释义（word.js 对 id=deck:word 有现成处理）。 */
  var DECK_INDEX = null;
  var deckIndexLoading = null;

  /** 按需加载词面索引 */
  function loadDeckIndex(cb) {
    if (DECK_INDEX) { if (cb) cb(); return; }
    if (deckIndexLoading) { if (cb) deckIndexLoading.push(cb); return; }
    deckIndexLoading = cb ? [cb] : [];
    injectOnce('data/deck-index.js', function () {
      DECK_INDEX = TW.DECK_INDEX || {};
      var q = deckIndexLoading; deckIndexLoading = null;
      q.forEach(function (f) { if (f) f(); });
    }, function () {
      var q = deckIndexLoading; deckIndexLoading = null;
      q.forEach(function (f) { if (f) f(); });
    });
  }

  /** 在词面索引里搜（前缀命中优先）。返回 [{word, deck}]，word 是纯词面（无释义）。 */
  function searchDeckIndex(q, cap) {
    if (!DECK_INDEX) return [];
    q = String(q || '').trim().toLowerCase();
    if (!q) return [];
    cap = cap || 8;
    var pre = [], mid = [];
    Object.keys(DECK_INDEX).forEach(function (id) {
      var list = DECK_INDEX[id];
      for (var i = 0; i < list.length; i++) {
        var hit = list[i].indexOf(q);
        if (hit === 0) pre.push({ word: list[i], deck: id });
        else if (hit > 0) mid.push({ word: list[i], deck: id });
      }
    });
    return pre.concat(mid).slice(0, cap);
  }

  /* ---------- 在线词典兜底（真·本地词库没有的词）----------
     有道 dict.youdao.com/suggest 接口，**JSONP**（script 注入，绕开 CORS）：
       · 返回中文简释（背单词场景比 dictionaryapi.dev 的英文释义实用）
       · 国内直连可达（站点发音本来就在用 dict.youdao.com 的音频）
       · dictionaryapi.dev 实测当前网络直连/代理都不通（curl 000），弃用
     结果缓存到 localStorage 避免重复请求。 */
  var ONLINE_MAX = 300;
  var jsonpSeq = 0;

  function onlineCacheRead() {
    try { return JSON.parse(localStorage.getItem('tw.onlineDict') || '{}'); }
    catch (e) { return {}; }
  }

  function onlineCacheWrite(cache) {
    try {
      var keys = Object.keys(cache);
      if (keys.length > ONLINE_MAX) {          // 超限就丢最旧的
        keys.sort(function (a, b) { return (cache[a].t || 0) - (cache[b].t || 0); });
        keys.slice(0, keys.length - ONLINE_MAX).forEach(function (k) { delete cache[k]; });
      }
      localStorage.setItem('tw.onlineDict', JSON.stringify(cache));
    } catch (e) { /* 隐私模式写不进就算了，只是不缓存 */ }
  }

  function onlineLookup(term, cb) {
    var key = String(term || '').toLowerCase().replace(/[^a-z'\-]/g, '');
    if (!key) { cb(null); return; }
    var cache = onlineCacheRead();
    if (cache[key]) { cb(cache[key].r); return; }

    var cbName = '__twDicCb' + (++jsonpSeq);
    var script = document.createElement('script');
    var timer = setTimeout(function () { cleanup(); cb(null); }, 6000);   // 别转圈半分钟

    function cleanup() {
      clearTimeout(timer);
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[cbName] = function (data) {
      cleanup();
      var entries = data && data.data && data.data.entries;
      var defs = [];
      var word = key;
      if (entries && entries.length) {
        if (entries[0] && entries[0].entry) word = entries[0].entry;
        for (var i = 0; i < entries.length && i < 3; i++) {
          if (entries[i] && entries[i].explain) defs.push(entries[i].explain);
        }
      }
      if (!defs.length) { cb(null); return; }
      var res = { word: word, ph: '', ms: [{ pos: '', defs: defs }] };
      cache[key] = { t: Date.now(), r: res };
      onlineCacheWrite(cache);
      cb(res);
    };

    script.onerror = function () { cleanup(); cb(null); };
    script.src = 'https://dict.youdao.com/suggest?num=3&ver=3&doctype=json&cache=false&le=en' +
      '&callback=' + cbName + '&q=' + encodeURIComponent(key);
    document.head.appendChild(script);
  }

  /** 首页搜索的兜底链（searchAll 已加载词 miss 后调用）：
      ① 词典词面索引（未加载的 12 本词典）→ ② dict-ext 全量键值（带词形还原）
      → ③ 在线词典。三层都没有 cb(null)。 */
  function lookupChain(q, cb) {
    loadDeckIndex(function () {
      var hits = searchDeckIndex(q, 8);
      if (hits.length) { cb({ type: 'deck', hits: hits }); return; }
      loadDictExt(function () {
        var cands = baseForms(q);
        for (var i = 0; i < cands.length; i++) {
          var e = extWord(cands[i]);
          if (e) { cb({ type: 'ext', word: cands[i], e: e }); return; }
        }
        onlineLookup(q, function (res) {
          cb(res ? { type: 'online', res: res } : null);
        });
      }, q);
    });
  }

  /* ---------- 按需加载大文件：词典卡（按首字母分块） ----------
     整本 dict.js 4MB / dict-ext.js 1MB 在慢网下要 96s+（2026-10-15 实测），
     而详解页一次只需要当前词那一块。分块文件由 tools/build_dict_letters.py 生成：
     data/dict/<字母>.js、data/dict-ext/<字母>.js，注入后自动 Object.assign 进
     TW.DICT / TW.DICT_EXT（累计合并，已载的块不重复拉）。 */

  var DICT_LETTERS = 'abcdefghijklmnopqrstuvwxyz0'.split('');
  var dictPartWaiting = {};    // 块名 -> [cb]（去重并发注入）
  var dictPartLoaded = {};     // 块名 -> true
  var extPartWaiting = {};
  var extPartLoaded = {};

  /** 词条所属分块：取首个字母/数字（跳过前导符号；与 build_dict_letters.py 对应） */
  function dictLetterOf(term) {
    var s = String(term || '').toLowerCase();
    var i = 0;
    while (i < s.length && !(('a' <= s[i] && s[i] <= 'z') || ('0' <= s[i] && s[i] <= '9'))) i++;
    var c = i < s.length ? s[i] : '0';
    return (('a' <= c && c <= 'z') || ('0' <= c && c <= '9')) ? c : '0';
  }

  function loadPart(dir, letter, waiting, loaded, cb) {
    if (loaded[letter]) { if (cb) cb(true); return; }
    if (waiting[letter]) { if (cb) waiting[letter].push(cb); return; }
    waiting[letter] = cb ? [cb] : [];
    injectOnce(dir + '/' + letter + '.js', function () {
      loaded[letter] = true;
      var q = waiting[letter]; delete waiting[letter];
      (q || []).forEach(function (f) { if (f) f(true); });
    }, function () {
      var q = waiting[letter]; delete waiting[letter];
      (q || []).forEach(function (f) { if (f) f(false); });
    });
  }

  /** 请求一批分块，全部落定（成功或失败）后回调一次 */
  function loadParts(dir, letters, waiting, loaded, cb) {
    var need = letters.filter(function (L) { return !loaded[L]; });
    if (!need.length) { if (cb) cb(); return; }
    var left = need.length;
    need.forEach(function (L) {
      loadPart(dir, L, waiting, loaded, function () {
        if (--left === 0) { if (cb) cb(); }
      });
    });
  }

  /** 加载词典卡。term 给出时只载该词所在字母块（详解页路径）；
      不给 term 则载全部（兜底/测试路径，慎用）。 */
  function loadDict(cb, term) {
    var letters = term ? [dictLetterOf(term)] : DICT_LETTERS;
    loadParts('data/dict', letters, dictPartWaiting, dictPartLoaded, cb);
  }

  /** 加载扩展词条（同上，按块） */
  function loadDictExt(cb, term) {
    var letters = term ? [dictLetterOf(term)] : DICT_LETTERS;
    loadParts('data/dict-ext', letters, extPartWaiting, extPartLoaded, cb);
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
    preloadDecks: preloadDecks,
    isDeck: function (id) { return !!metaOf(id); },
    deckMeta: metaOf,
    decksLoaded: function () { return Object.keys(DECK_WORDS); },
    /** 全部词典（DECKS_META 里的每一本）是否都已载入——首页搜索用：
        没载齐时只搜周计划+已加载词典，结果可能偏少 */
    allDecksReady: function () {
      for (var i = 0; i < DECKS_META.length; i++) if (!DECK_WORDS[DECKS_META[i].id]) return false;
      return true;
    },
    /** 整本词典卡是否全部载入（分块化后通常只有部分字母在内存，详解决态看 dictLetterReady） */
    dictReady: function () {
      return DICT_LETTERS.every(function (L) { return !!dictPartLoaded[L]; });
    },
    extReady: function () {
      return DICT_LETTERS.every(function (L) { return !!extPartLoaded[L]; });
    },
    /** 某个字母块的词典卡/扩展词条是否已载入（详解页按需判断用） */
    dictLetterReady: function (letter) { return !!dictPartLoaded[dictLetterOf(letter)]; },
    extLetterReady: function (letter) { return !!extPartLoaded[dictLetterOf(letter)]; },
    dictLetterOf: dictLetterOf,
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
    searchAll: searchAll,
    loadDeckIndex: loadDeckIndex,
    searchDeckIndex: searchDeckIndex,
    lookupChain: lookupChain,
    onlineLookup: onlineLookup,
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
