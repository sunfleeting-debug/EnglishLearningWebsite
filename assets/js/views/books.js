/* 词库页
   /books            词典选择（六级词汇周计划 + 12 本常用词典，含学习进度）
   /books?book=xxx   某本词书 / 某本词典的词表（词典按需加载）
*/
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  var PAGE_SIZE = 60;

  /* ---------------- 词典选择页 ---------------- */

  function progressBar(stats, count) {
    var p = TW.pct(stats.master, count);
    return '<div class="bk-bar"><div class="bk-meta">' +
      '<span>已学 ' + stats.touched + '</span><span>' + p + '%</span></div>' +
      '<div class="progress-line ok"><i style="width:' + p + '%"></i></div></div>';
  }

  function deckCard(b) {
    var st = TW.store.srcStats(b.id);
    return '<div class="book-card deck-card" data-book="' + b.id + '">' +
      '<span class="bk-chip">' + b.count + ' 词</span>' +
      '<div class="bk-name">' + TW.esc(b.name) + '</div>' +
      '<div class="bk-desc">' + TW.esc(b.desc) + '</div>' +
      progressBar(st, b.count) +
      '<div class="deck-foot">' +
        '<span class="small muted">浏览词表</span>' +
        '<span class="btn ghost sm" data-practice="' + b.id + '">' + TW.icon('play', 14) + ' 练习</span>' +
      '</div>' +
    '</div>';
  }

  function groupHtml(title, sub, books) {
    return '<div class="deck-group">' +
      '<div class="page-head" style="margin-bottom:.7rem"><div>' +
        '<h3 class="deck-group-title">' + TW.esc(title) + '</h3>' +
        (sub ? '<div class="page-desc">' + TW.esc(sub) + '</div>' : '') +
      '</div></div>' +
      '<div class="grid books">' + books.map(deckCard).join('') + '</div>' +
    '</div>';
  }

  function drawChooser(host) {
    var all = TW.data.allBooks();
    var main = all.filter(function (b) { return b.main; });
    var decks = all.filter(function (b) { return b.deck; });

    // 主词书补一张「全部」卡
    var mainCards = [{
      id: 'all', name: '六级词汇周计划 · 全部', desc: '7 个周计划 + 2 册认知词汇，一次性浏览全部 ' + TW.data.words.length + ' 词',
      count: TW.data.words.length, main: true
    }].concat(main);

    var groups = [groupHtml('六级词汇周计划', '来自你整理的音频字幕，共 ' + TW.data.words.length + ' 词', mainCards)];
    var order = [];
    decks.forEach(function (d) { if (order.indexOf(d.group) < 0) order.push(d.group); });
    order.forEach(function (g) {
      var list = decks.filter(function (d) { return d.group === g; });
      var n = list.reduce(function (a, b) { return a + b.count; }, 0);
      groups.push(groupHtml(g, list.length + ' 本词典，共 ' + n + ' 词', list));
    });

    host.innerHTML = '<div class="wrap">' +
      TW.ui.pageHead('词库', '共 ' + TW.data.totalWords() + ' 个单词，来自「六级词汇周计划」与 ' +
        TW.data.decks.length + ' 本常用词典（数据取自开源项目 qwerty-learner）') +
      groups.join('') +
      '<div class="card card-pad muted small" style="margin-top:1rem">' +
        '词典数据来源于开源项目 <b>qwerty-learner</b>（GPL-3.0），仅使用其中的单词、音标与中文释义。' +
        '打开某本词典的词表时才会加载对应数据，不会拖慢首屏。' +
      '</div>' +
    '</div>';

    TW.$$('.deck-card', host).forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.closest('[data-practice]')) return;    // 练习按钮单独处理
        TW.app.go('/books?book=' + encodeURIComponent(el.dataset.book));
      });
    });
    TW.$$('[data-practice]', host).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        TW.app.go('/practice?book=' + encodeURIComponent(b.dataset.practice));
      });
    });
  }

  /* ---------------- 词表页 ---------------- */

  function render(host, query) {
    var params = {
      book: query.book || '',
      q: query.q || '',
      status: query.status || 'all',
      page: Math.max(1, parseInt(query.page || '1', 10) || 1)
    };

    if (!params.book) { drawChooser(host); return; }

    var token = 'bk' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    host.dataset.owner = token;
    function alive() { return host.dataset.owner === token; }

    if (TW.data.isDeck(params.book)) {
      host.innerHTML = '<div class="wrap">' + TW.ui.pageHead('词库', '') +
        '<div class="card card-pad muted">正在加载词典数据…</div></div>';
      TW.data.loadBook(params.book, function (ok) {
        if (!alive()) return;
        if (!ok) {
          host.innerHTML = '<div class="wrap">' + TW.ui.pageHead('词库', '') +
            '<div class="card card-pad">' + TW.ui.empty('这本词典加载失败，检查网络后重试', '⚠️') +
            '<div class="row" style="justify-content:center"><button class="btn" id="bk-back">' +
            TW.icon('arrowLeft', 16) + ' 返回词典列表</button></div></div></div>';
          var b = TW.$('#bk-back', host);
          if (b) b.addEventListener('click', function () { TW.app.go('/books'); });
          return;
        }
        drawList(host, params, alive);
      });
      return;
    }
    drawList(host, params, alive);
  }

  function drawList(host, params, alive) {
    function isAlive() { return !alive || alive(); }

    function setParam(k, v) {
      params[k] = v;
      if (k !== 'page') params.page = 1;
      var parts = [];
      parts.push('book=' + encodeURIComponent(params.book));
      if (params.q) parts.push('q=' + encodeURIComponent(params.q));
      if (params.status !== 'all') parts.push('status=' + params.status);
      if (params.page > 1) parts.push('page=' + params.page);
      TW.app.go('/books?' + parts.join('&'));
    }

    function basePool() {
      return params.book === 'all' ? TW.data.words : TW.data.byBook(params.book);
    }

    function currentList() {
      return TW.data.filterByStatus(TW.data.searchIn(basePool(), params.q), params.status, TW.store);
    }

    var book = TW.data.getBook(params.book);
    var bookName = book ? book.name : params.book;
    var poolLen = basePool().length;

    function drawHead() {
      var statuses = [
        ['all', '全部'], ['new', '未学'], ['wrong', '错词'], ['fav', '收藏'], ['master', '已掌握'], ['unmaster', '未掌握']
      ];
      var segHtml = statuses.map(function (s) {
        return '<button data-status="' + s[0] + '" class="' + (params.status === s[0] ? 'active' : '') + '">' + s[1] + '</button>';
      }).join('');

      TW.$('#books-head', host).innerHTML =
        '<div class="page-head"><div>' +
          '<div class="row" style="gap:.5rem;align-items:center">' +
            '<button class="btn sm ghost" id="bk-choose">' + TW.icon('arrowLeft', 15) + ' 词典</button>' +
            '<h2 class="page-title">' + TW.esc(bookName) + '</h2>' +
          '</div>' +
          '<div class="page-desc">共 ' + poolLen + ' 个单词；点击任意单词查看详情，右侧可发音 / 收藏 / 标记掌握' +
            (book && book.deck ? ' · 该词典词条仅含音标与释义' : '') + '</div>' +
        '</div>' +
        '<div class="row">' +
          '<input class="field" id="bk-search" placeholder="搜索单词或释义…" value="' + TW.esc(params.q) + '" />' +
          '<button class="btn primary" id="bk-practice">' + TW.icon('play', 16) + ' 练这一组</button>' +
        '</div></div>' +
        '<div class="row" style="justify-content:space-between;margin-bottom:1rem">' +
          '<div class="seg" id="bk-status">' + segHtml + '</div>' +
        '</div>';

      TW.$('#bk-choose', host).addEventListener('click', function () { TW.app.go('/books'); });
      TW.$$('#bk-status button', host).forEach(function (b) {
        b.addEventListener('click', function () { setParam('status', b.dataset.status); });
      });
      var search = TW.$('#bk-search', host);
      search.addEventListener('input', TW.debounce(function () { setParam('q', search.value); }, 260));
      TW.$('#bk-practice', host).addEventListener('click', function () {
        TW.app.go('/practice?book=' + encodeURIComponent(params.book) +
          (params.status !== 'all' ? '&status=' + params.status : ''));
      });
    }

    function drawBody() {
      var list = currentList();
      if (!list.length) {
        TW.$('#books-body', host).innerHTML = TW.ui.empty(params.q ? '没有匹配的单词' : '这本词书还没有内容');
        return;
      }
      var pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
      if (params.page > pages) params.page = pages;
      var start = (params.page - 1) * PAGE_SIZE;
      var slice = list.slice(start, start + PAGE_SIZE);

      var rows = slice.map(function (w, i) {
        return TW.ui.wordRow(w, { showNum: true, num: start + i + 1 });
      }).join('');

      TW.$('#books-body', host).innerHTML =
        '<div class="card"><div class="wordlist" id="bk-list">' + rows + '</div></div>' +
        TW.ui.pager(params.page, pages, list.length);

      TW.ui.bindWordList(TW.$('#bk-list', host), {
        onOpen: function (w) { TW.app.go('/word?id=' + encodeURIComponent(w.id)); }
      });

      TW.$$('[data-pg]', host).forEach(function (b) {
        b.addEventListener('click', function () {
          setParam('page', b.dataset.pg === 'prev' ? params.page - 1 : params.page + 1);
        });
      });
    }

    host.innerHTML = '<div class="wrap"><div id="books-head"></div><div id="books-body"></div></div>';
    if (!isAlive()) return;
    drawHead();
    drawBody();
  }

  TW.views.books = { render: render };
})();
