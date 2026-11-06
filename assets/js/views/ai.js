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
    stick: true,       // 是否贴着底部（用户往上翻看历史时不要被强行拽回来）
    models: [],        // 当前 provider + Key 拉到的模型列表
    manual: false,     // 接口没有 /models 时手动填模型名
    modelErr: '',
    autoModelTried: false,
    entered: null,     // 是否已从配置卡「保存并开始」进到聊天：false=还在配置，null=没判断过
    threadId: '',      // 当前会话 id（历史对话按它 upsert）
    threads: [],       // 历史会话列表（右栏、历史面板共用）
    histOpen: false,   // 历史面板是否展开
    webOn: true,       // 联网检索开关（默认开；只有「最近/考试时间」这类问法才真去搜）
    searching: false   // 正在检索（先给个提示，别让气泡空等）
  };
  var HOST = null;
  var keyTimer = null;   // 粘贴 Key 后延迟拉列表的定时器（见 syncKey）

  var TYPE_NAMES = { choice: '选择', spell: '拼写', fill: '填空', trans: '翻译', match: '段落匹配' };

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
    '【你能看到什么】',
    '【真实学习数据】里除了背单词的统计，还有【写作…】【写作草稿…】【题目板块最近】【听力最近】——',
    '也就是用户在写作板块写的译文/作文原文、AI 批改过的分数与意见、做过的题目、听过的材料。',
    '用户说「评价我最新写的那篇翻译/作文」「我哪里写错了」时，直接用那里的原文逐句改，',
    '只根据实际提供的片段回答；如果没有草稿、内容被截断或明细不存在，要如实说明。',
    '',
    '【题目板块：题库索引与原文】',
    '【题目板块 · 题库索引】列出本站题库的每一套题：id、分组（如「Model Test 1」「模拟题 · 第9组」）、题型、题数、标题。',
    '用户提到某一套（「Model Test 1」「模拟题第9组」「2024年12月真题」「那篇讲美学的阅读」）时，',
    '系统会把那套的原文、题目、答案与解析整段贴进【题目板块 · 原文】。',
    '所以讲题库里的题就直接引用原文，不要推托。',
    '仅引用实际提供的题库内容，不要推测不存在的原文。',
    '真没贴到全文（篇幅超预算）时，就照索引说出那几套的 id 与题型，请他点名，也别声称看不到。',
    '用户没作答前不要上来就报答案：先带他定位段落或句子，再让他自己挑，答完再讲为什么。',
    '看不到的只有账号私人信息（邮箱、密码、登录状态），这些也别假装知道。',
    '',
    '【出题协议】',
    '用户要求出题/练一组/来几道题时：正文先用 1-2 句说明这组题练什么，然后在回复**最后**附一个代码块，',
    '语言标记写 quiz，内容严格是 JSON（不要加注释、不要换行到块外）：',
    '```quiz',
    '{"exercises":[{"id":"","word":"","type":"choice|spell|fill","question":"","options":[],"answer":"","explanation":""}]}',
    '```',
    '仿阅读/完形要**多带一个 body 放原文段落**，选项里写真实的英文词（不是字母）：',
    '```quiz',
    '{"body":["Paragraph 1 ...","Paragraph 2 ..."],"exercises":[{"word":"","type":"choice","question":"Which word best fits the first blank in Paragraph 1?","options":["cope","curb","cite","cast"],"answer":"cope","explanation":"中文解析"}]}',
    '```',
    '生成的练习卡支持点击发布保存到当前浏览器。写作或听力练习请使用下述 material 代码块，用户点击发布后才会保存，不要声称已经保存。',
    '写作示例：```material\n{\"kind\":\"writing\",\"type\":\"essay\",\"title\":\"标题\",\"prompt\":\"题目\",\"require\":\"要求\",\"sample\":\"参考范文\"}\n```',
    '听力示例：```material\n{\"kind\":\"listening\",\"title\":\"标题\",\"transcript\":\"英文听力原文\",\"translation\":\"中文译文\",\"questions\":[{\"stem\":\"Question?\",\"options\":[\"A选项\",\"B选项\",\"C选项\",\"D选项\"],\"answer\":\"A\",\"explain\":\"中文解析\"}]}\n```',
    '听力材料为原创模拟，由浏览器语音朗读；不得冒充真题或真人录音。',
    '「按词出题」：id 必须原样取自【候选词表】，每个词只出一题；',
    'choice 必须给 4 个选项且 answer 与其中某个字符串完全一致；',
    'spell 的 question 写「中文释义 + 词性 + 首字母与字母数提示」，answer 是英文原形；',
    'fill 的 question 是挖空英文句子（用 ___），answer 是英文原形；',
    /* 2026-11-05 补：之前没约束题面语言，AI 出了「下列哪个词表示…」这种中文四选一，
       用户看着像「没有题目」（sunfleeting 反馈）。这里把语言写死。 */
    '【题面语言】question 默认用英文：choice 的题干是英文句子挖空或英文提问，选项是英文单词/短语；',
    'fill 的题干是整句英文（用 ___ 挖空，句子必须完整，别只给中文意思）。',
    '唯一允许中文题干的是 spell（看中文写英文），且必须写成「adj. 模糊的；含糊的（首字母 v，5 个字母）」这种',
    '「词性 + 中文释义 + 首字母与字母数」的提示格式，不要写成「下列哪个词表示……」这类中文问句。',
    '中文只出现在 explanation 和 spell 的释义提示里。',
    'explanation 用中文一句话讲清 + 一个高频搭配。默认 8 题，用户指定题量时按用户的。',
    '「按考试题型出题」（仿照某套真题/模拟题写阅读、完形、匹配）：',
    '必须把材料原文**放进 quiz 块**，写成 {"body":["第一段","第二段"],"exercises":[...]}，',
    'body 里每个空位写成 ___（三个以上下划线）。**没有 body 就不要出这类题**，改成单词题。',
    '这类题的 question 用英文自带定位信息，例如 "Which word best fits the first blank in Paragraph 1?"；',
    'options 必须是四个**真实的英文单词或短语**，绝对不要写 A/B/C/D 或词库编号——',
    '那等于没有选项，发到题目板块就是一道没法做的废题。',
    '这类题 word 与 id 都写空字符串 ""，只判分、不写回单词记录。',
    '',
    '【整篇选词填空（十个空的完形）】',
    '用户要「完整的十个空」「一整篇材料」「完形填空」「选词填空」时，必须出一整篇，不许拆成一堆独立小题。',
    '协议：setType 写 "cloze"，body 是**一整篇连贯的文章**（3 段左右，共 200-300 词），',
    '空位在正文里写成【1】【2】…【10】（中文方括号加数字，不是 ___），一段里可以有好几个空；',
    'bank 是 15 个词条，格式 "A. alleviate"，字母 A 到 O 连续不能断，其中 10 个是答案、5 个是干扰项；',
    'exercises 每项只给三样：n（空号，1-10 连续）、answer（词库字母，如 "C"）、explanation（中文解析 + 搭配）；',
    '词库里的词一律给**原形**，同一题内不要重复；答案必须是 bank 里真实存在的字母。',
    '```quiz',
    '{"setType":"cloze","title":"AI 原创 · 选词填空 10 空","body":["In recent years, the way people work has changed 【1】 ... 【2】 ...","Second paragraph ... 【6】 ...","Final paragraph ... 【10】 ..."],"bank":["A. alleviate","B. ambiguous","C. anticipate","D. comply","E. consecutive","F. controversy","G. deteriorate","H. impose","I. inevitable","J. maintain","K. notorious","L. persistent","M. reluctant","N. sustain","O. undermine"],"exercises":[{"n":1,"answer":"C","explanation":"anticipate 预料；anticipate changes 预见变化"},{"n":2,"answer":"H","explanation":"impose ... on 强加于"}]}',
    '```',
    '出题前先自己在心里核对一遍：正文里【1】到【10】十个空都在、每个空的答案字母在 bank 里、词库 15 项字母连续。',
    '文章要像六级真题的选词填空（学术/社会话题的说明文），不要写成十句互不相干的句子。',
    '',
    '【整篇仔细阅读】用户要「一整篇阅读 + 几道题」时：setType 写 "reading"，',
    'body 是 3-5 段连贯文章（约 350-450 词，可以带一个英文 heading），',
    'exercises 给 5 题，每题 {question(英文提问),options(4 个**英文选项原文**,别写 "A." 前缀),answer(字母 A-D),explanation(中文解析+原文定位)}；',
    '```quiz',
    '{"setType":"reading","title":"为什么短会开得更久","heading":"Why short meetings last longer","body":["Paragraph 1 ...","Paragraph 2 ...","Paragraph 3 ..."],"exercises":[{"question":"What does the author say about short meetings?","options":["They are easier to schedule","They tend to expand","They reduce attendance","They suit large teams"],"answer":"B","explanation":"第二段：short meetings expand to fill the time given。定位 short meetings + expand"}]}',
    '```',
    '【整篇段落匹配】用户要「段落匹配」「找段落」「信息匹配」时：setType 写 "match"，',
    'paras 给 10-15 段（每段 40-80 词）：[{"k":"A","text":"..."},{"k":"B","text":"..."}]，',
    'exercises 给 10 题，每题 {question(一句英文陈述),answer(段落字母),explanation(中文定位依据)}，**没有 options**；',
    '每条陈述必须能在某一段里找到明确对应，不要出「哪段都沾一点」的题。',
    '```quiz',
    '{"setType":"match","title":"城市 15 分钟生活圈","heading":"The 15-minute city","paras":[{"k":"A","text":"The idea is simple ..."},{"k":"B","text":"Critics point out ..."}],"exercises":[{"question":"A professor in Paris is credited with developing the concept.","answer":"A","explanation":"A 段：developed by Carlos Moreno, a professor based in Paris"}]}',
    '```',
    '这三种整套题（cloze / reading / match）都必须「材料 + 题」一次给全：材料缺段、答案对不上材料，',
    '我会把整卷丢掉，不用残卷糊弄人。听力练习仍用下面的 material 块（浏览器朗读，不要冒充真题录音）。',
    '',
    '【关于联网】',
    '你本身不能主动浏览网页；本站会在需要时（问最新消息、考试时间、政策变化这类）把实时检索结果贴进【联网检索结果】。',
    '有结果：事实以结果为准，句末标一个来源域名（如「据 neea.edu.cn」），别啰嗦。',
    '如果本次检索失败或结果为空，明确说明本次未能核实；未触发检索时不要声称已经联网。'
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

  function buildSystem(searchPack, userText) {
    var snap = TW.ai.snapshot();
    var pool = wordPool();
    var L = [SYSTEM];
    var brief = (searchPack && searchPack.results && searchPack.results.length) ? TW.ai.searchBrief(searchPack) : '';
    if (brief) L.push('', brief);
    else if (searchPack) L.push('', '【本次联网检索】没有获得可靠结果。');
    L.push('', '【真实学习数据】（可能因长度限制截断）', TW.ai.briefText(snap).slice(0, 9000));
    if (pool.length) L.push('', '【候选词表】（id | 单词 | 中文释义）', pool.join('\n'));

    /* 题目板块：先给索引（让模型知道「有哪些题、怎么点名」）……
       2026-11-05 补：之前只给做题记录不给题库，模型就会答「我无法访问题库」。 */
    var idx = TW.ai.quizIndex ? TW.ai.quizIndex() : [];
    if (idx.length) {
      L.push('', '【题目板块 · 题库索引】（id | 分组 | 题型 | 题数 | 标题）');
      L.push(idx.join('\n'));
    }
    /* ……用户这一句真提到某套时，再把原文与题目整段贴进来 */
    var qctx = TW.ai.quizContext ? TW.ai.quizContext(userText || '') : '';
    if (qctx) L.push('', qctx);

    if (!pool.length) L.push('', '【候选词表】空，可以出通用题或讲解现有题库。');
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

  /** 题面是不是「基本全中文」（真四选一的题面必须是英文，中文只该出现在解析里） */
  function mostlyChinese(s) {
    var t = String(s || '');
    var cjk = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
    var lat = (t.match(/[A-Za-z]/g) || []).length;
    return cjk >= 6 && cjk > lat;
  }

  /** 选项是不是「一串字母编号」（A / B / C / D …）：那不是选项，是词库编号，属于无效题 */
  function lettersOnly(opts) {
    if (!opts || !opts.length) return false;
    return opts.every(function (o) { return /^[A-Oa-o]$/.test(String(o).trim()); });
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
      /* 2026-11-05：两类废题直接丢，别发到题目板块里让人对着 A/B/C/D 发呆。
         ① 选项是字母编号（AI 仿完形时把词库字母当选项了）——真正的选项得是英文单词；
         ② 四选一/填空题面几乎是中文（「下列哪个词表示…」）——题面必须英文。 */
      if (lettersOnly(opts)) return;
      if (type !== 'spell' && mostlyChinese(q)) return;
      if (!/^[A-Da-d]$/.test(ans)) ans = strip(ans);
      if (!word) {
        var hit = null;
        var rid = String(raw2.id || '');
        if (rid) {
          var w0 = TW.data.byId ? TW.data.byId(rid) : null;
          if (w0) { word = w0.word; hit = w0; }
        }
        /* 不带单词的通用选择题（仿真题的阅读/完形题）：照收。
           判分时没有 id 就跳过学习记录写回（见 judgeQuiz），不会污染进度。 */
        if (!hit) {
          if (type !== 'choice') return;
          out.push({
            id: '', word: '', type: type, question: q,
            options: opts, answer: ans,
            explanation: String(raw2.explanation || raw2.exp || raw2.why || '').trim()
          });
          return;
        }
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

  /** 从 quiz 块里取材料原文（仿阅读/完形的题干必须配原文，否则选项再对也没法做） */
  /** 整篇选词填空（setType=cloze）：一整篇材料 + 【n】空位 + A~O 词库 + 字母答案
      2026-11-05 新增。之前的协议只能出「散题卡片」，用户要十个空的完整文章时，
      AI 只能把文章塞正文、题拆成十张卡，做起来跟真题完全不是一回事。 */
  function normalizeCloze(raw) {
    var data;
    try { data = TW.ai.parseJson(raw); } catch (e) { return null; }
    if (!data) return null;
    var kind = String(data.setType || data.set_type || '').toLowerCase();
    if (kind !== 'cloze') return null;
    var body = (data.body || data.passage || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    if (!body.length) return null;
    /* 空号必须真的写在正文里，否则点不到空位，等于一道做不了的题 */
    var holes = {};
    body.forEach(function (p) {
      String(p).replace(/【(\d+)】/g, function (m, n) { holes[Number(n)] = 1; return m; });
    });
    /* 词库：兼容 "A. word" / {k,w} / 纯单词数组（按顺序补字母） */
    var bank = [], seenK = {};
    (data.bank || data.words || []).forEach(function (b) {
      var k = '', w = '';
      if (b && typeof b === 'object') { k = String(b.k || b.letter || '').toUpperCase(); w = String(b.w || b.word || ''); }
      else {
        var t = String(b || '').trim();
        var mm = /^([A-Oa-o])\s*[.、)．]\s*(.+)$/.exec(t);
        if (mm) { k = mm[1].toUpperCase(); w = mm[2].trim(); }
        else if (t) { k = String.fromCharCode(65 + bank.length); w = t; }
      }
      if (!k || !w || seenK[k]) return;
      seenK[k] = 1;
      bank.push({ k: k, w: w });
    });
    var list = data.exercises || data.items || data.questions || [];
    var out = [];
    list.forEach(function (q, qi) {
      if (!q || typeof q !== 'object') return;
      /* 模型常见两种写歪：① 漏了 n（按顺序给）；② answer 写成单词而不是字母。
         都就地纠正——按空号对齐这条铁律不变，纠不回来才丢。 */
      var n = Number(q.n != null ? q.n : q.no) || 0;
      if (!n && holes[qi + 1]) n = qi + 1;
      var rawAns = String(q.answer || q.a || '').trim();
      var ans = rawAns.toUpperCase();
      if (!/^[A-O]$/.test(ans) && rawAns) {
        var want = rawAns.toLowerCase();
        bank.forEach(function (b) { if (b.w.toLowerCase() === want) ans = b.k; });
      }
      if (!n || !holes[n] || !/^[A-O]$/.test(ans) || !seenK[ans]) return;
      var hit = '';
      bank.forEach(function (b) { if (b.k === ans) hit = b.w; });
      out.push({
        id: '', word: '', type: 'choice', n: n,
        question: '第 ' + n + ' 空', options: [],
        answer: ans, key: String(q.key || q.word || hit || ''),
        explanation: String(q.explanation || q.explain || '')
      });
    });
    if (out.length < 5) return null;
    out.sort(function (a, b) { return a.n - b.n; });
    return {
      cloze: { body: body.slice(0, 20), bank: bank, title: String(data.title || '').trim() },
      exercises: out
    };
  }

  /** 整篇仔细阅读 / 段落匹配（setType=reading|match）：一篇材料 + 一整套题
      reading：body 是文章段落，每题四选一；
      match：paras 是 A~O 十几段，每题答案是一个段落字母。 */
  function normalizePaper(raw) {
    var data;
    try { data = TW.ai.parseJson(raw); } catch (e) { return null; }
    if (!data) return null;
    var kind = String(data.setType || data.set_type || '').toLowerCase();
    if (kind !== 'reading' && kind !== 'match') return null;
    var title = String(data.title || '').trim();
    var heading = String(data.heading || '').trim();
    var body = (data.body || data.passage || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    var paras = [];
    (data.paras || data.paragraphs || []).forEach(function (p, i) {
      var k = String((p && p.k) || String.fromCharCode(65 + i)).toUpperCase();
      var text = String((p && (p.text || p.t)) || (typeof p === 'string' ? p : '')).trim();
      if (k && text) paras.push({ k: k, text: text });
    });
    /* 材料是这类题的地基：阅读没正文、匹配没段落，一律当废题 */
    if (kind === 'reading' && body.length < 2) return null;
    if (kind === 'match' && paras.length < 6) return null;

    var out = [];
    (data.exercises || data.items || data.questions || []).forEach(function (ex, i) {
      if (!ex || typeof ex !== 'object') return;
      var stem = String(ex.question || ex.stem || ex.q || '').trim();
      var ans = String(ex.answer || ex.a || '').trim();
      if (!stem || !ans) return;
      if (mostlyChinese(stem)) return;      // 题面必须英文，中文只进解析
      var exp = String(ex.explanation || ex.explain || ex.why || '').trim();
      if (kind === 'match') {
        var letter = ans.replace(/[^A-Oa-o]/g, '').toUpperCase();
        if (!paras.some(function (p) { return p.k === letter; })) return;
        out.push({
          id: '', word: '', type: 'match', question: stem, options: [],
          answer: letter, explanation: exp
        });
        return;
      }
      var opts = Array.isArray(ex.options) ? ex.options.map(function (o) {
        return String(o && typeof o === 'object' ? (o.t || o.text || o.label || '') : o)
          .replace(/^\s*[A-Da-d][.、)．]\s*/, '').trim();
      }).filter(Boolean) : [];
      if (opts.length < 3) return;
      var up = ans.toUpperCase();
      if (!/^[A-D]$/.test(up) || up.charCodeAt(0) - 65 >= opts.length) {
        /* 答案写成了选项原文：只要能在选项里唯一定位就换成字母，定位不到就丢 */
        var at = -1;
        opts.forEach(function (t, oi) { if (t.toLowerCase() === ans.toLowerCase()) at = oi; });
        if (at < 0) return;
        up = 'ABCD'.charAt(at);
      }
      out.push({
        id: '', word: '', type: 'choice', question: stem, options: opts,
        answer: up, explanation: exp
      });
    });
    if (out.length < (kind === 'match' ? 5 : 3)) return null;
    return {
      paper: { kind: kind, title: title, heading: heading, body: body, paras: paras },
      exercises: out.slice(0, 20)
    };
  }

  function quizBody(raw) {
    var data;
    try { data = TW.ai.parseJson(raw); } catch (e) { return []; }
    var b = data && (data.body || data.passage || data.material || data.text);
    var arr = Array.isArray(b) ? b : (typeof b === 'string' ? b.split(/\n\s*\n/) : []);
    return arr.map(function (x) { return String(x || '').trim(); }).filter(Boolean).slice(0, 20);
  }

  /** 消息完成后解析一次：把 quiz 块从正文摘掉，挂到 msg.quiz 上 */
  function parseMsg(m) {
    if (m._parsed || m.role !== 'assistant') return;
    m._parsed = true;
    var material = /```material\s*([\s\S]*?)```/i.exec(m.content);
    if (material) {
      try {
        var obj = TW.ai.parseJson(material[1]);
        if (!obj || ['writing', 'listening'].indexOf(obj.kind) < 0) throw new Error('无效类型');
        m.material = obj;
        m.content = (m.content.slice(0, material.index) + m.content.slice(material.index + material[0].length)).trim();
      } catch (e) { m.content += '\n\n（生成内容格式无效，请重新生成。）'; }
    }
    var sp = splitQuiz(m.content);
    if (sp.raw == null) return;
    m.content = sp.text;
    /* 先认「整套题」：选词填空 / 整篇阅读 / 段落匹配都没有独立题干，
       套用散题解析器会被当成废题全丢 */
    var cz = normalizeCloze(sp.raw) || normalizePaper(sp.raw);
    if (cz) {
      m.quiz = {
        exercises: cz.exercises, cloze: cz.cloze, paper: cz.paper, body: quizBody(sp.raw),
        answers: {}, graded: false, items: [], right: 0, acc: 0, pick: 0
      };
      return;
    }
    var list = normalizeExercises(sp.raw);
    if (list) m.quiz = { exercises: list, body: quizBody(sp.raw), answers: {}, graded: false, items: [], right: 0, acc: 0 };
    else m.content += '\n\n（这组练习没解析出来：题面要用英文、选项要写真实的英文单词而不是 A/B/C/D，' +
      '整套阅读/选词/匹配还得把材料放进 body 或 paras。可以让我重新出一遍。）';
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

  /** 整篇选词填空的卡片：正文就地挖空 + 词库点选，和真题板块的作答页同一套交互 */
  function clozeCard(m, mi) {
    var q = m.quiz;
    var cz = q.cloze;
    var idxByN = {};
    q.exercises.forEach(function (ex, i) { idxByN[ex.n] = i; });

    /* 正文：把【n】换成可点的空位；交卷后错的空紧跟一个绿色正确答案 */
    var mat = cz.body.map(function (p) {
      var html = esc(p).replace(/【(\d+)】/g, function (mt, ns) {
        var n = Number(ns);
        var i = idxByN[n];
        if (i == null) return mt;
        var mine = q.answers[i] || '';
        var cls = 'qz-blank';
        if (q.graded) cls += q.items[i] && q.items[i].ok ? ' ok' : ' err';
        else if (q.pick === i) cls += ' pick';
        else if (mine) cls += ' filled';
        var label = mine || String(n);
        return '<button type="button" class="' + cls + '" data-mi="' + mi + '" data-cz="' + i + '">' + esc(label) + '</button>' +
          (q.graded && !(q.items[i] && q.items[i].ok)
            ? '<span class="qz-fix">' + esc(q.exercises[i].answer) + '</span>' : '');
      });
      return '<p class="qz-p">' + html + '</p>';
    }).join('');

    /* 词库：已用过的标出来，并显示填在第几空 */
    var bank = cz.bank.map(function (b) {
      var usedBy = '';
      q.exercises.forEach(function (ex, i) { if (q.answers[i] === b.k) usedBy = ex.n; });
      var cls = 'qz-word' + (usedBy ? ' used' : '');
      if (q.graded && usedBy) {
        var ii = idxByN[usedBy];
        if (!(q.items[ii] && q.items[ii].ok)) cls += ' err';
      }
      return '<button type="button" class="' + cls + '" data-mi="' + mi + '" data-czb="' + b.k + '">' +
        '<i>' + b.k + '</i><span>' + esc(b.w) + '</span>' +
        (usedBy ? '<em>' + usedBy + '</em>' : '') + '</button>';
    }).join('');

    var done = 0;
    q.exercises.forEach(function (ex, i) { if (q.answers[i]) done++; });
    var tip = q.graded
      ? '<div class="qz-hint">' + (q.right === q.exercises.length
          ? '全对，这篇可以过了。'
          : '红色空位是错的，绿色小字是正确答案；下面是逐空解析。') + '</div>'
      : '<div class="qz-hint"><b>怎么答</b>：先在正文里点一个空位（会被高亮），再点下面词库里对应的词；' +
        '点已填的空位可以清掉重填。' +
        '<span class="qz-progress">已填 <b>' + done + '</b>/' + q.exercises.length + '</span></div>';

    /* 交卷后的逐空解析（题号 + 你填的 / 正确的 / 解析） */
    var detail = '';
    if (q.graded) {
      detail = '<div class="qz-qs">' + q.exercises.map(function (ex, i) {
        var ok = !!(q.items[i] && q.items[i].ok);
        var mine = q.answers[i] || '';
        var mineWord = '';
        cz.bank.forEach(function (b) { if (b.k === mine) mineWord = b.w; });
        var keyWord = '';
        cz.bank.forEach(function (b) { if (b.k === ex.answer) keyWord = b.w; });
        return '<div class="qz-q' + (ok ? ' ok' : ' err') + '">' +
          '<div class="qz-q-h"><span class="qz-q-no">' + ex.n + '</span>' +
          '<span class="' + (ok ? 'qz-ok' : 'qz-err') + '">' + (ok
            ? '✓ ' + esc(ex.answer + '. ' + keyWord)
            : '✗ 你填 ' + esc(mine ? mine + '. ' + mineWord : '（空）') + '，正确 ' + esc(ex.answer + '. ' + keyWord)) +
          '</span></div>' +
          '<div class="qz-exp-t">' + esc(ex.explanation || '（这空没有解析）') + '</div>' +
        '</div>';
      }).join('') + '</div>';
    }

    var head = '<div class="ai-quizbox-h"><span>整篇选词填空 · ' + q.exercises.length + ' 空</span>' +
      (q.graded ? '<span class="ai-score">答对 <b>' + q.right + '</b>/' + q.exercises.length + ' · ' + q.acc + '%</span>' : '') +
      '</div>';
    var foot = q.graded
      ? '<div class="ai-quizbox-f">' +
        '<button class="btn sm primary" data-mi="' + mi + '" data-act="review">让教练讲讲错题</button>' +
        '<button class="btn sm ghost" data-mi="' + mi + '" data-act="publish">发布到题目板块</button>' +
        '<span class="small muted">这类题不写单词记录，只计本次练习</span></div>'
      : '<div class="ai-quizbox-f"><button class="btn sm primary" data-mi="' + mi + '" data-act="grade">交卷判分</button>' +
        '<button class="btn sm ghost" data-mi="' + mi + '" data-act="publish">发布到题目板块</button>' +
        '<span class="small muted">这类题不写单词记录，只计本次练习</span></div>';

    return '<div class="ai-quizbox ai-cloze">' + head +
      (cz.title ? '<div class="ai-cloze-t">' + esc(cz.title) + '</div>' : '') +
      '<div class="qz-mat">' + mat + '</div>' +
      '<div class="qz-bank">' + bank + '</div>' +
      tip + detail + foot + '</div>';
  }

  /** 一组题卡的公共渲染：散题、整套阅读/匹配都用它，省得两套逻辑各改一遍 */
  function exList(q, mi) {
    return q.exercises.map(function (ex, i) {
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
      } else if (ex.type === 'match' && q.paper) {
        /* 段落匹配：选项就是段落字母，走同一条 .ai-opt 通路，点选与判分不用另写 */
        inner = '<div class="ai-opts ai-letters">' + q.paper.paras.map(function (x) {
          var sel2 = norm(q.answers[i]) === norm(x.k);
          var lcls = 'ai-opt' + (sel2 ? ' sel' : '');
          if (it) {
            if (norm(x.k) === norm(answerOf(ex))) lcls += ' ok';
            else if (sel2) lcls += ' err';
          }
          return '<button type="button" class="' + lcls + '" data-mi="' + mi + '" data-i="' + i +
            '" data-val="' + esc(x.k) + '"><i>' + esc(x.k) + '</i></button>';
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
  }

  /** 整篇阅读 / 段落匹配的卡片：材料在上、题在下，跟真题作答页一个顺序 */
  function paperCard(m, mi) {
    var q = m.quiz;
    var p = q.paper;
    var isMatch = p.kind === 'match';
    var mat = '';
    if (isMatch) {
      mat = (p.heading ? '<h3 class="qz-h3">' + esc(p.heading) + '</h3>' : '') +
        p.paras.map(function (x) {
          return '<p class="qz-p"><b class="qz-pl">' + esc(x.k) + ')</b>' + esc(x.text) + '</p>';
        }).join('');
    } else {
      mat = (p.heading ? '<h3 class="qz-h3">' + esc(p.heading) + '</h3>' : '') +
        p.body.map(function (x) { return '<p class="qz-p">' + esc(x) + '</p>'; }).join('');
    }
    var head = '<div class="ai-quizbox-h"><span>' +
      (isMatch ? '整篇段落匹配 · ' + q.exercises.length + ' 题'
               : '整篇仔细阅读 · ' + q.exercises.length + ' 题') + '</span>' +
      (q.graded ? '<span class="ai-score">答对 <b>' + q.right + '</b>/' + q.exercises.length +
        ' · ' + q.acc + '%</span>' : '') + '</div>';
    var foot = q.graded
      ? '<div class="ai-quizbox-f">' +
        '<button class="btn sm primary" data-mi="' + mi + '" data-act="review">让教练讲讲错题</button>' +
        '<button class="btn sm ghost" data-mi="' + mi + '" data-act="publish">发布到题目板块</button>' +
        '<span class="small muted">这类题只判分，不记单词</span></div>'
      : '<div class="ai-quizbox-f"><button class="btn sm primary" data-mi="' + mi + '" data-act="grade">交卷判分</button>' +
        '<button class="btn sm ghost" data-mi="' + mi + '" data-act="publish">发布到题目板块</button>' +
        '<span class="small muted">这类题只判分，不记单词</span></div>';
    return '<div class="ai-quizbox ai-paper">' + head +
      (p.title ? '<div class="ai-cloze-t">' + esc(p.title) + '</div>' : '') +
      '<div class="qz-mat">' + mat + '</div>' +
      '<div class="ai-qs">' + exList(q, mi) + '</div>' + foot + '</div>';
  }

  function quizCard(m, mi) {
    var q = m.quiz;
    if (!q) return '';
    if (q.cloze) return clozeCard(m, mi);
    if (q.paper) return paperCard(m, mi);
    var body = exList(q, mi);

    var head = '<div class="ai-quizbox-h"><span>练习 · ' + q.exercises.length + ' 题</span>' +
      (q.graded ? '<span class="ai-score">答对 <b>' + q.right + '</b>/' + q.exercises.length + ' · ' + q.acc + '%</span>' : '') +
      '</div>';

    /* 不带单词的通用题（仿真阅读/完形）：只判分，不写回单词记录，别让用户以为会计入 */
    var hasWord = q.exercises.some(function (ex) { return !!ex.word; });
    var hint = hasWord ? '判分结果会写回错词本和复习队列' : '这类题只判分，不计入单词记录';
    var foot = q.graded
      ? '<div class="ai-quizbox-f">' +
        '<button class="btn sm primary" data-mi="' + mi + '" data-act="review">让教练讲讲错题</button>' +
        '<button class="btn sm ghost" data-mi="' + mi + '" data-act="publish">发布到题目板块</button>' +
        '<span class="small muted">成绩已计入学习统计</span></div>'
      : '<div class="ai-quizbox-f"><button class="btn sm primary" data-mi="' + mi + '" data-act="grade">交卷判分</button>' +
        '<button class="btn sm ghost" data-mi="' + mi + '" data-act="publish">发布到题目板块</button>' +
        '<span class="small muted">' + hint + '</span></div>';

    return '<div class="ai-quizbox">' + head + body + foot + '</div>';
  }

  function renderMsg(m, mi) {
    if (m.role === 'user') {
      var chip = '';
      if (m.web === 'pending') chip = '<span class="ai-webchip">联网检索中…</span>';
      else if (m.web && m.web !== 'none') chip = '<span class="ai-webchip on">已联网检索 ' + esc(m.web) + '</span>';
      else if (m.web === 'none') chip = '<span class="ai-webchip">联网没搜到，按已有知识回答</span>';
      return '<div class="ai-row user"><div class="ai-col"><div class="ai-bubble">' + esc(m.content) +
        '</div>' + chip + '</div></div>';
    }
    return '<div class="ai-row assistant" data-mi="' + mi + '">' +
      '<div class="ai-ava">A</div>' +
      '<div class="ai-bubble"><div class="ai-md">' + TW.ai.md(m.content) + '</div>' + quizCard(m, mi) + (m.material ? '<div class="ai-quizbox"><div class="ai-quizbox-h">AI 原创' + (m.material.kind === 'writing' ? '写作' : '听力') + '练习 · ' + esc(m.material.title || '') + '</div><div class="ai-quizbox-f"><button class="btn sm primary" data-mi="' + mi + '" data-act="publish-material">发布到' + (m.material.kind === 'writing' ? '写作' : '听力') + '板块</button></div></div>' : '') + '</div>' +
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
          : (S.searching
              ? '<span class="ai-dots"><i></i><i></i><i></i></span>' +
                '<span class="ai-searching small muted">正在联网检索最新信息…</span>'
              : '<span class="ai-dots"><i></i><i></i><i></i></span>')) +
        '</div></div>';
    }
    if (S.err) {
      /* 报错旁边给一个「重试」：上游限流（1015）这类问题，等半分钟点一下就好，
         不用让用户把问题重新打一遍 */
      var canRetry = S.messages.length && S.messages[S.messages.length - 1].role === 'user' && !S.busy;
      html += '<div class="ai-err"><span class="ai-err-tx">' + esc(S.err) + '</span>' +
        (canRetry ? '<button type="button" class="btn sm ghost" id="ai-retry">重试</button>' : '') +
      '</div>';
    }
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

  /* 模型选择：默认从该 Key 的 /models 拉列表来选，不让人手打模型名。
     少数自建接口没实现 /models，留「手动填写」兜底（不然那类用户直接卡死）。 */
  function modelField(p) {
    var list = (S.models && S.models.length) ? S.models : TW.ai.cachedModels();
    var cur = TW.ai.modelName();
    var fetching = S.busy === 'models';
    var c = TW.ai.config();
    var canFetch = TW.ai.apiKey().length >= 8 || (c.provider === 'custom' && !!TW.ai.baseUrl());

    if (S.manual) {
      return '<label class="ai-fl"><span>模型（手动填写）</span>' +
        '<div class="ai-model-row">' +
          '<input class="field" id="ai-model" type="text" autocomplete="off" spellcheck="false" ' +
            'placeholder="' + esc(p.model || '例如 qwen-plus') + '" value="' + esc(cur) + '">' +
          '<button type="button" class="btn sm ghost" id="ai-model-modes">从列表选</button>' +
        '</div>' +
        '<span class="small muted">接口没实现 /models 时才需要手填</span>' +
      '</label>';
    }

    if (!list.length) {
      return '<label class="ai-fl"><span>模型</span>' +
        '<div class="ai-model-row">' +
          '<button type="button" class="btn" id="ai-model-fetch"' + (fetching ? ' disabled' : '') + '>' +
            TW.icon('refresh', 15) + ' ' + (fetching ? '获取中…' : (canFetch ? '获取模型列表' : '先填 Key，再获取模型')) +
          '</button>' +
          '<button type="button" class="btn ghost sm" id="ai-model-manual">手动填写</button>' +
        '</div>' +
        (S.modelErr ? '<span class="small" style="color:var(--err);line-height:1.6">' + esc(S.modelErr) + '</span>'
                    : '<span class="small muted">填好 Key 后点一下，直接从该账号可用的模型里选</span>') +
      '</label>';
    }

    var opts = list.map(function (id) {
      return '<option value="' + esc(id) + '"' + (id === cur ? ' selected' : '') + '>' + esc(id) + '</option>';
    }).join('');
    if (cur && list.indexOf(cur) < 0) {
      opts = '<option value="' + esc(cur) + '" selected>' + esc(cur) + '（当前）</option>' + opts;
    }
    return '<label class="ai-fl"><span>模型</span>' +
      '<div class="ai-model-row">' +
        '<select class="field" id="ai-model-select">' + opts + '</select>' +
        '<button type="button" class="btn ghost sm" id="ai-model-fetch"' + (fetching ? ' disabled' : '') + '>' +
          TW.icon('refresh', 14) + ' ' + (fetching ? '刷新中…' : '刷新') + '</button>' +
        '<button type="button" class="btn ghost sm" id="ai-model-manual">手动填写</button>' +
      '</div>' +
      '<span class="small muted">列表来自 ' + esc(p.name) + ' 的 /models，共 ' + list.length + ' 个' +
        (S.modelErr ? '（刷新失败：' + esc(S.modelErr) + '）' : '') + '</span>' +
    '</label>';
  }

  function setupCard() {
    var c = TW.ai.config();
    var p = TW.ai.provider(c.provider);
    var isCustom = c.provider === 'custom';
    return '<div class="card card-pad ai-setup">' +
      '<div class="card-title" style="margin-bottom:.35rem">先接入一个模型</div>' +
      '<div class="set-hint" style="margin-bottom:.9rem">API Key 只保存在这台设备的浏览器里，' +
        '不会进云端同步、也不会出现在导出备份里。内置提供方经本站 Worker 转发一次（不落库、不记日志）；' +
        '自定义接口默认由浏览器直连。' +
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
        (isCustom ?
          '<label class="ai-fl"><span>接口地址</span>' +
            '<input class="field" id="ai-base" type="text" autocomplete="off" spellcheck="false" ' +
              'placeholder="https://xxx/v1 或 http://127.0.0.1:11434/v1" value="' + esc(c.baseUrl) + '"></label>' +
          '<label class="ai-fl"><span>连接方式</span>' +
            '<div class="seg" id="ai-via" style="justify-self:start">' +
              '<button type="button" data-via="direct" class="' +
                (TW.ai.via() === 'direct' ? 'active' : '') + '">浏览器直连</button>' +
              '<button type="button" data-via="auto" class="' +
                (TW.ai.via() === 'auto' ? 'active' : '') + '">失败转后端</button>' +
            '</div></label>' +
          '<div class="set-hint" style="margin:0 0 .35rem">' +
            '直连＝请求从你的浏览器直接发给该接口；被上游限流（1015/429）时只在同一通道重试，' +
            '不会偷偷绕到后端 —— 后端的出口 IP 是共享的，反而更容易被限。' +
          '</div>'
          : '') +
        modelField(p) +
      '</div>' +
      '<div class="row" style="margin-top:.9rem">' +
        '<button class="btn primary" id="ai-save-test"' + (S.busy === 'test' ? ' disabled' : '') + '>' +
          (S.busy === 'test' ? '测试中…' : '保存并开始') + '</button>' +
        '<span class="small muted">会发一句「只回复 ok」验证连通性</span>' +
      '</div>' +
      (S.err ? '<div class="ai-err">' + esc(S.err) + '</div>' : '') +
    '</div>';
  }

  /** 拉模型列表：成功后若当前模型不在列表里，自动切到第一个，免得「选了 Key 却没有模型」 */
  function fetchModels() {
    if (S.busy === 'models') return;
    S.modelErr = '';
    S.busy = 'models';
    redraw();
    TW.ai.listModels(true).then(function (list) {
      S.busy = '';
      S.models = list;
      if (list.indexOf(TW.ai.modelName()) < 0) TW.ai.setModel(list[0]);
      redraw();
    }, function (e) {
      S.busy = '';
      S.modelErr = (e && e.message) || '获取模型列表失败';
      redraw();
    });
  }

  /** 重渲染并保住 Key 输入框的焦点/光标（用户在敲 Key 时会被上面几次 render 打断） */
  function redraw() {
    if (!HOST) return;
    var active = document.activeElement;
    var keep = active && active.id === 'ai-key' ? active.selectionStart : -1;
    render(HOST);
    if (keep >= 0) {
      var k = TW.$('#ai-key', HOST);
      if (k) {
        k.focus();
        try { k.setSelectionRange(keep, keep); } catch (e) {}
      }
    }
  }

  function shell() {
    var p = TW.ai.provider(TW.ai.config().provider);
    return '<div class="ai-layout">' +
      '<div class="ai-shell">' +
        '<div class="ai-bar">' +
          '<div class="ai-bar-l"><span class="ai-bar-ava">A</span>' +
            '<div><b>AI 英语教练</b><span class="small muted">' + esc(p.name) + ' · ' + esc(TW.ai.modelName()) + '</span></div>' +
          '</div>' +
          '<div class="ai-bar-r">' +
            '<button class="btn ghost sm" id="ai-hist-btn">' + TW.icon('list', 14) + ' 历史</button>' +
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
            '<button type="button" class="ai-toggle ai-web-toggle' + (S.webOn ? ' on' : '') + '" id="ai-web">' +
              TW.icon('search', 13) + ' 联网检索' + (S.webOn ? '：开' : '：关') + '</button>' +
          '</div>' +
          '<div class="ai-inwrap">' +
            '<textarea id="ai-input" class="ai-textarea" rows="1" placeholder="问点什么，或说「按我的错词出 8 道题」"></textarea>' +
            '<button class="ai-send" id="ai-send" title="发送">' + TW.icon('arrowRight', 18) + '</button>' +
          '</div>' +
          '<div class="ai-hint small muted">Enter 发送 · Shift + Enter 换行 · 问到最新的事会自动联网检索</div>' +
        '</div>' +
      '</div>' +
      '<aside class="ai-rail" id="ai-rail">' + railHtml() + '</aside>' +
      (S.histOpen ? '<div class="ai-hist" id="ai-hist"><div class="ai-hist-in">' +
        '<div class="ai-hist-head"><b>历史对话（' + S.threads.length + '）</b>' +
          '<button class="icon-btn" id="ai-hist-close" aria-label="关闭">' + TW.icon('x', 16) + '</button></div>' +
        '<div class="ai-hist-body">' + histHtml(true) + '</div>' +
      '</div></div>' : '') +
    '</div>';
  }

  /* ---------------- 右栏：历史对话 + 题目板块 ---------------- */

  function relTime(ts) {
    var d = Date.now() - (ts || 0);
    if (d < 60 * 1000) return '刚刚';
    if (d < 3600 * 1000) return Math.round(d / 60000) + ' 分钟前';
    if (d < 86400 * 1000) return Math.round(d / 3600000) + ' 小时前';
    if (d < 7 * 86400 * 1000) return Math.round(d / 86400000) + ' 天前';
    var dt = new Date(ts || 0);
    return (dt.getMonth() + 1) + '月' + dt.getDate() + '日';
  }

  function histHtml(full) {
    var list = S.threads || [];
    if (!list.length) return '<div class="ai-th-empty small muted">还没有历史对话。<br>聊完会自动存下来，换设备前也可以先在这里翻。</div>';
    var pick = full ? list : list.slice(0, 5);
    return pick.map(function (t) {
      var on = t.id === S.threadId;
      return '<div class="ai-th' + (on ? ' on' : '') + '" data-thread="' + esc(t.id) + '">' +
        '<div class="ai-th-main"><b>' + esc(t.title) + '</b>' +
          '<span>' + relTime(t.ts) + ' · ' + (t.messages || []).length + ' 条</span></div>' +
        '<button class="ai-th-x" data-del="' + esc(t.id) + '" title="删除这条对话">' + TW.icon('x', 13) + '</button>' +
      '</div>';
    }).join('');
  }

  function railHtml() {
    var sum = TW.quiz ? TW.quiz.summary() : { sets: 0, done: 0, acc: 0, published: 0 };
    var pub = TW.quiz ? TW.quiz.published().slice(0, 3) : [];
    var pubItems = pub.map(function (p) {
      return '<a class="ai-rail-item" href="#/quiz?set=' + encodeURIComponent(p.id) + '">' +
        '<b>' + esc(p.title) + '</b><span>' + (p.questions || []).length + ' 题 · ' + relTime(p.ts) + '</span></a>';
    }).join('');
    return '<div class="ai-rail-sec">' +
        '<div class="ai-rail-h"><span>历史对话</span>' +
          '<button class="ai-rail-more" id="ai-rail-more" data-hist="1">全部</button></div>' +
        '<div class="ai-th-list">' + histHtml(false) + '</div>' +
        '<button class="btn ghost sm ai-rail-new" data-newthread="1">' + TW.icon('play', 13) + ' 开新对话</button>' +
      '</div>' +
      '<div class="ai-rail-sec">' +
        '<div class="ai-rail-h"><span>题目板块</span>' +
          '<a class="ai-rail-more" href="#/quiz">全部 →</a></div>' +
        '<div class="ai-rail-stat small muted">题库 <b>' + sum.sets + '</b> 组 · 已做 <b>' + sum.done +
          '</b> · 正确率 <b>' + sum.acc + '%</b></div>' +
        (pubItems || '<div class="small muted" style="margin:.3rem 0 .5rem">在聊天里让它出题，判分后点「发布到题目板块」，' +
          '这组题就会固定下来，随时能重做。</div>') +
        '<a class="btn sm ai-rail-btn" href="#/quiz">' + TW.icon('quiz', 14) + ' 去做题</a>' +
      '</div>';
  }

  /** 只重画右栏与历史面板：整页 render 会打断正在输入的草稿焦点 */
  function paintRail() {
    var rail = TW.$('#ai-rail');
    if (rail) rail.innerHTML = railHtml();
    var body = TW.$('.ai-hist-body');
    if (body) body.innerHTML = histHtml(true);
    var head = TW.$('.ai-hist-head b');
    if (head) head.textContent = '历史对话（' + (S.threads || []).length + '）';
  }

  function persist() {
    if (!S.messages.length) return;
    if (!S.threadId) S.threadId = TW.ai.newThreadId();
    TW.ai.saveThread({ id: S.threadId, messages: S.messages });
    S.threads = TW.ai.listThreads();
    paintRail();
  }

  function loadThread(id) {
    var t = TW.ai.getThread(id);
    if (!t) { TW.toast('这条对话找不到了'); return; }
    if (S.busy && S.ctrl) S.ctrl.abort();
    S.threadId = t.id;
    S.messages = (t.messages || []).map(function (m) {
      var o = { role: m.role, content: m.content };
      if (m.quiz) { o.quiz = m.quiz; o._parsed = true; }
      if (m.material) { o.material = m.material; o._parsed = true; }
      if (m.web) o.web = m.web;
      return o;
    });
    S.err = ''; S.streamText = ''; S.busy = false; S.searching = false;
    S.stick = true; S.histOpen = false;
    render(HOST);
  }

  function startNewThread() {
    persist();
    if (S.busy && S.ctrl) S.ctrl.abort();
    S.threadId = '';
    S.messages = [];
    S.err = ''; S.streamText = ''; S.busy = false; S.searching = false;
    S.stick = true; S.histOpen = false;
    render(HOST);
    var inp = TW.$('#ai-input');
    if (inp) inp.focus();
  }

  /* ---------------- 交互 ---------------- */

  function render(host) {
    HOST = host;
    S.threads = TW.ai.listThreads();
    /* configured() 在「Key + 默认模型」齐了就算通，但那一刻用户还在配置卡上选模型，
       不能直接把人踢进聊天页 —— 所以未配置过的人必须先点「保存并开始」。 */
    if (!TW.ai.configured()) S.entered = false;
    var ok = TW.ai.configured() && S.entered !== false;
    host.innerHTML = '<div class="wrap">' +
      TW.ui.pageHead('AI 英语助手', ok ? '聊天式教练：读你的数据、出题、讲单词' : '先填一个自己的 API Key（只存本机）',
        '<a class="btn ghost" href="#/settings">' + TW.icon('settings', 15) + ' 模型设置</a>') +
      (ok ? shell() : setupCard()) +
    '</div>';

    bind(host, ok);
    if (ok) { paintMsgs(); scrollBottom(true); }
    else if (!S.autoModelTried && !S.manual && !TW.ai.cachedModels().length &&
             (TW.ai.apiKey().length >= 8 || (TW.ai.config().provider === 'custom' && !!TW.ai.baseUrl()))) {
      /* Key 已经有了（多半是从设置页填的）→ 自动拉一次，省得用户再点一下 */
      S.autoModelTried = true;
      fetchModels();
    }
  }

  function bind(host, ok) {
    /* ---- 配置卡 ---- */
    TW.$$('.ai-prov-btn', host).forEach(function (b) {
      b.addEventListener('click', function () {
        TW.ai.setProvider(b.dataset.prov);
        S.err = '';
        S.models = [];        // 换 provider 后旧列表（别的家的模型名）必须作废
        S.modelErr = '';
        S.autoModelTried = false;
        render(host);
      });
    });
    var saveTest = TW.$('#ai-save-test', host);
    if (saveTest) {
      var keyEl = TW.$('#ai-key', host);
      var modelEl = TW.$('#ai-model', host);          // 手动模式下的输入框
      var modelSel = TW.$('#ai-model-select', host);  // 列表模式下的下拉
      var baseEl = TW.$('#ai-base', host);
      var fetchBtn = TW.$('#ai-model-fetch', host);

      /* 改 Key / 接口地址后旧模型列表不再可信：清空并按需重新拉一次。
         注意监听 input 而不只是 change —— ① 用户**粘贴** Key 就应立刻拿到模型列表，
         不必再点一次按钮；② 自动化测试（Playwright fill）只派发 input，不派发 change。 */
      function syncKey() {
        var v = keyEl.value.trim();
        var changed = v !== TW.ai.apiKey();
        if (changed) {
          TW.ai.setKey(v);
          S.models = []; S.modelErr = ''; S.autoModelTried = true;
        }
        if (keyTimer) { clearTimeout(keyTimer); keyTimer = null; }
        if (S.manual) return;                  // 手动模式下别偷偷发请求
        var ready = v.length >= 8 || (TW.ai.config().provider === 'custom' && TW.ai.baseUrl());
        if (!ready) return;                    // 太短就等，别拿半个 Key 去打接口
        if (!changed && TW.ai.cachedModels().length) return;   // 列表还有效，不用重拉
        /* 停顿 420ms 再拉，免得逐字符敲 Key 时打出一串请求 */
        keyTimer = setTimeout(function () { keyTimer = null; fetchModels(); }, 420);
      }
      if (keyEl) {
        keyEl.addEventListener('input', syncKey);
        keyEl.addEventListener('change', syncKey);
      }
      if (baseEl) baseEl.addEventListener('change', function () {
        TW.ai.save({ baseUrl: baseEl.value.trim() });
        S.models = []; S.modelErr = '';
        render(host);
      });
      if (modelEl) modelEl.addEventListener('change', function () { TW.ai.setModel(modelEl.value.trim()); });
      if (modelSel) modelSel.addEventListener('change', function () { TW.ai.setModel(modelSel.value); });

      /* 连接方式：直连 / 失败转后端。改了就地翻高亮，不重渲染（别把 Key 输入框打断） */
      var viaEl = TW.$('#ai-via', host);
      if (viaEl) viaEl.addEventListener('click', function (ev) {
        var btn = ev.target.closest('button[data-via]');
        if (!btn) return;
        TW.ai.setVia(btn.getAttribute('data-via'));
        Array.prototype.forEach.call(viaEl.querySelectorAll('button'), function (b) {
          b.classList.toggle('active', b === btn);
        });
      });

      if (fetchBtn) fetchBtn.addEventListener('click', function () {
        /* 先把输入框里的 Key / 地址落库，否则拉的是上一次保存的凭据 */
        if (keyEl) TW.ai.setKey(keyEl.value.trim());
        if (baseEl) TW.ai.save({ baseUrl: baseEl.value.trim() });
        fetchModels();
      });
      var manualBtn = TW.$('#ai-model-manual', host);
      if (manualBtn) manualBtn.addEventListener('click', function () {
        S.manual = true; S.modelErr = ''; render(host);
      });
      var modesBtn = TW.$('#ai-model-modes', host);
      if (modesBtn) modesBtn.addEventListener('click', function () {
        S.manual = false; render(host);
        if (!TW.ai.cachedModels().length) fetchModels();
      });

      saveTest.addEventListener('click', function () {
        if (keyEl) TW.ai.setKey(keyEl.value.trim());
        if (baseEl) TW.ai.save({ baseUrl: baseEl.value.trim() });
        if (modelEl) TW.ai.setModel(modelEl.value.trim());
        if (modelSel) TW.ai.setModel(modelSel.value);
        S.err = ''; S.busy = 'test';
        render(host);
        TW.ai.chat({
          system: '你是一个连通性测试助手。',
          messages: [{ role: 'user', content: '只回复 ok' }],
          maxTokens: 16, temperature: 0
        }).then(function (r) {
          S.busy = '';
          S.entered = true;
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
    if (nb) nb.addEventListener('click', startNewThread);

    var hb = TW.$('#ai-hist-btn', host);
    if (hb) hb.addEventListener('click', function () { S.histOpen = !S.histOpen; render(host); });

    /* ---- 右栏：历史对话 / 题目板块（内容会重绘，监听挂在容器上） ---- */
    var rail = TW.$('#ai-rail', host);
    if (rail) rail.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del) {
        e.stopPropagation();
        var id = del.dataset.del;
        if (!window.confirm('删除这条对话？删了就找不回来了。')) return;
        TW.ai.removeThread(id);
        if (id === S.threadId) { S.threadId = ''; S.messages = []; }
        S.threads = TW.ai.listThreads();
        paintRail();
        paintMsgs();
        return;
      }
      if (e.target.closest('[data-newthread]')) { startNewThread(); return; }
      if (e.target.closest('[data-hist]')) { S.histOpen = true; render(host); return; }
      var th = e.target.closest('[data-thread]');
      if (th) loadThread(th.dataset.thread);
    });

    var panel = TW.$('#ai-hist', host);
    if (panel) {
      panel.addEventListener('click', function (e) {
        if (e.target === panel || e.target.closest('#ai-hist-close')) { S.histOpen = false; render(host); return; }
        var del = e.target.closest('[data-del]');
        if (del) {
          e.stopPropagation();
          if (!window.confirm('删除这条对话？删了就找不回来了。')) return;
          TW.ai.removeThread(del.dataset.del);
          if (del.dataset.del === S.threadId) { S.threadId = ''; S.messages = []; }
          S.threads = TW.ai.listThreads();
          paintRail();
          render(host);
          return;
        }
        var th = e.target.closest('[data-thread]');
        if (th) loadThread(th.dataset.thread);
      });
    }

    var web = TW.$('#ai-web', host);
    if (web) web.addEventListener('click', function () {
      S.webOn = !S.webOn;
      web.classList.toggle('on', S.webOn);
      web.innerHTML = TW.icon('search', 13) + ' 联网检索' + (S.webOn ? '：开' : '：关');
      TW.toast(S.webOn ? '联网检索已开：问到最新的事会先去搜' : '联网检索已关：只用模型自己的知识', S.webOn ? 'ok' : '');
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
        var rt = e.target.closest('#ai-retry');
        if (rt) { retryLast(); return; }
        var sug = e.target.closest('.ai-sug[data-prompt]');
        if (sug) {
          if (!S.busy) sendText(sug.dataset.prompt);
          return;
        }
        /* 整篇选词填空：点空位选中/清空，点词库把词填进当前空位 */
        var blk = e.target.closest('.qz-blank[data-mi]');
        if (blk) {
          var bmi = parseInt(blk.dataset.mi, 10);
          var bmm = S.messages[bmi];
          if (!bmm || !bmm.quiz || !bmm.quiz.cloze || bmm.quiz.graded) return;
          var bi = parseInt(blk.dataset.cz, 10);
          if (bmm.quiz.answers[bi]) delete bmm.quiz.answers[bi];
          else bmm.quiz.pick = bi;
          paintMsgs();
          return;
        }
        var wd = e.target.closest('.qz-word[data-mi]');
        if (wd) {
          var wmi = parseInt(wd.dataset.mi, 10);
          var wmm = S.messages[wmi];
          if (!wmm || !wmm.quiz || !wmm.quiz.cloze || wmm.quiz.graded) return;
          var k = wd.dataset.czb;
          var qq = wmm.quiz;
          var target = -1;
          if (qq.pick != null && !qq.answers[qq.pick]) target = qq.pick;
          if (target < 0) {
            for (var z = 0; z < qq.exercises.length; z++) {
              if (!qq.answers[z]) { target = z; break; }
            }
          }
          if (target < 0) { TW.toast('十个空都填满了，点空位可以改'); return; }
          /* 同一个词已经填在别的空里：先把它从那个空里撤掉，避免一词两用 */
          Object.keys(qq.answers).forEach(function (n2) {
            if (qq.answers[n2] === k) delete qq.answers[n2];
          });
          qq.answers[target] = k;
          var nxt = -1;
          for (var z2 = target + 1; z2 < qq.exercises.length; z2++) {
            if (!qq.answers[z2]) { nxt = z2; break; }
          }
          qq.pick = nxt;
          paintMsgs();
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
        else if (btn.dataset.act === 'publish') publishQuiz(mi2, box);
        else if (btn.dataset.act === 'publish-material') {
          var message = S.messages[mi2];
          if (!message || !message.material) return;
          try { TW.aiMaterials.save(message.material); TW.toast('已保存到' + (message.material.kind === 'writing' ? '写作' : '听力') + '板块', 'ok'); btn.disabled = true; btn.textContent = '已保存'; }
          catch (error) { TW.toast(error.message || '保存失败，请重试', 'err'); }
        }
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

  function sendText(text, opts) {
    text = String(text || '').trim();
    if (!text || S.busy) return;
    /* 联网判定：开关开着、并且问的是「最新/时间/政策」这类才去搜（见 TW.ai.needsWeb）。
       搜不到也照常发——模型手里有 system 里的约束，不会再说「我无法联网」。 */
    var wantWeb = (opts && typeof opts.web === 'boolean') ? opts.web : (S.webOn && TW.ai.needsWeb(text));
    S.messages.push({ role: 'user', content: text, web: wantWeb ? 'pending' : '' });
    S.draft = '';
    var inp = TW.$('#ai-input');
    if (inp) { inp.value = ''; autoGrow(inp); }
    S.busy = true; S.streamText = ''; S.err = ''; S.stick = true; S.searching = !!wantWeb;
    var bar = TW.$('#ai-send');
    if (bar) bar.classList.add('stop');
    paintMsgs();
    scrollBottom(true);
    persist();       // 用户这句先落盘：万一关掉页面，至少问题还在历史里

    var go = function (searchPack) {
      S.searching = false;
      S.ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var lastPaint = 0;
      TW.ai.streamChat({
        system: buildSystem(searchPack, text),
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
        S.err = explain(e && e.message ? e.message : '请求失败');
        if (S.err.indexOf('还没配置') >= 0) S.err += '，去「设置」填一下。';
        S.streamText = '';
        var b = TW.$('#ai-send'); if (b) b.classList.remove('stop');
        paintMsgs();
      });
    };

    if (!wantWeb) { go(null); return; }
    TW.ai.searchWeb(text).then(function (pack) {
      var last = S.messages[S.messages.length - 1];
      if (last && last.role === 'user') {
        last.web = pack.results.length ? (pack.results.length + ' 条') : 'none';
      }
      S.lastSearch = pack;
      go(pack);
    });
  }

  /** 把人话补在报错后面：1015/1020 是上游 Cloudflare 的限流页，看着像「我们坏了」，其实不是 */
  function explain(msg) {
    var s = String(msg || '');
    if (/1015|1020|1010/.test(s)) {
      return s + '\n（模型服务的 Cloudflare 限流或拦截，请稍后再试；持续出现可联系模型服务商或更换可用接口。）';
    }
    if (/429|rate limit|too many requests/i.test(s)) {
      return s + '\n（上游限流：等一会儿再点「重试」）';
    }
    return s;
  }

  /** 重试上一次提问：把那条用户消息从历史里拿出来重发（上游限流时等一会儿点一下就行） */
  function retryLast() {
    if (S.busy || !S.messages.length) return;
    var last = S.messages[S.messages.length - 1];
    if (!last || last.role !== 'user') return;
    S.err = '';
    S.messages.pop();
    sendText(last.content);
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
    persist();
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
    var detail = [];
    q.exercises.forEach(function (ex, i) {
      var id = ex.id || wmap[String(ex.word || '').toLowerCase()];
      if (!id) return;
      var w = TW.data.byId ? TW.data.byId(id) : null;
      var word = ex.word || (w && w.word) || '';
      if (!word) return;
      var src = (w && w.book) || '';
      var brief = (w && TW.data.brief) ? TW.data.brief(w) : '';
      detail.push({ id: id, word: word, ok: q.items[i].ok ? 1 : 0 });
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
        wrong: q.exercises.length - right, acc: q.acc,
        detail: detail
      });
    } catch (e) {}

    S.messages[mi] = m;
    paintMsgs();
    TW.toast('这组题 ' + q.acc + '%', q.acc >= 60 ? 'ok' : '');
  }

  /** 把这一组 AI 出的题固定到「题目板块」，之后可以反复练（离线也能做） */
  function publishQuiz(mi) {
    var m = S.messages[mi];
    if (!m || !m.quiz) return;
    if (!TW.quiz) { TW.toast('题目板块没加载成功，刷新一下试试'); return; }
    var n = m.quiz.exercises.length;
    var d = new Date();
    /* 材料优先用 quiz 块里的 body（真正的原文）；没有才退回正文段落。
       之前一律用正文，结果仿完形/仿阅读发布出去只剩一句「这套题仿照…」，看着就是「没材料」。 */
    var passage = (m.quiz.body && m.quiz.body.length)
      ? m.quiz.body.slice(0, 20)
      : String(m.content || '').slice(0, 12000).split(/\n\s*\n/).filter(Boolean);
    var rec = null;
    if (m.quiz.cloze) {
      /* 整篇选词填空：直接按 cloze 结构发布，题目板块里就成了原生「选词填空」套题 */
      var cz = m.quiz.cloze;
      rec = TW.quiz.publish({
        kind: 'cloze',
        title: cz.title || ('AI 出题 · 选词填空 ' + m.quiz.exercises.length + ' 空'),
        body: cz.body,
        bank: cz.bank,
        questions: m.quiz.exercises.map(function (ex) {
          return { n: ex.n, answer: ex.answer, key: ex.key, explain: ex.explanation };
        })
      });
    } else if (m.quiz.paper) {
      /* 整篇阅读 / 段落匹配：材料跟题一起发，题目板块按原生 type 存 */
      var pp = m.quiz.paper;
      rec = TW.quiz.publish({
        kind: pp.kind,
        title: pp.title || ('AI 出题 · ' + (pp.kind === 'match' ? '段落匹配' : '仔细阅读')),
        heading: pp.heading,
        body: pp.body,
        paras: pp.paras,
        exercises: m.quiz.exercises.map(function (ex) {
          return { question: ex.question, options: ex.options, answer: ex.answer, explanation: ex.explanation };
        })
      });
    } else {
      rec = TW.quiz.publish({
        exercises: m.quiz.exercises,
        body: passage,
        title: 'AI 出题 · ' + (d.getMonth() + 1) + '/' + d.getDate() + ' · ' + n + ' 题'
      });
    }
    if (!rec) { TW.toast('这组题没有可用题目'); return; }
    TW.toast('已发布到题目板块', 'ok');
    paintRail();
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
    var lines;
    if (q.cloze) {
      /* 选词填空要带上词库里的词，否则光看字母教练也没法讲 */
      var wordOf = {};
      q.cloze.bank.forEach(function (b) { wordOf[b.k] = b.w; });
      lines = wrongs.map(function (ex) {
        var idx = q.exercises.indexOf(ex);
        var my = q.answers[idx] || '（空）';
        return '- 第 ' + ex.n + ' 空｜我填：' + (my === '（空）' ? my : my + '. ' + (wordOf[my] || '')) +
          '｜正确：' + ex.answer + '. ' + (wordOf[ex.answer] || ex.key || '') +
          '｜题目解析：' + (ex.explanation || '无');
      }).join('\n');
    } else {
      lines = wrongs.map(function (ex) {
        var idx = q.exercises.indexOf(ex);
        var my = q.answers[idx] || '（空）';
        return '- ' + ex.word + '｜题目：' + ex.question + '｜我的答案：' + my +
          '｜正确答案：' + answerOf(ex);
      }).join('\n');
    }
    sendText('这组练习我错了 ' + wrongs.length + ' 个，帮我讲一下错在哪、怎么记：\n' + lines);
  }

  TW.views.ai = { render: render };
})();
