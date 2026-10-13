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
    var srs = TW.store.srs.stats();

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
          '<p>共 ' + TW.data.totalWords() + ' 个单词：六级词汇周计划（' + c.total + ' 词）' +
            ' 加上 ' + TW.data.decks.length + ' 本常用词典。练习记录保存在本机浏览器中。</p>' +
          '<div class="row">' +
            (lastBk
              ? '<button class="btn primary" id="btn-continue" data-magnetic>' + TW.icon('play', 16) + ' 继续「' + TW.esc(lastBk.name) + '」</button>'
              : '<button class="btn primary" id="btn-start" data-magnetic>' + TW.icon('play', 16) + ' 开始学习</button>') +
            '<button class="btn" id="btn-random">' + TW.icon('shuffle', 16) + ' 随机练习</button>' +
            '<button class="btn ghost" id="btn-decks">' + TW.icon('book', 16) + ' 选词典</button>' +
          '</div>' +
        '</div>' +

        /* ---- 首页搜词（sunfleeting：在首页就能搜出单词的意思）----
           联想：周计划 + 已加载词典（searchAll，命中单词或释义，前缀优先）；
           联想没有 → dict-ext.js 全量键值精确兜底（带词形还原），点击进详解页看完整词典卡。 */
        '<div class="card card-pad hs-card" style="margin-bottom:1.2rem">' +
          '<div class="hs-box">' +
            TW.icon('search', 17) +
            '<input id="hs-input" type="text" placeholder="搜索单词或释义，如 eventually / 显著地" autocomplete="off" spellcheck="false">' +
          '</div>' +
          '<div id="hs-res" class="hs-res" hidden></div>' +
        '</div>' +

        (srs.due
          ? '<div class="card card-pad srs-callout" style="margin-bottom:1.2rem">' +
              '<div class="row" style="justify-content:space-between">' +
                '<div><div class="card-title">' + TW.icon('refresh', 15) + ' 今日复习</div>' +
                  '<div class="small muted">按艾宾浩斯曲线，今天有 <b>' + srs.due + '</b> 个词到期</div></div>' +
                '<button class="btn primary" id="btn-srs">' + TW.icon('play', 16) + ' 开始复习</button>' +
              '</div>' +
            '</div>'
          : '') +

        '<div class="grid stats" style="margin-bottom:1.2rem">' +
          statCard(c.total, '周计划词数', 'accent') +
          statCard(c.touched, '已练过的词', '') +
          statCard(c.master, '已掌握', 'ok') +
          statCard(c.wrong, '待攻克错词', 'err') +
          statCard(srs.due, '今日待复习', srs.due ? 'accent' : '') +
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

    /* ---------- 首页搜词 ---------- */
    var input = TW.$('#hs-input', host);
    var resBox = TW.$('#hs-res', host);
    var hsTimer = null;

    function hsHide() { resBox.hidden = true; resBox.innerHTML = ''; }

    function hsGo(word) {
      hsHide();
      input.value = word;
      input.blur();
      TW.app.go('/word?w=' + encodeURIComponent(word));
    }

    function hsItem(w) {
      var phon = w.us ? '<span class="hs-phon">/' + TW.esc(w.us) + '/</span>' : '';
      return '<button class="hs-item" data-w="' + TW.esc(w.word) + '">' +
        '<span class="hs-word">' + TW.esc(w.word) + '</span>' + phon +
        '<span class="hs-brief">' + TW.esc(TW.data.brief(w)) + '</span>' +
        '<span class="hs-src">' + (w.deck ? '词典' : '周计划') + '</span>' +
      '</button>';
    }

    function hsShow(list, q) {
      resBox.innerHTML = list.length
        ? list.map(hsItem).join('')
        : '<div class="hs-empty">词库里没有「' + TW.esc(q) + '」</div>';
      resBox.hidden = false;
      TW.$$('.hs-item', resBox).forEach(function (el) {
        el.addEventListener('click', function () { hsGo(el.dataset.w); });
      });
    }

    function hsExtHit(q) {
      var cands = TW.data.baseForms(q);          // 词形还原：studies → study
      for (var i = 0; i < cands.length; i++) {
        var e = TW.data.ext(cands[i]);
        if (e) {
          hsShow([{ word: cands[i], raw: cands[i], us: e.u || '', trans: e.t || [], deck: true }], q);
          return;
        }
      }
      hsShow([], q);
    }

    function hsRun(q) {
      q = (q || '').trim();
      if (!q) { hsHide(); return; }
      var list = TW.data.searchAll(q, 8);
      if (list.length) { hsShow(list, q); return; }
      // 联想没有 → 只对「像英文单词的输入」走 dict-ext 精确兜底（中文释义搜不了全量键值）
      if (!/^[a-zA-Z][a-zA-Z' -]*$/.test(q)) { hsShow([], q); return; }
      if (TW.data.extReady()) { hsExtHit(q); return; }
      resBox.innerHTML = '<div class="hs-empty">正在加载词典…</div>';
      resBox.hidden = false;
      TW.data.loadDictExt(function () {
        if (input.value.trim() !== q) return;    // 加载期间用户已改输入
        hsExtHit(q);
      });
    }

    input.addEventListener('input', function () {
      clearTimeout(hsTimer);
      hsTimer = setTimeout(function () { hsRun(input.value); }, 220);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var first = TW.$('.hs-item', resBox);
        if (first) first.click();                // 回车 = 打开第一条结果
      } else if (e.key === 'Escape') {
        input.value = ''; hsHide(); input.blur();
      }
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
    var db = TW.$('#btn-decks', host);
    if (db) db.addEventListener('click', function () { TW.app.go('/books'); });
    var sb = TW.$('#btn-srs', host);
    if (sb) sb.addEventListener('click', function () { TW.app.go('/srs'); });
    TW.$('#btn-all-books', host).addEventListener('click', function () { TW.app.go('/books?book=all'); });
  }

  TW.views.home = { render: render };
})();
