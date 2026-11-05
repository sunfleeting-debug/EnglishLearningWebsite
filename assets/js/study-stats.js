/* Aggregates the latest saved result per exercise; no personal text leaves the browser. */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; }
  }
  function summary() {
    var groups = { quiz: [], listening: [], trans: [], essay: [] };
    function add(group, value, max, ts) {
      if (value == null || max == null || value === '' || max === '') return;
      value = Number(value); max = Number(max);
      if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value < 0 || value > max) return;
      groups[group].push({ percent: value / max * 100, ts: Number(ts) || 0 });
    }
    var quiz = read('typingcet.quiz.v1').results || {};
    var sets = TW.quiz ? TW.quiz.all() : [];
    var seen = Object.create(null);
    sets.forEach(function (set) {
      if (seen[set.id]) return;
      seen[set.id] = true;
      var r = quiz[set.id];
      if (r) add(set.type === 'listening' ? 'listening' : 'quiz', r.right, r.total, r.ts);
    });
    var listening = read('typingcet.listen.v1').results || {};
    Object.keys(listening).forEach(function (id) { var r = listening[id]; if (r) add('listening', r.right, r.total, r.ts); });
    var writing = read('typingcet.write.v1').results || {};
    var items = ((window.TW_WRITING && window.TW_WRITING.items) || [])
      .concat(window.TW_WRITING_ZHENTI || [], TW.aiMaterials ? TW.aiMaterials.list('writing') : [],
        TW.personalMaterials ? TW.personalMaterials.writingItems() : []);
    seen = Object.create(null);
    items.forEach(function (item) {
      if (seen[item.id]) return;
      seen[item.id] = true;
      var r = writing[item.id];
      if (r && r.score != null && (item.type === 'trans' || item.type === 'essay'))
        add(item.type === 'trans' ? 'trans' : 'essay', r.score, r.max, r.ts);
    });
    Object.keys(groups).forEach(function (key) {
      var rows = groups[key], bins = [0, 0, 0], sum = 0;
      rows.forEach(function (r) { sum += r.percent; bins[r.percent < 60 ? 0 : r.percent < 80 ? 1 : 2]++; });
      groups[key] = { count: rows.length, average: rows.length ? Math.round(sum / rows.length) : null, bins: bins };
    });
    return groups;
  }
  TW.studyStats = { summary: summary };
})();
