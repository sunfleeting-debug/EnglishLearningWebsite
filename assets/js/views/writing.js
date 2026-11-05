/* 写作板块：翻译（汉译英）+ 作文，主观题用 AI 当阅卷老师
   ------------------------------------------------------------------
   sunfleeting 2026-11-04：「搞一些翻译练习，写作文，这种主观的……让 AI 去打分，
   并且给出参考答案，并且还可以让 AI 生成三个候选答案」。
   所以这一页有三层：
     ① 离线也能用 —— 题目、写作要点、参考译文/范文都在 data/writing.js 里；
     ② 自评 —— 字数、句子数、常用连接词统计，帮你在没 Key 时也看得出来写得怎么样；
     ③ AI 批改 —— 复用 /api/ai/chat 流式，回复末尾附 ```grade JSON（分数/分项/问题/改写/三个候选）。
   草稿与批改记录存独立键 typingcet.write.v1（和 AI 的 Key、题目记录一样故意不进 store.state，
   免得云同步把纯本地的写作记录带上）。
*/
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  var KEY = 'typingcet.write.v1';
  var DB = { drafts: {}, results: {} };
  var S = { id: '', busy: false, streamText: '', err: '', tab: 0, showTips: false, sample: false };
  var personalHost = null, personalQuery = null;
  window.addEventListener('tw-personal-quiz-change', function () {
    if (!personalHost || !personalHost.isConnected || !/^#\/writing(?:\?|$)/.test(window.location.hash)) return;
    if (personalQuery && personalQuery.id) { if (get(personalQuery.id)) renderItem(personalHost, personalQuery.id); }
    else renderList(personalHost);
  });

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        DB.drafts = o.drafts || {};
        DB.results = o.results || {};
      }
    } catch (e) { /* 读不出来就当空的，别把整页搞挂 */ }
  }
  function write() {
    try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { /* 存不下就先这样 */ }
  }
  read();

  function items() { return ((window.TW_WRITING && window.TW_WRITING.items) || []).concat(TW.aiMaterials ? TW.aiMaterials.list('writing') : [], TW.personalMaterials ? TW.personalMaterials.writingItems() : []); }
  function get(id) {
    var l = items();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function esc(s) { return TW.esc(s); }

  /* 英文词数：按空白切，去掉纯标点 */
  function wordCount(t) {
    var m = String(t || '').trim().match(/[A-Za-z][A-Za-z'’-]*/g);
    return m ? m.length : 0;
  }

  /* ---------------- 列表 ---------------- */

  function card(it) {
    var r = DB.results[it.id];
    var draft = DB.drafts[it.id] || '';
    return '<a class="wr-card" href="#/writing?id=' + encodeURIComponent(it.id) + '">' +
      '<div class="wr-card-h">' +
        '<span class="tag qz">' + (it.type === 'trans' ? '翻译' : '作文') + '</span>' +
        '<span class="small muted">' + esc(it.sub) + '</span>' +
        (r && r.score != null ? '<span class="tag ' + (r.score >= r.max * 0.8 ? 'ok' : r.score >= r.max * 0.6 ? '' : 'err') +
          '">上次 ' + r.score + '/' + r.max + '</span>' : '') +
      '</div>' +
      '<div class="wr-card-t">' + esc(it.title) + '</div>' +
      '<div class="wr-card-m small muted">' + (it.type === 'trans' ? '汉译英' : '150–200 词') + ' · 建议 ' +
        (it.minutes || 30) + ' 分钟' + (draft ? ' · 有草稿' : '') + '</div>' +
    '</a>';
  }

  function renderList(host) {
    var l = items();
    var done = 0, sum = 0, n = 0;
    l.forEach(function (it) {
      var r = DB.results[it.id];
      if (r && r.score != null) { done++; sum += r.score; n++; }
    });
    var groups = { trans: [], essay: [] };
    l.forEach(function (it) { (groups[it.type] || groups.essay).push(it); });

    host.innerHTML = '<div class="wrap">' +
      TW.ui.pageHead('写作', '翻译与作文都是主观题：可以先自己写，再让 AI 按六级标准批改（也能只看参考译文）') +
      '<div id="personal-materials"></div>' +
      '<div class="grid stats" style="margin-bottom:1.2rem">' +
        '<div class="stat-card"><div class="stat-num">' + l.length + '</div><div class="stat-label">题目</div></div>' +
        '<div class="stat-card"><div class="stat-num accent">' + done + '</div><div class="stat-label">已批改</div></div>' +
        '<div class="stat-card"><div class="stat-num ok">' + (n ? (sum / n).toFixed(1) : '—') + '</div><div class="stat-label">平均分（满分 15）</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + Object.keys(DB.drafts).filter(function (k) { return DB.drafts[k]; }).length + '</div><div class="stat-label">草稿</div></div>' +
      '</div>' +
      '<div class="wr-group"><div class="wr-group-h"><h3>翻译</h3><span class="small muted">汉译英 · 约 150 字中文</span></div>' +
        '<div class="wr-cards">' + groups.trans.map(card).join('') + '</div></div>' +
      '<div class="wr-group"><div class="wr-group-h"><h3>作文</h3><span class="small muted">议论文 / 应用文 · 150–200 词</span></div>' +
        '<div class="wr-cards">' + groups.essay.map(card).join('') + '</div></div>' +
      '<div class="card card-pad muted small" style="margin-top:1rem">' +
        '<b>怎么用</b>：先自己写，写不动就先看「写作要点」；写完点「AI 批改」，会给出分数、逐条问题、' +
        '一份改写稿和三个不同风格的候选版本。没配 AI 时也能看参考译文/范文。' +
      '</div>' +
    '</div>';
    if (TW.personalMaterials) TW.personalMaterials.mount(host, 'writing');
  }

  /* ---------------- 批改协议 ---------------- */

  /** 从模型回复里摘出 ```grade JSON；摘不出来就只返回正文（不假装有分数） */
  function splitGrade(text) {
    var m = /```grade\s*([\s\S]*?)```/i.exec(String(text || ''));
    if (!m) return { text: String(text || '').trim(), data: null };
    var body = String(text || '').replace(m[0], '').trim();
    var data = null;
    try { data = JSON.parse(m[1].trim()); } catch (e) { data = null; }
    if (data && typeof data !== 'object') data = null;
    return { text: body, data: data };
  }

  function sysPrompt(it) {
    var kind = it.type === 'trans' ? '汉译英翻译' : '六级命题作文';
    return [
      '你是中国大学英语六级（CET-6）的阅卷老师，正在批改一位学生的' + kind + '。',
      '满分 15 分。' + (it.type === 'trans'
        ? '评分维度：准确（信息完整、无漏译误译）、通顺（语法正确、句子可读）、用词（搭配与语域得当）。'
        : '评分维度：内容（切题、论据充分）、结构（段落清楚、衔接自然）、语言（句式多样、错误少）。'),
      '打分要严格、接近真实阅卷：有明显语法错误或跑题就不能给高分。',
      '',
      '输出要求：',
      '1) 先用 2~4 句中文给总评，点出最关键的 1~2 个问题，不要逐句罗列。',
      '2) 列出 3~6 条具体问题：原文片段 + 改法 + 原因（中文解释）。',
      '3) 给出改写后的完整版本（英文，可直接背）。',
      '4) 再给出 3 个候选版本，风格分别是：',
      '   · 稳妥版：保分，句式简单但完全正确；',
      '   · 进阶版：句式与词汇更丰富，仍稳妥；',
      '   · 高分版：地道、有亮点但不浮夸，适合冲高分。',
      '   三个版本都要完整、能独立成篇。',
      '5) 最后附一个 ```grade 代码块，里面是**合法 JSON**（不要写注释、不要用列表代替），结构：',
      '{"score":11,"max":15,"rubric":[{"name":"准确","score":4,"max":5},{"name":"通顺","score":4,"max":5},{"name":"用词","score":3,"max":5}],' +
        '"comment":"总评","issues":[{"quote":"原文片段","fix":"改法","why":"原因"}],' +
        '"rewrite":"改写后的完整版本","samples":[{"style":"稳妥版","text":""},{"style":"进阶版","text":""},{"style":"高分版","text":""}]}',
      '除这个代码块之外不要再输出 JSON。',
      '如果学生提交的内容与题目无关、或几乎是空的，不要编分数：score 给 0，并在 comment 里直接说明原因。'
    ].join('\n');
  }

  function userPrompt(it, text) {
    return [
      '【题目】' + (it.type === 'trans' ? '' : it.prompt),
      it.type === 'trans' ? it.prompt : '',
      it.require ? '【要求】' + it.require : '',
      '',
      '【学生作答】',
      text,
      '',
      '（学生作答 ' + wordCount(text) + ' 词）'
    ].filter(function (x) { return x !== ''; }).join('\n');
  }

  /* ---------------- 结果渲染 ---------------- */

  function rubricHtml(rub) {
    if (!Array.isArray(rub) || !rub.length) return '';
    return '<div class="wr-rubric">' + rub.map(function (r) {
      var max = Number(r.max) || 5, sc = Number(r.score) || 0;
      var pct = Math.max(0, Math.min(100, sc / max * 100));
      return '<div class="wr-rub-row">' +
        '<span class="wr-rub-l">' + esc(r.name || '') + '</span>' +
        '<span class="wr-rub-bar"><i style="width:' + pct.toFixed(0) + '%"></i></span>' +
        '<span class="wr-rub-n">' + sc + '/' + max + '</span></div>';
    }).join('') + '</div>';
  }

  function issuesHtml(list) {
    if (!Array.isArray(list) || !list.length) return '';
    return '<div class="wr-issues"><div class="wr-h">具体问题 <span class="small muted">' + list.length + ' 条</span></div>' +
      list.map(function (x) {
        return '<div class="wr-issue">' +
          (x.quote ? '<div class="wr-quote">' + esc(x.quote) + '</div>' : '') +
          (x.fix ? '<div class="wr-fix">→ ' + esc(x.fix) + '</div>' : '') +
          (x.why ? '<div class="wr-why small muted">' + esc(x.why) + '</div>' : '') +
        '</div>';
      }).join('') + '</div>';
  }

  function samplesHtml(list) {
    if (!Array.isArray(list) || !list.length) return '';
    var idx = Math.min(S.tab, list.length - 1);
    return '<div class="wr-samples"><div class="wr-h">AI 给的三个候选版本</div>' +
      '<div class="wr-tabs">' + list.map(function (s, i) {
        return '<button class="wr-tab' + (i === idx ? ' active' : '') + '" data-sample="' + i + '">' +
          esc(s.style || ('版本 ' + (i + 1))) + '</button>';
      }).join('') + '</div>' +
      '<div class="wr-sample">' + esc(list[idx] && list[idx].text || '') + '</div>' +
      '<div class="row" style="gap:.5rem;margin-top:.5rem">' +
        '<button class="btn sm ghost" data-copy="' + idx + '">复制这个版本</button>' +
        '<span class="small muted">' + wordCount(list[idx] && list[idx].text) + ' 词</span>' +
      '</div></div>';
  }

  function resultHtml(r) {
    var d = r.data || {};
    var score = d.score != null ? d.score : r.score;
    var max = d.max || r.max || 15;
    var cls = score >= max * 0.8 ? 'ok' : score >= max * 0.6 ? '' : 'err';
    return '<div class="wr-result">' +
      '<div class="wr-score">' +
        '<div class="wr-score-n ' + cls + '">' + (score != null ? score : '—') + '<span>/' + max + '</span></div>' +
        '<div class="wr-score-cap small muted">' + (r.ts ? new Date(r.ts).toLocaleString('zh-CN', { hour12: false }).slice(0, 16) : '') + '</div>' +
      '</div>' +
      (d.comment ? '<div class="wr-comment">' + esc(d.comment) + '</div>' : '') +
      rubricHtml(d.rubric) +
      issuesHtml(d.issues) +
      (d.rewrite ? '<div class="wr-block"><div class="wr-h">改写稿（可直接背）' +
        '<button class="btn sm ghost" data-copy="rewrite">复制</button></div>' +
        '<div class="wr-rewrite">' + esc(d.rewrite) + '</div></div>' : '') +
      samplesHtml(d.samples) +
      (r.text ? '<details class="wr-orig"><summary>我原来写的（' + wordCount(r.text) + ' 词）</summary>' +
        '<div class="wr-rewrite">' + esc(r.text) + '</div></details>' : '') +
    '</div>';
  }

  /* ---------------- 做题页 ---------------- */

  function renderItem(host, id) {
    var it = get(id);
    if (!it) {
      host.innerHTML = '<div class="wrap-narrow"><div class="card card-pad">' + TW.ui.empty('没找到这道题') +
        '<div class="row" style="justify-content:center"><a class="btn primary" href="#/writing">回写作列表</a></div></div></div>';
      return;
    }
    if (S.id !== id) {
      S.id = id; S.busy = false; S.streamText = ''; S.err = ''; S.tab = 0; S.showTips = false; S.sample = false;
    }
    var draft = DB.drafts[id] || '';
    var res = DB.results[id] || null;
    var ai = !!(TW.ai && TW.ai.configured && TW.ai.configured());
    var wc = wordCount(draft);
    var target = it.type === 'trans' ? '建议 120–180 词' : '要求 150–200 词';

    host.innerHTML = '<div class="wrap">' +
      TW.ui.pageHead(it.title, (it.type === 'trans' ? '翻译' : '作文') + ' · ' + it.sub +
        ' · 建议 ' + (it.minutes || 30) + ' 分钟',
        '<a class="btn ghost" href="#/writing">' + TW.icon('arrowLeft', 15) + ' 回写作列表</a>') +

      '<div class="card card-pad wr-prompt">' +
        '<div class="wr-h">题目' +
          '<button class="btn sm ghost" id="wr-tips">' + (S.showTips ? '收起写作要点' : '看写作要点') + '</button>' +
        '</div>' +
        '<div class="wr-text">' + esc(it.prompt) + '</div>' +
        (it.require ? '<div class="small muted" style="margin-top:.4rem">' + esc(it.require) + '</div>' : '') +
        (S.showTips && it.tips && it.tips.length ? '<ul class="wr-tips">' +
          it.tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
      '</div>' +

      '<div class="card card-pad">' +
        '<div class="wr-h">我的作答' +
          '<span class="small muted"><b id="wr-wc">' + wc + '</b> 词 · ' + target + '</span></div>' +
        '<textarea id="wr-input" class="field wr-input" spellcheck="false" ' +
          'placeholder="' + (it.type === 'trans' ? '在这里写英文译文…' : '在这里写你的作文…') + '">' + esc(draft) + '</textarea>' +
        '<div class="row" style="gap:.5rem;margin-top:.6rem;flex-wrap:wrap">' +
          '<button class="btn primary" id="wr-grade"' + (S.busy ? ' disabled' : '') + '>' +
            TW.icon('spark', 15) + ' ' + (S.busy ? '批改中…' : (ai ? 'AI 批改' : 'AI 批改（需先配 Key）')) + '</button>' +
          (it.sample ? '<button class="btn ghost" id="wr-ref">' + (S.sample ? '收起参考' : (it.type === 'trans' ? '看参考译文' : '看范文')) + '</button>' : '') +
          '<button class="btn ghost" id="wr-clear">清空</button>' +
          (res ? '<span class="small muted">上次批改 ' + (res.score != null ? res.score + '/' + (res.max || 15) : '无分数') + '</span>' : '') +
        '</div>' +
        (ai ? '' : '<div class="small muted" style="margin-top:.5rem">还没配置 AI：' + (it.sample ? '可以先看参考' + (it.type === 'trans' ? '译文' : '范文') + '，或者' : '请') + '去 <a href="#/ai">AI 助手</a> 里填一个 Key，回来就能批改。' +
          '批改结果只在你的浏览器里，不会上传到别处（只把这段文字发给模型）。</div>') +
        (S.sample ? '<div class="wr-sample-ref"><div class="wr-h">参考' + (it.type === 'trans' ? '译文' : '范文') +
          '<button class="btn sm ghost" data-copy="ref">复制</button></div>' +
          '<div class="wr-rewrite">' + esc(it.sample) + '</div></div>' : '') +
        (S.err ? '<div class="wr-err">' + esc(S.err) + '</div>' : '') +
      '</div>' +

      (S.busy || S.streamText ? '<div class="card card-pad" id="wr-stream-box"><div class="wr-h">批改中…</div>' +
        '<div class="wr-rewrite" id="wr-stream">' + esc(S.streamText) + '</div></div>' : '') +
      (res && !S.busy ? resultHtml(res) : '') +
      '<div id="study-chat"></div>' +
    '</div>';

    bindItem(host, it);
    if (TW.studyChat) TW.studyChat.mount(host, function () { return {type: it.type, title: it.title, prompt: it.prompt, require: it.require, draft: DB.drafts[it.id] || '', previousResult: DB.results[it.id] || null}; }, it.type === 'trans' ? '翻译' : '作文');
  }

  function bindItem(host, it) {
    var ta = TW.$('#wr-input', host);
    if (ta) {
      ta.addEventListener('input', function () {
        DB.drafts[it.id] = ta.value;
        write();
        var n = TW.$('#wr-wc', host);
        if (n) n.textContent = wordCount(ta.value);
      });
    }
    var tips = TW.$('#wr-tips', host);
    if (tips) tips.addEventListener('click', function () { S.showTips = !S.showTips; renderItem(host, it.id); });
    var ref = TW.$('#wr-ref', host);
    if (ref) ref.addEventListener('click', function () { S.sample = !S.sample; renderItem(host, it.id); });
    var clr = TW.$('#wr-clear', host);
    if (clr) clr.addEventListener('click', function () {
      if (!window.confirm('清空这道题的作答？')) return;
      DB.drafts[it.id] = '';
      if (ta) ta.value = '';
      write();
      var n = TW.$('#wr-wc', host); if (n) n.textContent = '0';
      TW.toast('已清空');
    });

    var gb = TW.$('#wr-grade', host);
    if (gb) gb.addEventListener('click', function () { startGrade(host, it); });

    /* 复制（改写稿 / 候选版本 / 参考） */
    TW.$$('[data-copy]', host).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.copy;
        var text = '';
        var res = DB.results[it.id];
        if (key === 'ref') text = it.sample || '';
        else if (key === 'rewrite') text = (res && res.data && res.data.rewrite) || '';
        else text = (res && res.data && res.data.samples && res.data.samples[Number(key)] &&
          res.data.samples[Number(key)].text) || '';
        if (!text) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { TW.toast('已复制', 'ok'); },
            function () { TW.toast('复制失败，手动选择吧', 'err'); });
        } else {
          TW.toast('这个浏览器不支持自动复制', 'err');
        }
      });
    });
    TW.$$('[data-sample]', host).forEach(function (btn) {
      btn.addEventListener('click', function () {
        S.tab = Number(btn.dataset.sample);
        renderItem(host, it.id);
      });
    });
  }

  /* ---------------- AI 批改 ---------------- */

  function startGrade(host, it) {
    if (S.busy) return;
    var ta = TW.$('#wr-input', host);
    var text = (ta ? ta.value : DB.drafts[it.id] || '').trim();
    if (!text) { TW.toast('先写点东西再批改吧', 'err'); return; }
    if (wordCount(text) < 15) { TW.toast('太短了，至少写两三句再让 AI 批改', 'err'); return; }
    if (!TW.ai || !TW.ai.configured || !TW.ai.configured()) {
      TW.toast('还没配置 AI Key，去「AI 助手」填一下', 'err');
      TW.app.go('/ai');
      return;
    }
    DB.drafts[it.id] = text;
    write();

    S.busy = true; S.streamText = ''; S.err = ''; S.tab = 0;
    renderItem(host, it.id);
    var box = TW.$('#wr-stream', host);

    TW.ai.streamChat({
      system: sysPrompt(it),
      messages: [{ role: 'user', content: userPrompt(it, text) }],
      maxTokens: 3000,
      temperature: 0.4
    }, function (sofar) {
      S.streamText = sofar;
      box = TW.$('#wr-stream', host) || box;
      if (box) box.textContent = sofar;
    }).then(function (r) {
      var parsed = splitGrade(r && r.text);
      var d = parsed.data || {};
      DB.results[it.id] = {
        ts: Date.now(),
        score: d.score != null ? d.score : null,
        max: d.max || 15,
        text: text,
        data: parsed.data,
        raw: parsed.text
      };
      write();
      S.busy = false; S.streamText = '';
      renderItem(host, it.id);
      if (!parsed.data) TW.toast('批改回来了，但没解析出分数（模型没按格式给）', 'warn');
      else TW.toast('批改完成：' + d.score + '/' + (d.max || 15), 'ok');
    }, function (e) {
      S.busy = false; S.streamText = '';
      S.err = (e && e.message) || '批改失败';
      if (e && e.aborted) S.err = '已停止';
      renderItem(host, it.id);
    });
  }

  function render(host, query) {
    personalHost = host; personalQuery = query || {};
    if (query && query.id && /^personal-/.test(query.id) && TW.personalMaterials) TW.personalMaterials.restore();
    if (query && query.id) renderItem(host, query.id);
    else { S.id = ''; renderList(host); }
  }

  TW.views.writing = { render: render };
})();
