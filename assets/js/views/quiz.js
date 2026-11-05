/* 题目板块：六级阅读真题（选词填空 / 段落匹配 / 仔细阅读）+ AI 出的题
   ------------------------------------------------------------------
   为什么单独做一个板块（sunfleeting 2026-11-04）：
     「把现在已有的 pdf 的题目练习导进去，而且解析要完整一点」——
     PDF 里每道题都有【定位】+【解析】和整篇参考译文，这些是背单词练不出来的能力，
     所以题面、四个选项、解析、译文全部搬进来，做完当场对答案看解析。
   三种题型共用一套作答模型：
     · 选词填空 —— 正文里【n】是空位，从 A~O 词库里挑，答案比对字母（与真题一致）；
     · 段落匹配 —— 题干配 A~O 段落字母；
     · 仔细阅读 —— 四选一；AI 出的拼写/填空题则退化成输入框。
*/
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  var S = {
    id: '', answers: {}, items: {}, graded: false, right: 0,
    pick: 0,          // 选词填空：当前选中的空位
    showBody: true,
    showTrans: false,
    cache: {}         // setId -> {answers, graded, items, right, pick}
  };

  var TYPE_TAG = { cloze: '选词填空', match: '段落匹配', reading: '仔细阅读', listening: '听力', mixed: 'AI 出题' };
  var localAudio = null, localAudioId = '', localAudioUrl = '', localAudioRequest = 0;
  function releaseAudio() {
    localAudioRequest++;
    if (localAudio) { localAudio.pause(); localAudio.removeAttribute('src'); localAudio.load(); }
    if (localAudioUrl) URL.revokeObjectURL(localAudioUrl);
    localAudio = null; localAudioId = ''; localAudioUrl = '';
  }
  var activeHost = null, activeQuery = null;
  window.addEventListener('tw-personal-quiz-change', function () {
    if (!activeHost || !activeHost.isConnected || !/^#\/quiz(?:\?|$)/.test(window.location.hash)) return;
    if (activeQuery && activeQuery.set) {
      if (TW.quiz.get(activeQuery.set)) renderSet(activeHost, activeQuery.set);
    } else renderList(activeHost);
  });

  /* ---------------- 计时器（sunfleeting 2026-11-05） ----------------
     「做题目的时候加一个计时器…超过十分钟就提醒，这个在设置那里可以关掉」。
     按「一套题」计时，不是按单道小题：六级阅读本来就是一篇十分钟，
     一道题一道题掐反而打断读文章。阈值走设置里的 quizTimerMin（默认 10 分钟），
     总开关是 settings.quizTimer（默认开）。
     状态放在模块级 T 里：renderSet 会整块重渲染（点选项就重渲），
     计时起点必须活在渲染之外，否则每点一次就归零。 */
  var T = { id: '', start: 0, end: 0, warned: false, tick: 0 };

  function timerOn() {
    var st = TW.store.settings || {};
    return st.quizTimer !== false;      // 没设置过 = 开
  }

  function timerLimit() {
    var st = TW.store.settings || {};
    var m = Number(st.quizTimerMin);
    return m > 0 ? m : 10;
  }

  function fmtClock(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(s / 60);
    s = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function startTimer(id) {
    T.id = id; T.start = Date.now(); T.end = 0; T.warned = false;
  }

  function stopTimer() {
    if (T.start && !T.end) T.end = Date.now();
  }

  /** 只在页面里真有 #qz-timer 时才跑；视图一走（元素没了）自己把定时器关掉，不留后台任务 */
  function ensureTick() {
    if (T.tick) return;
    T.tick = setInterval(function () {
      var el = document.getElementById('qz-timer');
      if (!el) { clearInterval(T.tick); T.tick = 0; return; }
      if (T.end) return;                       // 已交卷：定住，不再跳
      var ms = Date.now() - T.start;
      el.textContent = fmtClock(ms);
      if (!T.warned && ms >= timerLimit() * 60000) {
        T.warned = true;
        el.classList.add('over');
        TW.toast('这套题已经做了 ' + timerLimit() + ' 分钟，先把不确定的标记掉，往下走', 'warn');
      }
    }, 1000);
  }

  function esc(s) { return TW.esc(s); }

  /* 换路由就作废计时：下次进来重新开始，别把在别的页面待的时间算进来 */
  window.addEventListener('hashchange', function () {
    releaseAudio();
    T.id = ''; stopTimer();
    if (T.tick) { clearInterval(T.tick); T.tick = 0; }
  });

  /* ---------------- 列表页 ---------------- */

  /* 卡片标题：书上只有段落匹配给了文章名，选词填空/仔细阅读只有题型。
     直接显示「仔细阅读」等于把类型标签写两遍，所以退一步用正文首句当标题——
     一眼能认出是哪一篇，又不至于去编一个原文没有的标题。 */
  function preview(s) {
    var t = String(s.heading || s.title || '').trim();
    if (t && !/^(选词填空|段落匹配|仔细阅读|AI 出题)$/.test(t)) return t;
    var first = (s.body && s.body[0]) || (s.paras && s.paras[0] && s.paras[0].text) || '';
    first = String(first).replace(/【\d+】/g, ' ____ ').replace(/\s+/g, ' ').trim();
    if (!first) return [s.topic, s.source].filter(Boolean).join(' · ') || t;
    return first.length > 56 ? first.slice(0, 56) + '…' : first;
  }

  function setCard(s) {
    var r = TW.quiz.result(s.id);
    var done = r && r.total ? Math.round(r.right / r.total * 100) : null;
    var meta = [];
    if (s.source) meta.push(s.source);
    if (s.topic) meta.push(s.topic);
    if (s.minutes) meta.push(s.minutes + ' 分钟');
    meta.push(s.questions.length + ' 题');
    return '<a class="qz-card" href="#/quiz?set=' + encodeURIComponent(s.id) + '">' +
      '<div class="qz-card-h">' +
        '<span class="tag qz">' + esc(TYPE_TAG[s.type] || '题目') + '</span>' +
        '<span class="qz-card-no">' + (s.no ? 'Passage ' + s.no : esc(s.test)) + '</span>' +
        (done !== null ? '<span class="tag ' + (done >= 60 ? 'ok' : 'err') + '">上次 ' + done + '%</span>' : '') +
      '</div>' +
      '<div class="qz-card-t">' + esc(preview(s)) + '</div>' +
      '<div class="qz-card-m small muted">' + esc(meta.join(' · ')) + '</div>' +
    '</a>';
  }

  function renderList(host) {
    var sum = TW.quiz.summary();
    var bank = TW.quiz.bank();
    var pub = TW.quiz.published();
    var groups = {};
    bank.forEach(function (s) { (groups[s.test] = groups[s.test] || []).push(s); });

    var body = Object.keys(groups).map(function (t) {
      return '<div class="qz-group">' +
        '<div class="qz-group-h"><h3>' + esc(t) + '</h3>' +
          '<span class="small muted">' + groups[t].length + ' 篇 · ' +
            groups[t].reduce(function (n, s) { return n + s.questions.length; }, 0) + ' 题</span></div>' +
        '<div class="qz-cards">' + groups[t].map(setCard).join('') + '</div></div>';
    }).join('');

    var pubBlock = '<div class="qz-group">' +
      '<div class="qz-group-h"><h3>AI 出题</h3>' +
        '<span class="small muted">' + (pub.length ? pub.length + ' 组' : '还没有') + '</span></div>' +
      (pub.length
        ? '<div class="qz-cards">' + pub.map(setCard).join('') + '</div>'
        : '<div class="card card-pad"><div class="small muted">' +
            '在「<a href="#/ai">AI 助手</a>」里让它出一组题，点击「发布到题目板块」，这里就会出现，' +
            '以后可以反复练、离线也能用。' +
          '</div></div>') +
    '</div>';

    host.innerHTML = '<div class="wrap">' +
      TW.ui.pageHead('题目板块', '六级阅读真题（选词填空 / 段落匹配 / 仔细阅读）+ AI 出的题，做完当场看完整解析',
        '<a class="btn ghost" href="#/reading">' + TW.icon('file', 15) + ' 真题阅读原文</a>') +
      '<div id="personal-materials"></div>' +
      '<div class="grid stats" style="margin-bottom:1.2rem">' +
        '<div class="stat-card"><div class="stat-num">' + sum.sets + '</div><div class="stat-label">题目组</div></div>' +
        '<div class="stat-card"><div class="stat-num accent">' + sum.done + '</div><div class="stat-label">已做</div></div>' +
        '<div class="stat-card"><div class="stat-num ok">' + sum.acc + '%</div><div class="stat-label">平均正确率</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + sum.published + '</div><div class="stat-label">AI 发布</div></div>' +
      '</div>' +
      (sum.error ? '<div class="card card-pad small" style="color:var(--err)">' + esc(sum.error) + '</div>' : '') +
      body + pubBlock +
      '<div class="card card-pad muted small" style="margin-top:1rem">' +
        '<b>说明</b>：内置阅读练习来自扫描资料，部分文字可能存在识别误差；本机导入的题目另行标注来源。' +
      '</div>' +
    '</div>';
    if (TW.personalMaterials) TW.personalMaterials.mount(host, 'quiz');
  }

  /* ---------------- 做题页 ---------------- */

  function openCache(id) {
    var c = S.cache[id];
    var r = TW.quiz.result(id);
    if (c) return c;
    return { answers: (r && r.answers) || {}, items: (r && r.items) || {}, graded: !!(r && r.total), right: (r && r.right) || 0, pick: 0 };
  }

  function bodyBlank(paras, set) {
    return paras.map(function (p) {
      var html = esc(p).replace(/【(\d+)】/g, function (m, n) {
        var idx = Number(n);
        var q = null;
        set.questions.forEach(function (x) { if (x.n === idx) q = x; });
        var mine = S.answers[idx];
        var cls = 'qz-blank';
        if (S.graded) cls += (S.items[idx] ? ' ok' : ' err');
        else if (S.pick === idx) cls += ' pick';
        else if (mine) cls += ' filled';
        var label = mine ? esc(mine) : String(idx);
        return '<button type="button" class="' + cls + '" data-blank="' + idx + '">' + label + '</button>' +
          (S.graded && !S.items[idx] ? '<span class="qz-fix">' + esc(q ? q.answer : '') + '</span>' : '');
      });
      return '<p class="qz-p">' + html + '</p>';
    }).join('');
  }

  function bankHtml(set) {
    if (set.type !== 'cloze' || !set.bank || !set.bank.length) return '';
    return '<div class="qz-bank">' + set.bank.map(function (b) {
      var usedBy = '';
      Object.keys(S.answers).forEach(function (n) { if (S.answers[n] === b.k) usedBy = n; });
      var cls = 'qz-word' + (usedBy ? ' used' : '');
      if (S.graded && usedBy && !S.items[usedBy]) cls += ' err';
      return '<button type="button" class="' + cls + '" data-word="' + b.k + '">' +
        '<i>' + b.k + '</i><span>' + esc(b.w) + '</span>' +
        (usedBy ? '<em>' + usedBy + '</em>' : '') + '</button>';
    }).join('') + '</div>';
  }

  function parasHtml(set) {
    if (!set.paras || !set.paras.length) return '';
    return '<div class="qz-paras">' + set.paras.map(function (p) {
      return '<p class="qz-p"><b class="qz-pl">' + esc(p.k) + ')</b>' + esc(p.text) + '</p>';
    }).join('') + '</div>';
  }

  /** 选词填空：作答阶段只给进度，交卷后按空号列「你填的 / 正确的 / 解析」 */
  function clozePanel(set) {
    if (!S.graded) {
      var done = 0;
      set.questions.forEach(function (q) { if (S.answers[q.n]) done++; });
      return '<div class="qz-hint"><b>怎么答</b>：在正文里点一下空位（或直接看高亮的那个），' +
        '再到下面词库里点一个词；点已填的空位可以清掉重填。' +
        '<span class="qz-progress">已填 <b>' + done + '</b>/' + set.questions.length + '</span></div>';
    }
    return '<div class="qz-qs">' + set.questions.map(function (q) {
      var mine = S.answers[q.n] || '';
      var ok = !!S.items[q.n];
      return '<div class="qz-q' + (ok ? ' ok' : ' err') + '">' +
        '<div class="qz-q-h"><span class="qz-q-no">' + q.n + '</span>' +
          '<span class="' + (ok ? 'qz-ok' : 'qz-err') + '">' + (ok ? '✓ 答对' :
            '✗ 你填 ' + esc(mine || '（空）') + '，正确 ' + esc(q.answer) + (q.key ? '（' + esc(q.key) + '）' : '')) +
          '</span></div>' +
        '<div class="qz-exp-t">' + esc(q.explain || '（这题没有解析）') + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function qHtml(q, set) {
    var mine = S.answers[q.n];
    var it = S.graded ? (S.items[q.n] ? ' ok' : ' err') : '';
    var pick = '';
    if (q.options && q.options.length) {
      pick = '<div class="qz-opts">' + q.options.map(function (o) {
        var sel = String(mine || '').toUpperCase() === o.k;
        var cls = 'qz-opt' + (sel ? ' sel' : '');
        if (S.graded && o.k === q.answer) cls += ' ok';
        else if (S.graded && sel) cls += ' err';
        return '<button type="button" class="' + cls + '" data-q="' + q.n + '" data-val="' + o.k + '">' +
          '<i>' + o.k + '</i><span>' + esc(o.t) + '</span></button>';
      }).join('') + '</div>';
    } else if (set.type === 'match' || set.type === 'cloze') {
      var letters = set.type === 'cloze'
        ? (set.bank || []).map(function (b) { return b.k; })
        : (set.paras || []).map(function (p) { return p.k; });
      pick = '<div class="qz-letters">' + letters.map(function (k) {
        var cls = 'qz-lt' + (String(mine || '') === k ? ' sel' : '');
        if (S.graded && k === q.answer) cls += ' ok';
        else if (S.graded && String(mine || '') === k) cls += ' err';
        return '<button type="button" class="' + cls + '" data-q="' + q.n + '" data-val="' + k + '">' + k + '</button>';
      }).join('') + '</div>';
    } else {
      pick = '<input class="field qz-input" data-q="' + q.n + '" type="text" autocomplete="off" ' +
        'spellcheck="false" placeholder="填答案" value="' + esc(mine || '') + '"' + (S.graded ? ' disabled' : '') + '>';
    }
    var exp = '';
    if (S.graded) {
      var head = '<span class="' + (S.items[q.n] ? 'qz-ok' : 'qz-err') + '">' +
        (S.items[q.n] ? '✓ 答对' : '✗ 正确答案：' + esc(q.answer) +
          (q.key ? '（' + esc(q.key) + '）' : '')) + '</span>';
      exp = '<div class="qz-exp">' + head + '<div class="qz-exp-t">' + esc(q.explain || '（这题没有解析）') + '</div></div>';
    }
    return '<div class="qz-q' + it + '">' +
      '<div class="qz-q-h"><span class="qz-q-no">' + q.n + '</span>' +
        (q.word ? '<span class="small muted">' + esc(q.word) + '</span>' : '') + '</div>' +
      (set.type === 'cloze' && q.stem && q.stem !== '第 ' + q.n + ' 空'
        ? '<div class="qz-q-t small muted">' + esc(q.stem) + '</div>' : '') +
      (set.type !== 'cloze' ? '<div class="qz-q-t">' + esc(q.stem) + '</div>' : '') +
      pick + exp + '</div>';
  }

  function renderSet(host, id) {
    var set = TW.quiz.get(id);
    if (!set) {
      host.innerHTML = '<div class="wrap-narrow"><div class="card card-pad">' +
        TW.ui.empty('没找到这组题') + '<div class="row" style="justify-content:center">' +
        '<a class="btn primary" href="#/quiz">回题目板块</a></div></div></div>';
      return;
    }
    if (S.id !== id) {
      var c = openCache(id);
      S.id = id; S.answers = c.answers || {}; S.items = c.items || {};
      S.graded = !!c.graded; S.right = c.right || 0; S.pick = c.pick || 0;
      S.showTrans = false; S.showBody = true;
    } else {
      S.pick = S.pick || 0;
    }

    /* 计时器：换套题才重置；同一套重渲染（点选项、展开材料）保持计时 */
    if (T.id !== id) startTimer(id);
    if (S.graded) stopTimer();

    var meta = [];
    if (set.no) meta.push('Passage ' + set.no);
    if (set.source) meta.push(set.source);
    if (set.topic) meta.push(set.topic);
    if (set.minutes) meta.push('建议 ' + set.minutes + ' 分钟');
    meta.push(set.questions.length + ' 题');

    var scoreBar = S.graded
      ? '<div class="qz-score"><b>' + S.right + '/' + set.questions.length + '</b>' +
        '<span>答对率 ' + Math.round(S.right / set.questions.length * 100) + '%</span>' +
        '<button class="btn sm" id="qz-again">' + TW.icon('refresh', 14) + ' 再做一遍</button></div>'
      : '';

    var matHead = '<div class="qz-mat-h">' +
      '<button class="btn sm ghost" id="qz-toggle-body">' +
        (S.showBody ? '收起材料' : '展开材料') + '</button>' +
      (set.translation ? '<button class="btn sm ghost" id="qz-toggle-tr">' +
        (S.showTrans ? '收起译文' : '看参考译文') + '</button>' : '') +
      '</div>';

    var mat = '';
    if (set.type === 'cloze') {
      mat = '<div class="qz-mat">' + bodyBlank(set.body, set) + '</div>';
    } else if (set.type === 'match') {
      mat = '<div class="qz-mat">' + (set.heading ? '<h3 class="qz-h3">' + esc(set.heading) + '</h3>' : '') +
        parasHtml(set) + '</div>';
    } else if (set.body && set.body.length) {
      mat = '<div class="qz-mat">' + set.body.map(function (p) { return '<p class="qz-p">' + esc(p) + '</p>'; }).join('') + '</div>';
    }
    if (!S.showBody) mat = '';

    /* 译文：sunfleeting 2026-11-05 要求「一句一句放在英文原句下面」，
       用 TW.biling 对齐（对齐不出来就退回整段，绝不硬凑） */
    var trans = S.showTrans && set.translation
      ? '<div class="qz-mat qz-tr"><div class="card-title">参考译文 · 逐句对照</div>' +
        ((TW.biling && TW.biling.html(TW.biling.parasOf(set), set.translation)) || esc(set.translation)) +
        '</div>' : '';

    /* 计时小条：交卷后定住显示总用时，超时后变红（提醒只弹一次） */
    var chip = '';
    if (timerOn()) {
      var used = T.start ? ((T.end || Date.now()) - T.start) : 0;
      chip = '<span class="qz-timer' + (T.warned ? ' over' : '') + (T.end ? ' frozen' : '') +
        '" id="qz-timer" title="单套题超过 ' + timerLimit() + ' 分钟会提醒（设置里可关）">' +
        fmtClock(used) + '</span>';
    }

    if (localAudio && localAudioId === set.id && localAudio.parentNode) localAudio.parentNode.removeChild(localAudio);
    host.innerHTML = '<div class="wrap">' +
      TW.ui.pageHead(set.test + (set.no ? ' · Passage ' + set.no : ''), meta.join(' · '),
        '<a class="btn ghost" href="#/quiz">' + TW.icon('arrowLeft', 15) + ' 回题目板块</a>') +
      scoreBar +
      (set.type === 'listening' ? '<div class="card card-pad"><div class="card-title">真题录音</div><p class="small muted">请播放本机录音；问题在录音中，题面提供选项。</p><div id="qz-local-audio">正在读取录音…</div></div>' : '') +
      '<div class="card card-pad qz-sheet">' +
        '<div class="qz-mat-wrap">' +
          '<div class="qz-mat-h-row"><span class="tag qz">' + esc(TYPE_TAG[set.type] || '题目') + '</span>' +
            chip + matHead + '</div>' +
          mat + trans +
        '</div>' +
        (set.type === 'cloze' ? bankHtml(set) : '') +
        (set.type === 'cloze'
          ? clozePanel(set)
          : '<div class="qz-qs">' + set.questions.map(function (q) { return qHtml(q, set); }).join('') + '</div>') +
        (S.graded ? '' : '<div class="qz-foot"><button class="btn primary" id="qz-submit">' +
          TW.icon('check', 16) + ' 交卷看解析</button>' +
          '<span class="small muted">交卷后逐题给对错与完整解析</span></div>') +
      '</div>' + '<div id="study-chat"></div>' +
    '</div>';

    bind(host, set);
    if (set.type === 'listening') {
      var audioHost = TW.$('#qz-local-audio', host);
      if (localAudio && localAudioId === set.id) { audioHost.textContent = ''; audioHost.appendChild(localAudio); }
      else if (TW.personalMaterials) {
        var request = ++localAudioRequest;
        TW.personalMaterials.audioFile(set.audio).then(function (file) {
          if (request !== localAudioRequest || S.id !== set.id) return;
          var target = TW.$('#qz-local-audio', host); if (!target) return;
          localAudioUrl = URL.createObjectURL(file); localAudioId = set.id;
          localAudio = document.createElement('audio'); localAudio.controls = true; localAudio.preload = 'metadata'; localAudio.src = localAudioUrl;
          target.textContent = ''; target.appendChild(localAudio);
        }).catch(function () {
          var target = TW.$('#qz-local-audio', host);
          if (request === localAudioRequest && target) target.textContent = '无法读取录音，请重新选择包含该录音的星火六级文件夹。';
        });
      }
    }
    if (TW.studyChat) TW.studyChat.mount(host, function () { return {type: set.type, title: set.title, answers: S.answers, graded: S.graded, results: S.graded ? S.items : undefined, body: set.body, paras: set.paras, questions: set.questions}; }, '题目');
  }

  function bind(host, set) {
    if (timerOn()) ensureTick();       // 元素在就每秒刷新，元素不在自己停
    var tb = TW.$('#qz-toggle-body', host);
    if (tb) tb.addEventListener('click', function () { S.showBody = !S.showBody; renderSet(host, set.id); });
    var tt = TW.$('#qz-toggle-tr', host);
    if (tt) tt.addEventListener('click', function () { S.showTrans = !S.showTrans; renderSet(host, set.id); });

    var again = TW.$('#qz-again', host);
    if (again) again.addEventListener('click', function () {
      TW.quiz.clearResult(set.id);
      delete S.cache[set.id];
      S.answers = {}; S.items = {}; S.graded = false; S.right = 0; S.pick = 0;
      startTimer(set.id);              // 重做＝重新计时
      renderSet(host, set.id);
    });

    TW.$$('[data-q]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        if (S.graded) return;
        var n = Number(b.dataset.q);
        S.answers[n] = b.dataset.val;
        /* 选词填空：选中某个词就自动跳到下一个空，符合「一路填下去」的手感 */
        if (set.type === 'cloze') {
          var next = 0;
          set.questions.forEach(function (q) { if (!next && !S.answers[q.n]) next = q.n; });
          S.pick = next || 0;
        }
        renderSet(host, set.id);
      });
    });
    TW.$$('[data-blank]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        if (S.graded) return;
        var n = Number(b.dataset.blank);
        if (S.answers[n]) { delete S.answers[n]; }
        S.pick = n;
        renderSet(host, set.id);
      });
    });
    TW.$$('[data-word]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        if (S.graded) return;
        var k = b.dataset.word;
        var target = S.pick;
        if (!target) {
          set.questions.forEach(function (q) { if (!target && !S.answers[q.n]) target = q.n; });
        }
        if (!target) return;
        /* 同一个词已经占着别的空 → 先把旧位置腾出来，一个词只能用一次 */
        Object.keys(S.answers).forEach(function (n) { if (S.answers[n] === k && Number(n) !== target) delete S.answers[n]; });
        S.answers[target] = k;
        var next = 0;
        set.questions.forEach(function (q) { if (!next && !S.answers[q.n]) next = q.n; });
        S.pick = next || 0;
        renderSet(host, set.id);
      });
    });
    var inputs = TW.$$('.qz-input', host);
    inputs.forEach(function (el) {
      el.addEventListener('input', function () { S.answers[Number(el.dataset.q)] = el.value; });
    });

    var sub = TW.$('#qz-submit', host);
    if (sub) sub.addEventListener('click', function () {
      var items = {}, right = 0;
      set.questions.forEach(function (q) {
        var ok = TW.quiz.judge(q, S.answers[q.n]);
        items[q.n] = ok ? 1 : 0;
        if (ok) right++;
      });
      S.items = items; S.right = right; S.graded = true;
      S.cache[set.id] = { answers: S.answers, items: items, graded: true, right: right, pick: 0 };
      TW.quiz.saveResult(set.id, { right: right, total: set.questions.length, answers: S.answers, items: items });
      renderSet(host, set.id);
      TW.toast('这组答对 ' + right + '/' + set.questions.length, right / set.questions.length >= 0.6 ? 'ok' : '');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function render(host, query) {
    activeHost = host; activeQuery = query || {};
    if (query && query.set && /^personal-/.test(query.set) && TW.personalMaterials) TW.personalMaterials.restore();
    if (query && query.set) renderSet(host, query.set);
    else { S.id = ''; T.id = ''; stopTimer(); renderList(host); }
  }

  TW.views.quiz = { render: render };
})();
