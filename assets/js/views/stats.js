/* 学习统计：总量、近 14 天趋势、分书进度、最近错词 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  function lastDays(n) {
    var arr = [];
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var m = d.getMonth() + 1, day = d.getDate();
      arr.push({
        key: d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day,
        label: m + '/' + day
      });
    }
    return arr;
  }

  function render(host) {
    var c = TW.store.counts();
    var daily = TW.store.state.daily;

    // 近 14 天做题量
    var days = lastDays(14);
    var maxDone = 1;
    var chartData = days.map(function (d) {
      var rec = daily[d.key] || { done: 0, right: 0 };
      maxDone = Math.max(maxDone, rec.done);
      return { label: d.label, done: rec.done, right: rec.right };
    });
    var bars = chartData.map(function (d) {
      var h = Math.round((d.done / maxDone) * 100);
      return '<div class="bar-col" title="' + d.label + '：' + d.done + ' 题 / 对 ' + d.right + '">' +
        '<div class="bar-fill" style="height:' + Math.max(d.done ? 4 : 0, h) + '%"></div>' +
        '<div class="bar-label">' + d.label + '</div></div>';
    }).join('');

    // 连续学习天数
    var streak = 0;
    for (var i = 0; i < 400; i++) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var m = d.getMonth() + 1, day = d.getDate();
      var k = d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
      if (daily[k] && daily[k].done > 0) streak++;
      else if (i > 0) break;
      else if (!daily[k]) break;
    }

    // 分书进度
    var bookRows = TW.data.books.map(function (b) {
      var list = TW.data.byBook(b.id);
      var master = 0, touched = 0;
      list.forEach(function (w) {
        var p = TW.store.get(w.id);
        if (p && p.seen > 0) touched++;
        if (p && p.master) master++;
      });
      var pct = TW.pct(master, list.length);
      return '<div style="margin-bottom:.85rem">' +
        '<div class="row" style="justify-content:space-between;margin-bottom:.3rem">' +
          '<span style="font-weight:600">' + TW.esc(b.name) + '</span>' +
          '<span class="small muted">掌握 ' + master + ' / ' + list.length + ' · 已练 ' + touched + '</span>' +
        '</div>' +
        '<div class="progress-line ok"><i style="width:' + pct + '%"></i></div>' +
      '</div>';
    }).join('');

    // 最近错词
    var wrongs = TW.data.words.filter(function (w) {
      var p = TW.store.get(w.id); return p && p.w > 0 && !p.master;
    }).sort(function (a, b) {
      var pa = TW.store.get(a.id), pb = TW.store.get(b.id);
      return pb.w - pa.w || pb.ts - pa.ts;
    }).slice(0, 12);

    var wrongHtml = wrongs.length
      ? '<div class="card"><div class="wordlist" id="st-wrong">' +
          wrongs.map(function (w) {
            var p = TW.store.get(w.id);
            return '<div class="wl-row" data-id="' + w.id + '"><div class="wl-main">' +
              '<div class="wl-word">' + TW.esc(w.word) + '<span class="tag err">错 ' + p.w + ' 次</span></div>' +
              '<div class="wl-trans">' + TW.esc(TW.data.brief(w)) + '</div></div></div>';
          }).join('') +
        '</div></div>'
      : TW.ui.empty('暂无错词，保持住！', '✅');

    host.innerHTML =
      '<div class="wrap">' +
        TW.ui.pageHead('学习统计', '数据保存在本机浏览器，换设备不会同步') +
        '<div class="grid stats" style="margin-bottom:1.2rem">' +
          card(c.total, '词库总量', '') +
          card(c.touched, '已练过', 'accent') +
          card(c.master, '已掌握', 'ok') +
          card(c.wrong, '待攻克错词', 'err') +
          card(streak, '连续学习天数', 'accent') +
        '</div>' +

        '<div class="card card-pad" style="margin-bottom:1.2rem">' +
          '<div class="row" style="justify-content:space-between;margin-bottom:.4rem">' +
            '<div class="card-title">近 14 天练习量</div>' +
            '<div class="bar-legend"><span><i class="dot" style="background:var(--accent)"></i>题目数</span></div>' +
          '</div>' +
          '<div class="bar-chart">' + bars + '</div>' +
        '</div>' +

        '<div class="card card-pad" style="margin-bottom:1.2rem">' +
          '<div class="card-title" style="margin-bottom:.9rem">分书掌握进度</div>' +
          bookRows +
        '</div>' +

        '<div class="page-head" style="margin-bottom:.8rem"><h2 class="page-title" style="font-size:1.15rem">错得最多的词</h2>' +
          '<button class="btn sm ghost" id="st-review">查看生词本 ' + TW.icon('arrowRight', 14) + '</button></div>' +
        wrongHtml +
      '</div>';

    function card(num, label, cls) {
      return '<div class="stat-card"><div class="stat-num ' + cls + '">' + num + '</div><div class="stat-label">' + label + '</div></div>';
    }

    var lw = TW.$('#st-wrong', host);
    if (lw) lw.addEventListener('click', function (e) {
      var row = e.target.closest('.wl-row');
      if (!row) return;
      var w = TW.data.byId(+row.dataset.id);
      if (w) TW.speech.speak(w.word, TW.store.settings.accent);
    });
    var rv = TW.$('#st-review', host);
    if (rv) rv.addEventListener('click', function () { TW.app.go('/review?tab=wrong'); });
  }

  TW.views.stats = { render: render };
})();
