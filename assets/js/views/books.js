/* 词库页：按书浏览 / 搜索 / 状态筛选 / 分页 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  var PAGE_SIZE = 60;

  function render(host, query) {
    var params = {
      book: query.book || 'all',
      q: query.q || '',
      status: query.status || 'all',
      page: Math.max(1, parseInt(query.page || '1', 10) || 1)
    };

    function setParam(k, v) {
      params[k] = v;
      if (k !== 'page') params.page = 1;
      var parts = [];
      if (params.book !== 'all') parts.push('book=' + encodeURIComponent(params.book));
      if (params.q) parts.push('q=' + encodeURIComponent(params.q));
      if (params.status !== 'all') parts.push('status=' + params.status);
      if (params.page > 1) parts.push('page=' + params.page);
      TW.app.go('/books' + (parts.length ? '?' + parts.join('&') : ''));
    }

    function currentList() {
      var list = TW.data.search(params.q);
      if (params.book !== 'all') list = list.filter(function (w) { return w.book === params.book; });
      return TW.data.filterByStatus(list, params.status, TW.store);
    }

    function drawHead() {
      var chips = [{ id: 'all', name: '全部词库', count: TW.data.words.length }]
        .concat(TW.data.books.map(function (b) { return { id: b.id, name: b.name, count: b.count }; }));

      var chipHtml = chips.map(function (c) {
        return '<button class="btn sm' + (params.book === c.id ? ' primary' : '') + '" data-book="' + c.id + '">' +
          TW.esc(c.name) + ' · ' + c.count + '</button>';
      }).join('');

      var statuses = [
        ['all', '全部'], ['new', '未学'], ['wrong', '错词'], ['fav', '收藏'], ['master', '已掌握'], ['unmaster', '未掌握']
      ];
      var segHtml = statuses.map(function (s) {
        return '<button data-status="' + s[0] + '" class="' + (params.status === s[0] ? 'active' : '') + '">' + s[1] + '</button>';
      }).join('');

      TW.$('#books-head', host).innerHTML =
        '<div class="page-head"><div><h2 class="page-title">词库</h2>' +
        '<div class="page-desc">共 ' + TW.data.words.length + ' 个单词，来自字幕文件；点击任意单词查看词典详解，右侧可发音 / 收藏 / 标记掌握</div></div>' +
        '<div class="row">' +
          '<input class="field" id="bk-search" placeholder="搜索单词或释义…" value="' + TW.esc(params.q) + '" />' +
          '<button class="btn primary" id="bk-practice">' + TW.icon('play', 16) + ' 练这一组</button>' +
        '</div></div>' +
        '<div class="row" style="margin-bottom:0.6rem;gap:0.35rem">' + chipHtml + '</div>' +
        '<div class="row" style="justify-content:space-between;margin-bottom:1rem">' +
          '<div class="seg" id="bk-status">' + segHtml + '</div>' +
        '</div>';

      TW.$$('[data-book]', TW.$('#books-head', host)).forEach(function (b) {
        b.addEventListener('click', function () { setParam('book', b.dataset.book); });
      });
      TW.$$('#bk-status button', host).forEach(function (b) {
        b.addEventListener('click', function () { setParam('status', b.dataset.status); });
      });
      var search = TW.$('#bk-search', host);
      search.addEventListener('input', TW.debounce(function () { setParam('q', search.value); }, 260));
      TW.$('#bk-practice', host).addEventListener('click', function () {
        TW.app.go('/practice?book=' + params.book);
      });
    }

    function drawList() {
      var list = currentList();
      if (!list.length) {
        TW.$('#books-body', host).innerHTML = TW.ui.empty('没有匹配的单词');
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

      // 点击整行 / 单词 → 进入词典详解页；发音改走行右侧的喇叭按钮
      TW.ui.bindWordList(TW.$('#bk-list', host), {
        onOpen: function (w) { TW.app.go('/word?id=' + w.id); }
      });

      TW.$$('[data-pg]', host).forEach(function (b) {
        b.addEventListener('click', function () {
          setParam('page', b.dataset.pg === 'prev' ? params.page - 1 : params.page + 1);
        });
      });
    }

    host.innerHTML = '<div class="wrap"><div id="books-head"></div><div id="books-body"></div></div>';
    drawHead();
    drawList();
  }

  TW.views.books = { render: render };
})();
