/* 首页：概览与快捷入口 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  function greeting() {
    var h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 11) return '早上好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  function bookProgress(b) {
    var list = TW.data.byBook(b.id);
    var touched = 0, master = 0;
    list.forEach(function (w) {
      var p = TW.store.get(w.id);
      if (p && p.seen > 0) touched++;
      if (p && p.master) master++;
    });
    return { total: list.length, touched: touched, master: master };
  }

  function render(host, query) {
    var c = TW.store.counts();
    var d = TW.store.state.daily[TW.store.today()] || { done: 0, right: 0 };
    var acc = d.done ? Math.round((d.right / d.done) * 100) : 0;
    var lastBook = TW.store.state.lastBook;
    var lastBk = lastBook ? TW.data.getBook(lastBook) : null;

    var booksHtml = TW.data.books.map(function (b) {
      var pr = bookProgress(b);
      var p = TW.pct(pr.master, pr.total);
      return '<div class="book-card" data-book="' + b.id + '">' +
        '<span class="bk-chip">' + b.count + ' 词</span>' +
        '<div class="bk-name">' + TW.esc(b.name) + '</div>' +
        '<div class="bk-desc">' + TW.esc(b.desc) + '</div>' +
        '<div class="bk-bar">' +
          '<div class="bk-meta"><span>已掌握 ' + pr.master + '</span><span>' + p + '%</span></div>' +
          '<div class="progress-line ok"><i style="width:' + p + '%"></i></div>' +
        '</div>' +
      '</div>';
    }).join('');

    host.innerHTML =
      '<div class="wrap">' +
        '<div class="hero">' +
          '<h1>' + greeting() + '，今天也来背几个词吧</h1>' +
          '<p>词库来自你整理的「六级词汇周计划音频」字幕，共 ' + c.total + ' 个单词，按 7 个周计划与 2 册认知词汇分组。练习记录保存在本机浏览器中。</p>' +
          '<div class="row">' +
            (lastBk
              ? '<button class="btn primary" id="btn-continue">' + TW.icon('play', 16) + ' 继续「' + TW.esc(lastBk.name) + '」</button>'
              : '<button class="btn primary" id="btn-start">' + TW.icon('play', 16) + ' 开始学习</button>') +
            '<button class="btn" id="btn-random">' + TW.icon('shuffle', 16) + ' 随机练习</button>' +
            '<button class="btn ghost" id="btn-audio">' + TW.icon('headphone', 16) + ' 音频跟读</button>' +
          '</div>' +
        '</div>' +

        '<div class="grid stats" style="margin-bottom:1.2rem">' +
          statCard(c.total, '词库总量', 'accent') +
          statCard(c.touched, '已练过的词', '') +
          statCard(c.master, '已掌握', 'ok') +
          statCard(c.wrong, '待攻克错词', 'err') +
          statCard(c.fav, '收藏', 'fav') +
        '</div>' +

        '<div class="card card-pad" style="margin-bottom:1.2rem">' +
          '<div class="row" style="justify-content:space-between">' +
            '<div><div class="card-title">今日进度</div><div class="small muted">' +
              (d.done ? '已练 ' + d.done + ' 题，正确率 ' + acc + '%' : '今天还没开始，动起来 👋') +
            '</div></div>' +
            '<div class="stat-num ' + (acc >= 80 ? 'ok' : acc >= 60 ? '' : 'err') + '" style="font-size:1.3rem">' +
              (d.done ? acc + '%' : '—') + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="page-head" style="margin-bottom:0.8rem"><h2 class="page-title" style="font-size:1.15rem">词库进度</h2>' +
          '<button class="btn sm ghost" id="btn-all-books">全部词库 ' + TW.icon('arrowRight', 14) + '</button></div>' +
        '<div class="grid books">' + booksHtml + '</div>' +
      '</div>';

    function statCard(num, label, cls) {
      return '<div class="stat-card"><div class="stat-num ' + cls + '">' + num + '</div><div class="stat-label">' + label + '</div></div>';
    }

    TW.$$('.book-card', host).forEach(function (el) {
      el.addEventListener('click', function () { TW.app.go('/books?book=' + el.dataset.book); });
    });

    var cont = TW.$('#btn-continue', host);
    if (cont) cont.addEventListener('click', function () {
      TW.app.go('/practice?book=' + lastBook);
    });
    var start = TW.$('#btn-start', host);
    if (start) start.addEventListener('click', function () { TW.app.go('/practice?book=' + TW.data.books[0].id); });
    TW.$('#btn-random', host).addEventListener('click', function () {
      var id = TW.data.books[Math.floor(Math.random() * TW.data.books.length)].id;
      TW.app.go('/practice?book=' + id + '&order=random');
    });
    TW.$('#btn-audio', host).addEventListener('click', function () { TW.app.go('/audio'); });
    TW.$('#btn-all-books', host).addEventListener('click', function () { TW.app.go('/books'); });
  }

  TW.views.home = { render: render };
})();
