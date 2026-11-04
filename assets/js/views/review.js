/* 生词本：待攻克错词 / 最近学过 / 收藏 / 已掌握 / 我的笔记 / 已练过
   统计口径是「所有来源」——六级词汇周计划 + 各本词典 + 扩展词条（词典词靠进度快照，无需加载词典） */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  var PAGE_SIZE = 60;

  var TABS = [
    { id: 'wrong', name: '待攻克错词', empty: '还没有错词，练习时答错的词会自动进来' },
    { id: 'recent', name: '最近学过', empty: '这个时间段里没学过单词，换个范围试试' },
    { id: 'fav', name: '我的收藏', empty: '还没有收藏，在词库或练习中点星标即可收藏' },
    { id: 'master', name: '已掌握', empty: '还没有标记掌握的单词' },
    { id: 'notes', name: '我的笔记', empty: '还没有笔记，在单词详解页写下第一条吧' },
    { id: 'learned', name: '已练过', empty: '还没有练过的词，去练习页开始吧' }
  ];

  function has(id) { return TABS.some(function (t) { return t.id === id; }); }

  /** 「N 分钟前 / N 小时前 / N 天前」——最近学过列表里比绝对时间好读 */
  function ago(ts) {
    var d = Date.now() - (ts || 0);
    if (d < 60 * 1000) return '刚刚';
    if (d < 3600 * 1000) return Math.floor(d / 60000) + ' 分钟前';
    if (d < 24 * 3600 * 1000) return Math.floor(d / 3600000) + ' 小时前';
    if (d < 7 * 24 * 3600 * 1000) return Math.floor(d / 86400000) + ' 天前';
    var dt = new Date(ts);
    return (dt.getMonth() + 1) + '/' + dt.getDate();
  }

  function render(host, query) {
    var tab = has(query.tab) ? query.tab : 'wrong';
    var page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    var range = query.range || '3d';
    if (!TW.store.RANGES.some(function (r) { return r.id === range; })) range = '3d';

    /** 最近学过的时间过滤（按最后一次练/笔记的时间倒序，离现在最近的排最前） */
    function recentList() {
      var cut = Date.now() - TW.store.rangeMs(range);
      return TW.data.progressItems('touched').filter(function (w) {
        var p = TW.store.get(w.id) || {};
        return (p.ts || 0) >= cut;
      }).sort(function (a, b) {
        return (TW.store.get(b.id).ts || 0) - (TW.store.get(a.id).ts || 0);
      });
    }

    var counts = {};
    TABS.forEach(function (t) {
      counts[t.id] = t.id === 'recent' ? recentList().length : TW.data.progressItems(t.id).length;
    });

    function list() {
      var l = tab === 'recent' ? recentList() : TW.data.progressItems(tab);
      if (tab === 'wrong') {
        l = l.slice().sort(function (a, b) {
          var pa = TW.store.get(a.id) || {}, pb = TW.store.get(b.id) || {};
          return pb.w - pa.w || pb.ts - pa.ts;
        });
      }
      if (tab === 'notes') {
        // 最近写的笔记排最前（sunfleeting：方便接着昨天的笔记往下看）
        l = l.slice().sort(function (a, b) {
          var pa = TW.store.get(a.id) || {}, pb = TW.store.get(b.id) || {};
          return (pb.noteTs || 0) - (pa.noteTs || 0);
        });
      }
      return l;
    }

    function rowHtml(w, num) {
      var p = TW.store.get(w.id) || {};
      var srs = TW.store.srs.get(w.word);
      var tags = '';
      if (tab === 'recent') tags += '<span class="tag">' + ago(p.ts) + '</span>';
      if (srs) {
        var dt = TW.store.diffDays(TW.store.today(), srs.d);
        tags += '<span class="tag srs">复习第 ' + (srs.b + 1) + ' 档 · ' +
          (dt <= 0 ? '今天到期' : dt + ' 天后') + '</span>';
      }
      if (tab === 'notes') {
        var brief = (p.note || '').replace(/\s+/g, ' ').trim();
        if (brief.length > 40) brief = brief.slice(0, 40) + '…';
        var when = p.noteTs ? new Date(p.noteTs).toLocaleDateString() : '';
        tags += '<span class="tag">📝 ' + TW.esc(brief) + (when ? ' · ' + when : '') + '</span>';
      }
      return TW.ui.wordRow(w, { showNum: true, num: num, extraTags: tags });
    }

    /** 生词本的 URL：tab 必带，range 只在「最近学过」里带，page 大于 1 才带 */
    function href(newTab, newPage, newRange) {
      var t = newTab || tab;
      var p = newPage == null ? page : newPage;
      var r = newRange || range;
      var q = '/review?tab=' + t;
      if (t === 'recent' && r !== '3d') q += '&range=' + r;
      if (p > 1) q += '&page=' + p;
      return q;
    }

    function draw() {
      var data = list();
      var pages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
      if (page > pages) page = pages;
      var start = (page - 1) * PAGE_SIZE;
      var slice = data.slice(start, start + PAGE_SIZE);
      var cur = TABS.find(function (t) { return t.id === tab; });

      var extra = '';
      if (tab === 'wrong' && data.length) {
        extra = '<button class="btn sm ghost" id="rv-to-srs">' + TW.icon('refresh', 14) + ' 全部加入复习队列</button>';
      }

      var rangeBar = '';
      if (tab === 'recent') {
        rangeBar = '<div class="row" style="justify-content:space-between;align-items:center;margin-bottom:.7rem">' +
          '<div class="seg" id="rv-range">' + TW.store.RANGES.map(function (r) {
            return '<button data-range="' + r.id + '" class="' + (r.id === range ? 'active' : '') + '">' + r.name + '</button>';
          }).join('') + '</div>' +
          '<span class="small muted">按最近学习时间倒序</span>' +
        '</div>';
      }

      var body = data.length
        ? rangeBar +
          '<div class="page-head" style="margin-bottom:.7rem"><div><h3 class="deck-group-title">共 ' + data.length + ' 个</h3>' +
            '<div class="page-desc">来自所有词库（周计划 + 已练过的词典）</div></div>' + extra + '</div>' +
          '<div class="card"><div class="wordlist" id="rv-list">' +
            slice.map(function (w, i) { return rowHtml(w, start + i + 1); }).join('') +
          '</div></div>' + TW.ui.pager(page, pages, data.length)
        : rangeBar + TW.ui.empty(cur.empty, '⭐');

      TW.$('#rv-body', host).innerHTML = body;

      var listEl = TW.$('#rv-list', host);
      if (listEl) {
        TW.ui.bindWordList(listEl, {
          onOpen: function (w) { TW.app.go('/word?id=' + encodeURIComponent(w.id)); }
        });
      }

      TW.ui.bindPager(TW.$('#rv-body', host), page, pages, function (p) {
        TW.app.go(href(tab, p));
      });

      var rangeEl = TW.$('#rv-range', host);
      if (rangeEl) {
        rangeEl.addEventListener('click', function (e) {
          var b = e.target.closest('[data-range]');
          if (!b) return;
          TW.app.go(href('recent', 1, b.dataset.range));
        });
      }

      var ts = TW.$('#rv-to-srs', host);
      if (ts) ts.addEventListener('click', function () {
        var n = 0;
        data.forEach(function (w) { TW.store.srs.enroll(w.word, w.book || '', TW.data.brief(w)); n++; });
        TW.toast(n ? '已把 ' + n + ' 个错词加入复习队列' : '没有可加入的词');
        TW.app.render();
      });
    }

    host.innerHTML =
      '<div class="wrap">' +
        TW.ui.pageHead('生词本', '答错的词、最近学过的词、收藏的词与写过笔记的词都在这里集中管理') +
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
      /* 「最近学过」按当前时间范围练习；其它分页沿用原口径 */
      if (tab === 'recent') {
        TW.app.go('/practice?src=collection&status=recent&range=' + range + '&order=random');
      } else {
        TW.app.go('/practice?src=collection&status=' + tab + '&order=random');
      }
    });

    draw();
  }

  TW.views.review = { render: render };
})();
