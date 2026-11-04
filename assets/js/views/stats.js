/* 学习统计：总量、近 14 天趋势、分书进度、最近错词 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  var SESS_SHOW = 10;     // 先展示最近 10 场，可点「查看更早的场次」展开
  var sessOpen = false;   // 是否已展开到全部场次（模块级：同页重渲染后保持）

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
    var sentenceStats = TW.sentences ? TW.sentences.summary() : null;

    // 近 14 天做题量
    var days = lastDays(14);
    var maxDone = 1;
    var chartData = days.map(function (d) {
      var rec = daily[d.key] || { done: 0, right: 0 };
      maxDone = Math.max(maxDone, rec.done);
      return { label: d.label, done: rec.done, right: rec.right };
    });
    var sumDone = 0, sumRight = 0;
    chartData.forEach(function (d) { sumDone += d.done; sumRight += d.right; });
    var periodAcc = sumDone ? Math.round((sumRight / sumDone) * 100) : 0;   // 近 14 天整体正确率
    var bars = chartData.map(function (d) {
      var dayAcc = d.done ? Math.round((d.right / d.done) * 100) : -1;
      var h = Math.round((d.done / maxDone) * 100);
      return '<div class="bar-col" title="' + d.label + '：' + d.done + ' 题 / 对 ' + d.right +
        (dayAcc >= 0 ? '（正确率 ' + dayAcc + '%）' : '') + '">' +
        '<div class="bar-fill" style="height:' + Math.max(d.done ? 4 : 0, h) + '%"></div>' +
        '<div class="bar-label">' + d.label + '</div></div>';
    }).join('');

    /* 近期场次正确率（每轮练习/复习 finish 时记一条，见 practice.js → store.addSession）
       每条可以点开看「这一场具体哪几个词答错了」：明细（detail）由 finish 时写入，
       老场次没有这个字段 → 面板里老实说「没有明细」，不假装能看。 */
    var MODE_NAMES = { type: '看词打字', recall: '看中文拼写', listen: '听音写词', card: '翻卡记忆', ai: 'AI 出题' };
    var SRC_NAMES = { book: '词书', srs: '复习队列', collection: '生词本', ai: 'AI 助手' };
    var sessList = TW.store.sessions();
    /* addSession 是 unshift，正常就是新→旧；但导入备份/旧数据可能乱序，按时间兜底排一次 */
    sessList.sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
    function relTime(t) {
      var d = new Date(t), now = new Date();
      var hm = function (x) { return x.getHours() + ':' + (x.getMinutes() < 10 ? '0' : '') + x.getMinutes(); };
      var same = function (a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
      if (same(d, now)) return '今天 ' + hm(d);
      var yd = new Date(now); yd.setDate(now.getDate() - 1);
      if (same(d, yd)) return '昨天 ' + hm(d);
      return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm(d);
    }

    /** 单词胶囊：能进详解的做成链接，库外词（x: 开头）只显示文字 */
    function sdChip(x) {
      var mark = '<span class="sd-mark">' + (x.ok ? '✓' : '✗') + '</span>';
      var cls = 'sd-chip ' + (x.ok ? 'ok' : 'err');
      if (String(x.id || '').indexOf('x:') === 0) {
        return '<span class="' + cls + '">' + TW.esc(x.word) + mark + '</span>';
      }
      return '<a class="' + cls + '" href="#/word?id=' + encodeURIComponent(x.id) + '">' + TW.esc(x.word) + mark + '</a>';
    }

    function detailHtml(s, si) {
      if (!s.detail || !s.detail.length) {
        return '<div class="sess-detail" id="sd-' + si + '" hidden>' +
          '<div class="small muted">这一场没有记录明细（升级前的旧场次，只有总正确率）。</div></div>';
      }
      var wrongs = s.detail.filter(function (x) { return !x.ok; });
      var rights = s.detail.filter(function (x) { return x.ok; });
      return '<div class="sess-detail" id="sd-' + si + '" hidden>' +
        '<div class="sd-head">' +
          '<span class="small muted">错 <b class="sd-n-err">' + wrongs.length + '</b> · 对 <b class="sd-n-ok">' +
            rights.length + '</b> · 点单词可进详解</span>' +
          (wrongs.length ? '<a class="sd-more" href="#/review?tab=wrong">去生词本</a>' : '') +
        '</div>' +
        '<div class="sd-grid">' + wrongs.map(sdChip).join('') + rights.map(sdChip).join('') + '</div>' +
      '</div>';
    }

    function sessRow(s, si) {
      var cls = s.acc >= 80 ? 'ok' : s.acc >= 60 ? '' : 'err';   // ≥80 绿 / 60~79 主题色 / <60 红
      var srcName = SRC_NAMES[s.src] || '';
      var has = !!(s.detail && s.detail.length);
      return '<div class="sess-row sess-click" data-si="' + si + '" role="button" tabindex="0" ' +
          'aria-expanded="false" title="' + (has ? '点开看这一场的答题明细' : '这一场没有明细') + '">' +
        '<div class="sess-meta">' +
          '<span class="sess-mode">' + TW.esc(MODE_NAMES[s.mode] || s.mode || '练习') +
            (has ? '<span class="sess-chev">' + TW.icon('arrowRight', 12) + '</span>' : '') + '</span>' +
          '<span class="small muted">' + (srcName ? TW.esc(srcName) + ' · ' : '') + relTime(s.t) + ' · ' + s.total + ' 题</span>' +
        '</div>' +
        '<div class="sess-bar">' +
          '<div class="progress-line ' + cls + '"><i style="width:' + Math.max(2, s.acc) + '%"></i></div>' +
          '<span class="sess-acc ' + cls + '">' + s.acc + '%</span>' +
        '</div></div>' + detailHtml(s, si);
    }

    var shownSess = sessOpen ? sessList : sessList.slice(0, SESS_SHOW);
    var sessHtml = sessList.length
      ? '<div class="sess-list" id="st-sess">' + shownSess.map(sessRow).join('') + '</div>' +
        (sessList.length > shownSess.length
          ? '<button class="btn sm ghost" id="st-sess-more" style="margin-top:.6rem">查看更早的场次（还有 ' +
            (sessList.length - shownSess.length) + ' 条）</button>'
          : sessOpen && sessList.length > SESS_SHOW
            ? '<button class="btn sm ghost" id="st-sess-more" data-close="1" style="margin-top:.6rem">收起</button>'
            : '')
      : TW.ui.empty('完成一轮练习或复习后，这里会记录每场的正确率', '📈');

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

    // 分词书进度（周计划 9 册 + 12 本词典，靠进度快照统计，无需加载词典）
    var srcList = TW.data.books.map(function (b) {
      return { id: b.id, name: b.name, count: b.count, group: '六级词汇周计划' };
    }).concat(TW.data.decks.map(function (d) {
      return { id: d.id, name: d.name, count: d.count, group: d.group };
    }));
    var bookRows = srcList.map(function (b) {
      var st = TW.store.srcStats(b.id);
      var pct = TW.pct(st.master, b.count);
      return '<div style="margin-bottom:.85rem">' +
        '<div class="row" style="justify-content:space-between;margin-bottom:.3rem">' +
          '<span style="font-weight:600">' + TW.esc(b.name) + '</span>' +
          '<span class="small muted">掌握 ' + st.master + ' / ' + b.count + ' · 已练 ' + st.touched + '</span>' +
        '</div>' +
        '<div class="progress-line ok"><i style="width:' + pct + '%"></i></div>' +
      '</div>';
    }).join('');

    // 最近错词（跨所有词库）
    var wrongs = TW.data.progressItems('wrong').map(function (w) {
      var p = TW.store.get(w.id);
      return { w: w, p: p || {} };
    }).sort(function (a, b) {
      return b.p.w - a.p.w || b.p.ts - a.p.ts;
    }).slice(0, 12);

    var wrongHtml = wrongs.length
      ? '<div class="card"><div class="wordlist" id="st-wrong">' +
          wrongs.map(function (it) {
            return '<div class="wl-row" data-say="' + TW.esc(it.w.word) + '"><div class="wl-main">' +
              '<div class="wl-word">' + TW.esc(it.w.word) + '<span class="tag err">错 ' + it.p.w + ' 次</span></div>' +
              '<div class="wl-trans">' + TW.esc(TW.data.brief(it.w)) + '</div></div></div>';
          }).join('') +
        '</div></div>'
      : TW.ui.empty('暂无错词，保持住！', '✅');

    host.innerHTML =
      '<div class="wrap">' +
        TW.ui.pageHead('学习统计', '数据保存在本机浏览器，换设备不会同步') +
        (sentenceStats ? '<div class="sentence-overview-link"><div><h3>句子练习</h3><p>已练 ' + sentenceStats.learned + ' / ' + sentenceStats.total +
          ' 组 · 今日完成 ' + sentenceStats.doneToday + ' 组 · 独立答对 ' + sentenceStats.rightToday + ' 组 · 到期复习 ' + sentenceStats.due + ' 组（仅本机记录）</p></div>' +
          '<a class="btn" href="#/sentences">查看句子课程 ' + TW.icon('arrowRight', 15) + '</a></div>' : '') +
        '<div class="grid stats" style="margin-bottom:1.2rem">' +
          card(c.total, '周计划词数', '') +
          card(c.touched, '已练过', 'accent') +
          card(c.master, '已掌握', 'ok') +
          card(c.wrong, '待攻克错词', 'err') +
          card(TW.store.srs.dueCount(), '今日待复习', 'accent') +
          card(streak, '连续学习天数', 'accent') +
        '</div>' +

        '<div class="card card-pad" style="margin-bottom:1.2rem">' +
          '<div class="row" style="justify-content:space-between;margin-bottom:.4rem">' +
            '<div class="card-title">近 14 天练习量</div>' +
            '<div class="bar-legend"><span><i class="dot" style="background:var(--accent)"></i>题目数</span>' +
              (sumDone ? '<span>正确率 <b style="color:' + (periodAcc >= 80 ? 'var(--ok)' : 'var(--text-1)') + '">' + periodAcc + '%</b></span>' : '') + '</div>' +
          '</div>' +
          '<div class="bar-chart">' + bars + '</div>' +
        '</div>' +

        '<div class="card card-pad" style="margin-bottom:1.2rem">' +
          '<div class="row" style="justify-content:space-between;margin-bottom:.6rem">' +
            '<div class="card-title">近期场次正确率</div>' +
            (sessList.length ? '<span class="small muted">共 ' + sessList.length + ' 轮 · 点任意一场看答题明细</span>' : '') +
          '</div>' +
          sessHtml +
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
      var say = row.dataset.say || '';
      if (say) TW.speech.speak(say, TW.store.settings.accent);
    });
    var rv = TW.$('#st-review', host);
    if (rv) rv.addEventListener('click', function () { TW.app.go('/review?tab=wrong'); });

    /* 场次明细：点一行展开/收起（行内插入的 .sess-detail 就是它的面板） */
    var sessBox = TW.$('#st-sess', host);
    if (sessBox) {
      function toggle(row) {
        var panel = TW.$('#sd-' + row.dataset.si, host);
        if (!panel) return;
        var open = panel.hasAttribute('hidden');
        if (open) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
        row.classList.toggle('open', open);
        row.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      sessBox.addEventListener('click', function (e) {
        var row = e.target.closest('.sess-row');
        if (row && sessBox.contains(row)) toggle(row);
      });
      sessBox.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var row = e.target.closest('.sess-row');
        if (!row) return;
        e.preventDefault();
        toggle(row);
      });
    }
    var more = TW.$('#st-sess-more', host);
    if (more) more.addEventListener('click', function () {
      sessOpen = !more.dataset.close;
      render(host);
    });
  }

  TW.views.stats = { render: render };
})();
