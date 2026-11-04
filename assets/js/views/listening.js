/* 听力板块视图：新闻 / 长对话 / 讲座
   ------------------------------------------------------------------
   sunfleeting 2026-11-05：站点之前只有「阅读 + 选词填空 + 匹配」，没有听力，
   也没有 BBC 类素材。这一页补上，做法是：
     ① 音频 = 浏览器自带语音朗读原文（零依赖、离线、无版权问题），
        能整段播、单独重播某一段、调语速；
     ② 每套题都带原文 + 译文 + 每题解析，交卷后才默认展开，避免「没听就先看答案」；
     ③ 做题记录存独立键 typingcet.listen.v1（同样不进 store.state，免得云同步带走）。
   想换成真人录音：给 segment 加 file: 'audio/xxx.mp3'，播放时优先用它即可。
*/
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  var KEY = 'typingcet.listen.v1';
  var DB = { results: {} };
  var S = {
    id: '', answers: {}, graded: false, showText: false, showTrans: false,
    rate: 1, playing: -1, paused: false, err: ''
  };

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o && typeof o === 'object' && o.results) DB.results = o.results;
    } catch (e) { /* 读不出来按空的来 */ }
  }
  function write() {
    try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { /* 存不下就先这样 */ }
  }
  read();

  function esc(s) { return TW.esc(s); }
  function sets() { return ((window.TW_LISTENING && window.TW_LISTENING.sets) || []).concat(TW.aiMaterials ? TW.aiMaterials.list('listening') : []); }
  function get(id) {
    var l = sets();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function qKey(sid, n) { return sid + '-' + n; }
  function totalQ(set) {
    var n = 0;
    (set.segments || []).forEach(function (s) { n += (s.questions || []).length; });
    return n;
  }

  /* ---------------- 朗读 ---------------- */

  var synth = window.speechSynthesis;
  var utters = [];

  function stopSpeak() {
    utters = [];
    S.playing = -1;
    S.paused = false;
    try { if (synth) synth.cancel(); } catch (e) { /* 某些环境没有 */ }
  }

  function speakText(text, rate, onStart, onEnd) {
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = rate;
    u.pitch = 1;
    var vs = synth.getVoices().filter(function (v) { return /en[-_]US|en[-_]GB/i.test(v.lang); });
    if (vs.length) u.voice = vs[0];
    u.onstart = function () { onStart && onStart(); };
    u.onend = function () { onEnd && onEnd(); };
    u.onerror = function () { onEnd && onEnd(); };
    utters.push(u);
    synth.speak(u);
  }

  /** 播某一段（或从这一段开始把后面的都播完） */
  function playSegment(host, set, segIndex, chain) {
    if (!synth) { S.err = '这个浏览器不支持语音朗读，可以用 Chrome / Edge 打开'; render(host, { id: set.id }); return; }
    stopSpeak();
    var seg = set.segments[segIndex];
    if (!seg) return;
    var lines = seg.transcript || [];
    S.playing = segIndex;
    render(host, { id: set.id });
    lines.forEach(function (line, i) {
      speakText(line, S.rate,
        function () {
          var tip = TW.$('#ls-now', host);
          if (tip) tip.textContent = '正在朗读 ' + seg.label + ' · 第 ' + (i + 1) + '/' + lines.length + ' 句';
        },
        function () {
          if (i === lines.length - 1) {
            // 链式播下一段（「连续播放」模式）
            if (chain && segIndex + 1 < set.segments.length) playSegment(host, set, segIndex + 1, true);
            else { S.playing = -1; render(host, { id: set.id }); }
          }
        });
    });
  }

  /* ---------------- 列表 ---------------- */

  function resultOf(id) { return DB.results[id] || null; }

  function card(set) {
    var r = resultOf(set.id);
    return '<a class="ls-card" href="#/listening?id=' + encodeURIComponent(set.id) + '">' +
      '<div class="ls-card-h">' +
        '<span class="tag qz">' + esc(set.kindName) + '</span>' +
        '<span class="small muted">' + esc(set.topic) + '</span>' +
        (r ? '<span class="tag ' + (r.right / r.total >= 0.8 ? 'ok' : r.right / r.total >= 0.6 ? '' : 'err') +
          '">上次 ' + r.right + '/' + r.total + '</span>' : '') +
      '</div>' +
      '<div class="ls-card-t">' + esc(set.title) + '</div>' +
      '<div class="small muted">' + (set.segments || []).length + ' 段 · ' + totalQ(set) + ' 题 · 约 ' +
        (set.minutes || 5) + ' 分钟</div>' +
    '</a>';
  }

  function renderList(host) {
    var l = sets();
    var qn = 0, done = 0, right = 0, total = 0;
    l.forEach(function (s) {
      qn += totalQ(s);
      var r = resultOf(s.id);
      if (r) { done++; right += r.right; total += r.total; }
    });

    host.innerHTML = '<div class="wrap">' +
      TW.ui.pageHead('听力', '新闻 / 长对话 / 讲座，按六级题型出题；用浏览器语音朗读，可调速、可单段重播') +
      '<div class="grid stats" style="margin-bottom:1.2rem">' +
        '<div class="stat-card"><div class="stat-num">' + l.length + '</div><div class="stat-label">套材料</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + qn + '</div><div class="stat-label">题目</div></div>' +
        '<div class="stat-card"><div class="stat-num accent">' + done + '</div><div class="stat-label">已听过</div></div>' +
        '<div class="stat-card"><div class="stat-num ' + (total ? (right / total >= 0.8 ? 'ok' : '') : '') + '">' +
          (total ? Math.round(right / total * 100) + '%' : '—') + '</div><div class="stat-label">正确率</div></div>' +
      '</div>' +
      '<div class="ls-cards">' + l.map(card).join('') + '</div>' +
      '<div class="card card-pad muted small" style="margin-top:1rem">' +
        '<b>怎么练最有效</b>：先按正常语速听一遍，只看题目不看原文；第二遍调到 0.8 倍速抓细节；' +
        '做完再展开原文和译文，把「听错的那句」跟着读两遍。听力提分靠的是「听错-看原文-再听」这个循环。' +
      '</div>' +
    '</div>';
  }

  /* ---------------- 做题页 ---------------- */

  function segHtml(set, seg, si) {
    var qs = seg.questions || [];
    return '<div class="card card-pad ls-seg" data-seg="' + si + '">' +
      '<div class="ls-seg-h">' +
        '<span class="ls-seg-l">' + esc(seg.label) + '</span>' +
        '<span class="small muted">' + (seg.transcript || []).length + ' 句 · ' + qs.length + ' 题</span>' +
        '<button class="btn sm ghost" data-play="' + si + '">' +
          (S.playing === si ? '重新播放' : '播放这一段') + '</button>' +
      '</div>' +
      '<div class="ls-qs">' + qs.map(function (q) { return qHtml(set, seg, q); }).join('') + '</div>' +
      '</div>';
  }

  function qHtml(set, seg, q) {
    var k = qKey(seg.id, q.n);
    var pick = S.answers[k] || '';
    var ok = S.graded && pick === q.answer;
    var bad = S.graded && !!pick && pick !== q.answer;
    return '<div class="ls-q' + (S.graded ? (ok ? ' ok' : bad ? ' err' : '') : '') + '">' +
      '<div class="ls-q-h"><span class="ls-q-no">' + q.n + '</span>' +
        '<span class="ls-q-t">' + esc(q.stem) + '</span></div>' +
      '<div class="ls-opts">' + (q.options || []).map(function (o) {
        var cls = 'ls-opt';
        if (S.graded) {
          if (o.k === q.answer) cls += ' ok';
          else if (o.k === pick) cls += ' err';
        } else if (o.k === pick) cls += ' sel';
        return '<button class="' + cls + '" data-q="' + k + '" data-k="' + o.k + '"' +
          (S.graded ? ' disabled' : '') + '>' +
          '<i>' + o.k + '</i><span>' + esc(o.t) + '</span></button>';
      }).join('') + '</div>' +
      (S.graded ? '<div class="ls-exp">' +
        (ok ? '<span class="ls-ok">✓ 答对</span>' : (pick ? '<span class="ls-err">✗ 你选了 ' + esc(pick) + '，正确答案 ' + esc(q.answer) + '</span>'
          : '<span class="ls-miss">未作答，正确答案 ' + esc(q.answer) + '</span>')) +
        '<div class="ls-exp-t">' + esc(q.explain || '') + '</div>' +
      '</div>' : '') +
    '</div>';
  }

  function textHtml(set) {
    return (set.segments || []).map(function (seg) {
      return '<div class="ls-txt">' +
        '<div class="card-title">' + esc(seg.label) +
          (S.showTrans ? ' · 原文 + 译文' : ' · 原文') + '</div>' +
        (S.showTrans
          /* 逐句对照：英文一句 + 紧随其下的中文（TW.biling 对齐，对不上就退回整段） */
          ? ((TW.biling && TW.biling.html(seg.transcript, seg.translation))
              || ('<div class="ls-tr">' + (seg.transcript || []).map(function (p) {
                return '<p>' + esc(p) + '</p>';
              }).join('') + '</div><div class="qz-tr" style="margin-top:.6rem">' +
                esc(seg.translation || '') + '</div>'))
          : '<div class="ls-tr">' + (seg.transcript || []).map(function (p) {
              return '<p>' + esc(p) + '</p>';
            }).join('') + '</div>') +
      '</div>';
    }).join('');
  }

  function renderItem(host, id) {
    var set = get(id);
    if (!set) {
      host.innerHTML = '<div class="wrap-narrow"><div class="card card-pad">' + TW.ui.empty('没找到这套听力') +
        '<div class="row" style="justify-content:center"><a class="btn primary" href="#/listening">回听力列表</a></div></div></div>';
      return;
    }
    if (S.id !== id) {
      S.id = id; S.answers = {}; S.graded = false; S.showText = false; S.showTrans = false; S.err = '';
      stopSpeak();
    }
    var qn = totalQ(set);
    var answered = Object.keys(S.answers).filter(function (k) { return S.answers[k]; }).length;

    host.innerHTML = '<div class="wrap">' +
      TW.ui.pageHead(set.title, set.kindName + ' · ' + set.topic + ' · ' + qn + ' 题',
        '<a class="btn ghost" href="#/listening">' + TW.icon('arrowLeft', 15) + ' 回听力列表</a>') +

      '<div class="card card-pad ls-player">' +
        '<div class="row" style="gap:.5rem;flex-wrap:wrap;align-items:center">' +
          '<button class="btn primary" id="ls-play">' + TW.icon('play', 15) + ' 从头播放</button>' +
          '<button class="btn ghost" id="ls-pause">' + (S.paused ? '继续' : '暂停') + '</button>' +
          '<button class="btn ghost" id="ls-stop">停止</button>' +
          '<span class="ls-rate"><span class="small muted">语速</span>' +
            [0.8, 1, 1.2].map(function (r) {
              return '<button class="ls-rate-b' + (S.rate === r ? ' on' : '') + '" data-rate="' + r + '">' +
                r + '×</button>';
            }).join('') + '</span>' +
          '<span class="small muted" id="ls-now">' + (S.playing >= 0 ? '朗读中…' : '未播放') + '</span>' +
        '</div>' +
        '<div class="small muted" style="margin-top:.5rem">' + esc(set.intro || '') + '</div>' +
        (S.err ? '<div class="ls-err">' + esc(S.err) + '</div>' : '') +
      '</div>' +

      (set.segments || []).map(function (seg, si) { return segHtml(set, seg, si); }).join('') +

      '<div class="card card-pad" style="margin-top:.4rem">' +
        '<div class="row" style="gap:.5rem;flex-wrap:wrap;align-items:center">' +
          (S.graded
            ? '<b class="ls-score">得分 ' + scoreOf(set) + ' / ' + qn + '</b>' +
              '<button class="btn ghost" id="ls-retry">再做一遍</button>'
            : '<button class="btn primary" id="ls-submit">交卷（已答 ' + answered + '/' + qn + '）</button>') +
          '<button class="btn ghost" id="ls-text">' + (S.showText ? '收起原文' : '看原文') + '</button>' +
          '<button class="btn ghost" id="ls-trans">' + (S.showTrans ? '只看原文' : '看原文 + 译文') + '</button>' +
        '</div>' +
        (S.showText ? '<div class="ls-texts">' + textHtml(set) + '</div>' : '') +
      '</div>' + '<div id="study-chat"></div>' +
    '</div>';

    bind(host, set);
    if (TW.studyChat) TW.studyChat.mount(host, function () { return {title: set.title, answers: S.answers, graded: S.graded, score: S.graded ? scoreOf(set) : undefined, segments: set.segments}; }, '听力');
    if (S.playing >= 0) {
      var tip = TW.$('#ls-now', host);
      if (tip) tip.textContent = '正在朗读 ' + set.segments[S.playing].label + '…';
    }
  }

  function scoreOf(set) {
    var n = 0;
    (set.segments || []).forEach(function (seg) {
      (seg.questions || []).forEach(function (q) {
        if (S.answers[qKey(seg.id, q.n)] === q.answer) n++;
      });
    });
    return n;
  }

  function bind(host, set) {
    var play = TW.$('#ls-play', host);
    if (play) play.addEventListener('click', function () { playSegment(host, set, 0, true); });
    var stop = TW.$('#ls-stop', host);
    if (stop) stop.addEventListener('click', function () { stopSpeak(); renderItem(host, set.id); });
    var pause = TW.$('#ls-pause', host);
    if (pause) pause.addEventListener('click', function () {
      if (!synth) return;
      if (S.paused) { synth.resume(); S.paused = false; }
      else { synth.pause(); S.paused = true; }
      renderItem(host, set.id);
    });

    TW.$$('[data-play]', host).forEach(function (b) {
      b.addEventListener('click', function () { playSegment(host, set, Number(b.dataset.play), false); });
    });
    TW.$$('[data-rate]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        S.rate = Number(b.dataset.rate);
        var was = S.playing;
        renderItem(host, set.id);
        if (was >= 0) playSegment(host, set, was, false);   // 换语速后接着读
      });
    });
    TW.$$('.ls-opt', host).forEach(function (b) {
      b.addEventListener('click', function () {
        if (S.graded) return;
        S.answers[b.dataset.q] = b.dataset.k;
        renderItem(host, set.id);
      });
    });

    var sub = TW.$('#ls-submit', host);
    if (sub) sub.addEventListener('click', function () {
      var qn = totalQ(set);
      var ans = Object.keys(S.answers).filter(function (k) { return S.answers[k]; }).length;
      if (ans < qn && !window.confirm('还有 ' + (qn - ans) + ' 题没答，确定交卷？')) return;
      S.graded = true;
      stopSpeak();
      var right = scoreOf(set);
      DB.results[set.id] = { right: right, total: qn, ts: Date.now(), answers: S.answers };
      write();
      renderItem(host, set.id);
      TW.toast('得 ' + right + '/' + qn + '，原文和解析已展开', right / qn >= 0.6 ? 'ok' : 'warn');
      var exp = TW.$('.ls-exp', host);
      if (exp && exp.scrollIntoView) exp.scrollIntoView({ block: 'center' });
    });

    var retry = TW.$('#ls-retry', host);
    if (retry) retry.addEventListener('click', function () {
      S.answers = {}; S.graded = false;
      renderItem(host, set.id);
    });

    var st = TW.$('#ls-text', host);
    if (st) st.addEventListener('click', function () {
      S.showText = !S.showText; if (!S.showText) S.showTrans = false;
      renderItem(host, set.id);
    });
    var tr = TW.$('#ls-trans', host);
    if (tr) tr.addEventListener('click', function () {
      S.showTrans = !S.showTrans; S.showText = S.showTrans ? true : S.showText;
      renderItem(host, set.id);
    });
  }

  function render(host, query) {
    if (query && query.id) renderItem(host, query.id);
    else { S.id = ''; stopSpeak(); renderList(host); }
  }

  /* 离开页面 / 重渲染前停掉语音，否则会一直读下去 */
  window.addEventListener('hashchange', stopSpeak);

  TW.views.listening = { render: render };
})();
