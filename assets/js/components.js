/* 共享 UI 片段：单词行、分页、状态标记 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  var ui = TW.ui = {};

  /** 单词列表行 HTML */
  ui.wordRow = function (w, opts) {
    opts = opts || {};
    var p = TW.store.get(w.id) || {};
    var brief = TW.data.brief(w);
    var hasCard = !!TW.data.card(w.word);
    var stars =
      '<button class="star-btn' + (p.fav ? ' on' : '') + '" data-act="fav" data-id="' + w.id + '" title="收藏">' + TW.icon('star') + '</button>' +
      '<button class="star-btn master' + (p.master ? ' on' : '') + '" data-act="master" data-id="' + w.id + '" title="已掌握">' + TW.icon('check') + '</button>';
    var detailBtn = opts.noCard ? '' :
      '<a class="star-btn' + (hasCard ? '' : ' dim') + '" href="#/word?id=' + w.id + '" title="词典详解">' + TW.icon('lightbulb') + '</a>';
    return '<div class="wl-row" data-id="' + w.id + '">' +
      (opts.showNum ? '<span class="wl-num">' + (opts.num != null ? opts.num : w.idx + 1) + '</span>' : '') +
      '<div class="wl-main">' +
        '<div class="wl-word">' + TW.esc(w.word) +
          (opts.showPhonetic !== false && w.us ? '<span class="wl-phon">/' + TW.esc(w.us) + '/</span>' : '') +
          (p.master ? '<span class="tag ok">已掌握</span>' : '') +
          (p.w > 0 && !p.master ? '<span class="tag err">错 ' + p.w + '</span>' : '') +
        '</div>' +
        '<div class="wl-trans" title="' + TW.esc(w.trans.join(' | ')) + '">' + TW.esc(brief || '（无释义）') + '</div>' +
      '</div>' +
      (opts.noStar ? '' : '<div class="wl-side">' + detailBtn + stars + '</div>') +
    '</div>';
  };

  /** 绑定列表里的发音 / 收藏 / 掌握交互（事件委托） */
  ui.bindWordList = function (root, onSpeak) {
    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (btn) {
        e.stopPropagation();
        var id = +btn.dataset.id;
        if (btn.dataset.act === 'fav') {
          var on = TW.store.toggleFav(id);
          btn.classList.toggle('on', on);
          TW.toast(on ? '已收藏' : '已取消收藏');
        } else if (btn.dataset.act === 'master') {
          var m = TW.store.toggleMaster(id);
          btn.classList.toggle('on', m);
          TW.toast(m ? '已标记掌握' : '已取消掌握');
        }
        return;
      }
      var row = e.target.closest('.wl-row');
      if (row) {
        if (e.target.closest('a')) return;   // 详解链接交给浏览器跳转
        var w = TW.data.byId(+row.dataset.id);
        if (w) {
          if (onSpeak) onSpeak(w);
          else TW.speech.speak(w.word, TW.store.settings.accent);
        }
      }
    });
  };

  /* ---------------- 单词链接（跨词跳转） ---------------- */

  /** 单个英文词的 HTML：存在于词库则渲染成可跳转链接 */
  ui.linkWord = function (term, opts) {
    opts = opts || {};
    var t = TW.esc(term);
    var w = TW.data.byWord(term);
    if (w) return '<a class="wref" href="#/word?id=' + w.id + '" title="' + TW.esc(TW.data.brief(w)) + '">' + t + '</a>';
    var e = TW.data.ext(term);
    if (e) return '<a class="wref ext" href="#/word?w=' + encodeURIComponent(String(term).toLowerCase()) + '" title="扩展词条">' + t + '</a>';
    return '<span class="wref dead">' + t + '</span>';
  };

  /** 例句分词链接：把句子中存在于词库的单词渲染成可跳转链接 */
  ui.linkify = function (text, opts) {
    opts = opts || {};
    var self = String(opts.self || '').toLowerCase();
    return String(text == null ? '' : text)
      .split(/([A-Za-z][A-Za-z'\-]*)/)
      .map(function (seg) {
        if (!/^[A-Za-z]/.test(seg)) return TW.esc(seg);
        var low = seg.toLowerCase();
        if (self && low === self) return '<b class="wself">' + TW.esc(seg) + '</b>';
        var w = TW.data.byWord(seg);
        if (w) return '<a class="wref" href="#/word?id=' + w.id + '" title="' + TW.esc(TW.data.brief(w)) + '">' + TW.esc(seg) + '</a>';
        var e = TW.data.ext(seg);
        if (e) return '<a class="wref ext" href="#/word?w=' + encodeURIComponent(low) + '" title="扩展词条">' + TW.esc(seg) + '</a>';
        return TW.esc(seg);
      })
      .join('');
  };

  /** 绑定链接区内的收藏 / 掌握按钮（详情页用） */
  ui.bindWordActions = function (root, id) {
    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      e.preventDefault();
      if (btn.dataset.act === 'fav') {
        var on = TW.store.toggleFav(id);
        btn.classList.toggle('on', on);
        TW.toast(on ? '已收藏' : '已取消收藏');
      } else if (btn.dataset.act === 'master') {
        var m = TW.store.toggleMaster(id);
        btn.classList.toggle('on', m);
        TW.toast(m ? '已标记掌握' : '已取消掌握');
      } else if (btn.dataset.act === 'speak') {
        var accent = btn.dataset.accent || TW.store.settings.accent;
        TW.speech.speak(btn.dataset.say || '', accent);
      }
    });
  };

  /** 分页控件 */
  ui.pager = function (page, pages, total) {
    return '<div class="pager">' +
      '<button class="btn sm" data-pg="prev"' + (page <= 1 ? ' disabled' : '') + '>' + TW.icon('arrowLeft', 14) + ' 上一页</button>' +
      '<span class="pg-info">' + page + ' / ' + Math.max(1, pages) + '（' + total + '）</span>' +
      '<button class="btn sm" data-pg="next"' + (page >= pages ? ' disabled' : '') + '>下一页 ' + TW.icon('arrowRight', 14) + '</button>' +
    '</div>';
  };

  ui.empty = function (text, ico) {
    return '<div class="empty"><div class="em-ico">' + (ico || '📭') + '</div><div>' + TW.esc(text) + '</div></div>';
  };

  ui.pageHead = function (title, desc, right) {
    return '<div class="page-head"><div><h2 class="page-title">' + TW.esc(title) + '</h2>' +
      (desc ? '<div class="page-desc">' + TW.esc(desc) + '</div>' : '') + '</div>' +
      (right ? '<div class="row">' + right + '</div>' : '') + '</div>';
  };
})();
