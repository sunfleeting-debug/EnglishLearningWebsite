/* 生词本：错词 / 收藏 / 已掌握 三个分组 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  var PAGE_SIZE = 60;

  var TABS = [
    { id: 'wrong', name: '待攻克错词', empty: '还没有错词，练习时答错的词会自动进来' },
    { id: 'fav', name: '我的收藏', empty: '还没有收藏，在词库或练习中点星标即可收藏' },
    { id: 'master', name: '已掌握', empty: '还没有标记掌握的单词' }
  ];

  function render(host, query) {
    var tab = TABS.some(function (t) { return t.id === query.tab; }) ? query.tab : 'wrong';
    var page = Math.max(1, parseInt(query.page || '1', 10) || 1);

    var counts = {};
    TABS.forEach(function (t) {
      counts[t.id] = TW.data.filterByStatus(TW.data.words, t.id, TW.store).length;
    });

    function list() {
      var l = TW.data.filterByStatus(TW.data.words, tab, TW.store);
      if (tab === 'wrong') {
        l = l.slice().sort(function (a, b) {
          var pa = TW.store.get(a.id) || {}, pb = TW.store.get(b.id) || {};
          return pb.w - pa.w || pb.ts - pa.ts;
        });
      }
      return l;
    }

    function draw() {
      var data = list();
      var pages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
      if (page > pages) page = pages;
      var start = (page - 1) * PAGE_SIZE;
      var slice = data.slice(start, start + PAGE_SIZE);
      var cur = TABS.find(function (t) { return t.id === tab; });

      var segHtml = TABS.map(function (t) {
        return '<button data-tab="' + t.id + '" class="' + (tab === t.id ? 'active' : '') + '">' + t.name + ' ' + counts[t.id] + '</button>';
      }).join('');

      var practiceBtn = data.length
        ? '<button class="btn primary" id="rv-practice">' + TW.icon('play', 16) + ' 练习这组</button>'
        : '';

      var body = data.length
        ? '<div class="card"><div class="wordlist" id="rv-list">' +
            slice.map(function (w, i) {
              return TW.ui.wordRow(w, { showNum: true, num: start + i + 1 });
            }).join('') +
          '</div></div>' + TW.ui.pager(page, pages, data.length)
        : TW.ui.empty(cur.empty, '⭐');

      TW.$('#rv-body', host).innerHTML = body;

      var listEl = TW.$('#rv-list', host);
      if (listEl) {
        // 与词库页保持一致：点行进词典详解，发音走行右侧的喇叭按钮
        TW.ui.bindWordList(listEl, {
          onOpen: function (w) { TW.app.go('/word?id=' + w.id); }
        });
      }

      TW.$$('[data-pg]', host).forEach(function (b) {
        b.addEventListener('click', function () {
          var np = b.dataset.pg === 'prev' ? page - 1 : page + 1;
          TW.app.go('/review?tab=' + tab + (np > 1 ? '&page=' + np : ''));
        });
      });
    }

    host.innerHTML =
      '<div class="wrap">' +
        TW.ui.pageHead('生词本', '答错的词、收藏的词与已掌握的词都在这里集中管理') +
        '<div class="row" style="justify-content:space-between;margin-bottom:1rem">' +
          '<div class="seg" id="rv-tabs"></div>' +
          '<button class="btn primary" id="rv-practice-top">' + TW.icon('play', 16) + ' 练习这组</button>' +
        '</div>' +
        '<div id="rv-body"></div>' +
      '</div>';

    TW.$('#rv-tabs', host).innerHTML = TABS.map(function (t) {
      return '<button data-tab="' + t.id + '" class="' + (tab === t.id ? 'active' : '') + '">' + t.name + ' ' + counts[t.id] + '</button>';
    }).join('');
    TW.$$('#rv-tabs button', host).forEach(function (b) {
      b.addEventListener('click', function () { TW.app.go('/review?tab=' + b.dataset.tab); });
    });

    var pBtn = TW.$('#rv-practice-top', host);
    if (pBtn) pBtn.addEventListener('click', function () {
      TW.app.go('/practice?book=all&status=' + tab + '&order=random');
    });

    draw();
  }

  TW.views.review = { render: render };
})();
