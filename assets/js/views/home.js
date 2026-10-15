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
          statCard(c.total, '周计划词数', 'accent', '/books') +
          statCard(c.touched, '已练过的词', '', '/review?tab=learned') +
          statCard(c.master, '已掌握', 'ok', '/review?tab=master') +
          statCard(c.wrong, '待攻克错词', 'err', '/review?tab=wrong') +
          statCard(srs.due, '今日待复习', srs.due ? 'accent' : '', '/srs') +
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

    function statCard(num, label, cls, go) {
      /* sunfleeting：统计卡可点击——周计划→词库、已练/掌握/错词→生词本对应分组、待复习→复习页 */
      return '<div class="stat-card' + (go ? ' stat-link' : '') + '"' +
        (go ? ' data-go="' + go + '" title="点击查看" style="cursor:pointer"' : '') + '>' +
        '<div class="stat-num ' + cls + '">' + num + '</div><div class="stat-label">' + label + '</div></div>';
    }

    TW.$$('.stat-card[data-go]', host).forEach(function (el) {
      el.addEventListener('click', function () { TW.app.go(el.dataset.go); });
    });

    TW.$$('.book-card', host).forEach(function (el) {
      el.addEventListener('click', function () { TW.app.go('/books?book=' + el.dataset.book); });
    });

    /* ---------- 首页搜词 ---------- */
    var input = TW.$('#hs-input', host);
    var resBox = TW.$('#hs-res', host);
    var hsTimer = null;

    /* ---- 搜索记录（sunfleeting：加一下搜索记录，最近 50 条，本地存储不进同步）---- */
    function shList() {
      try { return JSON.parse(localStorage.getItem('tw.searchHistory') || '[]'); }
      catch (err) { return []; }
    }
    function shAdd(word) {
      try {
        var l = shList().filter(function (x) { return x.w !== word; });
        l.unshift({ w: word, ts: Date.now() });
        localStorage.setItem('tw.searchHistory', JSON.stringify(l.slice(0, 50)));
      } catch (err) {}
    }
    function shClear() { try { localStorage.removeItem('tw.searchHistory'); } catch (err) {} }
    function hsShowHistory() {
      var l = shList().slice(0, 10);
      if (!l.length) { hsHide(); return; }
      resBox.innerHTML = '<div class="hs-hist-head" style="display:flex;justify-content:space-between;align-items:center;padding:.2rem .4rem">' +
          '<span class="muted small">最近搜索</span>' +
          '<button class="btn sm ghost" id="hs-hist-clear">清空</button></div>' +
        l.map(function (x) {
          return '<button class="hs-item" data-w="' + TW.esc(x.w) + '">' +
            '<span class="hs-word">' + TW.esc(x.w) + '</span>' +
            '<span class="hs-src">' + new Date(x.ts).toLocaleDateString() + '</span></button>';
        }).join('');
      resBox.hidden = false;
      TW.$$('.hs-item', resBox).forEach(function (el) {
        el.addEventListener('click', function () {
          input.value = el.dataset.w;
          hsRun(el.dataset.w);   // 展示该词的联想结果；点进详解时由 hsGo 记录
        });
      });
      var clr = TW.$('#hs-hist-clear', resBox);
      if (clr) clr.addEventListener('click', function (e) {
        e.stopPropagation();
        shClear();
        hsHide();
      });
    }

    function hsHide() { resBox.hidden = true; resBox.innerHTML = ''; }

    function hsGo(word) {
      hsHide();
      shAdd(word);
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

    function hsShow(list, q, partial) {
      if (list.length) {
        var foot = '共 ' + list.length + ' 条结果';
        if (partial) foot += '（词典载入中，稍候自动补全）';
        else if (list.length >= SEARCH_CAP) foot += '（已达展示上限，可换更精确的关键词）';
        resBox.innerHTML = list.map(hsItem).join('') + '<div class="hs-count">' + foot + '</div>';
      } else {
        resBox.innerHTML = '<div class="hs-empty">词库里没有「' + TW.esc(q) + '」</div>';
      }
      resBox.hidden = false;
      TW.$$('.hs-item', resBox).forEach(function (el) {
        el.addEventListener('click', function () { hsGo(el.dataset.w); });
      });
    }

    /* 兜底链结果①：未加载词典里的词（词面索引）——点击进详解，详解页会自动加载那本词典 */
    function hsShowDeckHits(hits) {
      resBox.innerHTML = hits.map(function (h) {
        var meta = TW.data.deckMeta(h.deck);
        return '<button class="hs-item" data-w="' + TW.esc(h.word) + '" data-deck="' + TW.esc(h.deck) + '">' +
          '<span class="hs-word">' + TW.esc(h.word) + '</span>' +
          '<span class="hs-brief muted">在词典「' + TW.esc(meta ? meta.name : h.deck) + '」中 · 点击看释义</span>' +
          '<span class="hs-src">词典</span>' +
        '</button>';
      }).join('');
      resBox.hidden = false;
      TW.$$('.hs-item', resBox).forEach(function (el) {
        el.addEventListener('click', function () {
          shAdd(el.dataset.w);   // 词典兜底条目不走 hsGo，单独记录
          hsHide();
          input.blur();
          TW.app.go('/word?id=' + encodeURIComponent(el.dataset.deck + ':' + el.dataset.w));
        });
      });
    }

    /* 兜底链结果：本地词库完全没有 → 在线词典（英文释义，点条目发音） */
    function hsShowOnline(res, q) {
      if (!res) { hsShow([], q); return; }
      var lines = [];
      (res.ms || []).forEach(function (m) {
        m.defs.forEach(function (d) {
          lines.push('<div class="hs-on-def">' +
            (m.pos ? '<i>' + TW.esc(m.pos) + '</i>' : '') + TW.esc(d) + '</div>');
        });
      });
      resBox.innerHTML =
        '<div class="hs-online">' +
          '<button class="hs-item" data-w="' + TW.esc(res.word) + '" title="点击发音">' +
            '<span class="hs-word">' + TW.esc(res.word) + '</span>' +
            (res.ph ? '<span class="hs-phon">' + TW.esc(res.ph) + '</span>' : '') +
            '<span class="hs-src online">在线词典</span>' +
          '</button>' +
          (lines.length ? '<div class="hs-on-body">' + lines.join('') + '</div>' : '') +
          '<div style="margin-top:.5rem"><button class="btn sm" id="hs-online-detail">查看详解 →</button></div>' +
        '</div>';
      resBox.hidden = false;
      var item = TW.$('.hs-item', resBox);
      if (item) item.addEventListener('click', function () {
        TW.speech.speak(res.word, TW.store.settings.accent);
      });
      /* sunfleeting：点在线结果「没反应」——原设计点击=发音，但用户预期是进详解。
         补一个显式的「查看详解」入口：详解页会现查在线释义展示（paintOnlineOnly）。 */
      var detail = TW.$('#hs-online-detail', resBox);
      if (detail) detail.addEventListener('click', function () {
        hsHide();
        input.blur();
        hsGo(res.word);
      });
    }

    /* sunfleeting：搜索要尽可能全。词典是懒加载的，第一次搜索时后台把 13 本词典
       一次性拉齐（~3.4MB，只此一次），载完若输入没变就自动重查补全；
       载入期间先展示已有结果（脚注提示会补全），不急着下「没有」的结论。 */
    var SEARCH_CAP = 100;   // 最多展示 100 条：够翻，又不至于把首页拖垮
    var decksState = 0;     // 0=未发起 1=载入中 2=发起过（成败看 decksAll）
    var decksAll = false;   // 13 本词典是否全部载齐

    function kickDecks() {
      if (decksState) return;
      decksState = 1;
      TW.data.ensureBooks(TW.data.decks.map(function (d) { return d.id; }), function () {
        decksState = 2;
        decksAll = TW.data.allDecksReady();
        var v = input.value.trim();
        if (v) hsRun(v);            // 载齐（或失败）后按当前输入重查一遍
      });
    }

    function hsRun(q) {
      q = (q || '').trim();
      if (!q) { hsShowHistory(); return; }   // 清空输入 = 显示最近搜索记录
      kickDecks();
      var list = TW.data.searchAll(q, SEARCH_CAP);
      if (list.length) { hsShow(list, q, !decksAll); return; }
      if (decksState === 1) {                // 词典还在载入：先别判「没有」，载完回调会重查
        resBox.innerHTML = '<div class="hs-empty">正在载入全部词库…</div>';
        resBox.hidden = false;
        return;
      }
      if (!decksAll) { hsShow([], q); return; }   // 词典载入失败（离线等）：拿现有词库下结论
      // 只对「像英文单词的输入」走兜底链（中文释义搜不了词面索引/在线词典）
      if (!/^[a-zA-Z][a-zA-Z' -]*$/.test(q)) { hsShow([], q); return; }
      resBox.innerHTML = '<div class="hs-empty">正在查询…</div>';
      resBox.hidden = false;
      TW.data.lookupChain(q, function (res) {
        if (input.value.trim() !== q) return;    // 查询期间用户已改输入
        if (!res) { hsShow([], q); return; }
        if (res.type === 'deck') hsShowDeckHits(res.hits);
        else if (res.type === 'ext') hsShow([{ word: res.word, raw: res.word, us: res.e.u || '', trans: res.e.t || [], deck: true }], q);
        else hsShowOnline(res.res, q);
      });
    }

    input.addEventListener('input', function () {
      clearTimeout(hsTimer);
      hsTimer = setTimeout(function () { hsRun(input.value); }, 220);
    });
    input.addEventListener('focus', function () {
      if (!input.value.trim()) hsShowHistory();   // 聚焦空输入框 = 看最近搜索
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
