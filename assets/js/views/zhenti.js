/* 四六级真题板块（2026-11-05 新增）
   ------------------------------------------------------------------
   为什么单独开一个板块（sunfleeting 的原话）：
     「你这个的题目要单独画一个版块叫作四六级真题」——
     之前真题是混在「题目」列表里的，跟手写题、AI 出的题、本机导入的阅读堆在一起，
     按题型平铺，看不出「这是一整套卷子」。真题的用法本来就是**按套练**：
     听力 → 选词填空 → 段落匹配 → 仔细阅读 → 写作翻译，和考场顺序一致。

   所以这里的组织方式是「套 → 模块 → 作答页」：
     · 列表页：一场考试一套，一张卡，卡片上标出这套有哪些模块、共几题、做过几块；
     · 详情页 #/zhenti?paper=xxx：这一套的模块清单，点进去就是原本的作答页；
     · 作答页的返回按钮由 TW.zhenti.back() 指回来（见 quiz/writing/listening 三个视图），
       出去还能回到「这一套」，不会掉进别的列表。

   数据来自三份 JSON（都在 index.html 里同步加载，不做懒加载）：
     window.TW_QUIZ_ZHENTI    选词填空 / 段落匹配 / 仔细阅读
     window.TW_LISTENING_ZHENTI  听力（带真实录音）
     window.TW_WRITING_ZHENTI    命题作文 / 汉译英
   这三份都是 tools/build_pack.py 从 PDF 抽取的，**不要手改**。
*/
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  /* 考场顺序：听力最先，写作翻译最后。readings 两篇都在 reading */
  var ORDER = { listening: 1, cloze: 2, match: 3, reading: 4, trans: 5, essay: 6 };
  var KIND = {
    listening: '听力', cloze: '选词填空', match: '段落匹配',
    reading: '仔细阅读', trans: '汉译英', essay: '命题作文'
  };
  var NUM_EN = ['One', 'Two', 'Three', 'Four'];

  var F = { year: '' };          // 年份筛选（'' = 全部），只是当前视图的临时状态

  function esc(s) { return TW.esc(s); }

  /** 「2024年6月真题（第1套） · 听力」→「2024年6月真题（第1套）」 */
  function paperName(t) {
    t = String(t || '');
    var i = t.indexOf(' · ');
    return i >= 0 ? t.slice(0, i) : t;
  }

  /** 排序用：年月 + 套号，倒序就是最新的在前 */
  function sortKey(name) {
    var m = /(\d{4})年(\d{1,2})月/.exec(name) || [];
    var n = /第(\d+)套/.exec(name) || [];
    return (+(m[1] || 0)) * 10000 + (+(m[2] || 0)) * 100 + (+(n[1] || 1));
  }

  function yearOf(name) {
    var m = /(\d{4})年/.exec(name);
    return m ? m[1] : '';
  }

  /* 听力和写作的记录存在各自视图的独立键里（typingcet.listen.v1 / typingcet.write.v1）。
     这里**只读**：写入仍然只由那两个视图负责，免得同一份数据有三处写法。 */
  function readKey(k) {
    try { return JSON.parse(window.localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; }
  }

  /** 一个模块的完成情况：return null 表示没做过 */
  function scoreOf(it, cache) {
    if (it.kind === 'trans' || it.kind === 'essay') {
      var w = cache.write.results && cache.write.results[it.id];
      if (!w || w.score == null) return null;
      var max = w.max || 15;
      return { label: 'AI 批改 ' + w.score + '/' + max, ratio: w.score / max };
    }
    if (it.kind === 'listening') {
      var l = cache.listen.results && cache.listen.results[it.id];
      if (!l || !l.total) return null;
      return { label: '上次 ' + l.right + '/' + l.total, ratio: l.right / l.total };
    }
    var r = TW.quiz.result(it.id);
    if (!r || !r.total) return null;
    return { label: '上次 ' + r.right + '/' + r.total, ratio: r.right / r.total };
  }

  /** 把三份数据按「套」聚起来 */
  function papers() {
    var map = {}, list = [];
    function slot(name) {
      if (!map[name]) { map[name] = { name: name, year: yearOf(name), items: [] }; list.push(map[name]); }
      return map[name];
    }

    (window.TW_LISTENING_ZHENTI || []).forEach(function (s) {
      var qn = 0;
      (s.segments || []).forEach(function (g) { qn += (g.questions || []).length; });
      slot(paperName(s.title)).items.push({
        kind: 'listening', id: s.id, n: qn, audio: true,
        label: '听力', href: '#/listening?id=' + encodeURIComponent(s.id)
      });
    });

    (window.TW_QUIZ_ZHENTI || []).forEach(function (s) {
      var label = KIND[s.type] || '题目';
      if (s.type === 'reading') {
        var m = /-p(\d+)$/.exec(s.id);
        label += ' Passage ' + (NUM_EN[(m ? +m[1] : 1) - 1] || 'One');
      }
      slot(s.test).items.push({
        kind: s.type, id: s.id, n: (s.questions || []).length, label: label,
        href: '#/quiz?set=' + encodeURIComponent(s.id)
      });
    });

    (window.TW_WRITING_ZHENTI || []).forEach(function (it) {
      slot(paperName(it.title)).items.push({
        kind: it.type, id: it.id, n: 1, label: KIND[it.type] || '写作',
        href: '#/writing?id=' + encodeURIComponent(it.id)
      });
    });

    list.forEach(function (p) {
      p.items.sort(function (a, b) { return (ORDER[a.kind] || 9) - (ORDER[b.kind] || 9); });
      p.qn = p.items.reduce(function (n, it) { return n + it.n; }, 0);
    });
    list.sort(function (a, b) { return sortKey(b.name) - sortKey(a.name); });
    return list;
  }

  function yearsOf(list) {
    var seen = {}, out = [];
    list.forEach(function (p) { if (p.year && !seen[p.year]) { seen[p.year] = 1; out.push(p.year); } });
    return out.sort().reverse();
  }

  /** 这一套做到哪了：返回 {done, total, right, qtotal} */
  function progressOf(p, cache) {
    var done = 0, qdone = 0, qtotal = 0;
    p.items.forEach(function (it) {
      var sc = scoreOf(it, cache);
      qtotal += it.n;
      if (sc) { done++; qdone += it.n; }
    });
    return { done: done, total: p.items.length, qdone: qdone, qtotal: qtotal };
  }

  /* ---------------- 列表页 ---------------- */

  function paperCard(p, cache) {
    var pg = progressOf(p, cache);
    var pct = pg.total ? Math.round(pg.done / pg.total * 100) : 0;
    var chips = p.items.map(function (it) {
      var sc = scoreOf(it, cache);
      return '<span class="zt-chip' + (sc ? ' done' : '') + '">' +
        (sc ? '✓ ' : '') + esc(it.label) + '<i>' + it.n + '</i></span>';
    }).join('');
    return '<a class="zt-paper" href="#/zhenti?paper=' + encodeURIComponent(p.name) + '">' +
      '<div class="zt-paper-h">' +
        '<span class="zt-paper-name">' + esc(p.name) + '</span>' +
        (pg.done === pg.total ? '<span class="tag ok">全做完</span>' :
          pg.done ? '<span class="tag">做到 ' + pg.done + '/' + pg.total + '</span>' :
          '<span class="tag">没开始</span>') +
      '</div>' +
      '<div class="zt-chips">' + chips + '</div>' +
      '<div class="zt-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="zt-paper-m small muted">' + p.items.length + ' 个模块 · ' + pg.qtotal +
        ' 题' + (pg.qdone ? ' · 已做 ' + pg.qdone + ' 题' : '') + '</div>' +
    '</a>';
  }

  function renderList(host) {
    var all = papers();
    var list = F.year ? all.filter(function (p) { return p.year === F.year; }) : all;
    var cache = { listen: readKey('typingcet.listen.v1'), write: readKey('typingcet.write.v1') };

    var mods = 0, qs = 0, touched = 0;
    all.forEach(function (p) {
      var pg = progressOf(p, cache);
      mods += pg.total; qs += pg.qtotal; touched += pg.done;
    });

    var years = yearsOf(all);
    var chips = '<div class="zt-filter">' +
      [''].concat(years).map(function (y) {
        return '<button type="button" class="zt-fchip' + ((F.year || '') === y ? ' active' : '') +
          '" data-year="' + y + '">' + (y ? y + ' 年' : '全部') + '</button>';
      }).join('') + '</div>';

    var body = list.length
      ? '<div class="zt-papers">' + list.map(function (p) { return paperCard(p, cache); }).join('') + '</div>'
      : '<div class="card card-pad">' + TW.ui.empty('这个年份还没有导入真题') + '</div>';

    host.innerHTML = '<div class="wrap">' +
      TW.ui.pageHead('四六级真题',
        '按套练：听力 → 选词填空 → 段落匹配 → 仔细阅读 → 写作翻译，和考场顺序一致；客观题即时判分，作文可让 AI 批改') +
      '<div class="grid stats" style="margin-bottom:1.2rem">' +
        '<div class="stat-card"><div class="stat-num">' + all.length + '</div><div class="stat-label">套真题</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + mods + '</div><div class="stat-label">可练模块</div></div>' +
        '<div class="stat-card"><div class="stat-num accent">' + touched + '</div><div class="stat-label">已做模块</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + qs + '</div><div class="stat-label">题目总数</div></div>' +
      '</div>' +
      chips + body +
      '<div class="card card-pad muted small" style="margin-top:1rem">' +
        '<b>说明</b>：题目与答案由真题 PDF 抽取，只收录答案可交叉核验的套次——' +
        '拿不到可靠答案的题已整题剔除，所以同一套的模块数可能不等。' +
        '资料包里没有听力原文的套次，只给选项和录音（跟考场一样，问题要听）。' +
      '</div>' +
    '</div>';

    TW.$$('[data-year]', host).forEach(function (b) {
      b.addEventListener('click', function () { F.year = b.dataset.year || ''; renderList(host); });
    });
  }

  /* ---------------- 套详情 ---------------- */

  function moduleCard(it, cache) {
    var sc = scoreOf(it, cache);
    var tag = sc
      ? '<span class="tag ' + (sc.ratio >= 0.6 ? 'ok' : 'err') + '">' + esc(sc.label) + '</span>'
      : '<span class="tag">未做</span>';
    return '<a class="zt-mod' + (sc ? ' done' : '') + '" href="' + it.href + '">' +
      '<div class="zt-mod-h">' +
        '<span class="zt-mod-k">' + esc(KIND[it.kind] || '题目') + '</span>' + tag +
      '</div>' +
      '<div class="zt-mod-t">' + esc(it.label) +
        (it.audio ? ' <span class="zt-audio">有录音</span>' : '') + '</div>' +
      '<div class="zt-mod-m small muted">' +
        (it.kind === 'trans' || it.kind === 'essay'
          ? '主观题 · 可 AI 批改'
          : it.n + ' 题 · 自动判分') + '</div>' +
      '<span class="zt-go">进入 ' + TW.icon('arrowRight', 13) + '</span>' +
    '</a>';
  }

  function renderPaper(host, name) {
    var p = null;
    papers().forEach(function (x) { if (x.name === name) p = x; });
    if (!p) {
      host.innerHTML = '<div class="wrap-narrow"><div class="card card-pad">' +
        TW.ui.empty('没有找到这套真题') +
        '<div class="row" style="justify-content:center">' +
        '<a class="btn primary" href="#/zhenti">回四六级真题</a></div></div></div>';
      return;
    }
    var cache = { listen: readKey('typingcet.listen.v1'), write: readKey('typingcet.write.v1') };
    var pg = progressOf(p, cache);

    host.innerHTML = '<div class="wrap">' +
      TW.ui.pageHead(p.name,
        p.items.length + ' 个模块 · ' + pg.qtotal + ' 题 · 已做 ' + pg.done + '/' + p.items.length,
        '<a class="btn ghost" href="#/zhenti">' + TW.icon('arrowLeft', 15) + ' 回四六级真题</a>') +
      '<div class="zt-mods">' + p.items.map(function (it) { return moduleCard(it, cache); }).join('') + '</div>' +
      '<div class="card card-pad muted small" style="margin-top:1rem">' +
        '按考场顺序从上往下做。做完客观题点「交卷看解析」；作文/翻译可以先写、再让 AI 按六级标准批改。' +
      '</div>' +
    '</div>';
  }

  function render(host, query) {
    if (query && query.paper) renderPaper(host, query.paper);
    else renderList(host);
  }

  /* ---------------- 给作答页用的「返回上级」 ----------------
     作答页原本都写死回自己的列表（题目/听力/写作）。真题从真题板块进来，
     返回时就该回这一套，而不是把用户丢进「题目」列表。
     非真题（手写题、AI 题、本机导入）返回 null，由调用方保持原样。 */
  function back(set) {
    var id = String((set && set.id) || '');
    var name = '';
    if (/^ls-zt/.test(id)) name = paperName(set.title);
    else if (/^zt\d/.test(id)) name = set.test || '';
    else if (/^(wr|tr)-zt/.test(id)) name = paperName(set.title);
    if (!name) return null;
    return { href: '#/zhenti?paper=' + encodeURIComponent(name), label: '回四六级真题 · ' + name };
  }

  TW.zhenti = { papers: papers, back: back, paperName: paperName };
  TW.views.zhenti = { render: render };
})();
