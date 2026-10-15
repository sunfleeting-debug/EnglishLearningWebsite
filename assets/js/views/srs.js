/* 复习页：艾宾浩斯遗忘曲线队列
   答错的词自动进入队列；答对升档（1/2/4/7/15/30/60 天），答错归零、当天重新回到队列。 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  var PREVIEW = 60;      // 到期词列表最多展示多少条

  var MODES = [
    { id: 'type', name: '看词打字' },
    { id: 'recall', name: '看中文拼写' },
    { id: 'listen', name: '听音写词' },
    { id: 'flash', name: '翻卡记忆' }
  ];

  function dueText(d) {
    var n = TW.store.diffDays(TW.store.today(), d);
    if (n <= 0) return '今天到期';
    return n + ' 天后';
  }

  function render(host, query) {
    var mode = MODES.some(function (m) { return m.id === query.mode; }) ? query.mode : 'type';
    var showAll = query.all === '1';
    var stats = TW.store.srs.stats();
    var due = TW.store.srs.dueList();
    var intervals = TW.store.srs.INTERVALS;
    var sentenceSummary = TW.sentences ? TW.sentences.summary() : null;
    var sentenceCard = sentenceSummary ? '<div class="sentence-overview-link"><div><h3>句子也可以按时复习</h3><p>今日到期 ' + sentenceSummary.due +
      ' 组 · 待攻克 ' + sentenceSummary.wrong + ' 组 · 句子与单词分别安排，不互相混计。</p></div>' +
      '<a class="btn" href="#/sentences?tab=review">复习句子 ' + TW.icon('arrowRight', 15) + '</a></div>' : '';

    /* ---------- 空闲态 ---------- */
    if (!stats.total) {
      var learnedN0 = TW.data.progressItems('learned').length;
      host.innerHTML = '<div class="wrap">' + TW.ui.pageHead('复习', '艾宾浩斯遗忘曲线复习队列') +
        sentenceCard +
        '<div class="card card-pad">' + TW.ui.empty('复习队列还是空的') +
          '<div class="muted small" style="text-align:center;max-width:560px;margin:0 auto 1rem">' +
            '在「练习」里答错的单词会自动进入复习队列：<b>当天重新回到队列</b>，之后每答对一次，' +
            '间隔就按 <b>' + intervals.join(' / ') + '</b> 天逐档拉长；答错则归零重来。' +
            '你也可以在任意单词详情页点 <b>' + TW.icon('refresh', 13) + '</b> 手动加入。</div>' +
          '<div class="row" style="justify-content:center">' +
            '<button class="btn primary" id="sr-go-practice">' + TW.icon('play', 16) + ' 去练习</button>' +
            '<button class="btn" id="sr-import">' + TW.icon('download', 16) + ' 导入生词本里的错词</button>' +
          '</div>' +
        '</div>' +
        (learnedN0
          ? '<div class="card card-pad" style="margin-top:1.2rem">' +
              '<div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:.6rem">' +
                '<div><div class="card-title">自由复习</div>' +
                  '<div class="small muted">从学过的词里随机抽一组，答错过的词权重翻倍</div></div>' +
                '<button class="btn primary" id="sr-free-learned0">' + TW.icon('play', 16) +
                  ' 复习已学的词（' + learnedN0 + '）</button>' +
              '</div></div>'
          : '') +
        '</div>';
      bindEmpty(host);
      return;
    }

    /* ---------- 排期条（未来 8 天） ---------- */
    var up = TW.store.srs.upcoming(8);
    var maxN = Math.max.apply(null, up.map(function (u) { return u.count; }).concat([1]));
    var bars = up.map(function (u, i) {
      var h = Math.round((u.count / maxN) * 100);
      var label = i === 0 ? '今天' : u.date.slice(5);
      return '<div class="sched-col' + (i === 0 ? ' today' : '') + '">' +
        '<div class="sched-n">' + (u.count || '') + '</div>' +
        '<div class="sched-bar"><i style="height:' + Math.max(u.count ? 6 : 0, h) + '%"></i></div>' +
        '<div class="sched-lbl">' + TW.esc(label) + '</div></div>';
    }).join('');

    /* ---------- 到期词列表 ---------- */
    var list = showAll ? due : due.slice(0, PREVIEW);
    var rows = list.map(function (r) {
      var late = TW.store.diffDays(r.d, TW.store.today());
      return '<div class="srs-row" data-w="' + TW.esc(r.w) + '">' +
        '<div class="sr-main">' +
          '<a class="wl-link" href="#/word?w=' + encodeURIComponent(r.w) + '">' + TW.esc(r.w) + '</a>' +
          '<span class="sr-brief">' + TW.esc(r.m || '') + '</span>' +
        '</div>' +
        '<div class="sr-side">' +
          '<span class="tag srs">第 ' + (r.b + 1) + ' 档</span>' +
          (late > 0 ? '<span class="tag err">逾期 ' + late + ' 天</span>' : '<span class="tag">今天</span>') +
          '<button class="star-btn" data-remove="' + TW.esc(r.w) + '" title="移出队列">' + TW.icon('x') + '</button>' +
        '</div>' +
      '</div>';
    }).join('');

    var modeSeg = MODES.map(function (m) {
      return '<button data-mode="' + m.id + '" class="' + (mode === m.id ? 'active' : '') + '">' + m.name + '</button>';
    }).join('');

    /* 自由复习：已学过的词（练过就算），错过的词双倍权重多练（sunfleeting 要求） */
    var learnedN = TW.data.progressItems('learned').length;
    var wrongN = 0;
    Object.keys(TW.store.state.progress).forEach(function (id) {
      var r = TW.store.state.progress[id];
      if (r && r.w > 0) wrongN++;
    });
    var freeCard = '<div class="card card-pad" style="margin-bottom:1.2rem">' +
      '<div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:.6rem">' +
        '<div>' +
          '<div class="card-title">自由复习</div>' +
          '<div class="small muted">从学过的词里随机抽一组' +
            (wrongN ? '，<b>答错过的词权重翻倍</b>，错的天然多练' : '') + '</div>' +
        '</div>' +
        '<div class="row" style="gap:.5rem">' +
          (learnedN
            ? '<button class="btn primary" id="sr-free-learned">' + TW.icon('play', 16) +
                ' 复习已学的词（' + learnedN + '）</button>'
            : '<span class="small muted">还没有学过的词，先去练习吧</span>') +
        '</div>' +
      '</div></div>';

    host.innerHTML = '<div class="wrap">' +
      TW.ui.pageHead('复习', '答错的词自动入队，按 ' + intervals.join(' / ') + ' 天的间隔滚动复习') +
      sentenceCard +

      '<div class="grid stats" style="margin-bottom:1.2rem">' +
        '<div class="stat-card"><div class="stat-num accent">' + stats.due + '</div><div class="stat-label">今日待复习</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + stats.total + '</div><div class="stat-label">队列总词数</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + stats.learning + '</div><div class="stat-label">滚动中</div></div>' +
        '<div class="stat-card"><div class="stat-num ok">' + stats.mastered + '</div><div class="stat-label">已满档</div></div>' +
      '</div>' +

      '<div class="card card-pad" style="margin-bottom:1.2rem">' +
        '<div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:.6rem">' +
          '<div>' +
            '<div class="card-title">今日任务</div>' +
            '<div class="small muted">' + (due.length ? '今天有 ' + due.length + ' 个词到期，开始复习吧' : '今天没有到期的词，休息一下 ☕') + '</div>' +
          '</div>' +
          '<div class="row" style="gap:.5rem">' +
            '<div class="seg" id="sr-mode">' + modeSeg + '</div>' +
            (due.length
              ? '<button class="btn primary" id="sr-start">' + TW.icon('play', 16) + ' 开始复习（' + due.length + '）</button>'
              : '') +
          '</div>' +
        '</div>' +
      '</div>' +

      freeCard +

      '<div class="card card-pad" style="margin-bottom:1.2rem">' +
        '<div class="card-title" style="margin-bottom:.6rem">未来 8 天排期</div>' +
        '<div class="sched">' + bars + '</div>' +
      '</div>' +

      (due.length
        ? '<div class="page-head" style="margin-bottom:.7rem"><div><h3 class="deck-group-title">到期单词（' + due.length + '）</h3></div>' +
            (due.length > PREVIEW
              ? '<button class="btn sm ghost" id="sr-toggle">' + (showAll ? '只看前 ' + PREVIEW + ' 个' : '展开全部 ' + due.length + ' 个') + '</button>'
              : '') + '</div>' +
          '<div class="card"><div class="srs-list">' + rows + '</div></div>'
        : '') +

      '<div class="card card-pad muted small" style="margin-top:1rem">' +
        '<b>复习规则</b>：练习中答错的词自动进入队列。答对一次升一档，下次复习时间 = 今天 + ' +
        '<b>1 / 2 / 4 / 7 / 15 / 30 / 60</b> 天；答错则归零档，当天重新回到队列。可在「设置」里关闭自动入队。' +
        (stats.total ? ' <button class="btn sm ghost" id="sr-clear" style="margin-left:.4rem">' + TW.icon('trash', 14) + ' 清空队列</button>' : '') +
      '</div>' +
    '</div>';

    /* ---------- 交互 ---------- */
    TW.$$('#sr-mode button', host).forEach(function (b) {
      b.addEventListener('click', function () {
        TW.app.go('/srs?mode=' + b.dataset.mode + (showAll ? '&all=1' : ''));
      });
    });
    var start = TW.$('#sr-start', host);
    if (start) start.addEventListener('click', function () {
      TW.app.go('/practice?src=srs&mode=' + mode);
    });
    var freeBtn = TW.$('#sr-free-learned', host);
    if (freeBtn) freeBtn.addEventListener('click', function () {
      TW.app.go('/practice?src=collection&status=learned&mode=' + mode);
    });
    var tog = TW.$('#sr-toggle', host);
    if (tog) tog.addEventListener('click', function () {
      TW.app.go('/srs?mode=' + mode + (showAll ? '' : '&all=1'));
    });
    var clr = TW.$('#sr-clear', host);
    if (clr) clr.addEventListener('click', function () {
      if (!window.confirm('确定清空整个复习队列吗？该操作不可撤销。')) return;
      TW.store.srs.reset();
      TW.toast('复习队列已清空');
    });
    TW.$$('[data-remove]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        TW.store.srs.remove(b.dataset.remove);
        TW.toast('已移出复习队列');
      });
    });
  }

  function bindEmpty(host) {
    var p = TW.$('#sr-go-practice', host);
    if (p) p.addEventListener('click', function () { TW.app.go('/practice'); });
    var f0 = TW.$('#sr-free-learned0', host);
    if (f0) f0.addEventListener('click', function () { TW.app.go('/practice?src=collection&status=learned'); });
    var im = TW.$('#sr-import', host);
    if (im) im.addEventListener('click', function () {
      var n = 0;
      Object.keys(TW.store.state.progress).forEach(function (id) {
        var r = TW.store.state.progress[id];
        if (r && r.w > 0 && !r.master && r.word) { TW.store.srs.enroll(r.word, r.src, r.brief); n++; }
      });
      TW.toast(n ? '已导入 ' + n + ' 个错词' : '生词本里还没有答错过的词');
      TW.app.render();
    });
  }

  TW.views.srs = { render: render };
})();
