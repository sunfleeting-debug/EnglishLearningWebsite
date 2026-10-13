/* 练习页：看词打字 / 看中文拼写 / 听音写词 / 翻卡记忆
   词源三种：
     ?book=<周计划id>    六级词汇周计划某个 book（静态已加载）
     ?book=<词典id>      12 本常用词典之一（按需加载）
     ?src=srs            艾宾浩斯复习队列中今天到期的词
*/
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

  /** 生词本分组名称（"练习这组"时显示在顶部） */
  var TAB_NAME = { wrong: '待攻克错词', fav: '我的收藏', master: '已掌握' };

  /* 🔴 工具动作（发音 / 收藏 / 详解 / 看中文提示）：
     按钮点击与键盘快捷键**走同一条路径**（都是 toolbarAct），避免两套行为不一致。
     快捷键：不在输入框里时是裸字母 s/f/d/h；正在打字时用 Alt + 同字母
     （裸字母在输入框里必须还是字母，不能抢键）。 */
  var TOOL_ACTS = ['speak', 'fav', 'detail', 'hint'];
  var TOOL_KEYS = { s: 'speak', f: 'fav', d: 'detail', h: 'hint' };

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

  /* 上一次练习实例的全局键盘监听清理器。
     路由复用同一个 #view 容器，旧实例不会被「卸载」，其 setTimeout（如答对后
     750ms 自动下一词）会继续跑并写进新页面的同名节点。每次 render 先拆掉上一次的监听，
     各回调再用 alive() 认领舞台，双保险。 */
  var prevGlobal = null;

  function render(host, query) {
    // 干掉上一个练习实例遗留的全局键盘监听
    if (prevGlobal) { prevGlobal(); prevGlobal = null; }

    var cfg = {
      book: query.book || 'all',
      src: query.src || '',
      mode: MODES.some(function (m) { return m.id === query.mode; }) ? query.mode : 'type',
      order: query.order || TW.store.settings.order,
      status: query.status || 'all',
      size: parseInt(query.size || '', 10) || TW.store.settings.sessionSize
    };

    /* 本实例的认领标记：#view 是复用的，新页面会改写 host.dataset.owner，
       所有异步回调靠它判断自己是否已被取代。 */
    var token = 'pv' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    host.dataset.owner = token;
    function alive() { return host.dataset.owner === token; }

    /* ---------- 组装本轮词表 ---------- */

    /** 这个词还没学过？（进度里没有任何答题记录） */
    function isNew(w) {
      var p = TW.store.get(w.id);
      return !p || !p.seen;
    }

    /** 当前练习范围里还剩多少没学的词（完成页用它决定要不要给「学下一组」） */
    function remainingNewCount() {
      var list = cfg.book === 'all' ? TW.data.words : TW.data.byBook(cfg.book);
      list = TW.data.filterByStatus(list, cfg.status, TW.store);
      var n = 0;
      for (var i = 0; i < list.length; i++) { if (isNew(list[i])) n++; }
      return n;
    }

    /* 组装本轮词表。
       🔴 **从还没学的词开始**：学完一组接着学下一组，而不是每次都从第 1 个词重来
       （旧实现永远只练前 size 个词，学完 20 个再进来还是这 20 个）。
         · 顺序模式：从第一个未学的词切起，取 size 个；不足则从头回绕补足
         · 随机模式：先在未学的词里随机抽，不足再用已学的补
       若筛选结果本身就是学过的词（错词本 / 收藏 / 已掌握），未学池为空
       ⇒ 自动退化成原来的顺序 / 随机取法，行为不变。 */
    function poolSession() {
      var list = cfg.book === 'all' ? TW.data.words.slice() : TW.data.byBook(cfg.book).slice();
      list = TW.data.filterByStatus(list, cfg.status, TW.store);
      var session;
      if (cfg.order === 'random') {
        session = TW.shuffle(list.filter(isNew))
          .concat(TW.shuffle(list.filter(function (w) { return !isNew(w); })));
      } else {
        var cut = 0;
        while (cut < list.length && !isNew(list[cut])) cut++;
        session = list.slice(cut).concat(list.slice(0, cut));
      }
      if (cfg.size > 0) session = session.slice(0, cfg.size);
      return session;
    }

    /** 复习队列 / 生词本分组：先把记录还原成 {w, s, m} 再解析成词条 */
    function recordsFor(src) {
      if (src === 'srs') {
        return TW.store.srs.dueList().map(function (r) { return { w: r.w, s: r.s, m: r.m }; });
      }
      var tab = (cfg.status === 'all' || cfg.status === 'new') ? 'wrong' : cfg.status;
      return TW.data.progressItems(tab).map(function (it) {
        return { w: it.word, s: it.book || '', m: TW.data.brief(it), id: it.id };
      });
    }

    function resolveRecords(recs) {
      var out = recs.map(function (r) {
        var w = TW.data.byWord(r.w);
        if (w) return w;
        return {
          id: r.id || ('x:' + r.w), word: r.w, raw: r.w, note: '', book: r.s || '',
          idx: 0, time: 0, us: '', uk: '', trans: r.m ? [r.m] : []
        };
      });
      if (cfg.order === 'random') out = TW.shuffle(out);
      return cfg.size > 0 ? out.slice(0, cfg.size) : out;
    }

    /** 词源在 URL 里的写法（模式切换 / 再来一轮都用它） */
    function srcQuery() {
      if (cfg.src === 'srs') return 'src=srs';
      if (cfg.src === 'collection') return 'src=collection&status=' + cfg.status;
      return 'book=' + encodeURIComponent(cfg.book);
    }

    /* ---------- 入口：视词源决定是否要先把词典载进来 ---------- */
    if (cfg.src === 'srs' || cfg.src === 'collection') {
      var isSrs = cfg.src === 'srs';
      var recs = recordsFor(cfg.src);
      if (!recs.length) {
        emptyPage(isSrs
          ? '今天没有到期的复习词。答错的词会自动进入复习队列，隔天再来吧。'
          : '这一组还没有词，先去练习里攒几个吧。');
        return;
      }
      var srcs = [];
      recs.forEach(function (r) { if (r.s && srcs.indexOf(r.s) < 0) srcs.push(r.s); });
      loadingPage(isSrs ? '正在准备复习队列…' : '正在准备词表…');
      TW.data.ensureBooks(srcs, function () {
        if (!alive()) return;
        begin(resolveRecords(recs));
      });
      return;
    }

    function emptyPage(msg) {
      host.innerHTML = '<div class="wrap-narrow">' +
        TW.ui.pageHead('练习', '') +
        '<div class="card card-pad">' + TW.ui.empty(msg) +
          '<div class="row" style="justify-content:center">' +
            '<button class="btn primary" id="p-empty-back">' + TW.icon('arrowLeft', 16) + ' 去词库挑一本</button>' +
          '</div>' +
        '</div></div>';
      var b = TW.$('#p-empty-back', host);
      if (b) b.addEventListener('click', function () { TW.app.go('/books'); });
    }

    function loadingPage(msg) {
      host.innerHTML = '<div class="wrap-narrow">' + TW.ui.pageHead('练习', '') +
        '<div class="card card-pad muted">' + TW.esc(msg) + '</div></div>';
    }

    /* ---------- 入口：视词源决定是否要先把词典载进来 ---------- */
    if (cfg.book !== 'all' && TW.data.isDeck(cfg.book)) {
      var meta = TW.data.deckMeta(cfg.book);
      loadingPage('正在加载词典「' + (meta ? meta.name : cfg.book) + '」…');
      TW.data.loadBook(cfg.book, function (ok) {
        if (!alive()) return;
        if (!ok) { emptyPage('词典加载失败，请检查网络后重试。'); return; }
        begin(poolSession());
      });
      return;
    }

    begin(poolSession());

    /* ---------- 真正的练习会话 ---------- */
    function begin(session) {
      if (!alive()) return;

      /* st 用「重新赋值」而不是「逐字段归零」：所有回调都通过闭包读 st 这个变量，
         所以「再来一轮」只要 resetRound() 就能整组重来，且不重新切词表。 */
      var st = null;
      function resetRound() {
        st = {
          i: 0, correct: 0, wrong: 0, phase: 'answering', // answering | feedback | done
          revealed: false, lastOk: false, hintShown: false,
          tries: 0,    // 本题已答错次数：第一次错只提示重做，不改判、不揭答案
          spoke: false // 本词是否已自动发音（drawStage 在「看提示/翻面」时会重画，不标记会读两遍）
        };
      }
      resetRound();

      if (!session.length) {
        emptyPage('这一组没有可练习的单词，换个筛选条件试试。');
        return;
      }

      var REC = (cfg.src === 'srs' || cfg.src === 'collection');
      var bookMeta = REC ? null : TW.data.getBook(cfg.book);
      var srcLabel = cfg.src === 'srs' ? ('今日复习 · ' + session.length + ' 词')
        : cfg.src === 'collection' ? (TAB_NAME[cfg.status] || '生词本') + ' · ' + session.length + ' 词'
        : (bookMeta ? bookMeta.name : '全部词库');

      if (!REC) {
        TW.store.state.lastBook = cfg.book === 'all' ? TW.store.state.lastBook : cfg.book;
        TW.store.save();
      }

      /* ---------- 页面骨架 ---------- */
      host.innerHTML =
        '<div class="wrap-narrow">' +
          '<div class="practice-top">' +
            '<button class="btn ghost sm" id="p-back">' + TW.icon('arrowLeft', 15) + ' 返回</button>' +
            '<div class="practice-progress">' +
              '<div class="pp-src">' + TW.esc(srcLabel) + '</div>' +
              '<div class="pp-row"><span id="p-pos"></span><span id="p-acc"></span></div>' +
              '<div class="progress-line"><i id="p-bar" style="width:0%"></i></div>' +
            '</div>' +
            '<div class="seg" id="p-mode"></div>' +
          '</div>' +
          '<div id="p-stage"></div>' +
        '</div>';

      function backTo() {
        if (cfg.src === 'srs') return '/srs';
        if (cfg.src === 'collection') return '/review?tab=' + cfg.status;
        return '/books' + (cfg.book !== 'all' ? '?book=' + encodeURIComponent(cfg.book) : '');
      }

      TW.$('#p-back', host).addEventListener('click', function () { TW.app.go(backTo()); });

      TW.$('#p-mode', host).innerHTML = MODES.map(function (m) {
        return '<button data-mode="' + m.id + '" class="' + (cfg.mode === m.id ? 'active' : '') + '" title="' + m.desc + '">' + m.name + '</button>';
      }).join('');
      TW.$$('#p-mode button', host).forEach(function (b) {
        b.addEventListener('click', function () { switchMode(b.dataset.mode); });
      });

      /* ---------- 顶部进度 ---------- */
      function drawProgress() {
        if (!alive()) return;
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

      /** 工具条：发音 / 收藏 / 详解。四个模式都显示，且都标了快捷键（kbd 里的字就是按键） */
      function toolBarHtml(w) {
        var faved = !!(TW.store.get(w.id) || {}).fav;
        return '<button class="btn ghost sm" data-act="speak" title="发音（快捷键 S）">' +
            TW.icon('volume', 15) + ' 发音 <kbd>S</kbd></button>' +
          '<button class="btn ghost sm" data-act="fav" title="收藏 / 取消收藏（快捷键 F）">' +
            TW.icon('star', 15) + ' ' + (faved ? '已收藏' : '收藏') + ' <kbd>F</kbd></button>' +
          '<a class="btn ghost sm" data-act="detail" href="#/word?id=' + encodeURIComponent(w.id) + '" title="词典详解（快捷键 D）">' +
            TW.icon('lightbulb', 15) + ' 详解 <kbd>D</kbd></a>';
      }

      function stageHtml(w) {
        var head = '<div class="practice-tools">' +
          (TW.store.settings.showPhonetic && w.us ? '<span class="phon">/' + TW.esc(w.us) + '/</span>' : '') +
          toolBarHtml(w) +
          '</div>';
        var means = '<div class="mean-box">' + meaningsHtml(w) + '</div>';

        if (cfg.mode === 'type') {
          return '<div class="stage">' + head +
            '<div class="word-display" id="p-word">' + TW.esc(w.word) + '</div>' +
            means +
            '<div class="typing-box"><input class="typing-input" id="p-input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="在这里打出这个单词…" /></div>' +
            retryLineHtml() +
            '<div class="hint-keys">' + typingKeysHtml() + '</div>' +
            '</div>';
        }
        if (cfg.mode === 'recall') {
          return '<div class="stage">' + head +
            '<div class="word-display" id="p-word" style="font-size:1.8rem;letter-spacing:6px;color:var(--text-3)">' +
              '· '.repeat(Math.max(3, Math.min(12, w.word.length))) + '</div>' +
            means +
            '<div class="typing-box"><input class="typing-input" id="p-input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="根据释义拼写英文单词…" /></div>' +
            retryLineHtml() +
            '<div class="hint-keys">' + typingKeysHtml() + ' · ' + w.word.length + ' 个字母</div>' +
            '</div>';
        }
        if (cfg.mode === 'listen') {
          return '<div class="stage">' +
            '<button class="btn primary" data-act="speak" style="font-size:15px" title="再听一遍（快捷键 S）">' + TW.icon('volume', 18) + ' 重听 <kbd>S</kbd></button>' +
            '<div class="word-display" id="p-word" style="font-size:1.6rem;color:var(--text-3)">' +
              (TW.store.settings.showPhonetic && w.us ? '/' + TW.esc(w.us) + '/' : '听发音写单词') + '</div>' +
            (st.hintShown ? means : '<button class="btn ghost sm" data-act="hint" title="显示中文释义（快捷键 H）">' + TW.icon('lightbulb', 15) + ' 看中文提示 <kbd>H</kbd></button>') +
            '<div class="typing-box"><input class="typing-input" id="p-input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="听音拼写…" /></div>' +
            retryLineHtml() +
            '<div class="hint-keys">' + typingKeysHtml() + ' · <kbd>H</kbd> 中文提示</div>' +
            '</div>';
        }
        // flash
        return '<div class="stage">' +
          // 翻卡也给工具条：看词时想听发音 / 收藏 / 进详解，不该非切模式不可
          '<div class="practice-tools">' + toolBarHtml(w) + '</div>' +
          '<div class="flashcard' + (st.revealed ? ' revealed' : '') + '" id="p-card">' +
            '<div class="word-phonetic">' + (TW.store.settings.showPhonetic && w.us ? '/' + TW.esc(w.us) + '/' : '') + '</div>' +
            '<div class="word-display" style="font-size:clamp(1.8rem,5vw,2.8rem)">' + TW.esc(w.word) + '</div>' +
            (st.revealed
              ? means
              : '<div class="muted small">点击卡片 / 按 <kbd>空格</kbd> 翻面查看释义</div>') +
          '</div>' +
          (st.revealed
            ? '<div class="practice-actions">' +
                // 详解已经在上面工具条里了，这里只留判定按钮
                '<button class="btn" data-act="unknown">' + TW.icon('x', 16) + ' 不认识 <kbd>Backspace</kbd></button>' +
                '<button class="btn primary" data-act="known">' + TW.icon('check', 16) + ' 认识 <kbd>Enter</kbd></button>' +
              '</div>'
            : '<div class="practice-actions"><button class="btn primary" data-act="reveal">翻面 <kbd>空格</kbd></button></div>') +
          // 键盘提示：整个练习页都能不用鼠标（sunfleeting 要求）
          '<div class="hint-keys">' +
            '<kbd>空格</kbd> 翻面 · <kbd>Enter</kbd> 认识 · <kbd>Backspace</kbd> 不认识 · ' +
            '<kbd>S</kbd> 发音 · <kbd>F</kbd> 收藏 · <kbd>D</kbd> 详解 · ' +
            '<kbd>Esc</kbd> 跳过 · <kbd>1</kbd>~<kbd>4</kbd> 换模式' +
          '</div>' +
          '</div>';
      }

      /** 「再试一次」提示位：位于输入框下方，内容由 retry() 填充 */
      function retryLineHtml() {
        return '<div class="retry-line" id="p-retry"></div>';
      }

      /** 打字类模式的键盘提示。焦点在输入框里时裸字母是字母本身，
          所以工具键要写成 Alt+S/F/D（onKey 里处理）。 */
      function typingKeysHtml() {
        return '<kbd>Enter</kbd> 提交 · <kbd>Esc</kbd> 跳过 · ' +
          '<kbd>Alt</kbd>+<kbd>S</kbd>/<kbd>F</kbd>/<kbd>D</kbd> 发音 · 收藏 · 详解';
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
        if (!alive()) return;
        var w = session[st.i];
        var wrap = TW.$('#p-stage', host);
        if (!wrap) return;
        wrap.innerHTML = stageHtml(w);
        TW.ui.bindWordList(wrap, function () {});  // 占位，避免误触发
        bindActs(wrap, w);
        input = TW.$('#p-input', host);
        if (input) {
          input.addEventListener('input', function () {
            if (TW.store.settings.keySound) TW.speech.sound.key();
          });
          input.addEventListener('keydown', onKey);
          input.focus();
        }
        /* 进入新词自动发音 —— 四个模式统一走这里（sunfleeting 要求「答完一个、到下一个，
           自动读下一个单词」）。旧实现只在「看词打字 / 听音写词」里发音，而且 listen 分支
           额外又调用了一次 ⇒ 同一时刻两次 speak，第二次的 stopAudio() 把第一次掐断，
           听起来就是「读到一半重来」甚至没声。
           · 听音模式即使关掉 autoPronounce 也必须读（发音就是题面）
           · 🔴 用 st.spoke 去重：drawStage() 在「看中文提示」「翻面」时也会重画，不去重会读两遍 */
        if (!st.spoke && (cfg.mode === 'listen' || TW.store.settings.autoPronounce)) {
          st.spoke = true;
          setTimeout(function () { if (alive()) TW.speech.speak(w.word, TW.store.settings.accent); }, 150);
        }
      }

      /** 工具动作：按钮点击与键盘快捷键**同一条路径**（发音 / 收藏 / 详解 / 看中文提示）
          返回 true 表示这个动作在当前模式下可用 —— 键盘处理据此决定要不要 preventDefault，
          避免「按键被吞掉但什么也没发生」。 */
      function toolbarAct(name) {
        if (!alive()) return false;
        var w = session[st.i];
        if (!w) return false;
        if (name === 'speak') { TW.speech.speak(w.word, TW.store.settings.accent); return true; }
        if (name === 'fav') {
          var on = TW.store.toggleFav(w.id);
          // 文案要跟着状态走：工具栏 / 反馈区里可能各有一个收藏按钮，一起刷新
          TW.$$('[data-act="fav"]', host).forEach(function (b) {
            b.innerHTML = TW.icon('star', 15) + ' ' + (on ? '已收藏' : '收藏') + ' <kbd>F</kbd>';
          });
          TW.toast(on ? '已收藏' : '已取消收藏');
          return true;
        }
        if (name === 'detail') { TW.app.go('/word?id=' + encodeURIComponent(w.id)); return true; }
        // 「看中文提示」只有听音写词模式有（其它模式本来就把释义摆出来了）
        if (name === 'hint') {
          if (!TW.$('[data-act="hint"]', host)) return false;
          st.hintShown = true;
          drawStage();
          return true;
        }
        return false;
      }

      /** 绑定一个区域内的所有 data-act 按钮（工具键 + 流程键都在这里） */
      function bindActs(root, w) {
        TW.$$('[data-act]', root).forEach(function (b) {
          var act = b.dataset.act;
          if (TOOL_ACTS.indexOf(act) >= 0) {
            b.onclick = function (e) {
              if (act === 'detail') e.preventDefault();   // 用 app.go 走路由，别让 <a> 自己跳
              toolbarAct(act);
            };
            return;
          }
          if (act === 'reveal') b.onclick = function () { st.revealed = true; drawStage(); };
          else if (act === 'known') b.onclick = function () { grade(true); };
          else if (act === 'unknown') b.onclick = function () { grade(false); };
          else if (act === 'next') b.onclick = next;
        });
      }

      /* ---------- 交互逻辑 ---------- */
      /** 切到另一种练习模式（顶部按钮与键盘 1~4 都走这里） */
      function switchMode(id) {
        if (!id || id === cfg.mode) return;
        TW.app.go('/practice?' + srcQuery() + '&mode=' + id + '&order=' + cfg.order +
          (cfg.src === 'collection' ? '' : (cfg.status !== 'all' ? '&status=' + cfg.status : '')));
      }

      /** 输入框内的键盘：Enter 提交 / 反馈后继续，Esc 跳过 */
      function onKey(e) {
        if (e.isComposing) return;
        /* 工具键：焦点在输入框里时裸字母必须还是字母，所以这里只认 Alt+字母。
           用 e.code（KeyS/KeyF/KeyD/KeyH）而不是 e.key：Alt 组合键下 e.key 在部分
           布局/输入法下会变成别的字符，e.code 稳定是物理键位。 */
        var m = /^Key([SFDH])$/.exec(e.code || '');
        if (e.altKey && !e.ctrlKey && !e.metaKey && m) {
          // 先打标记再执行：『详解』会把视图换掉（输入框消失、焦点回到 body），
          // 事件继续冒泡到 globalKey 时判断条件已经变了，不打标记就会再执行一次
          e.__twHandled = true;
          if (toolbarAct(TOOL_KEYS[m[1].toLowerCase()])) e.preventDefault();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          e.__twHandled = true;   // 见 globalKey 里的说明：同一个按键别被处理两次
          if (st.phase === 'answering') check();
          else next();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.__twHandled = true;
          skip();
        }
      }

      document.addEventListener('keydown', globalKey);
      /* 键盘全覆盖：尽量不用鼠标（sunfleeting 要求）
         · 打字类：Enter 提交；反馈阶段输入框已被移除、焦点回到 body ⇒ 由这里接管
           「Enter 继续」（旧实现只管 flash，反馈页按 Enter 其实没反应）
         · 翻卡：空格 / Enter 翻面 → Enter（或 →）认识 · Backspace（或 ←）不认识
         · 通用：S 发音 · Esc 跳过 · 1~4 换模式 · 完成页 Enter = 主按钮
         输入框内的按键交给 onKey（它要读 input.value），这里直接让路。 */
      function globalKey(e) {
        if (!alive() || e.isComposing) return;
        /* 🔴 同一个按键可能已经被输入框上的 onKey 处理过了：比如提交后判错，
           grade() 会把输入框从 DOM 里移除，此时 document.activeElement 已经变成 BODY，
           事件继续冒泡到这里就会「看着像反馈阶段按 Enter」，于是又推进一次 ——
           症状是「一次 Enter 既判分又翻页」，第 2 次答错直接跳过、看不到正确答案。
           onKey 里给事件打了标记，这里认标记直接放行。 */
        if (e.__twHandled) return;
        var tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;   // 正在打字
        if (tag === 'BUTTON' || tag === 'A') return;         // 焦点在按钮/链接上，走原生行为

        if (e.key === 'Escape') { e.preventDefault(); skip(); return; }

        if (st.phase === 'done') {
          // 完成页：Enter = 主按钮（有下一组就学下一组，否则再来一轮）
          if (e.key === 'Enter') {
            var b = TW.$('#p-next-group', host) || TW.$('[data-act="again"]', host);
            if (b) { e.preventDefault(); b.click(); }
          }
          return;
        }

        /* 工具键（焦点不在输入框时用裸字母；在输入框里时走 onKey 的 Alt+ 组合）：
           S 发音/重听 · F 收藏 · D 详解 · H 看中文提示 */
        if (!e.altKey && !e.ctrlKey && !e.metaKey && TOOL_KEYS[(e.key || '').toLowerCase()]) {
          if (toolbarAct(TOOL_KEYS[e.key.toLowerCase()])) e.preventDefault();
          return;
        }

        if (/^[1-4]$/.test(e.key)) { switchMode(MODES[parseInt(e.key, 10) - 1].id); return; }

        if (cfg.mode !== 'flash') {
          if (e.key === 'Enter' && st.phase === 'feedback') { e.preventDefault(); next(); }
          return;
        }
        // 翻卡
        if (e.key === ' ' || (e.key === 'Enter' && !st.revealed)) {
          e.preventDefault();
          if (!st.revealed) { st.revealed = true; drawStage(); }
          return;
        }
        if (st.phase === 'feedback') {
          if (e.key === 'Enter') { e.preventDefault(); next(); }
          return;
        }
        if (!st.revealed) return;
        if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); grade(true); }
        else if (e.key === 'Backspace' || e.key === 'ArrowLeft') { e.preventDefault(); grade(false); }
      }
      // 交给下一次 render 拆掉；本实例的文档级监听不会永远堆积
      prevGlobal = function () { document.removeEventListener('keydown', globalKey); };

      function visibleAnswerHtml(w, ok) {
        return '<div class="feedback" style="margin-top:.4rem">' +
          '<div class="word-display" id="p-word" style="font-size:clamp(1.6rem,4.4vw,2.4rem);color:var(--' + (ok ? 'ok' : 'err') + ')">' + TW.esc(w.word) + '</div>' +
          '<div class="mean-box" style="margin-top:.5rem">' + meaningsHtml(w) + '</div>' +
          (ok ? '<div class="tag ok" style="margin-top:.6rem">' + TW.icon('check', 13) + ' 正确</div>'
              : '<div class="tag err" style="margin-top:.6rem">' + TW.icon('x', 13) + ' 答错了，正确答案如上</div>') +
          // 反馈页也给完整工具条：答完正想收藏 / 跟读一下最方便，不用退回上一屏
          '<div class="practice-tools" style="margin-top:.7rem">' + toolBarHtml(w) + '</div>' +
        '</div>';
      }

      function check() {
        if (!input) return;
        var w = session[st.i];
        var val = (input.value || '').trim();
        if (!val) { input.focus(); return; }   // 空输入不判分，避免误按 Enter 被记错
        var ok = answers(w.word).some(function (a) { return TW.isCorrect(val, a); });
        if (ok) { st.tries = 0; grade(true); return; }
        st.tries++;
        if (st.tries === 1) { retry(); return; }   // 第一次错：只提示重做，不改判、不揭答案
        st.tries = 0;
        grade(false);
      }

      /** 第一次答错：给一次重做机会（sunfleeting 要求「打错了要给个重做的机会」） */
      function retry() {
        TW.speech.sound.wrong();
        var line = TW.$('#p-retry', host);
        if (line) {
          line.innerHTML = '<span class="rt-tag">' + TW.icon('x', 13) +
            ' 还不对，再试一次（最后一次）</span>' +
            '<button class="btn ghost sm" data-act="giveup">看答案</button>';
          var g = TW.$('[data-act="giveup"]', line);
          if (g) g.onclick = giveUp;
        }
        if (input) {
          input.value = '';
          input.focus();
          var box = TW.$('.typing-box', host);
          if (box) {
            box.classList.remove('shake');
            void box.offsetWidth;      // 强制重排，保证动画可重复播放
            box.classList.add('shake');
          }
        }
        drawProgress();
      }

      /** 放弃重做：按答错处理并揭示答案 */
      function giveUp() { st.tries = 0; grade(false); }

      function grade(ok) {
        if (!alive()) return;
        var w = session[st.i];
        st.phase = 'feedback';
        st.lastOk = ok;
        var brief = TW.data.brief(w);
        if (ok) {
          st.correct++; TW.store.markRight(w.id);
          TW.store.srs.onResult(w.word, true, w.book, brief);
          TW.speech.sound.correct();
        } else {
          st.wrong++; TW.store.markWrong(w.id);
          TW.store.srs.onResult(w.word, false, w.book, brief);
          TW.speech.sound.wrong();
        }

        // 反馈取代输入区
        var box = TW.$('.typing-box', host);
        if (box) box.remove();
        var hint = TW.$('.hint-keys', host);
        if (hint) hint.remove();
        var rl = TW.$('.retry-line', host);
        if (rl) rl.remove();
        var actionsHost = TW.$('.stage', host);
        if (actionsHost) {
          // 四个模式的反馈页长得一样：正确/错误 + 工具条（发音·收藏·详解）+ 继续
          actionsHost.innerHTML = visibleAnswerHtml(w, ok) +
            '<div class="practice-actions" style="margin-top:1rem">' +
            '<button class="btn primary" data-act="next">继续 ' + TW.icon('arrowRight', 16) + ' <kbd>Enter</kbd></button></div>';
          bindActs(actionsHost, w);
        }
        drawProgress();
        if (ok && TW.store.settings.autoNext) setTimeout(function () { if (alive() && st.phase === 'feedback') next(); }, 750);
      }

      function skip() {
        // 只在「答题中」才算跳过：反馈/完成阶段按 Esc 不该再记一次错
        if (st.phase !== 'answering') return;
        var w = session[st.i];
        st.wrong++; TW.store.markWrong(w.id);
        TW.store.srs.onResult(w.word, false, w.book, TW.data.brief(w));
        next();
      }

      function next() {
        if (!alive()) return;
        if (st.i >= session.length - 1) { finish(); return; }
        st.i++;
        st.phase = 'answering';
        st.revealed = false;
        st.hintShown = false;
        st.tries = 0;
        st.spoke = false;   // 新词：允许自动发音（见 drawStage）
        drawProgress();
        drawStage();
      }

      function finish() {
        if (!alive()) return;
        st.phase = 'done';
        drawProgress();
        TW.speech.sound.complete();
        var acc = (st.correct + st.wrong) ? Math.round((st.correct / (st.correct + st.wrong)) * 100) : 0;
        var stageEl = TW.$('#p-stage', host);
        if (!stageEl) return;
        var dueLeft = TW.store.srs.dueCount();
        // 词书练习（非复习队列 / 生词本）且这本还有没学的词 → 给一个「学习下一组」入口。
        // 下一组的取词逻辑就是 poolSession 的「从第一个未学词切起」，所以重复同一个 URL 即可。
        var remain = cfg.src === '' ? remainingNewCount() : 0;
        var hasNext = cfg.src === '' && remain > 0;
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
            (cfg.src === 'srs'
              ? '<div class="muted small" style="margin-top:.6rem">复习队列还剩 ' + dueLeft + ' 个到期词</div>'
              : (hasNext
                  ? '<div class="muted small" style="margin-top:.6rem">这本词书还有 ' + remain + ' 个词没学</div>'
                  : (cfg.src === '' ? '<div class="muted small" style="margin-top:.6rem">这本词书已经全部学完啦 🎉</div>' : ''))) +
            '<div class="practice-actions">' +
              (hasNext
                ? '<button class="btn primary" id="p-next-group" data-act="nextgroup">' + TW.icon('arrowRight', 16) +
                    ' 学习下一组 <kbd>Enter</kbd></button>'
                : '') +
              '<button class="btn' + (hasNext ? '' : ' primary') + '" data-act="again">' +
                TW.icon('refresh', 16) + ' 再来一轮' + (hasNext ? '' : ' <kbd>Enter</kbd>') + '</button>' +
              (REC
                ? (cfg.src === 'srs' && dueLeft
                    ? '<button class="btn" data-act="wrong">' + TW.icon('refresh', 16) + ' 继续复习（' + dueLeft + '）</button>'
                    : '')
                : '<button class="btn" data-act="wrong">' + TW.icon('x', 16) + ' 复习错词</button>') +
              '<button class="btn ghost" data-act="books">' +
                (cfg.src === 'srs' ? '返回复习页' : cfg.src === 'collection' ? '返回生词本' : '返回词库') + '</button>' +
            '</div>' +
          '</div>';
        TW.$$('[data-act]', host).forEach(function (b) {
          // 再来一轮 = 同一批词重练一遍（不重新切词表），与「学习下一组」区分开
          if (b.dataset.act === 'again') b.onclick = replay;
          // 学习下一组 = 重新进入同一 URL，poolSession 会从第一个未学的词开始取
          if (b.dataset.act === 'nextgroup') b.onclick = function () {
            TW.app.go('/practice?' + srcQuery() + '&mode=' + cfg.mode + '&order=' + cfg.order);
          };
          if (b.dataset.act === 'wrong') b.onclick = function () {
            TW.app.go(cfg.src === 'srs' ? '/practice?src=srs&mode=' + cfg.mode
              : '/practice?' + srcQuery() + '&mode=' + cfg.mode + '&status=wrong');
          };
          if (b.dataset.act === 'books') b.onclick = function () { TW.app.go(backTo()); };
        });
      }

      /** 同一批词再练一遍（不重新切词表；与完成页的「学习下一组」互补） */
      function replay() {
        if (!alive()) return;
        resetRound();
        drawProgress();
        drawStage();
      }

      /* ---------- 启动 ---------- */
      drawProgress();
      drawStage();
    }
  }

  TW.views.practice = { render: render };
})();
