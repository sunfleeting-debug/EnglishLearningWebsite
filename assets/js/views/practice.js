/* 练习页：看词打字 / 看中文拼写 / 听音写词 / 翻卡记忆 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  var MODES = [
    { id: 'type', name: '看词打字', desc: '看着单词把它打出来，练拼写肌肉记忆' },
    { id: 'recall', name: '看中文拼写', desc: '只看中文释义，凭记忆写出英文单词' },
    { id: 'listen', name: '听音写词', desc: '听发音写出单词，练听力与拼写' },
    { id: 'flash', name: '翻卡记忆', desc: '先回忆再翻面，认识 / 不认识快速过词' }
  ];

  /** 生成可接受的答案集合（兼容 analog(ue) 这类带括号的写法） */
  function answers(word) {
    var set = [word];
    if (/[()]/.test(word)) {
      set.push(word.replace(/[()]/g, ''));
      set.push(word.replace(/\(([^)]*)\)/, '$1'));
      set.push(word.replace(/\([^)]*\)/, ''));
    }
    return set.map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function render(host, query) {
    var cfg = {
      book: query.book || 'all',
      mode: MODES.some(function (m) { return m.id === query.mode; }) ? query.mode : 'type',
      order: query.order || TW.store.settings.order,
      status: query.status || 'all',
      size: parseInt(query.size || '', 10) || TW.store.settings.sessionSize
    };

    /* ---------- 组装本轮词表 ---------- */
    function buildPool() {
      var list = cfg.book === 'all' ? TW.data.words.slice() : TW.data.byBook(cfg.book).slice();
      list = TW.data.filterByStatus(list, cfg.status, TW.store);
      return list;
    }
    var pool = buildPool();
    var session = (cfg.order === 'random' ? TW.shuffle(pool) : pool.slice());
    if (cfg.size > 0) session = session.slice(0, cfg.size);

    var st = {
      i: 0, correct: 0, wrong: 0, phase: 'answering', // answering | feedback | done
      revealed: false, lastOk: false, hintShown: false
    };
    var destroyed = false;   // 离开本页后置真，阻止异步回调回写已卸载的 DOM

    if (!session.length) {
      host.innerHTML = '<div class="wrap-narrow">' + TW.ui.pageHead('练习', '') +
        TW.ui.empty('这一组没有可练习的单词，换个筛选条件试试') + '</div>';
      return;
    }

    TW.store.state.lastBook = cfg.book === 'all' ? TW.store.state.lastBook : cfg.book;
    TW.store.save();

    /* ---------- 页面骨架 ---------- */
    host.innerHTML =
      '<div class="wrap-narrow">' +
        '<div class="practice-top">' +
          '<button class="btn ghost sm" id="p-back">' + TW.icon('arrowLeft', 15) + ' 返回</button>' +
          '<div class="practice-progress">' +
            '<div class="pp-row"><span id="p-pos"></span><span id="p-acc"></span></div>' +
            '<div class="progress-line"><i id="p-bar" style="width:0%"></i></div>' +
          '</div>' +
          '<div class="seg" id="p-mode"></div>' +
        '</div>' +
        '<div id="p-stage"></div>' +
      '</div>';

    TW.$('#p-back', host).addEventListener('click', function () {
      TW.app.go('/books' + (cfg.book !== 'all' ? '?book=' + cfg.book : ''));
    });

    TW.$('#p-mode', host).innerHTML = MODES.map(function (m) {
      return '<button data-mode="' + m.id + '" class="' + (cfg.mode === m.id ? 'active' : '') + '" title="' + m.desc + '">' + m.name + '</button>';
    }).join('');
    TW.$$('#p-mode button', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var u = '/practice?book=' + cfg.book + '&mode=' + b.dataset.mode + '&order=' + cfg.order +
          (cfg.status !== 'all' ? '&status=' + cfg.status : '');
        TW.app.go(u);
      });
    });

    /* ---------- 顶部进度 ---------- */
    function drawProgress() {
      if (destroyed) return;
      var pos = Math.min(st.i + 1, session.length);
      var posEl = TW.$('#p-pos', host), accEl = TW.$('#p-acc', host), barEl = TW.$('#p-bar', host);
      if (!posEl || !accEl || !barEl) return;
      posEl.textContent = '第 ' + pos + ' / ' + session.length + ' 词';
      var total = st.correct + st.wrong;
      accEl.textContent = total ? '正确率 ' + Math.round((st.correct / total) * 100) + '%' : '开始吧';
      barEl.style.width = TW.pct(st.i, session.length) + '%';
    }

    /* ---------- 主区域 ---------- */
    var input = null;

    function stageHtml(w) {
      var head = '<div class="word-phonetic">' + (TW.store.settings.showPhonetic && w.us ? '/' + TW.esc(w.us) + '/' : '') +
        '  <button class="btn ghost sm" data-act="speak">' + TW.icon('volume', 15) + ' 发音</button>' +
        '  <button class="btn ghost sm" data-act="fav">' + TW.icon('star', 15) + ' ' + ((TW.store.get(w.id) || {}).fav ? '已收藏' : '收藏') + '</button>' +
        '  <a class="btn ghost sm" href="#/word?id=' + w.id + '">' + TW.icon('lightbulb', 15) + ' 详解</a>' +
        '</div>';
      var means = '<div class="mean-box">' + meaningsHtml(w) + '</div>';

      if (cfg.mode === 'type') {
        return '<div class="stage">' + head +
          '<div class="word-display" id="p-word">' + TW.esc(w.word) + '</div>' +
          means +
          '<div class="typing-box"><input class="typing-input" id="p-input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="在这里打出这个单词…" /></div>' +
          '<div class="hint-keys"><kbd>Enter</kbd> 提交 · <kbd>Esc</kbd> 跳过</div>' +
          '</div>';
      }
      if (cfg.mode === 'recall') {
        return '<div class="stage">' + head +
          '<div class="word-display" id="p-word" style="font-size:1.8rem;letter-spacing:6px;color:var(--text-3)">' +
            '· '.repeat(Math.max(3, Math.min(12, w.word.length))) + '</div>' +
          means +
          '<div class="typing-box"><input class="typing-input" id="p-input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="根据释义拼写英文单词…" /></div>' +
          '<div class="hint-keys"><kbd>Enter</kbd> 提交 · <kbd>Esc</kbd> 跳过 · ' + w.word.length + ' 个字母</div>' +
          '</div>';
      }
      if (cfg.mode === 'listen') {
        return '<div class="stage">' +
          '<button class="btn primary" data-act="speak" style="font-size:15px">' + TW.icon('volume', 18) + ' 重听</button>' +
          '<div class="word-display" id="p-word" style="font-size:1.6rem;color:var(--text-3)">' +
            (TW.store.settings.showPhonetic && w.us ? '/' + TW.esc(w.us) + '/' : '听发音写单词') + '</div>' +
          (st.hintShown ? means : '<button class="btn ghost sm" data-act="hint">' + TW.icon('lightbulb', 15) + ' 看中文提示</button>') +
          '<div class="typing-box"><input class="typing-input" id="p-input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="听音拼写…" /></div>' +
          '<div class="hint-keys"><kbd>Enter</kbd> 提交 · <kbd>Esc</kbd> 跳过</div>' +
          '</div>';
      }
      // flash
      return '<div class="stage">' +
        '<div class="flashcard' + (st.revealed ? ' revealed' : '') + '" id="p-card">' +
          '<div class="word-phonetic">' + (TW.store.settings.showPhonetic && w.us ? '/' + TW.esc(w.us) + '/' : '') + '</div>' +
          '<div class="word-display" style="font-size:clamp(1.8rem,5vw,2.8rem)">' + TW.esc(w.word) + '</div>' +
          (st.revealed
            ? means
            : '<div class="muted small">点击卡片 / 按 <kbd>空格</kbd> 翻面查看释义</div>') +
        '</div>' +
        (st.revealed
          ? '<div class="practice-actions">' +
              // 翻面后与其它模式对齐，给出词典详解入口
              '<a class="btn ghost" href="#/word?id=' + w.id + '">' + TW.icon('lightbulb', 16) + ' 详解</a>' +
              '<button class="btn" data-act="unknown">' + TW.icon('x', 16) + ' 不认识</button>' +
              '<button class="btn primary" data-act="known">' + TW.icon('check', 16) + ' 认识</button>' +
            '</div>'
          : '<div class="practice-actions"><button class="btn primary" data-act="reveal">翻面</button></div>') +
        '</div>';
    }

    function meaningsHtml(w) {
      if (!w.trans || !w.trans.length) {
        return '<div class="mean-line muted">（该词暂无释义，可点击右上角发音按钮跟读）</div>';
      }
      return w.trans.map(function (t) {
        var p = TW.data.parseTrans(t);
        return '<div class="mean-line">' + (p.pos ? '<span class="pos">' + TW.esc(p.pos) + '</span>' : '') +
          '<span>' + TW.esc(p.text) + '</span></div>';
      }).join('');
    }

    function drawStage() {
      if (destroyed) return;
      var w = session[st.i];
      var wrap = TW.$('#p-stage', host);
      if (!wrap) return;
      wrap.innerHTML = stageHtml(w);
      TW.ui.bindWordList(wrap, function () {});  // 占位，避免误触发
      bindStageActions(w);
      input = TW.$('#p-input', host);
      if (input) {
        input.addEventListener('input', function () {
          if (TW.store.settings.keySound) TW.speech.sound.key();
        });
        input.addEventListener('keydown', onKey);
        input.focus();
      }
      // 自动发音
      if (TW.store.settings.autoPronounce && (cfg.mode === 'listen' || cfg.mode === 'type')) {
        setTimeout(function () { TW.speech.speak(w.word, TW.store.settings.accent); }, 120);
      }
      if (cfg.mode === 'listen') {
        setTimeout(function () { TW.speech.speak(w.word, TW.store.settings.accent); }, 200);
      }
    }

    function bindStageActions(w) {
      TW.$$('[data-act]', host).forEach(function (b) {
        if (!host.contains(b)) return;
        var act = b.dataset.act;
        if (act === 'speak') b.onclick = function () { TW.speech.speak(w.word, TW.store.settings.accent); };
        else if (act === 'fav') b.onclick = function () {
          var on = TW.store.toggleFav(w.id);
          b.innerHTML = TW.icon('star', 15) + ' ' + (on ? '已收藏' : '收藏');
          TW.toast(on ? '已收藏' : '已取消收藏');
        };
        else if (act === 'hint') b.onclick = function () { st.hintShown = true; drawStage(); };
        else if (act === 'reveal') b.onclick = function () { st.revealed = true; drawStage(); };
        else if (act === 'known') b.onclick = function () { grade(true); };
        else if (act === 'unknown') b.onclick = function () { grade(false); };
      });
    }

    /* ---------- 交互逻辑 ---------- */
    function onKey(e) {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        if (st.phase === 'answering') check();
        else next();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        skip();
      } else if (e.key === ' ' && cfg.mode === 'flash') {
        e.preventDefault();
        if (!st.revealed) { st.revealed = true; drawStage(); }
      }
    }

    document.addEventListener('keydown', globalKey);
    function globalKey(e) {
      if (cfg.mode !== 'flash' || !host.isConnected) return;
      if (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
      if (e.key === ' ') { e.preventDefault(); if (!st.revealed) { st.revealed = true; drawStage(); } }
    }

    function visibleAnswerHtml(w, ok) {
      return '<div class="feedback" style="margin-top:.4rem">' +
        '<div class="word-display" id="p-word" style="font-size:clamp(1.6rem,4.4vw,2.4rem);color:var(--' + (ok ? 'ok' : 'err') + ')">' + TW.esc(w.word) + '</div>' +
        '<div class="mean-box" style="margin-top:.5rem">' + meaningsHtml(w) + '</div>' +
        (ok ? '<div class="tag ok" style="margin-top:.6rem">' + TW.icon('check', 13) + ' 正确</div>'
            : '<div class="tag err" style="margin-top:.6rem">' + TW.icon('x', 13) + ' 答错了，正确答案如上</div>') +
        '<div style="margin-top:.6rem"><a class="btn ghost sm" href="#/word?id=' + w.id + '">' + TW.icon('lightbulb', 15) + ' 查看词典详解</a></div>' +
      '</div>';
    }

    function check() {
      if (!input) return;
      var w = session[st.i];
      var ok = answers(w.word).some(function (a) { return TW.isCorrect(input.value, a); });
      grade(ok);
    }

    function grade(ok) {
      if (destroyed) return;
      var w = session[st.i];
      st.phase = 'feedback';
      st.lastOk = ok;
      if (ok) { st.correct++; TW.store.markRight(w.id); TW.speech.sound.correct(); }
      else { st.wrong++; TW.store.markWrong(w.id); TW.speech.sound.wrong(); }

      // 反馈取代输入区
      var box = TW.$('.typing-box', host);
      if (box) box.remove();
      var hint = TW.$('.hint-keys', host);
      if (hint) hint.remove();
      var actionsHost = TW.$('.stage', host);
      if (actionsHost) {
        if (cfg.mode === 'flash') {
          // 翻卡模式下 grade 只在已翻面时触发，直接显示结果
          actionsHost.innerHTML = visibleAnswerHtml(w, ok) +
            '<div class="practice-actions" style="margin-top:1rem">' +
            '<button class="btn primary" data-act="next">继续 ' + TW.icon('arrowRight', 16) + ' <kbd>Enter</kbd></button></div>';
        } else {
          actionsHost.innerHTML = visibleAnswerHtml(w, ok) +
            '<div class="practice-actions" style="margin-top:1rem">' +
            '<button class="btn" data-act="speak2">' + TW.icon('volume', 16) + ' 听发音</button>' +
            '<button class="btn primary" data-act="next">继续 ' + TW.icon('arrowRight', 16) + ' <kbd>Enter</kbd></button></div>';
        }
        TW.$$('[data-act]', actionsHost).forEach(function (b) {
          if (b.dataset.act === 'next') b.onclick = next;
          if (b.dataset.act === 'speak2') b.onclick = function () { TW.speech.speak(w.word, TW.store.settings.accent); };
        });
      }
      drawProgress();
      if (ok && TW.store.settings.autoNext) setTimeout(function () { if (st.phase === 'feedback') next(); }, 750);
    }

    function skip() {
      if (st.phase === 'done') return;
      var w = session[st.i];
      st.wrong++; TW.store.markWrong(w.id);
      next();
    }

    function next() {
      if (destroyed) return;
      if (st.i >= session.length - 1) { finish(); return; }
      st.i++;
      st.phase = 'answering';
      st.revealed = false;
      st.hintShown = false;
      drawProgress();
      drawStage();
    }

    function finish() {
      if (destroyed) return;
      st.phase = 'done';
      drawProgress();
      TW.speech.sound.complete();
      var acc = (st.correct + st.wrong) ? Math.round((st.correct / (st.correct + st.wrong)) * 100) : 0;
      var stageEl = TW.$('#p-stage', host);
      if (!stageEl) return;
      stageEl.innerHTML =
        '<div class="stage">' +
          '<div style="font-size:3rem">🎉</div>' +
          '<h2 class="page-title">本轮完成</h2>' +
          '<div class="grid stats" style="width:100%;max-width:620px">' +
            '<div class="stat-card"><div class="stat-num">' + session.length + '</div><div class="stat-label">练习题数</div></div>' +
            '<div class="stat-card"><div class="stat-num ok">' + st.correct + '</div><div class="stat-label">答对</div></div>' +
            '<div class="stat-card"><div class="stat-num err">' + st.wrong + '</div><div class="stat-label">答错</div></div>' +
            '<div class="stat-card"><div class="stat-num accent">' + acc + '%</div><div class="stat-label">正确率</div></div>' +
          '</div>' +
          '<div class="practice-actions">' +
            '<button class="btn primary" data-act="again">' + TW.icon('refresh', 16) + ' 再来一轮</button>' +
            '<button class="btn" data-act="wrong">' + TW.icon('x', 16) + ' 复习错词</button>' +
            '<button class="btn ghost" data-act="books">返回词库</button>' +
          '</div>' +
        '</div>';
      TW.$$('[data-act]', host).forEach(function (b) {
        if (b.dataset.act === 'again') b.onclick = function () {
          TW.app.go('/practice?book=' + cfg.book + '&mode=' + cfg.mode + '&order=' + cfg.order);
        };
        if (b.dataset.act === 'wrong') b.onclick = function () {
          TW.app.go('/practice?book=' + cfg.book + '&mode=' + cfg.mode + '&status=wrong');
        };
        if (b.dataset.act === 'books') b.onclick = function () {
          TW.app.go('/books' + (cfg.book !== 'all' ? '?book=' + cfg.book : ''));
        };
      });
    }

    /* ---------- 启动 ---------- */
    drawProgress();
    drawStage();

    // 离开页面时清理全局键盘监听与异步回调
    function cleanup() {
      if (host.isConnected) return;
      destroyed = true;
      document.removeEventListener('keydown', globalKey);
      window.removeEventListener('hashchange', cleanup);
    }
    window.addEventListener('hashchange', cleanup);
  }

  TW.views.practice = { render: render };
})();
