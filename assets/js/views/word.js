/* 单词详情页：一词一卡的词典详解（搭配 / 派生 / 辨析 / 近义 / 反义 / 例句 / 词源）
   近义词、反义词、例句中的单词 —— 只要存在于本地词库，均可点击跳转 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  function sec(title, icon, body, cls) {
    if (!body) return '';
    return '<div class="card dc-sec' + (cls ? ' ' + cls : '') + '">' +
      '<div class="dc-sec-title">' + TW.icon(icon || 'list', 16) + '<span>' + TW.esc(title) + '</span></div>' +
      body + '</div>';
  }

  function transHtml(w) {
    if (!w.trans || !w.trans.length) return '<div class="muted">（暂无释义）</div>';
    return '<ul class="dc-means">' + w.trans.map(function (line) {
      var t = TW.data.parseTrans(line);
      return '<li>' + (t.pos ? '<span class="dc-pos">' + TW.esc(t.pos) + '</span>' : '') +
        '<span>' + TW.esc(t.text) + '</span></li>';
    }).join('') + '</ul>';
  }

  function render(host, query) {
    var w = null;
    if (query.id) w = TW.data.byId(+query.id);
    if (!w && query.w) w = TW.data.byWord(query.w);

    if (!w && query.w) {
      var e = TW.data.ext(query.w);
      if (e) { renderExt(host, query.w, e); return; }
    }

    if (!w) {
      host.innerHTML = '<div class="wrap"><div class="card card-pad">' +
        TW.ui.empty('未找到这个单词', '🔍') +
        '<div class="row" style="justify-content:center"><button class="btn" id="dc-back">' + TW.icon('arrowLeft', 16) + ' 返回</button></div>' +
        '</div></div>';
      var bb = TW.$('#dc-back', host);
      if (bb) bb.addEventListener('click', back);
      return;
    }

    var card = TW.data.card(w.word) || {};
    var book = TW.data.getBook(w.book);
    var siblings = TW.data.byBook(w.book);
    var pos = siblings.map(function (x) { return x.id; }).indexOf(w.id);
    var prev = pos > 0 ? siblings[pos - 1] : null;
    var next = pos >= 0 && pos < siblings.length - 1 ? siblings[pos + 1] : null;

    /* ---- 头部 ---- */
    var phon = '';
    if (w.us) phon += '<button class="dc-phon" data-act="speak" data-say="' + TW.esc(w.word) + '" data-accent="us">美 /' + TW.esc(w.us) + '/</button>';
    if (w.uk) phon += '<button class="dc-phon" data-act="speak" data-say="' + TW.esc(w.word) + '" data-accent="uk">英 /' + TW.esc(w.uk) + '/</button>';

    var exams = (card.exam || []).map(function (e) { return '<span class="tag">' + TW.esc(e) + '</span>'; }).join('');

    var p = TW.store.get(w.id) || {};

    var head = '<div class="card card-pad dc-head">' +
      '<div class="dc-crumb"><button class="btn sm ghost" id="dc-back">' + TW.icon('arrowLeft', 15) + ' 返回</button>' +
        '<span class="muted small">' + TW.esc(book ? book.name : '') + ' · 第 ' + (w.idx + 1) + ' 词</span>' +
        '<span class="dc-nav-sp">' +
          (prev ? '<a class="btn sm ghost" href="#/word?id=' + prev.id + '">' + TW.icon('arrowLeft', 15) + '</a>' : '') +
          (next ? '<a class="btn sm ghost" href="#/word?id=' + next.id + '">' + TW.icon('arrowRight', 15) + '</a>' : '') +
        '</span></div>' +
      '<div class="dc-title">' +
        '<div class="dc-word">' + TW.esc(w.word) + '</div>' +
        '<div class="dc-actions">' +
          '<button class="star-btn' + (p.fav ? ' on' : '') + '" data-act="fav" title="收藏">' + TW.icon('star') + '</button>' +
          '<button class="star-btn master' + (p.master ? ' on' : '') + '" data-act="master" title="已掌握">' + TW.icon('check') + '</button>' +
          '<button class="star-btn" data-act="speak" data-say="' + TW.esc(w.word) + '" title="朗读">' + TW.icon('volume') + '</button>' +
        '</div>' +
      '</div>' +
      (phon ? '<div class="dc-phons">' + phon + '</div>' : '') +
      (w.note ? '<div class="muted small">字幕原形：' + TW.esc(w.note) + '</div>' : '') +
      '<div class="row dc-tags">' + exams + (book && book.audio ? '<a class="tag link" href="#/audio?book=' + book.id + '&t=' + w.time + '">' + TW.icon('headphone', 13) + ' 转到音频</a>' : '') + '</div>' +
    '</div>';

    /* ---- 各板块 ---- */
    var secs = '';

    // 释义（始终有）
    secs += sec('释义', 'file', transHtml(w));

    // 搭配
    if (card.colloc && card.colloc.length) {
      secs += sec('搭配', 'shuffle', '<ul class="dc-list">' + card.colloc.map(function (c) {
        return '<li><span class="dc-en">' + TW.ui.linkify(c.en, { self: w.word }) + '</span>' +
          (c.zh ? '<span class="dc-zh">' + TW.esc(c.zh) + '</span>' : '') + '</li>';
      }).join('') + '</ul>');
    } else if (card.colloc_raw && card.colloc_raw.length) {
      secs += sec('语料搭配', 'shuffle', '<div class="muted small" style="margin-bottom:.35rem">以下为例句中与该词高频共现的搭配</div>' +
        '<div class="dc-chips">' + card.colloc_raw.map(function (c) {
          return '<span class="dc-chip">' + TW.ui.linkify(c, { self: w.word }) + '</span>';
        }).join('') + '</div>');
    }

    // 派生词
    if (card.deriv && card.deriv.length) {
      secs += sec('派生词', 'refresh', '<ul class="dc-list">' + card.deriv.map(function (d) {
        return '<li>' + (d.pos ? '<span class="dc-pos">' + TW.esc(d.pos) + '</span>' : '') +
          '<span class="dc-en">' + TW.ui.linkWord(d.word) + '</span>' +
          (d.zh ? '<span class="dc-zh">' + TW.esc(d.zh) + '</span>' : '') + '</li>';
      }).join('') + '</ul>');
    }

    // 近义词
    if (card.syn && card.syn.length) {
      secs += sec('近义词', 'check', card.syn.map(function (s) {
        return '<div class="dc-synrow">' +
          (s.pos ? '<span class="dc-pos">' + TW.esc(s.pos) + '</span>' : '') +
          '<span class="dc-synwords">' + s.words.map(function (x) { return TW.ui.linkWord(x); }).join('<span class="dc-sep">、</span>') + '</span>' +
          (s.zh ? '<div class="dc-zh small">' + TW.esc(s.zh) + '</div>' : '') + '</div>';
      }).join(''));
    }

    // 反义词
    if (card.ant && card.ant.length) {
      secs += sec('反义词', 'x', '<div class="dc-synwords">' +
        card.ant.map(function (x) { return TW.ui.linkWord(x); }).join('<span class="dc-sep">、</span>') + '</div>');
    }

    // 辨析
    if (card.discrim && card.discrim.items && card.discrim.items.length) {
      secs += sec('辨析', 'lightbulb', (card.discrim.tran ? '<div class="muted small" style="margin-bottom:.4rem">' + TW.esc(card.discrim.tran) + '</div>' : '') +
        '<ul class="dc-list">' + card.discrim.items.map(function (it) {
          return '<li><span class="dc-en">' + TW.ui.linkWord(it.word) + '</span><span class="dc-zh">' + TW.esc(it.zh) + '</span></li>';
        }).join('') + '</ul>');
    }

    // 经典例句
    if (card.ex && card.ex.length) {
      secs += sec('经典例句', 'file', '<ol class="dc-ex">' + card.ex.map(function (e) {
        return '<li><div class="dc-ex-en">' + TW.ui.linkify(e.en, { self: w.word }) + '</div>' +
          (e.zh ? '<div class="dc-ex-zh">' + TW.esc(e.zh) + '</div>' : '') + '</li>';
      }).join('') + '</ol>');
    }

    // 词源
    if (card.etym) {
      secs += sec('词源', 'book', '<div class="dc-etym">' + TW.esc(card.etym) + '</div>');
    }

    if (!card.syn && !card.ant && !card.deriv && !card.discrim && !card.colloc && !card.colloc_raw && !card.ex) {
      secs += '<div class="card card-pad muted">该词暂无词典卡数据。</div>';
    }

    host.innerHTML = '<div class="wrap wrap-narrow dc-wrap">' + head + secs + '</div>';

    // 交互
    var backBtn = TW.$('#dc-back', host);
    if (backBtn) backBtn.addEventListener('click', back);
    TW.ui.bindWordActions(host, w.id);
  }

  function back() {
    if (history.length > 1) history.back();
    else TW.app.go('/books');
  }

  /** 扩展词条（不在本地六级词库中的近义/反义词）：只展示音标 + 释义 */
  function renderExt(host, term, e) {
    var phon = '';
    if (e.u) phon += '<button class="dc-phon" data-act="speak" data-say="' + TW.esc(term) + '" data-accent="us">美 /' + TW.esc(e.u) + '/</button>';
    if (e.k) phon += '<button class="dc-phon" data-act="speak" data-say="' + TW.esc(term) + '" data-accent="uk">英 /' + TW.esc(e.k) + '/</button>';

    var host_ = '<div class="wrap wrap-narrow dc-wrap">' +
      '<div class="card card-pad dc-head">' +
        '<div class="dc-crumb"><button class="btn sm ghost" id="dc-back">' + TW.icon('arrowLeft', 15) + ' 返回</button>' +
          '<span class="muted small">扩展词条</span></div>' +
        '<div class="dc-title"><div class="dc-word">' + TW.esc(term) + '</div>' +
          '<div class="dc-actions"><button class="star-btn" data-act="speak" data-say="' + TW.esc(term) + '" title="朗读">' + TW.icon('volume') + '</button></div>' +
        '</div>' +
        (phon ? '<div class="dc-phons">' + phon + '</div>' : '') +
        '<div class="muted small">该词不在本地六级词书中，为词典卡的扩展词条（仅提供音标与释义）。</div>' +
      '</div>' +
      sec('释义', 'file', transHtml({ trans: e.t })) +
      '<div class="row" style="justify-content:center"><button class="btn" id="dc-ext-back">' + TW.icon('arrowLeft', 16) + ' 返回上一页</button></div>' +
    '</div>';

    host.innerHTML = host_;
    var b1 = TW.$('#dc-back', host), b2 = TW.$('#dc-ext-back', host);
    if (b1) b1.addEventListener('click', back);
    if (b2) b2.addEventListener('click', back);
    TW.ui.bindWordActions(host, null);
  }

  TW.views.word = { render: render };
})();
