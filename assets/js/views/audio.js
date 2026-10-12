/* 音频跟读：播放课程音频，按时间轴高亮当前单词，点击可跳转 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  function render(host, query) {
    var books = TW.data.books.filter(function (b) { return b.audio; });
    if (!books.length) {
      host.innerHTML = '<div class="wrap-narrow">' + TW.ui.pageHead('音频跟读', '') +
        TW.ui.empty('没有找到可用的音频文件') + '</div>';
      return;
    }
    var bookId = query.book && books.some(function (b) { return b.id === query.book; }) ? query.book : books[0].id;

    host.innerHTML =
      '<div class="wrap">' +
        TW.ui.pageHead('音频跟读', '边听边记：音频播放时自动高亮当前单词，点击任意单词可跳转') +
        '<div class="card card-pad" style="margin-bottom:1rem">' +
          '<div class="audio-player">' +
            '<button class="btn primary" id="au-toggle">' + TW.icon('play', 16) + ' 播放</button>' +
            '<button class="btn" id="au-prev" title="上一词">' + TW.icon('arrowLeft', 16) + '</button>' +
            '<button class="btn" id="au-next" title="下一词">' + TW.icon('arrowRight', 16) + '</button>' +
            '<audio id="au-audio" controls preload="metadata"></audio>' +
          '</div>' +
          '<div class="row" style="margin-top:.8rem;justify-content:space-between">' +
            '<div class="row" style="gap:.35rem" id="au-books"></div>' +
            '<label class="row small" style="gap:.4rem;cursor:pointer"><input type="checkbox" id="au-step" /> 逐词暂停（听写模式）</label>' +
          '</div>' +
        '</div>' +
        '<div class="lyric-list" id="au-lyrics"></div>' +
      '</div>';

    // 书本切换
    TW.$('#au-books', host).innerHTML = books.map(function (b) {
      return '<button class="btn sm' + (b.id === bookId ? ' primary' : '') + '" data-book="' + b.id + '">' + TW.esc(b.name) + '</button>';
    }).join('');
    TW.$$('#au-books [data-book]', host).forEach(function (b) {
      b.addEventListener('click', function () { TW.app.go('/audio?book=' + b.dataset.book); });
    });

    var words = TW.data.byBook(bookId);
    var audio = TW.$('#au-audio', host);
    audio.src = TW.data.getBook(bookId).audio;

    var lyricHost = TW.$('#au-lyrics', host);
    lyricHost.innerHTML = words.map(function (w, i) {
      var t = TW.data.parseTrans((w.trans || [])[0] || '');
      return '<div class="lyric-item" data-index="' + i + '" data-time="' + w.time + '">' +
        '<span class="ly-time">' + TW.fmtTime(w.time) + '</span>' +
        '<span class="ly-word">' + TW.esc(w.word) + '</span>' +
        '<span class="ly-trans">' + TW.esc(t.text || '') + '</span>' +
      '</div>';
    }).join('');

    var items = TW.$$('.lyric-item', lyricHost);
    var activeIdx = -1;
    var destroyed = false;

    /** 稳妥跳转：元数据未就绪时先等 loadedmetadata，否则 currentTime 会被忽略 */
    function seekTo(t) {
      if (destroyed) return;
      if (audio.readyState >= 1) {
        try { audio.currentTime = t; } catch (e) {}
        return;
      }
      var once = function () {
        audio.removeEventListener('loadedmetadata', once);
        if (destroyed) return;
        try { audio.currentTime = t; } catch (e) {}
      };
      audio.addEventListener('loadedmetadata', once);
    }

    function safePlay() {
      if (destroyed) return;
      var p = audio.play();
      if (p && p.catch) p.catch(function () { /* 浏览器自动播放策略拦截，忽略 */ });
    }

    lyricHost.addEventListener('click', function (e) {
      var it = e.target.closest('.lyric-item');
      if (!it) return;
      seekTo(parseFloat(it.dataset.time) || 0);
      safePlay();
      setActive(+it.dataset.index, true);
    });

    function setActive(idx, scroll) {
      if (idx === activeIdx) return;
      if (activeIdx >= 0 && items[activeIdx]) items[activeIdx].classList.remove('active');
      activeIdx = idx;
      if (idx >= 0 && items[idx]) {
        items[idx].classList.add('active');
        if (scroll) items[idx].scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }

    // 从单词详情页带上 #/audio?book=xx&t=秒 跳转：定位到该词
    if (query.t != null && query.t !== '') {
      var seekT = parseFloat(query.t) || 0;
      seekTo(seekT);
      audio.addEventListener('loadedmetadata', function () {
        if (!destroyed) setActive(currentIndexByTime(seekT), true);
      });
    }

    function currentIndexByTime(t) {
      var idx = -1;
      for (var i = 0; i < words.length; i++) {
        if (words[i].time <= t + 0.05) idx = i; else break;
      }
      return idx;
    }

    var stepMode = TW.$('#au-step', host);
    stepMode.addEventListener('change', function () {
      if (!stepMode.checked) return;
      safePlay();
    });

    audio.addEventListener('timeupdate', function () {
      if (destroyed) return;
      var idx = currentIndexByTime(audio.currentTime);
      setActive(idx, true);
      if (stepMode.checked && idx >= 0) {
        var next = words[idx + 1];
        var end = next ? next.time - 0.35 : audio.duration;
        if (end && audio.currentTime >= end) {
          audio.pause();
          // 下一词从暂停点继续
        }
      }
    });

    audio.addEventListener('play', function () {
      if (destroyed) return;
      var btn = TW.$('#au-toggle', host);
      if (btn) btn.innerHTML = TW.icon('pause', 16) + ' 暂停';
    });
    audio.addEventListener('pause', function () {
      if (destroyed) return;
      var btn = TW.$('#au-toggle', host);
      if (btn) btn.innerHTML = TW.icon('play', 16) + ' 播放';
    });

    TW.$('#au-toggle', host).addEventListener('click', function () {
      if (audio.paused) safePlay(); else audio.pause();
    });
    TW.$('#au-prev', host).addEventListener('click', function () {
      var i = Math.max(0, activeIdx - 1);
      seekTo(words[i].time); setActive(i, true); safePlay();
    });
    TW.$('#au-next', host).addEventListener('click', function () {
      var i = Math.min(words.length - 1, activeIdx + 1);
      seekTo(words[i].time); setActive(i, true); safePlay();
    });

    // 离开页面时销毁音频实例，避免异步事件回写已卸载的 DOM
    function cleanup() {
      if (host.isConnected) return;
      destroyed = true;
      try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (e) {}
      window.removeEventListener('hashchange', cleanup);
    }
    window.addEventListener('hashchange', cleanup);
  }

  TW.views.audio = { render: render };
})();
