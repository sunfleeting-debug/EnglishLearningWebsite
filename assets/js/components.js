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
    var stars =
      '<button class="star-btn' + (p.fav ? ' on' : '') + '" data-act="fav" data-id="' + w.id + '" title="收藏">' + TW.icon('star') + '</button>' +
      '<button class="star-btn master' + (p.master ? ' on' : '') + '" data-act="master" data-id="' + w.id + '" title="已掌握">' + TW.icon('check') + '</button>';
    // 注意：词典卡改为「按需加载」，列表渲染时还没有 dict 数据，所以这里不再判断有无卡片，一律给入口
    var detailBtn = opts.noCard ? '' :
      '<a class="star-btn" href="#/word?id=' + encodeURIComponent(w.id) + '" title="查看详情">' + TW.icon('lightbulb') + '</a>';
    // 发音按钮：整行点击改为「进词典详解」后，发音收进右侧图标，不再靠点单词触发
    var speakBtn = opts.noStar ? '' :
      '<button class="star-btn" data-act="speak" data-id="' + TW.esc(w.id) + '" data-say="' + TW.esc(w.word) + '" title="发音">' + TW.icon('volume') + '</button>';
    return '<div class="wl-row" data-id="' + TW.esc(w.id) + '">' +
      (opts.showNum ? '<span class="wl-num">' + (opts.num != null ? opts.num : w.idx + 1) + '</span>' : '') +
      '<div class="wl-main">' +
        // 单词本身也是链接：可右键「在新标签打开」，鼠标悬停能看到链接
        '<div class="wl-word"><a class="wl-link" href="#/word?id=' + encodeURIComponent(w.id) + '" title="查看详情">' + TW.esc(w.word) + '</a>' +
          (opts.showPhonetic !== false && w.us ? '<span class="wl-phon">/' + TW.esc(w.us) + '/</span>' : '') +
          (p.master ? '<span class="tag ok">已掌握</span>' : '') +
          (p.w > 0 && !p.master ? '<span class="tag err">错 ' + p.w + '</span>' : '') +
          (opts.extraTags || '') +
        '</div>' +
        '<div class="wl-trans" title="' + TW.esc(w.trans.join(' | ')) + '">' + TW.esc(brief || '（无释义）') + '</div>' +
      '</div>' +
      (opts.noStar ? '' : '<div class="wl-side">' + speakBtn + detailBtn + stars + '</div>') +
    '</div>';
  };

  /** 绑定列表交互（事件委托）
   *  点击行（非按钮）→ opts.onOpen(w)，用于进入词典详解页；未提供 onOpen 时退回 opts.onSpeak(w)。
   *  右侧图标按钮：发音 / 收藏 / 掌握。
   *  兼容旧签名：第二个参数直接传函数等价于 { onSpeak: fn }。
   */
  ui.bindWordList = function (root, arg) {
    var opts = (typeof arg === 'function') ? { onSpeak: arg } : (arg || {});
    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (btn) {
        e.stopPropagation();
        var id = btn.dataset.id;           // 词 id 可能是 "cet6:abandon" 这样的字符串，不能做数字转换
        var act = btn.dataset.act;
        if (act === 'fav') {
          var on = TW.store.toggleFav(id);
          btn.classList.toggle('on', on);
          TW.toast(on ? '已收藏' : '已取消收藏');
        } else if (act === 'master') {
          var m = TW.store.toggleMaster(id);
          btn.classList.toggle('on', m);
          TW.toast(m ? '已标记掌握' : '已取消掌握');
        } else if (act === 'speak') {
          var sw = TW.data.byId(id);
          if (opts.onSpeak) opts.onSpeak(sw);
          else TW.speech.speak((sw && sw.word) || btn.dataset.say || '', TW.store.settings.accent);
        }
        return;
      }
      var row = e.target.closest('.wl-row');
      if (!row) return;
      if (e.target.closest('a')) return;   // 行内链接（单词本身）交给浏览器跳转
      var w = TW.data.byId(row.dataset.id);
      if (!w) return;
      if (opts.onOpen) opts.onOpen(w);
      else if (opts.onSpeak) opts.onSpeak(w);
    });
  };

  /* ---------------- 单词链接（跨词跳转） ---------------- */

  /** 单个英文词的 HTML：存在于词库则渲染成可跳转链接 */
  ui.linkWord = function (term, opts) {
    opts = opts || {};
    var t = TW.esc(term);
    var w = TW.data.byWord(term);
    if (w) return '<a class="wref" href="#/word?id=' + encodeURIComponent(w.id) + '" title="' + TW.esc(TW.data.brief(w)) + '">' + t + '</a>';
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
        if (w) return '<a class="wref" href="#/word?id=' + encodeURIComponent(w.id) + '" title="' + TW.esc(TW.data.brief(w)) + '">' + TW.esc(seg) + '</a>';
        var e = TW.data.ext(seg);
        if (e) return '<a class="wref ext" href="#/word?w=' + encodeURIComponent(low) + '" title="扩展词条">' + TW.esc(seg) + '</a>';
        return TW.esc(seg);
      })
      .join('');
  };

  /** 绑定链接区内的收藏 / 掌握 / 发音按钮（详情页用）。
      返回清理函数 —— root 是 SPA 复用的 #view 容器，不随 innerHTML 重建而卸载；
      每次进详情页都重新绑定会**叠加监听**：点一次美音读 N 遍（跳过 N 个词就是 N 层）、
      收藏反复横跳（sunfleeting 实测）。调用方必须在下次 render 前拆掉旧的。 */
  ui.bindWordActions = function (root, id) {
    var handler = function (e) {
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
    };
    root.addEventListener('click', handler);
    return function () { root.removeEventListener('click', handler); };
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
