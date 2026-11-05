/* 题目板块内核：题库读取、本地做题记录、AI 出题的「发布」、判分工具
   ------------------------------------------------------------------
   数据来源两处：
     data/quiz.js  —— DRJ172《阅读海量练习》扫描件抽出来的真题（tools/build_quiz_bank.py 生成）
     本机 localStorage —— AI 教练出的题，用户点「发布到题目板块」后落到这里
   为什么存独立的 localStorage 键而不是 store.state：
     云同步的合并规则对未知字段是按白名单归一化的（worker/index.js 与 tools/mock_api.py 各一份），
     往 state 里塞新字段会被服务端的旧快照覆盖掉；题目记录是纯本地产物，没必要进同步协议。
*/
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};

  var KEY = 'typingcet.quiz.v1';
  var S = { published: [], results: {} };
  var loadErr = '';

  function read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        S.published = Array.isArray(o.published) ? o.published : [];
        S.results = (o.results && typeof o.results === 'object') ? o.results : {};
      }
    } catch (e) {
      loadErr = '本机题目记录读不出来（可能存储空间满了），这次先按空记录显示';
    }
  }
  function write() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(S));
    } catch (e) {
      loadErr = '题目记录保存失败（浏览器存储已满）';
    }
  }

  /** 题库里的真题（静态数据，可能因为脚本没加载而缺席）
      2026-11-05 起三处来源：data/quiz.js（扫描件生成）+ data/quiz-more.js（真题/模拟，手写）
      + data/quiz-zhenti.js（tools/build_pack.py 从真题 PDF 抽取，答案已交叉校验）
      ⚠️ 真题已经单独搬到「四六级真题」板块（#/zhenti，按套组织），
         所以列表页用 bank('base') 只拿手写题；get/result/summary 不带 scope 时仍然是全量，
         否则从真题板块点进 #/quiz?set=zt... 会「找不到这组题」。 */
  function bank(scope) {
    var out = [];
    var a = window.TW_QUIZ;
    if (a && Array.isArray(a.sets)) out = out.concat(a.sets);
    var b = window.TW_QUIZ_MORE;
    if (b && Array.isArray(b.sets)) out = out.concat(b.sets);
    var c = window.TW_QUIZ_ZHENTI;
    if (c && Array.isArray(c) && scope !== 'base') out = out.concat(c);
    if (TW.personalMaterials) out = out.concat(TW.personalMaterials.quizSets());
    return out;
  }

  /** 只拿真题（四六级真题板块用） */
  function zhentiBank() {
    var c = window.TW_QUIZ_ZHENTI;
    return (c && Array.isArray(c)) ? c.slice() : [];
  }

  /** 选项是不是「一串字母编号」——那不是选项，是没出完的废题 */
  function lettersOnly(opts) {
    if (!opts || !opts.length) return false;
    return opts.every(function (o) { return /^[A-Oa-o]$/.test(String(o).trim()); });
  }

  /** 题面是不是几乎全中文（四选一/填空题面必须英文，中文只该在解析里） */
  function mostlyChinese(s) {
    var t = String(s || '');
    var cjk = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
    var lat = (t.match(/[A-Za-z]/g) || []).length;
    return cjk >= 6 && cjk > lat;
  }

  /** AI 发布出来的题：结构补齐成和真题一样的形状 */
  function publishedSets() {
    return S.published.map(function (p) {
      /* 2026-11-05：AI 现在能出「整篇选词填空」（一段完整材料 + 10 个空 + A~O 词库）。
         这种套题直接还原成题目板块原生的 cloze 形状，交给现成的作答页渲染，
         而不是塞进 mixed 的散题卡片里（散题卡片没法在正文里挖空）。 */
      if (p && p.kind === 'cloze' && Array.isArray(p.body) && p.body.length && Array.isArray(p.bank) && p.bank.length) {
        return {
          id: p.id, type: 'cloze', test: 'AI 出题', no: 0,
          title: p.title || 'AI 出题 · 选词填空',
          source: 'AI 教练', topic: (p.bank.length + ' 词库'), minutes: 0,
          body: p.body.slice(), bank: p.bank.slice(),
          questions: (p.questions || []).map(function (q) {
            return {
              n: Number(q.n) || 0, stem: '', answer: String(q.answer || '').toUpperCase(),
              key: String(q.key || ''), explain: String(q.explain || '')
            };
          }).filter(function (q) { return q.n > 0 && /^[A-O]$/.test(q.answer); }),
          paras: [], ai: true, ts: p.ts
        };
      }
      /* 整篇阅读 / 段落匹配：同样还原成原生 type，作答页直接认 */
      if (p && (p.kind === 'reading' || p.kind === 'match') &&
          Array.isArray(p.questions) && p.questions.length) {
        return {
          id: p.id, type: p.kind, test: 'AI 出题', no: 0,
          title: p.title || ('AI 出题 · ' + (p.kind === 'match' ? '段落匹配' : '仔细阅读')),
          source: 'AI 教练',
          topic: p.kind === 'match'
            ? ((p.paras || []).length + ' 段')
            : ((p.body || []).length + ' 段'),
          minutes: p.kind === 'match' ? 12 : 9,
          heading: p.heading || '',
          body: Array.isArray(p.body) ? p.body.slice() : [],
          paras: Array.isArray(p.paras) ? p.paras.slice() : [],
          questions: p.questions.map(function (q) {
            return {
              n: Number(q.n) || 0, stem: String(q.stem || ''),
              options: (q.options || []).slice(),
              answer: String(q.answer || '').toUpperCase(),
              explain: String(q.explain || '')
            };
          }).filter(function (q) { return q.n > 0 && q.answer; }),
          ai: true, ts: p.ts
        };
      }
      return {
        id: p.id, type: 'mixed', test: 'AI 出题', no: 0,
        title: p.title || 'AI 出题', source: 'AI 教练', topic: p.word || '',
        minutes: 0, body: Array.isArray(p.body) ? p.body : [], paras: [], bank: [],
        /* kind 是 2026-11-05 才加的字段：更早发布的记录里没有，
           按「有选项＝choice / 有 target word＝spell / 其余＝fill」补一个，
           不然老数据在新作答页上认不出题型、也就没有「中文提示」的说明条。
           顺手把废题（选项是 A/B/C/D、题面中文的「下列哪个词表示…」）过滤掉——
           它们在新规则下根本发不出来，是旧版本留下的，留着只会让人对着字母发呆。 */
        questions: (p.questions || []).map(function (q) {
          var copy = {};
          Object.keys(q || {}).forEach(function (k) { copy[k] = q[k]; });
          if (!copy.kind) {
            copy.kind = (copy.options && copy.options.length) ? 'choice' : (copy.word ? 'spell' : 'fill');
          }
          return copy;
        }).filter(function (q) {
          if (lettersOnly(q.options)) return false;
          if (q.kind !== 'spell' && mostlyChinese(q.stem)) return false;
          return true;
        }),
        ai: true, ts: p.ts
      };
    }).filter(function (s) { return s.questions.length > 0; });
  }

  function all() {
    return bank().concat(publishedSets());
  }

  function get(id) {
    var list = all();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function result(id) { return S.results[id] || null; }

  /** 保存一次作答：answers 是 {题号: 用户填的字母或单词}，items 是 {题号: 0|1} */
  function saveResult(id, payload) {
    S.results[id] = {
      right: payload.right, total: payload.total, ts: Date.now(),
      answers: payload.answers || {}, items: payload.items || {}
    };
    write();
    return S.results[id];
  }

  function clearResult(id) {
    delete S.results[id];
    write();
  }

  /* ---------- AI 出的题 → 题目板块 ---------- */

  function hash(s) {
    var h = 5381, i = 0;
    for (; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  /** 把 AI 的 exercises 转成题目板块的 question 形状 */
  function fromExercises(list) {
    var out = [];
    (list || []).forEach(function (ex, i) {
      if (!ex || !ex.question) return;
      var opts = (ex.options || []).map(function (t, k) {
        return { k: String.fromCharCode(65 + k), t: String(t) };
      });
      var ans = String(ex.answer || '').trim();
      if (opts.length) {
        if (/^[A-Da-d]$/.test(ans)) ans = ans.toUpperCase();
        else {
          var hit = '';
          opts.forEach(function (o) { if (String(o.t).toLowerCase() === ans.toLowerCase()) hit = o.k; });
          ans = hit || 'A';
        }
      }
      out.push({
        n: i + 1, stem: String(ex.question),
        /* kind 保留 AI 给的题型（choice/spell/fill）：作答页要据此提示
           「这是中文释义提示、请拼英文」，否则中文题干看着像「题目没显示」。 */
        kind: String(ex.type || ''),
        options: opts, answer: ans,
        explain: String(ex.explanation || ex.exp || ''),
        word: String(ex.word || '')
      });
    });
    return out;
  }

  /** 整篇选词填空（AI 出的）：body 里的【n】是空位，bank 是 A~O 词库，questions 按空号给字母答案 */
  function normalizeClozeSet(set) {
    var body = (set.body || []).map(function (x) { return String(x || '').slice(0, 4000); }).filter(Boolean);
    if (!body.length) return null;
    /* 空号必须真的出现在正文里，否则作答页点不到空位 */
    var holes = {};
    body.forEach(function (p) {
      String(p).replace(/【(\d+)】/g, function (m, n) { holes[Number(n)] = 1; return m; });
    });
    var bank = [], seenK = {};
    (set.bank || []).forEach(function (b) {
      var k = '', w = '';
      if (b && typeof b === 'object') { k = String(b.k || '').toUpperCase(); w = String(b.w || ''); }
      else {
        var t = String(b || '').trim();
        var mm = /^([A-Oa-o])\s*[.、)．]\s*(.+)$/.exec(t);
        if (mm) { k = mm[1].toUpperCase(); w = mm[2].trim(); }
        else { k = String.fromCharCode(65 + bank.length); w = t; }
      }
      if (!k || !w || seenK[k]) return;
      seenK[k] = 1;
      bank.push({ k: k, w: w });
    });
    var questions = [];
    (set.questions || []).forEach(function (q) {
      var n = Number(q && (q.n != null ? q.n : q.no)) || 0;
      var ans = String((q && q.answer) || '').trim().toUpperCase();
      if (!n || !holes[n] || !/^[A-O]$/.test(ans) || !seenK[ans]) return;
      var hit = '';
      bank.forEach(function (b) { if (b.k === ans) hit = b.w; });
      questions.push({ n: n, stem: '', answer: ans, key: String((q && (q.key || q.word)) || hit || ''), explain: String((q && (q.explain || q.explanation)) || '') });
    });
    if (questions.length < 5) return null;
    return { body: body, bank: bank, questions: questions };
  }

  /** 整篇阅读 / 段落匹配（AI 出的）：阅读是「一篇 + 5 道四选一」，
      匹配是「A~O 十几段 + 10 道找段落」，两种都必须自带材料，否则发布出去没法做。 */
  function normalizePaperSet(kind, set) {
    var heading = String(set.heading || '').slice(0, 300);
    var body = (set.body || []).map(function (x) { return String(x || '').slice(0, 6000); }).filter(Boolean);
    var paras = [];
    (set.paras || []).forEach(function (p, i) {
      var k = String((p && p.k) || String.fromCharCode(65 + i)).toUpperCase();
      var text = String((p && (p.text || p.t)) || (typeof p === 'string' ? p : '')).trim();
      if (k && text) paras.push({ k: k, text: text.slice(0, 4000) });
    });
    if (kind === 'reading' && !body.length) return null;
    if (kind === 'match' && paras.length < 6) return null;

    var questions = [];
    (set.exercises || set.questions || []).forEach(function (ex, i) {
      if (!ex) return;
      var stem = String(ex.question || ex.stem || ex.q || '').trim();
      var ans = String(ex.answer || ex.a || '').trim();
      if (!stem || !ans) return;
      var explain = String(ex.explanation || ex.explain || ex.why || '').trim();
      if (kind === 'match') {
        /* 匹配题没有选项，答案就是一个段落字母；写单词/中文一律丢弃 */
        ans = ans.replace(/[^A-Oa-o]/g, '').toUpperCase();
        var okPara = paras.some(function (p) { return p.k === ans; });
        if (!okPara) return;
        questions.push({ n: i + 1, stem: stem, options: [], answer: ans, explain: explain });
        return;
      }
      var opts = Array.isArray(ex.options) ? ex.options.map(function (o) {
        return String(o && typeof o === 'object' ? (o.t || o.text || o.label || '') : o).trim();
      }).filter(Boolean) : [];
      if (opts.length < 3) return;
      var optKeys = 'ABCD'.split('').slice(0, opts.length);
      var letter = ans.toUpperCase();
      if (!/^[A-D]$/.test(letter) || letter.charCodeAt(0) - 65 >= opts.length) {
        /* 答案写成了选项文本 → 反查字母；反查不到就丢，不猜 */
        var hit = -1;
        opts.forEach(function (t, oi) { if (t.toLowerCase() === ans.toLowerCase()) hit = oi; });
        if (hit < 0) return;
        letter = optKeys[hit];
      }
      questions.push({
        n: i + 1, stem: stem,
        options: opts.map(function (t, oi) { return { k: optKeys[oi], t: t }; }),
        answer: letter, explain: explain
      });
    });
    var need = kind === 'match' ? 5 : 3;
    if (questions.length < need) return null;
    return { kind: kind, heading: heading, body: body, paras: paras, questions: questions };
  }

  /** 发布一组 AI 题；同一批题重复发布会复用同一条（按内容哈希判重） */
  function publish(set) {
    /* 整篇选词填空走单独分支：它没有「题干」，只有正文里的空位和字母答案 */
    var cz = set.kind === 'cloze' ? normalizeClozeSet(set) : null;
    if (cz) {
      var cid = 'ai-cz-' + hash(cz.body.join('#') + cz.bank.map(function (b) { return b.k + b.w; }).join('#') +
        cz.questions.map(function (q) { return q.n + q.answer; }).join('#'));
      for (var j = 0; j < S.published.length; j++) {
        if (S.published[j].id === cid) return S.published[j];
      }
      var crec = {
        id: cid,
        kind: 'cloze',
        title: set.title || ('AI 出题 · 选词填空 ' + cz.questions.length + ' 空'),
        ts: Date.now(), word: '',
        body: cz.body, bank: cz.bank, questions: cz.questions,
        /* exercises 存一份是为了「再做一遍」和列表页统计能直接用，不必认识 cloze 结构 */
        exercises: cz.questions.map(function (q) { return { n: q.n, answer: q.answer, key: q.key, explanation: q.explain }; })
      };
      S.published.unshift(crec);
      if (S.published.length > 60) S.published.length = 60;
      write();
      return crec;
    }

    /* 整篇阅读 / 段落匹配：也是「材料 + 一整套题」，走原生 type 才能用作答页的渲染 */
    if (set.kind === 'reading' || set.kind === 'match') {
      var pp = normalizePaperSet(set.kind, set);
      if (pp) {
        var pid = 'ai-' + set.kind.charAt(0) + '-' + hash(
          (pp.body.join('#') + pp.paras.map(function (p) { return p.k + p.text; }).join('#') +
            pp.questions.map(function (q) { return q.stem + q.answer; }).join('#')));
        for (var m = 0; m < S.published.length; m++) {
          if (S.published[m].id === pid) return S.published[m];
        }
        var prec = {
          id: pid, kind: set.kind,
          title: set.title || ('AI 出题 · ' + (set.kind === 'match' ? '段落匹配' : '仔细阅读')),
          ts: Date.now(), word: '',
          heading: pp.heading, body: pp.body, paras: pp.paras, questions: pp.questions
        };
        S.published.unshift(prec);
        if (S.published.length > 60) S.published.length = 60;
        write();
        return prec;
      }
      return null;   // 材料或题不够，宁可发不出去，也别发一套做不了的
    }

    var questions = fromExercises(set.exercises || set.questions || []);
    if (!questions.length) return null;
    var body = Array.isArray(set.body) ? set.body.slice(0, 30).map(function (x) { return String(x || '').slice(0, 4000); }).filter(Boolean) : [];
    var id = 'ai-' + hash(body.join('#') + questions.map(function (q) { return q.stem + '|' + q.answer; }).join('#'));
    for (var i = 0; i < S.published.length; i++) {
      if (S.published[i].id === id) return S.published[i];
    }
    var rec = {
      id: id,
      title: set.title || ('AI 出题 · ' + questions.length + ' 题'),
      ts: Date.now(),
      word: set.word || '',
      body: body,
      questions: questions
    };
    S.published.unshift(rec);
    if (S.published.length > 60) S.published.length = 60;
    write();
    return rec;
  }

  function removePublished(id) {
    S.published = S.published.filter(function (p) { return p.id !== id; });
    delete S.results[id];
    write();
  }

  /** 概览：做了几组、平均正确率（scope='base' 时只看手写题，与列表页口径一致） */
  function summary(scope) {
    var list = bank(scope).concat(publishedSets()), done = 0, right = 0, total = 0;
    list.forEach(function (s) {
      var r = S.results[s.id];
      if (!r) return;
      done++;
      right += r.right || 0;
      total += r.total || 0;
    });
    return {
      sets: list.length, done: done, right: right, total: total,
      acc: total ? Math.round(right / total * 100) : 0,
      published: S.published.length, error: loadErr
    };
  }

  /** 文本答案归一化（拼写/填空类题的判分用） */
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[“”"'’]/g, '')
      .replace(/^[\s.,!?;:]+|[\s.,!?;:]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function judge(q, mine) {
    if (mine == null || mine === '') return false;
    if (q.options && q.options.length) return String(mine).toUpperCase() === String(q.answer).toUpperCase();
    return norm(mine) === norm(q.answer);
  }

  read();

  TW.quiz = {
    bank: bank, zhenti: zhentiBank, all: all, get: get, result: result, saveResult: saveResult,
    clearResult: clearResult, publish: publish, removePublished: removePublished,
    summary: summary, judge: judge, norm: norm, fromExercises: fromExercises,
    published: publishedSets, error: function () { return loadErr; }
  };
})();
