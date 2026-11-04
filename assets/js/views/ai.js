/* AI 英语教练：ChatGPT 式对话界面（流式输出 + 会被内联渲染成可作答的练习题）
   ------------------------------------------------------------------
   sunfleeting 2026-10-18：「搞成那种聊天助手，跟 ChatGPT 一样的」。
   所以整页只有一个聊天窗口，原来「诊断/出题/对话」三个标签收进对话里：
     · 读数据：每次请求都把 TW.ai.briefText() + 候选词表塞进 system，
       模型自己决定要不要引用（它看到的就是真实数字，编不出来）；
     · 出题：约定模型在回复末尾附 ```quiz 代码块，前端把它**从文字里摘掉**、
       渲染成可作答的卡片，交卷后本地判分并写回学习记录；
     · 复盘：把错题作为一条用户消息发回去，模型顺着上下文讲 —— 不需要额外接口。
   仍不做 function calling：各家参数格式不一致，收益不抵兼容成本。
*/
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  var S = {
    messages: [],      // [{role:'user'|'assistant', content, quiz?, _parsed?}]
    draft: '',
    busy: false,
    streamText: '',
    err: '',
    ctrl: null,
    stick: true        // 是否贴着底部（用户往上翻看历史时不要被强行拽回来）
  };
  var HOST = null;

  var TYPE_NAMES = { choice: '选择', spell: '拼写', fill: '填空', trans: '翻译' };

  var SYSTEM = [
    '你是「英语学习站」里的 AI 英语教练，界面是一个聊天窗口。用户在准备六级，用「打字背单词」练习。',
    '练习模式有四种：看词打字（看英文打英文）、看中文拼写（看中文写英文）、听音写词、翻卡记忆。',
    '',
    '【行为准则】',
    '1. 中文回答，简短直接：默认 200 字以内；用户说「详细讲」才展开。',
    '2. 只能引用下面【真实学习数据】里的数字，绝对不要编造统计。',
    '3. 给建议必须具体到「练几个词、用哪个模式、大概几分钟」，不要泛泛而谈。',
    '4. 讲单词时给词性、中文释义和一个例句；区分易混词时先说「差在哪」。',
    '5. 不要用 Markdown 表格；列点最多 4 条；关键结论用 **粗体**。',
    '',
    '【出题协议】',
    '用户要求出题/练一组/来几道题时：正文先用 1-2 句说明这组题练什么，然后在回复**最后**附一个代码块，',
    '语言标记写 quiz，内容严格是 JSON（不要加注释、不要换行到块外）：',
    '```quiz',
    '{"exercises":[{"id":"","word":"","type":"choice|spell|fill","question":"","options":[],"answer":"","explanation":""}]}',
    '```',
    '规则：id 必须原样取自【候选词表】；每个词只出一题；',
    'choice 必须给 4 个选项且 answer 与其中某个字符串完全一致；',
    'spell 的 question 写「中文释义 + 词性 + 首字母与字母数提示」，answer 是英文原形；',
    'fill 的 question 是挖空英文句子（用 ___），answer 是英文原形；',
    'explanation 用中文一句话讲清 + 一个高频搭配。默认 8 题，用户指定题量时按用户的。'
  ].join('\n');

  /* ---------------- 工具 ---------------- */

  function esc(s) { return TW.esc(s); }

  function scrollBottom(force) {
    var box = TW.$('#ai-msgs');
    if (!box) return;
    if (!S.stick && !force) return;
    box.scrollTop = box.scrollHeight;
  }

  function idByWord() {
    var m = {}, st = TW.store.state.progress;
    Object.keys(st).forEach(function (id) {
      var p = st[id];
      if (p && p.word) m[String(p.word).toLowerCase()] = id;
    });
    return m;
  }

  /* 候选词表：错词 + 今天到期，模型出题只能从这里面选（id 才对得上学习记录） */
  function wordPool() {
    var snap = TW.ai.snapshot();
    var map = idByWord();
    var out = [], seen = {};
    function push(id, word, cn) {
      var k = String(word || '').toLowerCase();
      if (!k || seen[k]) return;
      seen[k] = 1;
      out.push((id || map[k] || '-') + ' | ' + word + ' | ' + (cn || '（无释义）'));
    }
    snap.weakWords.forEach(function (w) { push(w.id, w.word, w.cn); });
    snap.dueWords.forEach(function (w) { push(map[String(w.word).toLowerCase()], w.word, w.cn); });
    /* 词表太少时补最近学过的词：刚练过的词拿来出题也不算跑偏 */
    if (out.length < 12) {
      Object.keys(TW.store.state.progress).forEach(function (id) {
        var p = TW.store.state.progress[id];
        if (p && p.seen > 0 && p.word) push(id, p.word, p.brief);
      });
    }
    return out.slice(0, 30);
  }

  function buildSystem() {
    var snap = TW.ai.snapshot();
    var pool = wordPool();
    var L = [SYSTEM, '', '【真实学习数据】', TW.ai.briefText(snap)];
    if (pool.length) {
      L.push('', '【候选词表】（id | 单词 | 中文释义）');
      L.push(pool.join('\n'));
    } else {
      L.push('', '【候选词表】空 —— 用户还没有学习记录，别出题，先让他去练一组。');
    }
    return L.join('\n');
  }

  /* ---------------- 练习题：从回复里抠出 quiz 代码块 ---------------- */

  function splitQuiz(content) {
    var re = /```quiz\s*([\s\S]*?)```/i;
    var m = re.exec(String(content || ''));
    if (!m) return { text: String(content || ''), raw: null };
    var text = (content.slice(0, m.index) + content.slice(m.index + m[0].length)).trim();
    return { text: text, raw: m[1] };
  }

  function normalizeExercises(raw) {
    var data;
    try { data = TW.ai.parseJson(raw); } catch (e) { return null; }
    var arr = data && (data.exercises || data.items || data.questions);
    if (!Array.isArray(arr) || !arr.length) return null;
    var map = idByWord();
    var out = [], used = {};
    arr.forEach(function (raw2) {
      if (!raw2 || typeof raw2 !== 'object') return;
      var type = String(raw2.type || '').toLowerCase();
      if (!TYPE_NAMES[type]) return;
      var word = String(raw2.word || '').trim();
      if (word && used[word.toLowerCase()]) return;
      var q = String(raw2.question || raw2.q || raw2.stem || '').trim();
      var ans = String(raw2.answer || raw2.a || '').trim();
      if (!q || !ans) return;
      /* 有的模型给选项加「A. 」前缀、answer 写成「B. abandon」：统一剥掉 */
      var strip = function (s) { return String(s).replace(/^\s*[A-Da-d][.、)．]\s*/, '').trim(); };
      var opts = Array.isArray(raw2.options) ? raw2.options.map(function (o) { return strip(o); }).slice(0, 5) : [];
      if (type === 'choice' && opts.length < 2) return;
      if (!/^[A-Da-d]$/.test(ans)) ans = strip(ans);
      if (!word) {
        var hit = null;
        var rid = String(raw2.id || '');
        if (rid) {
          var w0 = TW.data.byId ? TW.data.byId(rid) : null;
          if (w0) { word = w0.word; hit = w0; }
        }
        if (!hit) return;
      }
      used[word.toLowerCase()] = 1;
      out.push({
        id: String(raw2.id || '') || map[word.toLowerCase()] || '',
        word: word,
        type: type,
        question: q,
        options: opts,
        answer: ans,
        explanation: String(raw2.explanation || raw2.exp || raw2.why || '').trim()
      });
    });
    if (!out.length) return null;
    return out.slice(0, 20);
  }

  /** 消息完成后解析一次：把 quiz 块从正文摘掉，挂到 msg.quiz 上 */
  function parseMsg(m) {
    if (m._parsed || m.role !== 'assistant') return;
    m._parsed = true;
    var sp = splitQuiz(m.content);
    if (sp.raw == null) return;
    m.content = sp.text;
    var list = normalizeExercises(sp.raw);
    if (list) {
      m.quiz = { exercises: list, answers: {}, graded: false, items: [], right: 0, acc: 0 };
    } else {
      m.content += '\n\n（这组练习的格式没解析出来，可以让我重新出一遍。）';
    }
  }

  function answerOf(ex) {
    var a = String(ex.answer || '').trim();
    var opts = ex.options || [];
    if (/^[A-Da-d]$/.test(a)) {
      var i = a.toUpperCase().charCodeAt(0) - 65;
      if (opts[i]) return String(opts[i]);
    }
    return a;
  }

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[“”"'’]/g, '')
      .replace(/^[\s.,!?;:]+|[\s.,!?;:]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function judge(ex, ans) {
    var target = answerOf(ex);
    var a = norm(ans), t = norm(target);
    if (!a) return false;
    if (ex.type === 'trans') {
      var segs = String(target).split(/[；;、,，\/|]/).map(norm).filter(function (x) { return x.length >= 2; });
      if (!segs.length) return a === t;
      var hit = segs.filter(function (s) { return a.indexOf(s) >= 0; }).length;
      return hit / segs.length >= 0.5;
    }
    return a === t;
  }

  /* ---------------- 消息渲染 ---------------- */

  function quizCard(m, mi) {
    var q = m.quiz;
    if (!q) return '';
    var body = q.exercises.map(function (ex, i) {
      var it = q.graded ? q.items[i] : null;
      var cls = 'ai-q' + (it ? (it.ok ? ' ok' : ' err') : '');
      var inner = '';
      if (ex.type === 'choice') {
        inner = '<div class="ai-opts">' + (ex.options || []).map(function (o, oi) {
          var sel = norm(q.answers[i]) === norm(o);
          var ocls = 'ai-opt' + (sel ? ' sel' : '');
          if (it) {
            if (norm(o) === norm(answerOf(ex))) ocls += ' ok';
            else if (sel) ocls += ' err';
          }
          return '<button type="button" class="' + ocls + '" data-mi="' + mi + '" data-i="' + i +
            '" data-val="' + esc(o) + '"><i>' + String.fromCharCode(65 + oi) + '</i><span>' + esc(o) + '</span></button>';
        }).join('') + '</div>';
      } else {
        inner = '<input class="field ai-input" data-mi="' + mi + '" data-i="' + i + '" type="text" ' +
          'autocomplete="off" spellcheck="false" placeholder="' +
          (ex.type === 'spell' ? '拼出这个单词' : '填入缺失的单词') + '" ' +
          'value="' + esc(q.answers[i] || '') + '"' + (q.graded ? ' disabled' : '') + '>';
      }
      var foot = it
        ? '<div class="ai-q-foot"><div class="ai-ans">' +
          (it.ok ? '✓ 答对' : '✗ 正确答案：' + esc(answerOf(ex))) + '</div>' +
          (ex.explanation ? '<div class="ai-exp">' + esc(ex.explanation) + '</div>' : '') + '</div>'
        : '';
      return '<div class="' + cls + '"><div class="ai-q-head">' +
        '<span class="ai-q-no">' + (i + 1) + '</span>' +
        '<span class="ai-q-type">' + (TYPE_NAMES[ex.type] || ex.type) + '</span>' +
        (it && ex.word ? '<span class="ai-q-word">' + esc(ex.word) + '</span>' : '') +
        '</div><div class="ai-q-text">' + esc(ex.question) + '</div>' + inner + foot + '</div>';
    }).join('');

    var head = '<div class="ai-quizbox-h"><span>练习 · ' + q.exercises.length + ' 题</span>' +
      (q.graded ? '<span class="ai-score">答对 <b>' + q.right + '</b>/' + q.exercises.length + ' · ' + q.acc + '%</span>' : '') +
      '</div>';

    var foot = q.graded
      ? '<div class="ai-quizbox-f">' +
        '<button class="btn sm primary" data-mi="' + mi + '" data-act="review">让教练讲讲错题</button>' +
        '<span class="small muted">成绩已计入学习统计</span></div>'
      : '<div class="ai-quizbox-f"><button class="btn sm primary" data-mi="' + mi + '" data-act="grade">交卷判分</button>' +
        '<span class="small muted">判分结果会写回错词本和复习队列</span></div>';

    return '<div class="ai-quizbox">' + head + body + foot + '</div>';
  }

  function renderMsg(m, mi) {
    if (m.role === 'user') {
      return '<div class="ai-row user"><div class="ai-bubble">' + esc(m.content) + '</div></div>';
    }
    return '<div class="ai-row assistant" data-mi="' + mi + '">' +
      '<div class="ai-ava">A</div>' +
      '<div class="ai-bubble"><div class="ai-md">' + TW.ai.md(m.content) + '</div>' + quizCard(m, mi) + '</div>' +
    '</div>';
  }

  function welcome() {
    var c = TW.store.counts();
    var due = TW.store.srs.dueCount();
    var sugs = [
      ['学习诊断', '看看我最近卡在哪', '帮我分析最近的学习情况：结合我的真实数据，指出最关键的 1-2 个问题，并给这周的训练计划（具体到词量、模式、时长）。'],
      ['来一组练习', '按我的错词出 8 题', '用我错得最多的词出 8 道题，选择题和拼写题各一半，难度按六级真题来。'],
      ['排复习计划', '7 天怎么过完到期词', '我复习队列里有 ' + due + ' 个词到期，帮我排一个 7 天的复习计划，每天做什么、多少词。'],
      ['讲讲易混词', '我总记不住的几个词', '挑 5 个我最容易错的词，讲清它们的意思、搭配和记忆方法，并指出容易混的近义词。']
    ];
    return '<div class="ai-hero">' +
      '<div class="ai-hero-logo">A</div>' +
      '<h3>今天想练点什么？</h3>' +
      '<p class="small muted">我能读你的学习记录、错词和复习队列，给建议、出练习、讲单词。</p>' +
      '<div class="ai-hero-stats small muted">已学 ' + c.touched + ' 词 · 未掌握错词 ' + c.wrong +
        ' · 今天到期 ' + due + ' 词' + (c.touched === 0 ? ' · <a href="#/practice">先去练一组</a>' : '') + '</div>' +
      '<div class="ai-sugs">' + sugs.map(function (x) {
        return '<button type="button" class="ai-sug" data-prompt="' + esc(x[2]) + '">' +
          '<b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></button>';
      }).join('') + '</div>' +
    '</div>';
  }

  function paintMsgs() {
    var box = TW.$('#ai-msgs');
    if (!box) return;
    var html = '';
    if (!S.messages.length && !S.busy) html = welcome();
    html += S.messages.map(renderMsg).join('');
    if (S.busy) {
      html += '<div class="ai-row assistant" id="ai-stream">' +
        '<div class="ai-ava">A</div><div class="ai-bubble">' +
        (S.streamText
          ? '<div class="ai-md">' + TW.ai.md(S.streamText) + '</div>'
          : '<span class="ai-dots"><i></i><i></i><i></i></span>') +
        '</div></div>';
    }
    if (S.err) html += '<div class="ai-err">' + esc(S.err) + '</div>';
    box.innerHTML = html;
    scrollBottom();
  }

  function patchStream() {
    var el = TW.$('#ai-stream .ai-bubble');
    if (!el) { paintMsgs(); return; }
    el.innerHTML = S.streamText
      ? '<div class="ai-md">' + TW.ai.md(S.streamText) + '</div>'
      : '<span class="ai-dots"><i></i><i></i><i></i></span>';
    scrollBottom();
  }

  /* ---------------- 页面骨架 ---------------- */

  function setupCard() {
    var c = TW.ai.config();
    var p = TW.ai.provider(c.provider);
    var isCustom = c.provider === 'custom';
    return '<div class="card card-pad ai-setup">' +
      '<div class="card-title" style="margin-bottom:.35rem">先接入一个模型</div>' +
      '<div class="set-hint" style="margin-bottom:.9rem">API Key 只保存在这台设备的浏览器里，' +
        '不会进云端同步、也不会出现在导出备份里。请求由本站 Worker 转发一次到模型官方接口（不落库、不记日志）。' +
      '</div>' +
      '<div class="ai-prov">' + TW.ai.PROVIDERS.map(function (x) {
        return '<button type="button" class="ai-prov-btn' + (x.id === c.provider ? ' on' : '') +
          '" data-prov="' + x.id + '"><b>' + esc(x.name) + '</b><span>' + esc(x.hint) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="ai-form">' +
        '<label class="ai-fl"><span>API Key</span>' +
          '<input class="field" id="ai-key" type="password" autocomplete="off" spellcheck="false" ' +
            'placeholder="' + (isCustom ? '本地接口可留空' : '在 ' + esc(p.name) + ' 控制台创建，形如 sk-...') + '" ' +
            'value="' + esc(TW.ai.apiKey()) + '"></label>' +
        '<label class="ai-fl"><span>模型</span>' +
          '<input class="field" id="ai-model" type="text" autocomplete="off" spellcheck="false" ' +
            'placeholder="' + esc(p.model || '例如 qwen-plus') + '" value="' + esc(TW.ai.modelName()) + '"></label>' +
        (isCustom ?
          '<label class="ai-fl"><span>接口地址</span>' +
            '<input class="field" id="ai-base" type="text" autocomplete="off" spellcheck="false" ' +
              'placeholder="https://xxx/v1 或 http://127.0.0.1:11434/v1" value="' + esc(c.baseUrl) + '"></label>'
          : '') +
      '</div>' +
      '<div class="row" style="margin-top:.9rem">' +
        '<button class="btn primary" id="ai-save-test"' + (S.busy === 'test' ? ' disabled' : '') + '>' +
          (S.busy === 'test' ? '测试中…' : '保存并开始') + '</button>' +
        '<span class="small muted">会发一句「只回复 ok」验证连通性</span>' +
      '</div>' +
      (S.err ? '<div class="ai-err">' + esc(S.err) + '</div>' : '') +
    '</div>';
  }

  function shell() {
    var p = TW.ai.provider(TW.ai.config().provider);
    return '<div class="ai-shell">' +
      '<div class="ai-bar">' +
        '<div class="ai-bar-l"><span class="ai-bar-ava">A</span>' +
          '<div><b>AI 英语教练</b><span class="small muted">' + esc(p.name) + ' · ' + esc(TW.ai.modelName()) + '</span></div>' +
        '</div>' +
        '<div class="ai-bar-r">' +
          '<button class="btn ghost sm" id="ai-new">新对话</button>' +
          '<a class="btn ghost sm" href="#/settings">设置</a>' +
        '</div>' +
      '</div>' +
      '<div class="ai-msgs" id="ai-msgs"></div>' +
      '<div class="ai-composer">' +
        '<div class="ai-quick">' +
          ['分析我的学习情况', '按错词出 8 道题', '排一个 7 天复习计划'].map(function (q) {
            return '<button type="button" class="ai-toggle" data-prompt="' + esc(q) + '">' + esc(q) + '</button>';
          }).join('') +
        '</div>' +
        '<div class="ai-inwrap">' +
          '<textarea id="ai-input" class="ai-textarea" rows="1" placeholder="问点什么，或说「按我的错词出 8 道题」"></textarea>' +
          '<button class="ai-send" id="ai-send" title="发送">' + TW.icon('arrowRight', 18) + '</button>' +
        '</div>' +
        '<div class="ai-hint small muted">Enter 发送 · Shift + Enter 换行 · 回答会读取你的真实学习数据</div>' +
      '</div>' +
    '</div>';
  }

  /* ---------------- 交互 ---------------- */

  function render(host) {
    HOST = host;
    var ok = TW.ai.configured();
    host.innerHTML = '<div class="wrap">' +
      TW.ui.pageHead('AI 英语助手', ok ? '聊天式教练：读你的数据、出题、讲单词' : '先填一个自己的 API Key（只存本机）',
        '<a class="btn ghost" href="#/settings">' + TW.icon('settings', 15) + ' 模型设置</a>') +
      (ok ? shell() : setupCard()) +
    '</div>';

    bind(host, ok);
    if (ok) { paintMsgs(); scrollBottom(true); }
  }

  function bind(host, ok) {
    /* ---- 配置卡 ---- */
    TW.$$('.ai-prov-btn', host).forEach(function (b) {
      b.addEventListener('click', function () {
        TW.ai.setProvider(b.dataset.prov);
        S.err = '';
        render(host);
      });
    });
    var saveTest = TW.$('#ai-save-test', host);
    if (saveTest) {
      var keyEl = TW.$('#ai-key', host);
      var modelEl = TW.$('#ai-model', host);
      var baseEl = TW.$('#ai-base', host);
      if (keyEl) keyEl.addEventListener('change', function () { TW.ai.setKey(keyEl.value); });
      if (modelEl) modelEl.addEventListener('change', function () { TW.ai.setModel(modelEl.value); });
      if (baseEl) baseEl.addEventListener('change', function () { TW.ai.save({ baseUrl: baseEl.value.trim() }); });

      saveTest.addEventListener('click', function () {
        if (keyEl) TW.ai.setKey(keyEl.value);
        if (modelEl) TW.ai.setModel(modelEl.value);
        if (baseEl) TW.ai.save({ baseUrl: baseEl.value.trim() });
        S.err = ''; S.busy = 'test';
        render(host);
        TW.ai.chat({
          system: '你是一个连通性测试助手。',
          messages: [{ role: 'user', content: '只回复 ok' }],
          maxTokens: 16, temperature: 0
        }).then(function (r) {
          S.busy = '';
          S.messages = [];
          render(host);
          TW.toast('连接成功', 'ok');
        }, function (e) {
          S.busy = '';
          S.err = '连接失败：' + (e.message || '未知错误');
          render(host);
        });
      });
    }

    if (!ok) return;

    /* ---- 顶部按钮 ---- */
    var nb = TW.$('#ai-new', host);
    if (nb) nb.addEventListener('click', function () {
      if (S.busy && S.ctrl) S.ctrl.abort();
      S.messages = []; S.streamText = ''; S.err = ''; S.busy = false; S.stick = true;
      paintMsgs(); scrollBottom(true);
      var inp = TW.$('#ai-input');
      if (inp) inp.focus();
    });

    /* ---- 输入框 ---- */
    var input = TW.$('#ai-input', host);
    var send = TW.$('#ai-send', host);
    if (input) {
      input.value = S.draft;
      autoGrow(input);
      input.addEventListener('input', function () {
        S.draft = input.value;
        autoGrow(input);
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          if (S.busy) return;
          sendText(input.value);
        }
      });
    }
    if (send) {
      send.addEventListener('click', function () {
        if (S.busy) { if (S.ctrl) S.ctrl.abort(); return; }
        sendText(input ? input.value : S.draft);
      });
    }

    /* ---- 建议卡 / 快捷指令 ----
       🔴 建议卡是 paintMsgs() 之后才注入 #ai-msgs 的（render 里先 bind 再画消息），
       所以不能在 render 阶段直接绑 suggest；统一用容器委托，欢迎页与历史消息一起生效。 */
    TW.$$('.ai-quick [data-prompt]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        if (S.busy) return;
        sendText(b.dataset.prompt);
      });
    });

    /* ---- 消息区：滚动 & 题目 / 建议卡交互（容器每次重绘都新建，不会叠加） ---- */
    var box = TW.$('#ai-msgs', host);
    if (box) {
      box.addEventListener('scroll', function () {
        S.stick = (box.scrollHeight - box.scrollTop - box.clientHeight) < 48;
      });
      box.addEventListener('click', function (e) {
        var sug = e.target.closest('.ai-sug[data-prompt]');
        if (sug) {
          if (!S.busy) sendText(sug.dataset.prompt);
          return;
        }
        var opt = e.target.closest('.ai-opt');
        if (opt) {
          var mi = parseInt(opt.dataset.mi, 10);
          var m = S.messages[mi];
          if (!m || !m.quiz || m.quiz.graded) return;
          var i = parseInt(opt.dataset.i, 10);
          m.quiz.answers[i] = opt.dataset.val;
          TW.$$('.ai-opt[data-mi="' + mi + '"][data-i="' + i + '"]', box).forEach(function (x) { x.classList.remove('sel'); });
          opt.classList.add('sel');
          return;
        }
        var btn = e.target.closest('[data-act]');
        if (!btn) return;
        var mi2 = parseInt(btn.dataset.mi, 10);
        if (btn.dataset.act === 'grade') grade(mi2);
        else if (btn.dataset.act === 'review') reviewQuiz(mi2);
      });
      box.addEventListener('input', function (e) {
        var el = e.target.closest('.ai-input');
        if (!el) return;
        var m = S.messages[parseInt(el.dataset.mi, 10)];
        if (!m || !m.quiz) return;
        m.quiz.answers[parseInt(el.dataset.i, 10)] = el.value;
      });
    }
  }

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(160, Math.max(24, el.scrollHeight)) + 'px';
  }

  /* ---------------- 发送 / 流式 ---------------- */

  function history() {
    /* 只带最近 16 条，且把 quiz JSON 从历史里剥掉（省 token：题面已经在上下文里没意义） */
    return S.messages.slice(-16).map(function (m) {
      var text = m.content;
      if (m.role === 'assistant' && m.content.indexOf('```quiz') >= 0) text = splitQuiz(text).text;
      return { role: m.role, content: text || '（略）' };
    });
  }

  function sendText(text) {
    text = String(text || '').trim();
    if (!text || S.busy) return;
    S.messages.push({ role: 'user', content: text });
    S.draft = '';
    var inp = TW.$('#ai-input');
    if (inp) { inp.value = ''; autoGrow(inp); }
    S.busy = true; S.streamText = ''; S.err = ''; S.stick = true;
    var bar = TW.$('#ai-send');
    if (bar) bar.classList.add('stop');
    paintMsgs();
    scrollBottom(true);

    S.ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var lastPaint = 0;
    TW.ai.streamChat({
      system: buildSystem(),
      messages: history(),
      maxTokens: 1800,
      temperature: 0.6,
      signal: S.ctrl ? S.ctrl.signal : undefined
    }, function (soFar) {
      S.streamText = soFar;
      /* 40ms 节流：每个 token 都重排 Markdown 会明显掉帧 */
      var now = Date.now();
      if (now - lastPaint > 40) { lastPaint = now; patchStream(); }
    }).then(function (r) {
      finishStream(r.text);
    }, function (e) {
      if (e && e.aborted) {
        finishStream(S.streamText, '（已停止）');
        return;
      }
      S.busy = false;
      S.err = e && e.message ? e.message : '请求失败';
      if (S.err.indexOf('还没配置') >= 0) S.err += '，去「设置」填一下。';
      S.streamText = '';
      var b = TW.$('#ai-send'); if (b) b.classList.remove('stop');
      paintMsgs();
    });
  }

  function finishStream(text, note) {
    S.busy = false;
    S.streamText = '';
    var b = TW.$('#ai-send'); if (b) b.classList.remove('stop');
    var content = String(text || '').trim();
    if (content) {
      var m = { role: 'assistant', content: content + (note ? '\n\n' + note : '') };
      parseMsg(m);
      S.messages.push(m);
    }
    paintMsgs();
    scrollBottom(true);
    var inp = TW.$('#ai-input');
    if (inp) inp.focus();
  }

  /* ---------------- 判分与复盘 ---------------- */

  function grade(mi) {
    var m = S.messages[mi];
    if (!m || !m.quiz || m.quiz.graded) return;
    var q = m.quiz;
    var right = 0;
    q.items = q.exercises.map(function (ex, i) {
      var ok = judge(ex, q.answers[i]);
      if (ok) right++;
      return { ok: ok };
    });
    q.graded = true;
    q.right = right;
    q.acc = q.exercises.length ? Math.round((right / q.exercises.length) * 100) : 0;

    /* 写回学习记录：AI 练习与普通练习共用一套通路 */
    var wmap = idByWord();
    q.exercises.forEach(function (ex, i) {
      var id = ex.id || wmap[String(ex.word || '').toLowerCase()];
      if (!id) return;
      var w = TW.data.byId ? TW.data.byId(id) : null;
      var word = ex.word || (w && w.word) || '';
      if (!word) return;
      var src = (w && w.book) || '';
      var brief = (w && TW.data.brief) ? TW.data.brief(w) : '';
      try {
        if (q.items[i].ok) {
          TW.store.markRight(id);
          TW.store.srs.onResult(word, true, src, brief);
        } else {
          TW.store.markWrong(id);
          TW.store.srs.onResult(word, false, src, brief);
        }
      } catch (e) { /* 词可能已不在词库：忽略 */ }
    });
    try {
      TW.store.addSession({
        mode: 'ai', src: 'ai',
        total: q.exercises.length, right: right,
        wrong: q.exercises.length - right, acc: q.acc
      });
    } catch (e) {}

    S.messages[mi] = m;
    paintMsgs();
    TW.toast('这组题 ' + q.acc + '%', q.acc >= 60 ? 'ok' : '');
  }

  function reviewQuiz(mi) {
    var m = S.messages[mi];
    if (!m || !m.quiz || !m.quiz.graded || S.busy) return;
    var q = m.quiz;
    var wrongs = q.exercises.filter(function (ex, i) { return !q.items[i].ok; });
    if (!wrongs.length) {
      sendText('这组我全对了，接下来该练什么？');
      return;
    }
    var lines = wrongs.map(function (ex) {
      var idx = q.exercises.indexOf(ex);
      var my = q.answers[idx] || '（空）';
      return '- ' + ex.word + '｜题目：' + ex.question + '｜我的答案：' + my +
        '｜正确答案：' + answerOf(ex);
    }).join('\n');
    sendText('这组练习我错了 ' + wrongs.length + ' 个，帮我讲一下错在哪、怎么记：\n' + lines);
  }

  TW.views.ai = { render: render };
})();
