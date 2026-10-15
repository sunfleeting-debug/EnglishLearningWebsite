/* 句子练习的独立离线数据层。只存本机，不进入单词云同步协议。 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  var KEY = 'typingcet.sentences.v1';
  var INTERVALS = [1, 2, 4, 7, 15, 30, 60];
  var DEFAULTS = { mode: 'build', autoSpeak: true, size: 8, order: 'seq' };
  var LIMITS = { bytes: 1024 * 1024, courses: 50, units: 300, totalUnits: 2000, steps: 15, stateBytes: 5 * 1024 * 1024 };
  var listeners = [], loadError = null;

  function emptyState() { return { version: 1, settings: copy(DEFAULTS), courses: [], progress: {}, daily: {}, session: null, attempts: {} }; }
  function copy(obj) { return JSON.parse(JSON.stringify(obj)); }
  function byteLength(text) {
    var bytes = 0;
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code < 128) bytes++;
      else if (code < 2048) bytes += 2;
      else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xDC00 && text.charCodeAt(i + 1) <= 0xDFFF) { bytes += 4; i++; }
      else bytes += 3;
    }
    return bytes;
  }
  function object(obj) { return !!obj && typeof obj === 'object' && !Array.isArray(obj); }
  function checkSafe(obj, depth) {
    depth = depth || 0;
    if (depth > 30) throw new Error('数据层级过深，请简化导入文件');
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(function (key) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('导入文件包含不安全字段：' + key);
      checkSafe(obj[key], depth + 1);
    });
  }
  function string(value, max, label, optional) {
    if (value == null && optional) return '';
    if (typeof value !== 'string') throw new Error((label || '文本') + '必须是文字');
    value = value.trim();
    if ((!optional && !value) || value.length > max) throw new Error((label || '文本') + '为空或过长（最多 ' + max + ' 字）');
    return value;
  }
  function number(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw new Error(label + '不是有效数字');
    return Math.floor(value);
  }
  function day(date) {
    date = date || new Date();
    return date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2) + '-' + ('0' + date.getDate()).slice(-2);
  }
  function addDays(base, count) {
    var p = base.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + count); return day(d);
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    var p = value.split('-'); return day(new Date(+p[0], +p[1] - 1, +p[2])) === value;
  }
  function normalize(value) {
    return String(value == null ? '' : value).normalize('NFKC').replace(/[‘’‛`´]/g, "'")
      .replace(/[“”„]/g, '"').toLowerCase().replace(/[.,!?;:，。！？；：、…"()[\]{}<>《》「」『』]/g, ' ')
      .replace(/[—–-]/g, ' ').replace(/\s*['’]\s*/g, "'").replace(/(^|\s)'|'(?=\s|$)/g, '$1').replace(/\s+/g, ' ').trim();
  }
  function compare(input, expected, alternatives) {
    var normalized = normalize(input);
    if (!normalized) return false;
    return [expected].concat(Array.isArray(alternatives) ? alternatives : []).some(function (answer) { return normalized === normalize(answer); });
  }
  function step(raw) {
    if (typeof raw === 'string') raw = { en: raw, zh: '' };
    if (Array.isArray(raw)) raw = { en: raw[0], zh: raw[1] || '' };
    if (!object(raw)) throw new Error('每道题需要英文 en 和中文 zh');
    var out = { en: string(raw.en != null ? raw.en : raw.english, 1200, '英文'), zh: string(raw.zh != null ? raw.zh : (raw.chinese != null ? raw.chinese : raw.translation), 2000, '中文', true) };
    if (!/[a-z]/i.test(out.en)) throw new Error('英文内容需要包含英文字母');
    if (raw.alternatives != null) {
      if (!Array.isArray(raw.alternatives) || raw.alternatives.length > 8) throw new Error('每题最多支持 8 个可接受答案');
      out.alternatives = raw.alternatives.map(function (text) { return string(text, 1200, '可接受答案'); });
    }
    return out;
  }
  function safeId(raw, fallback) {
    if (raw == null || raw === '') return fallback;
    return string(raw, 160, '标识').replace(/\s+/g, '-');
  }
  function sanitizeCourse(raw, fallbackId, custom) {
    if (!object(raw)) throw new Error('课程必须是 JSON 对象');
    var out = {
      id: safeId(raw.id, fallbackId), title: string(raw.title || raw.name || '我的句子课程', 120, '课程名称'),
      description: string(raw.description, 1200, '课程说明', true), level: string(raw.level == null ? '自定义' : String(raw.level), 40, '课程级别'),
      category: string(raw.category, 80, '课程主题', true),
      custom: !!custom, units: []
    };
    var source = raw.units || raw.lessons || raw.sentences;
    if (!Array.isArray(source) || !source.length || source.length > LIMITS.units) throw new Error('每门课程需要 1–' + LIMITS.units + ' 个单元');
    var ids = {};
    out.units = source.map(function (item, index) {
      if (typeof item === 'string' || Array.isArray(item) || (object(item) && (item.en != null || item.english != null))) item = { steps: [item] };
      if (!object(item)) throw new Error('第 ' + (index + 1) + ' 个单元格式不正确');
      var steps = item.steps || item.sentences;
      if (!Array.isArray(steps) || !steps.length || steps.length > LIMITS.steps) throw new Error('每个单元需要 1–' + LIMITS.steps + ' 个短语或句子');
      var id = safeId(item.id, out.id + ':u' + (index + 1));
      if (ids[id]) throw new Error('课程中存在重复的单元标识');
      ids[id] = 1;
      return { id: id, title: string(item.title || '第 ' + (index + 1) + ' 句', 120, '单元标题'), steps: steps.map(step) };
    });
    return out;
  }
  function validateSettings(raw) {
    raw = raw || {};
    var out = Object.assign({}, DEFAULTS, raw);
    if (['build', 'recall', 'listen'].indexOf(out.mode) < 0 || ['seq', 'random'].indexOf(out.order) < 0 || typeof out.autoSpeak !== 'boolean') throw new Error('句子练习设置不正确');
    if ([4, 8, 10, 12, 16, 20, 30, 50, 100, 0].indexOf(out.size) < 0) throw new Error('每轮题数不正确');
    return { mode: out.mode, autoSpeak: out.autoSpeak, size: out.size, order: out.order };
  }
  function validateState(raw) {
    if (!object(raw)) throw new Error('句子备份格式不正确');
    checkSafe(raw);
    if (raw.version != null && raw.version !== 1) throw new Error('此句子备份版本暂不支持');
    var out = emptyState();
    out.settings = validateSettings(raw.settings);
    if (raw.courses != null && (!Array.isArray(raw.courses) || raw.courses.length > LIMITS.courses)) throw new Error('自定义课程数量超过限制');
    out.courses = (raw.courses || []).map(function (course, i) { return sanitizeCourse(course, 'custom:restored' + i, true); });
    var courseIds = {}, unitIds = {}, total = 0;
    out.courses.forEach(function (course) {
      if (courseIds[course.id]) throw new Error('备份中有重复的课程标识');
      courseIds[course.id] = 1;
      course.units.forEach(function (unit) { if (unitIds[unit.id]) throw new Error('备份中有重复的单元标识'); unitIds[unit.id] = 1; total++; });
    });
    if (total > LIMITS.totalUnits) throw new Error('自定义句子总数最多 ' + LIMITS.totalUnits + ' 个');
    ['progress', 'daily', 'attempts'].forEach(function (key) { if (raw[key] != null && !object(raw[key])) throw new Error('备份中的 ' + key + ' 格式不正确'); });
    if (Object.keys(raw.progress || {}).length > 10000 || Object.keys(raw.daily || {}).length > 5000 || Object.keys(raw.attempts || {}).length > 1000) throw new Error('备份记录数量过多');
    Object.keys(raw.progress || {}).forEach(function (id) {
      string(id, 160, '单元标识');
      var r = raw.progress[id];
      if (!object(r)) throw new Error('句子进度格式不正确');
      var p = defaultProgress();
      ['seen', 'right', 'wrong', 'bucket', 'lastAt', 'streak'].forEach(function (k) { if (r[k] != null) p[k] = number(r[k], '句子进度 ' + k); });
      ['favorite', 'needsPractice', 'review'].forEach(function (k) { if (r[k] != null) { if (typeof r[k] !== 'boolean') throw new Error('句子进度 ' + k + ' 格式不正确'); p[k] = r[k]; } });
      if (p.bucket > INTERVALS.length || p.right + p.wrong !== p.seen) throw new Error('句子进度计数不一致');
      if (r.due != null && r.due !== '') { if (!validDate(r.due)) throw new Error('复习日期不正确'); p.due = r.due; p.review = true; }
      out.progress[id] = p;
    });
    Object.keys(raw.daily || {}).forEach(function (date) {
      var r = raw.daily[date];
      if (!validDate(date) || !object(r)) throw new Error('每日统计格式不正确');
      var done = number(r.done, '练习总数'), right = number(r.right, '正确总数');
      if (right > done) throw new Error('每日正确数不能超过练习数');
      out.daily[date] = { done: done, right: right };
      if (r.courses != null) {
        if (!object(r.courses) || Object.keys(r.courses).length > 1000) throw new Error('课程每日统计格式不正确');
        out.daily[date].courses = {};
        Object.keys(r.courses).forEach(function (id) {
          var stats = r.courses[id];
          string(id, 160, '课程标识');
          if (!object(stats)) throw new Error('课程每日统计格式不正确');
          var count = number(stats.done, '课程练习数'), rightCount = number(stats.right, '课程正确数');
          if (rightCount > count || count > done || rightCount > right) throw new Error('课程每日统计计数不一致');
          out.daily[date].courses[id] = { done: count, right: rightCount };
        });
      }
    });
    Object.keys(raw.attempts || {}).slice(-500).forEach(function (id) { string(id, 400, '练习标识'); out.attempts[id] = number(raw.attempts[id], '练习时间'); });
    if (raw.session != null) out.session = validateSession(raw.session, out.courses);
    return out;
  }
  function validateSession(raw, customCourses) {
    if (!object(raw) || JSON.stringify(raw).length > 100000) throw new Error('练习会话格式不正确或过大');
    checkSafe(raw);
    var out = {}, known = {}, courseMap = {}, ids = {};
    builtins().concat(customCourses || []).forEach(function (c) {
      courseMap[c.id] = c;
      c.units.forEach(function (u) { known[u.id] = { unit: u, courseId: c.id }; });
    });
    out.id = string(raw.id, 200, '会话标识');
    if (!Array.isArray(raw.ids) || !raw.ids.length || raw.ids.length > LIMITS.units) throw new Error('会话句子列表需要 1–' + LIMITS.units + ' 个有效单元');
    out.ids = raw.ids.map(function (id) {
      if (typeof id !== 'string' || !id.trim() || id !== id.trim() || id.length > 160 || !Object.prototype.hasOwnProperty.call(known, id)) throw new Error('会话包含不存在或无效的句子标识');
      if (Object.prototype.hasOwnProperty.call(ids, id)) throw new Error('会话句子标识不能重复');
      ids[id] = true; return id;
    });
    if (['build', 'recall', 'listen'].indexOf(raw.mode) < 0) throw new Error('会话练习模式不正确');
    if (['course', 'unit', 'due', 'wrong', 'favorite', 'learned'].indexOf(raw.source) < 0) throw new Error('会话来源不正确');
    if (['typing', 'correct'].indexOf(raw.phase) < 0) throw new Error('会话答题阶段不正确');
    out.mode = raw.mode; out.source = raw.source; out.phase = raw.phase;
    out.courseId = string(raw.courseId, 160, '会话课程标识', true);
    if ((out.source === 'course' || out.source === 'unit') && (!Object.prototype.hasOwnProperty.call(courseMap, out.courseId) || out.ids.some(function (id) { return known[id].courseId !== out.courseId; }))) throw new Error('会话课程与句子列表不匹配');
    if (out.source === 'unit' && out.ids.length !== 1) throw new Error('单句会话只能包含一个句子');
    if (typeof raw.completed !== 'boolean') throw new Error('会话完成标记不正确');
    out.completed = raw.completed;
    ['index', 'step', 'correct', 'answered', 'startedAt', 'stageStartedAt'].forEach(function (key) {
      if (typeof raw[key] !== 'number' || !Number.isSafeInteger(raw[key]) || raw[key] < 0) throw new Error('会话 ' + key + ' 必须是非负整数');
      out[key] = raw[key];
    });
    if (out.index > out.ids.length || (out.completed ? out.index !== out.ids.length : out.index >= out.ids.length)) throw new Error('会话位置与完成状态不一致');
    var maxStep = out.completed ? 0 : known[out.ids[out.index]].unit.steps.length - 1;
    if (out.step > maxStep || (out.mode !== 'build' && out.step !== 0)) throw new Error('会话递进步骤超出范围');
    if (out.correct > out.answered || out.answered > out.ids.length) throw new Error('会话正确数与答题数不一致');
    if (typeof raw.input !== 'string' || raw.input.length > 12000) throw new Error('会话输入内容不正确或过长');
    out.input = raw.input;
    ['mistakes', 'hints', 'recorded'].forEach(function (key) {
      if (!object(raw[key])) throw new Error('会话 ' + key + ' 必须是答题标记对象');
      out[key] = {};
      Object.keys(raw[key]).forEach(function (id) {
        if (!Object.prototype.hasOwnProperty.call(ids, id) || typeof raw[key][id] !== 'boolean') throw new Error('会话 ' + key + ' 包含无效答题标记');
        out[key][id] = raw[key][id];
      });
    });
    var recorded = Object.keys(out.recorded), right = recorded.filter(function (id) { return out.recorded[id]; }).length;
    if (recorded.length !== out.answered || right !== out.correct || (out.completed && out.answered !== out.ids.length)) throw new Error('会话计数与已记录答案不一致');
    if (raw.roundDone != null) {
      if (!Array.isArray(raw.roundDone) || raw.roundDone.length > 10000) throw new Error('会话轮次记录格式不正确或过多');
      var roundIds = {};
      out.roundDone = raw.roundDone.map(function (id) {
        if (typeof id !== 'string' || !id.trim() || id !== id.trim() || !Object.prototype.hasOwnProperty.call(known, id) || Object.prototype.hasOwnProperty.call(roundIds, id)) throw new Error('会话轮次记录包含无效或重复的句子标识');
        roundIds[id] = true; return id;
      });
    }
    ['revealed', 'checked'].forEach(function (key) { if (raw[key] != null && typeof raw[key] !== 'boolean') throw new Error('会话 ' + key + ' 标记不正确'); if (raw[key] != null) out[key] = raw[key]; });
    return out;
  }
  var state = emptyState();
  try {
    var stored = localStorage.getItem(KEY);
    if (stored) {
      if (stored.length > LIMITS.stateBytes) throw new Error('句子本机数据过大');
      state = validateState(JSON.parse(stored));
    }
  } catch (error) { loadError = '句子本机数据读取失败：' + error.message + '。原数据已保留，请先导出或检查浏览器存储。'; }

  function commit(next, recover) {
    if (loadError && !recover) throw new Error(loadError);
    var serialized = JSON.stringify(next);
    if (serialized.length * 2 > LIMITS.stateBytes) throw new Error('句子数据超过本机存储限制，请先导出并移除部分自定义课程');
    try { localStorage.setItem(KEY, serialized); }
    catch (error) { throw new Error('句子数据保存失败，浏览器存储空间不足或已禁用。此次更改尚未保存。'); }
    state = next; loadError = null;
    listeners.slice().forEach(function (fn) { try { fn(); } catch (error) { /* 单个界面订阅者不能影响已保存的数据 */ } });
  }
  function builtins() {
    return (Array.isArray(window.TW_SENTENCE_COURSES) ? window.TW_SENTENCE_COURSES : []).map(function (raw, i) { return sanitizeCourse(raw, 'builtin:c' + (i + 1), false); });
  }
  function courses() { return builtins().concat(copy(state.courses)); }
  function course(id) { return courses().find(function (item) { return item.id === id; }) || null; }
  function units(courseId) {
    var list = [];
    courses().forEach(function (c) {
      if (courseId && c.id !== courseId) return;
      c.units.forEach(function (u) { list.push(Object.assign({}, u, { courseId: c.id, courseTitle: c.title, level: c.level, custom: c.custom })); });
    });
    return list;
  }
  function unit(id) { return units().find(function (item) { return item.id === id; }) || null; }
  function requireUnit(id) { var found = unit(id); if (!found) throw new Error('这道句子已不存在，请重新选择课程'); return found; }
  function defaultProgress() { return { seen: 0, right: 0, wrong: 0, favorite: false, bucket: 0, due: null, lastAt: 0, needsPractice: false, review: false, streak: 0 }; }
  function progress(id) { return copy(state.progress[id] || defaultProgress()); }
  function summary(courseId) {
    var list = units(courseId), today = day(), out = { total: list.length, learned: 0, mastered: 0, wrong: 0, favorite: 0, due: 0, doneToday: 0, rightToday: 0 };
    list.forEach(function (u) {
      var p = state.progress[u.id] || defaultProgress();
      if (p.seen) out.learned++;
      if (p.bucket >= INTERVALS.length && !p.needsPractice) out.mastered++;
      if (p.needsPractice) out.wrong++;
      if (p.favorite) out.favorite++;
      if (p.review && p.due && p.due <= today) out.due++;
    });
    var d = state.daily[today] || { done: 0, right: 0 };
    if (courseId) d = (d.courses && d.courses[courseId]) || { done: 0, right: 0 };
    out.doneToday = d.done; out.rightToday = d.right;
    return out;
  }
  function recordResult(id, ok, meta) {
    var currentUnit = requireUnit(id); meta = meta || {};
    var attemptId = meta.attemptId || (meta.sessionId ? meta.sessionId + ':' + id : null);
    if (attemptId) { attemptId = string(String(attemptId), 400, '练习标识'); if (state.attempts[attemptId]) return progress(id); }
    var next = copy(state), p = next.progress[id] || defaultProgress(), now = Date.now(), today = day();
    var clean = !!ok && !meta.hinted && !meta.usedHint && !meta.revealed;
    p.seen++; p.lastAt = now;
    if (clean) {
      p.right++; p.streak++; p.needsPractice = false;
      if (p.review) { p.due = addDays(today, INTERVALS[Math.min(p.bucket, INTERVALS.length - 1)]); p.bucket = Math.min(p.bucket + 1, INTERVALS.length); }
    } else {
      p.wrong++; p.streak = 0; p.needsPractice = true; p.review = true; p.bucket = 0; p.due = today;
    }
    next.progress[id] = p;
    var d = next.daily[today] || { done: 0, right: 0 }; d.done++; if (clean) d.right++;
    d.courses = d.courses || {};
    var cd = d.courses[currentUnit.courseId] || { done: 0, right: 0 }; cd.done++; if (clean) cd.right++;
    d.courses[currentUnit.courseId] = cd; next.daily[today] = d;
    if (attemptId) {
      next.attempts[attemptId] = now;
      var keys = Object.keys(next.attempts); keys.slice(0, Math.max(0, keys.length - 500)).forEach(function (key) { delete next.attempts[key]; });
    }
    commit(next); return progress(id);
  }
  function updateProgress(id, fn) { requireUnit(id); var next = copy(state), p = next.progress[id] || defaultProgress(); fn(p); p.lastAt = Date.now(); next.progress[id] = p; commit(next); return progress(id); }
  function toggleFavorite(id) { return updateProgress(id, function (p) { p.favorite = !p.favorite; }).favorite; }
  function noteDifficulty(id) { return updateProgress(id, function (p) { p.needsPractice = true; p.review = true; p.bucket = 0; p.due = day(); p.streak = 0; }); }
  function enroll(id) { return updateProgress(id, function (p) { if (!p.review) { p.review = true; p.bucket = 0; p.due = day(); } }); }
  function removeReview(id) { return updateProgress(id, function (p) { p.review = false; p.bucket = 0; p.due = null; }); }
  function reviewList(type) {
    if (['due', 'wrong', 'favorite', 'learned'].indexOf(type) < 0) throw new Error('句子列表类型不正确');
    var today = day();
    return units().filter(function (u) {
      var p = state.progress[u.id] || defaultProgress();
      if (type === 'due') return p.review && p.due && p.due <= today;
      if (type === 'wrong') return p.needsPractice;
      if (type === 'favorite') return p.favorite;
      return p.seen > 0;
    }).sort(function (a, b) { var p = progress(a.id), q = progress(b.id); return type === 'due' ? (p.due.localeCompare(q.due) || p.lastAt - q.lastAt) : q.lastAt - p.lastAt; });
  }

  function csvRows(text, delimiter) {
    var rows = [], row = [], value = '', quoted = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { value += '"'; i++; }
        else if (quoted || value === '') quoted = !quoted;
        else value += c;
      } else if (c === delimiter && !quoted) { row.push(value); value = ''; }
      else if ((c === '\n' || c === '\r') && !quoted) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(value); if (row.some(function (cell) { return cell.trim(); })) rows.push(row); row = []; value = '';
      } else value += c;
    }
    if (quoted) throw new Error('CSV 文件有未闭合的双引号');
    row.push(value); if (row.some(function (cell) { return cell.trim(); })) rows.push(row);
    return rows;
  }
  function jsonCourse(raw) {
    if (Array.isArray(raw)) return { units: raw };
    if (!object(raw)) throw new Error('JSON 需要课程对象或中英句子数组');
    if (raw.course) return raw.course;
    if (raw.steps && !raw.units) return { title: raw.title, units: [raw] };
    if (raw.pairs && !raw.units) return Object.assign({}, raw, { units: raw.pairs });
    return raw;
  }
  function subtitlePairs(text, warnings) {
    var lines = text.replace(/\r\n?/g, '\n').split('\n'), pairs = [], cue = [], active = false, skipBlock = false, timings = 0, skipped = 0;
    var timing = /^\s*(?:\d{1,3}:)?\d{2}:\d{2}[,.]\d{3}\s*-->\s*(?:\d{1,3}:)?\d{2}:\d{2}[,.]\d{3}(?:\s+.*)?$/;
    function stripMarkup(line) {
      var decoded = line.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d{1,7}|#x[0-9a-f]{1,6});/gi, function (entity) {
        var name = entity.slice(1, -1).toLowerCase(), named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
        if (Object.prototype.hasOwnProperty.call(named, name)) return named[name];
        var code = name.indexOf('#x') === 0 ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return code > 0 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF) ? String.fromCodePoint(code) : '';
      });
      return decoded.replace(/<(script|style|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<br\s*\/?\s*>|<\/(?:p|div)>/gi, '\n').replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '');
    }
    function flush() {
      if (!cue.length) return;
      var en = [], zh = [];
      stripMarkup(cue.join('\n')).split('\n').forEach(function (line) {
        line = line.trim();
        if (!line || /^\d+$/.test(line) || /-->/.test(line) || /^WEBVTT(?:\s|$)/i.test(line)) return;
        var match = line.match(/^(.*?)\s*[|｜]\s*(.*?)$/);
        if (match && /[a-z]/i.test(match[1]) && /[\u3400-\u9fff]/.test(match[2])) { en.push(match[1].trim()); zh.push(match[2].trim()); return; }
        if (match && /[\u3400-\u9fff]/.test(match[1]) && /[a-z]/i.test(match[2])) { zh.push(match[1].trim()); en.push(match[2].trim()); return; }
        match = line.match(/^([^\u3400-\u9fff]*[a-z][^\u3400-\u9fff]*)([\u3400-\u9fff][\s\S]*)$/i);
        if (match && (/[.!?;:]\s*$/.test(match[1]) || (!en.length && /\s$/.test(match[1])))) { en.push(match[1].trim()); zh.push(match[2].trim()); return; }
        if (/[\u3400-\u9fff]/.test(line)) zh.push(line);
        else if (/[a-z]/i.test(line)) en.push(line);
      });
      if (en.length) pairs.push({ en: en.join(' ').replace(/\s+/g, ' ').trim(), zh: zh.join('').trim() });
      else skipped++;
      cue = [];
    }
    lines.forEach(function (line, index) {
      var trimmed = line.trim();
      if (!trimmed) { flush(); active = false; skipBlock = false; return; }
      if (/^(?:WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/i.test(trimmed) && !active) { skipBlock = true; return; }
      if (skipBlock) return;
      if (timing.test(trimmed)) { flush(); timings++; active = true; return; }
      if (/-->/.test(trimmed) || (lines[index + 1] && timing.test(lines[index + 1].trim()))) return;
      if (active) cue.push(line);
    });
    flush();
    if (!timings) throw new Error('未找到有效的 SRT / VTT 字幕时间码，请检查文件格式');
    if (!pairs.length) throw new Error('字幕中没有找到可练习的英文内容');
    if (skipped) warnings.push(skipped + ' 条字幕没有英文，已跳过');
    return pairs;
  }
  function parseImport(text, fileName) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('请先粘贴内容或选择文件');
    if (text.length > LIMITS.bytes || byteLength(text) > LIMITS.bytes) throw new Error('导入文件过大，请控制在 1 MB 以内');
    text = text.replace(/^\uFEFF/, '').trim();
    var warnings = [], raw, title = (fileName || '我的句子课程').replace(/\.[^.]+$/, '').slice(0, 120);
    if (/\.(?:srt|vtt)$/i.test(fileName || '') || /^WEBVTT(?:\s|$)/i.test(text) || /\d{2}:\d{2}[,.]\d{3}\s*-->/.test(text)) {
      raw = { title: title, units: subtitlePairs(text, warnings) };
    } else if (/^[\[{]/.test(text)) {
      try { raw = JSON.parse(text); } catch (error) { throw new Error('JSON 格式不正确：' + error.message); }
      checkSafe(raw); raw = jsonCourse(raw);
    } else {
      var lines = text.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean), pairs = [], delimiter = null;
      if (/\.tsv$/i.test(fileName || '') || lines[0].indexOf('\t') >= 0) delimiter = '\t';
      else if (/\.csv$/i.test(fileName || '') || /^(?:"?en(?:glish)?"?|英文|英语)\s*,/i.test(lines[0]) || (lines[0].indexOf(',') >= 0 && /[\u3400-\u9fff]/.test(lines[0]))) delimiter = ',';
      if (delimiter) {
        var rows = csvRows(text, delimiter), first = rows[0] || [], enCol = -1, zhCol = -1;
        first.forEach(function (cell, i) {
          cell = cell.trim().toLowerCase();
          if (/^(en|english|英文|英语|sentence|text)$/.test(cell)) enCol = i;
          if (/^(zh|chinese|中文|汉语|translation|译文|翻译)$/.test(cell)) zhCol = i;
        });
        if (enCol >= 0 || zhCol >= 0) { if (enCol < 0) throw new Error('CSV/TSV 缺少英文列 en / english / 英文'); rows.shift(); }
        else { enCol = /[\u3400-\u9fff]/.test(first[0] || '') ? 1 : 0; zhCol = enCol === 0 ? 1 : 0; warnings.push('未识别到表头，已按前两列的语言判断中英文'); }
        rows.forEach(function (row, i) {
          if (!row[enCol] || !row[enCol].trim()) { warnings.push('第 ' + (i + 1) + ' 行没有英文，已跳过'); return; }
          pairs.push({ en: row[enCol], zh: zhCol >= 0 ? (row[zhCol] || '') : '' });
        });
      } else if (lines.some(function (line) { return /[|｜]/.test(line); })) {
        lines.forEach(function (line, i) {
          var m = line.match(/^(.*?)\s*[|｜]\s*(.*)$/);
          if (!m) { warnings.push('第 ' + (i + 1) + ' 行缺少 | 分隔符，已跳过'); return; }
          pairs.push(/[\u3400-\u9fff]/.test(m[1]) && !/[\u3400-\u9fff]/.test(m[2]) ? { en: m[2], zh: m[1] } : { en: m[1], zh: m[2] });
        });
      } else if (lines.length >= 2 && lines.some(function (line) { return /[\u3400-\u9fff]/.test(line); })) {
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i], next = lines[i + 1];
          if (next && /[\u3400-\u9fff]/.test(line) !== /[\u3400-\u9fff]/.test(next)) {
            pairs.push(/[\u3400-\u9fff]/.test(line) ? { en: next, zh: line } : { en: line, zh: next }); i++;
          } else if (/[a-z]/i.test(line) && !/[\u3400-\u9fff]/.test(line)) { pairs.push({ en: line, zh: '' }); }
          else warnings.push('第 ' + (i + 1) + ' 行没有对应英文，已跳过');
        }
      } else {
        // 用句末标点拆分文章；常见缩写和小数不拆开。无标点的独立行保留为独立题。
        lines.forEach(function (line) {
          var protectedText = line.replace(/\b(?:[a-z]\.){2,}/gi, function (m) { return m.replace(/\./g, '\uE000'); }).replace(/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)\./gi, function (m) { return m.replace('.', '\uE000'); }).replace(/(\d)\.(?=\d)/g, '$1\uE000');
          var sentences = protectedText.match(/[^.!?]+(?:[.!?]+["”']?(?=\s|$)|$)/g) || [];
          sentences.forEach(function (en) { en = en.replace(/\uE000/g, '.').trim(); if (en) pairs.push({ en: en, zh: '' }); });
        });
      }
      raw = { title: title, units: pairs };
    }
    raw = Object.assign({}, raw); if (!raw.title && !raw.name) raw.title = title;
    var parsed = sanitizeCourse(raw, 'import:preview', true), untranslated = 0;
    parsed.units.forEach(function (u) { u.steps.forEach(function (s) { if (!s.zh) untranslated++; }); });
    if (untranslated) warnings.push(untranslated + ' 条内容没有中文，将使用英文跟打，不能作为中文默写题');
    return { course: parsed, warnings: warnings };
  }
  function importCourse(raw) {
    checkSafe(raw);
    if (state.courses.length >= LIMITS.courses) throw new Error('最多保存 ' + LIMITS.courses + ' 门自定义课程');
    var id = 'custom:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2, 9), c = sanitizeCourse(raw, id, true);
    c.id = id; c.units.forEach(function (u, i) { u.id = id + ':u' + (i + 1); });
    var total = state.courses.reduce(function (sum, course) { return sum + course.units.length; }, c.units.length);
    if (total > LIMITS.totalUnits) throw new Error('自定义课程总计最多 ' + LIMITS.totalUnits + ' 个句子');
    var next = copy(state); next.courses.push(c); commit(next); return id;
  }
  function deleteCourse(id) {
    var c = state.courses.find(function (course) { return course.id === id; });
    if (!c) throw new Error('只能删除自定义课程');
    var next = copy(state); next.courses = next.courses.filter(function (course) { return course.id !== id; });
    c.units.forEach(function (u) { delete next.progress[u.id]; });
    if (next.session && JSON.stringify(next.session).indexOf(id) >= 0) next.session = null;
    commit(next); return true;
  }
  function exportCourse(id) { var c = course(id); if (!c) throw new Error('课程不存在'); return copy(c); }
  function exportState() { if (loadError) throw new Error(loadError); return copy(state); }
  function importState(raw) {
    var next = validateState(raw);
    // 与内置单元冲突的自定义 id 会让进度串课，备份导入时一并拒绝。
    var builtinIds = {}, builtinUnits = {};
    builtins().forEach(function (c) { builtinIds[c.id] = 1; c.units.forEach(function (u) { builtinUnits[u.id] = 1; }); });
    next.courses.forEach(function (c) { if (builtinIds[c.id]) throw new Error('自定义课程标识与内置课程冲突'); c.units.forEach(function (u) { if (builtinUnits[u.id]) throw new Error('自定义单元标识与内置单元冲突'); }); });
    commit(next, true); return true;
  }
  function resetProgress() { var next = copy(state); next.progress = {}; next.daily = {}; next.session = null; next.attempts = {}; commit(next); }
  function settings() { return copy(state.settings); }
  function setSetting(key, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) throw new Error('未知句子练习设置');
    var next = copy(state); next.settings[key] = value; next.settings = validateSettings(next.settings); commit(next); return settings();
  }
  function saveSession(session) {
    var valid = validateSession(session, state.courses);
    var next = copy(state); next.session = valid; commit(next);
  }
  function clearSession() { if (!state.session) return; var next = copy(state); next.session = null; commit(next); }
  function subscribe(fn) { if (typeof fn !== 'function') throw new Error('订阅者必须是函数'); listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }

  TW.sentences = {
    courses: courses, course: course, units: units, unit: unit, progress: progress, summary: summary,
    recordResult: recordResult, toggleFavorite: toggleFavorite, noteDifficulty: noteDifficulty, enroll: enroll, removeReview: removeReview, reviewList: reviewList,
    getSession: function () { return state.session ? copy(state.session) : null; }, saveSession: saveSession, clearSession: clearSession,
    settings: settings, setSetting: setSetting, normalize: normalize, compare: compare,
    parseImport: parseImport, importCourse: importCourse, deleteCourse: deleteCourse, exportCourse: exportCourse,
    exportState: exportState, importState: importState, resetProgress: resetProgress, subscribe: subscribe,
    storageKey: KEY, intervals: INTERVALS.slice(), storageError: function () { return loadError; }
  };
})();
