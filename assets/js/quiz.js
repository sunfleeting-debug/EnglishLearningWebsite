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

  /** AI 发布出来的题：结构补齐成和真题一样的形状 */
  function publishedSets() {
    return S.published.map(function (p) {
      return {
        id: p.id, type: 'mixed', test: 'AI 出题', no: 0,
        title: p.title || 'AI 出题', source: 'AI 教练', topic: p.word || '',
        minutes: 0, body: Array.isArray(p.body) ? p.body : [], paras: [], bank: [],
        /* kind 是 2026-11-05 才加的字段：更早发布的记录里没有，
           按「有选项＝choice / 有 target word＝spell / 其余＝fill」补一个，
           不然老数据在新作答页上认不出题型、也就没有「中文提示」的说明条。 */
        questions: (p.questions || []).map(function (q) {
          if (q && q.kind) return q;
          var kind = (q && q.options && q.options.length) ? 'choice' : ((q && q.word) ? 'spell' : 'fill');
          var copy = {};
          Object.keys(q || {}).forEach(function (k) { copy[k] = q[k]; });
          copy.kind = kind;
          return copy;
        }),
        ai: true, ts: p.ts
      };
    });
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

  /** 发布一组 AI 题；同一批题重复发布会复用同一条（按内容哈希判重） */
  function publish(set) {
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
