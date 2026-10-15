/* 句子练习：原创递进课程、整句翻译、听写与本地错句复习。 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};
  var S = TW.sentences;
  var previousCleanup = null;
  var levelFilter = 'all';
  var courseSearch = '';
  var importDraft = '';
  var importTitle = '';
  var parsedImport = null;
  var modes = [
    { id: 'build', title: '递进练习', desc: '短语 → 扩展 → 完整句' },
    { id: 'recall', title: '整句翻译', desc: '看中文，独立写出英文' },
    { id: 'listen', title: '听音写句', desc: '听发音，练听力与拼写' }
  ];

  function esc(value) { return TW.esc(value); }
  function go(path) { TW.app.go('/sentences' + (path || '')); }
  function say(text) { TW.speech.speak(text, TW.store.settings.accent); }
  function sound(kind) { if (TW.store.settings.keySound && TW.speech.sound[kind]) TW.speech.sound[kind](); }
  function guarded(fn) {
    return function () {
      try { return fn.apply(this, arguments); }
      catch (error) { TW.toast(error.message || '操作未完成，请先导出备份后重试', 'err'); }
    };
  }
  function download(name, value) {
    var url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function modePicker(current) {
    return '<div class="sentence-modes" role="group" aria-label="句子练习方式">' + modes.map(function (m) {
      return '<button type="button" data-sentence-mode="' + m.id + '" aria-pressed="' + (current === m.id) + '" class="' +
        (current === m.id ? 'active' : '') + '"><b>' + m.title + '</b><span>' + m.desc + '</span></button>';
    }).join('') + '</div>';
  }
  function sentenceStats(summary) {
    return '<div class="sentence-stats">' + [
      [summary.total, '组句子'], [summary.learned, '已练习'], [summary.due, '今日待复习'], [summary.favorite, '已收藏']
    ].map(function (it) { return '<div><strong>' + it[0] + '</strong><span>' + it[1] + '</span></div>'; }).join('') + '</div>';
  }
  function render(host, query) {
    if (previousCleanup) { previousCleanup(); previousCleanup = null; }
    if (!S) throw new Error('句子练习资源未加载，请刷新页面');
    var owner = 'sentence-' + Date.now() + '-' + Math.random();
    host.dataset.owner = owner;
    function alive() { return host.dataset.owner === owner; }
    if (query.run === '1') {
      var session = S.getSession();
      if (session && session.ids && session.ids.length) { renderPractice(host, session, alive); return; }
    }
    renderLibrary(host, query);
  }

  function startSession(courseId, source, unitId, force, excludeIds) {
    var saved = S.getSession();
    if (!force && saved && !saved.completed && saved.courseId === courseId && saved.source === source && !unitId) {
      go('?run=1'); return;
    }
    var prefs = S.settings();
    var list = unitId ? [S.unit(unitId)] : source === 'course' ? S.units(courseId) : S.reviewList(source);
    list = list.filter(Boolean);
    excludeIds = excludeIds || [];
    if (excludeIds.length) list = list.filter(function (unit) { return excludeIds.indexOf(unit.id) < 0; });
    if (!force && source === 'course') {
      var fresh = list.filter(function (unit) { return !S.progress(unit.id).seen; });
      if (fresh.length) list = fresh;
    }
    if (prefs.order === 'random' && !unitId) list = TW.shuffle(list);
    if (!list.length) { TW.toast('这一组暂时没有句子，先选择一门课程吧'); return; }
    list = list.slice(0, prefs.size || 8);
    var session = {
      id: 'sentence-session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      source: source, courseId: courseId || '', ids: list.map(function (unit) { return unit.id; }),
      index: 0, step: 0, mode: prefs.mode || 'build', input: '', phase: 'typing',
      mistakes: {}, hints: {}, recorded: {}, correct: 0, answered: 0,
      startedAt: Date.now(), stageStartedAt: Date.now(), completed: false
    };
    session.roundDone = excludeIds.slice();
    S.saveSession(session); go('?run=1');
  }

  function renderLibrary(host, query) {
    var tab = ['courses', 'review', 'favorites', 'import'].indexOf(query.tab) >= 0 ? query.tab : 'courses';
    var summary = S.summary();
    var saved = S.getSession();
    var prefs = S.settings();
    host.innerHTML = '<div class="wrap sentence-page" id="sentence-page">' +
      '<div class="sentence-hero"><div><span class="sentence-eyebrow">SENTENCE STUDIO · 句子练习</span>' +
      '<h1>把认识的单词，<br>变成说得出的句子。</h1>' +
      '<p>从短语一步步写到完整表达，也可以直接挑战整句翻译。<br class="sentence-desktop-break">每次多写一点，让英语自然连起来。</p>' +
      '<div class="row"><button class="btn primary" id="sentence-quick-start">' + TW.icon('play', 16) +
        (saved && !saved.completed ? '继续上次练习' : '开始第一课') + '</button>' +
      '<button class="btn ghost" id="sentence-go-import">导入我的句子 ' + TW.icon('arrowRight', 15) + '</button></div></div>' +
      '<div class="sentence-hero-example" aria-hidden="true"><span>每天进步一点点</span><p>I learn.</p><p>I learn English.</p><p>I learn English <em>every day.</em></p><small>短句 · 扩展 · 自由表达</small></div></div>' +
      sentenceStats(summary) +
      (S.storageError() ? '<p class="sentence-warning" role="alert">' + esc(S.storageError()) + '</p>' : '') +
      '<div class="sentence-tabs" role="group" aria-label="句子内容">' + [
        ['courses', '分级课程'], ['review', '错句与复习' + (summary.due ? ' · ' + summary.due : '')], ['favorites', '我的收藏'], ['import', '导入课程']
      ].map(function (it) { return '<button data-sentence-tab="' + it[0] + '" aria-pressed="' + (tab === it[0]) + '" class="' + (tab === it[0] ? 'active' : '') + '">' + it[1] + '</button>'; }).join('') + '</div>' +
      '<div id="sentence-library-body"></div>' +
      '<p class="sentence-local-note">' + TW.icon('shield', 14) + ' 句子课程与记录保存在当前浏览器，可随整站备份导出；当前账号云同步仅包含单词数据。</p></div>';
    TW.$$('[data-sentence-tab]', host).forEach(function (button) {
      button.addEventListener('click', function () { go('?tab=' + button.dataset.sentenceTab); });
    });
    TW.$('#sentence-quick-start', host).onclick = guarded(function () {
      if (saved && !saved.completed) go('?run=1');
      else startSession(S.courses()[0].id, 'course');
    });
    TW.$('#sentence-go-import', host).onclick = function () { go('?tab=import'); };
    var body = TW.$('#sentence-library-body', host);
    if (tab === 'import') { renderImport(body); return; }
    if (tab === 'review' || tab === 'favorites') { renderReview(body, tab, query); return; }
    body.innerHTML = '<div class="sentence-course-tools"><div><h2>选一门课，开始连句成篇</h2>' +
      '<p class="muted small">A1 基础表达 · A2 场景应用 · B1 观点与长句。每组按顺序逐步扩展。</p></div>' +
      '<label class="sentence-search">' + TW.icon('search', 16) + '<input id="sentence-search" aria-label="搜索句子课程" placeholder="搜索课程或主题" value="' + esc(courseSearch) + '"></label></div>' +
      '<div class="sentence-filters" aria-label="按级别筛选">' + ['all', 'A1', 'A2', 'B1', 'custom'].map(function (level) {
        return '<button data-sentence-level="' + level + '" aria-pressed="' + (levelFilter === level) + '" class="' + (levelFilter === level ? 'active' : '') + '">' +
          ({ all: '全部课程', custom: '我的课程' }[level] || level) + '</button>';
      }).join('') + '</div><div id="sentence-course-grid" class="sentence-course-grid"></div>' +
      '<details class="sentence-options"><summary>练习方式与偏好</summary><div class="sentence-options-body">' +
      modePicker(prefs.mode) + '<div class="sentence-preferences"><label>每轮句子组数 <select class="field" id="sentence-session-size">' +
      [4, 8, 12, 20, 50].map(function (size) { return '<option value="' + size + '"' + (prefs.size === size ? ' selected' : '') + '>' + size + ' 组</option>'; }).join('') +
      '</select></label><label>练习顺序 <select class="field" id="sentence-order"><option value="seq"' + (prefs.order === 'seq' ? ' selected' : '') + '>顺序</option><option value="random"' + (prefs.order === 'random' ? ' selected' : '') + '>随机</option></select></label>' +
      '<label class="sentence-check"><input type="checkbox" id="sentence-auto-speak"' + (prefs.autoSpeak ? ' checked' : '') + '> 答对后自动朗读</label></div></div></details>';
    function drawCourses() {
      var all = S.courses();
      var list = all.filter(function (course) {
        var custom = !!course.custom || course.id.indexOf('custom-') === 0;
        return (levelFilter === 'all' || (levelFilter === 'custom' ? custom : course.level === levelFilter)) &&
          (!courseSearch || (course.title + ' ' + course.description + ' ' + course.category).toLowerCase().indexOf(courseSearch.toLowerCase()) >= 0);
      });
      var grid = TW.$('#sentence-course-grid', body);
      grid.innerHTML = list.length ? list.map(function (course, index) {
        var st = S.summary(course.id), units = S.units(course.id), custom = !!course.custom || course.id.indexOf('custom-') === 0;
        var active = saved && !saved.completed && saved.courseId === course.id;
        var prompts = units.reduce(function (sum, unit) { return sum + unit.steps.length; }, 0);
        return '<article class="sentence-course-card" data-course="' + esc(course.id) + '"><div class="sentence-course-top"><span class="sentence-level">' + esc(course.level || '自选') + '</span><span class="muted small">' + esc(custom ? '自定义课程' : course.category || '分级课程') + '</span></div>' +
          '<div class="sentence-course-number">' + String(all.indexOf(course) + 1).padStart(2, '0') + '</div><h3>' + esc(course.title) + '</h3>' +
          '<p class="sentence-course-desc">' + esc(course.description || '用自己的素材，练习熟悉的表达。') + '</p>' +
          '<div class="sentence-course-meta">' + units.length + ' 组句子 <span>·</span> ' + prompts + ' 步递进</div>' +
          '<div class="sentence-course-progress"><span>已练 ' + st.learned + ' / ' + st.total + ' 组</span><span>' + TW.pct(st.learned, st.total) + '%</span></div>' +
          '<div class="progress-line"><i style="width:' + TW.pct(st.learned, st.total) + '%"></i></div>' +
          '<button class="btn primary sentence-course-start" data-start="' + esc(course.id) + '">' + (active ? '继续练习' : st.learned === st.total ? '再练一轮' : st.learned ? '学习下一组' : '开始练习') + TW.icon('arrowRight', 16) + '</button>' +
          '<details class="sentence-course-preview"><summary>看看这门课</summary><div>' + units.slice(0, 12).map(function (unit) {
            var last = unit.steps[unit.steps.length - 1];
            return '<button class="sentence-unit-row" data-unit="' + esc(unit.id) + '"><span>' + esc(last.zh || unit.title) + '</span><small lang="en">' + esc(last.en) + '</small></button>';
          }).join('') + (units.length > 12 ? '<p class="small muted">预览前 12 组；开始练习可学习全部 ' + units.length + ' 组。</p>' : '') + '</div></details>' +
          (custom ? '<div class="sentence-course-actions"><button class="btn sm ghost" data-export-course="' + esc(course.id) + '">导出课程</button><button class="btn sm ghost" data-delete-course="' + esc(course.id) + '">删除课程</button></div>' : '') + '</article>';
      }).join('') : '<div class="sentence-empty">没有找到匹配课程，试试其他级别，或导入自己的句子。</div>';
      TW.$$('[data-start]', grid).forEach(function (button) { button.onclick = guarded(function () { startSession(button.dataset.start, 'course'); }); });
      bindUnitButtons(grid);
      TW.$$('[data-export-course]', grid).forEach(function (button) { button.onclick = function () { download(button.dataset.exportCourse + '.json', S.exportCourse(button.dataset.exportCourse)); }; });
      TW.$$('[data-delete-course]', grid).forEach(function (button) { button.onclick = guarded(function () {
        if (confirm('删除这门自定义课程及其句子学习记录？需要保留时请先导出课程。')) {
          S.deleteCourse(button.dataset.deleteCourse); drawCourses();
        }
      }); });
    }
    drawCourses();
    TW.$('#sentence-search', body).oninput = function (event) { courseSearch = event.target.value; drawCourses(); };
    TW.$$('[data-sentence-level]', body).forEach(function (button) { button.onclick = function () {
      levelFilter = button.dataset.sentenceLevel;
      TW.$$('[data-sentence-level]', body).forEach(function (item) { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', item === button); });
      drawCourses();
    }; });
    TW.$$('[data-sentence-mode]', body).forEach(function (button) { button.onclick = guarded(function () {
      S.setSetting('mode', button.dataset.sentenceMode);
      TW.$$('[data-sentence-mode]', body).forEach(function (item) { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', item === button); });
    }); });
    TW.$('#sentence-session-size', body).onchange = guarded(function (e) { S.setSetting('size', Number(e.target.value)); });
    TW.$('#sentence-order', body).onchange = guarded(function (e) { S.setSetting('order', e.target.value); });
    TW.$('#sentence-auto-speak', body).onchange = guarded(function (e) { S.setSetting('autoSpeak', e.target.checked); });
  }

  function bindUnitButtons(host) {
    TW.$$('[data-unit]', host).forEach(function (button) { button.onclick = guarded(function () {
      var unit = S.unit(button.dataset.unit);
      if (unit) startSession(unit.courseId, 'unit', unit.id, true);
    }); });
  }

  function renderReview(host, tab, query) {
    var filter = tab === 'favorites' ? 'favorite' : query.filter === 'wrong' ? 'wrong' : query.filter === 'learned' ? 'learned' : 'due';
    var list = S.reviewList(filter);
    var titles = { favorite: '把喜欢的表达，变成自己的话', wrong: '把不熟的句子，再写一遍', due: '今天的复习，刚刚好', learned: '回顾已经练过的句子' };
    host.innerHTML = '<div class="sentence-review-head"><div><h2>' + titles[filter] + '</h2><p class="muted small">' +
      (filter === 'due' ? '错句当天重新练；独立答对后按 1 / 2 / 4 / 7 / 15 / 30 / 60 天安排复习。' : '提示过、跳过或曾答错的这一组会计入错句，独立答对后移出待攻克。') +
      '</p></div>' + (list.length ? '<button class="btn primary" id="sentence-review-start">' + TW.icon('play', 16) + ' 练习这组 · ' + list.length + '</button>' : '') + '</div>' +
      (tab === 'review' ? '<div class="sentence-filters">' + [['due', '今日到期'], ['wrong', '待攻克错句'], ['learned', '全部已练']].map(function (it) {
        return '<button data-review-filter="' + it[0] + '" class="' + (filter === it[0] ? 'active' : '') + '">' + it[1] + ' · ' + S.reviewList(it[0]).length + '</button>';
      }).join('') + '</div>' : '') +
      (list.length ? '<div class="sentence-review-list">' + list.slice(0, 100).map(function (unit) {
        var last = unit.steps[unit.steps.length - 1], progress = S.progress(unit.id);
        return '<article><button class="sentence-review-main" data-unit="' + esc(unit.id) + '"><span lang="en">' + esc(last.en) + '</span><span>' + esc(last.zh || '未提供中文，可看英文跟打') + '</span><small>' + esc(unit.courseTitle) + (progress.due ? ' · 下次复习 ' + esc(progress.due) : '') + '</small></button>' +
          '<div class="sentence-review-actions"><button class="icon-btn" data-say-unit="' + esc(unit.id) + '" aria-label="朗读句子">' + TW.icon('volume', 18) + '</button>' +
          '<button class="icon-btn' + (progress.favorite ? ' is-favorite' : '') + '" data-fav-unit="' + esc(unit.id) + '" aria-label="' + (progress.favorite ? '取消收藏' : '收藏句子') + '">' + TW.icon('star', 18) + '</button></div></article>';
      }).join('') + '</div>' + (list.length > 100 ? '<p class="small muted">显示前 100 组，点击「练习这组」按批次学习全部句子。</p>' : '') :
        '<div class="sentence-empty"><span>' + TW.icon(filter === 'favorite' ? 'star' : 'check', 32) + '</span><h3>' + (filter === 'favorite' ? '遇到喜欢的表达，就点一下星星' : '现在没有待练句子') + '</h3><p>先学一门课程，学习记录会出现在这里。</p><button class="btn" id="sentence-review-courses">去选课程</button></div>');
    if (TW.$('#sentence-review-start', host)) TW.$('#sentence-review-start', host).onclick = guarded(function () { startSession('', filter, '', true); });
    if (TW.$('#sentence-review-courses', host)) TW.$('#sentence-review-courses', host).onclick = function () { go(); };
    TW.$$('[data-review-filter]', host).forEach(function (button) { button.onclick = function () { go('?tab=review&filter=' + button.dataset.reviewFilter); }; });
    bindUnitButtons(host);
    TW.$$('[data-say-unit]', host).forEach(function (button) { button.onclick = function () { var unit = S.unit(button.dataset.sayUnit); say(unit.steps[unit.steps.length - 1].en); }; });
    TW.$$('[data-fav-unit]', host).forEach(function (button) { button.onclick = guarded(function () { S.toggleFavorite(button.dataset.favUnit); renderReview(host, tab, query); }); });
  }

  function renderImport(host) {
    host.innerHTML = '<div class="sentence-import-layout"><section class="card card-pad"><span class="sentence-eyebrow">YOUR WORDS, YOUR PRACTICE</span><h2>把自己的素材，变成练习</h2>' +
      '<p class="muted">粘贴中英句对、英文文章，或选择 JSON / CSV / TSV / TXT / SRT 字幕文件。先预览，再加入课程。</p>' +
      '<label class="sentence-label" for="sentence-import-title">课程名称</label><input class="field" id="sentence-import-title" maxlength="80" placeholder="例如：我的出行口语" value="' + esc(importTitle) + '">' +
      '<label class="sentence-label" for="sentence-import-text">句子素材</label><textarea class="field" id="sentence-import-text" rows="9" spellcheck="false" placeholder="I read every day. | 我每天阅读。&#10;Could you help me? | 你能帮帮我吗？">' + esc(importDraft) + '</textarea>' +
      '<div class="row"><button class="btn" id="sentence-import-choose">' + TW.icon('file', 16) + ' 选择文件</button><input type="file" id="sentence-import-file" accept=".json,.csv,.tsv,.txt,.srt,.vtt,text/plain,application/json,text/csv" hidden>' +
      '<button class="btn primary" id="sentence-import-preview">预览课程 ' + TW.icon('arrowRight', 16) + '</button></div>' +
      '<div id="sentence-import-result" aria-live="polite"></div></section><aside class="sentence-import-guide"><h3>支持这些写法</h3>' +
      '<div><b>中英句对</b><pre>I read every day. | 我每天阅读。&#10;I enjoy learning. | 我喜欢学习。</pre></div>' +
      '<div><b>表格文件</b><p>CSV / TSV 使用 <code>en,zh</code> 或 <code>english,chinese</code> 两列；英文里有逗号时请用双引号包住。</p></div>' +
      '<div><b>英文文章 / 字幕</b><p>按句子拆分为练习；没有中文时会显示英文供跟打，不会凭空生成翻译。音视频可先导出 SRT / VTT 字幕再导入。</p></div>' +
      '<div><b>递进课程 JSON</b><p>可保留自己编排的短语 → 完整句步骤，支持每步的等价英文答案。下面可下载示例。</p><button class="btn sm" id="sentence-import-example">下载课程示例</button></div>' +
      '<p class="small muted">导入内容只在浏览器中处理。请先检查预览里的英文和释义。</p></aside></div>';
    var fileName = '';
    var input = TW.$('#sentence-import-text', host), title = TW.$('#sentence-import-title', host), result = TW.$('#sentence-import-result', host);
    function invalidate() { parsedImport = null; result.innerHTML = ''; }
    input.oninput = function () { importDraft = input.value; fileName = ''; invalidate(); };
    title.oninput = function () { importTitle = title.value; invalidate(); };
    TW.$('#sentence-import-choose', host).onclick = function () { TW.$('#sentence-import-file', host).click(); };
    TW.$('#sentence-import-file', host).onchange = function (event) {
      var file = event.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { TW.toast('文件过大，请控制在 2 MB 以内', 'err'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        if (!host.isConnected) return;
        fileName = file.name; input.value = String(reader.result); importDraft = input.value;
        if (!title.value) { title.value = file.name.replace(/\.[^.]+$/, ''); importTitle = title.value; }
        invalidate(); TW.$('#sentence-import-preview', host).click();
      };
      reader.onerror = function () { TW.toast('文件读取失败，请重新选择', 'err'); };
      reader.readAsText(file, 'utf-8');
    };
    TW.$('#sentence-import-preview', host).onclick = function () {
      try {
        parsedImport = S.parseImport(input.value, fileName);
        if (title.value.trim()) parsedImport.course.title = title.value.trim();
        var course = parsedImport.course;
        result.innerHTML = '<div class="sentence-import-result"><h3>准备好了 · ' + course.units.length + ' 组句子</h3><p>' + esc(course.title || '我的课程') + '</p>' +
          ((parsedImport.warnings || []).length ? '<p class="sentence-warning">' + parsedImport.warnings.map(esc).join('<br>') + '</p>' : '') +
          '<div class="sentence-import-preview-list">' + course.units.slice(0, 5).map(function (unit) { var last = unit.steps[unit.steps.length - 1]; return '<div><b lang="en">' + esc(last.en) + '</b><span>' + esc(last.zh || '无中文，将使用英文跟打') + '</span><small>' + unit.steps.length + ' 步递进</small></div>'; }).join('') + '</div>' +
          '<button class="btn primary" id="sentence-import-confirm">确认加入课程</button></div>';
        TW.$('#sentence-import-confirm', host).onclick = guarded(function () {
          var id = S.importCourse(parsedImport.course);
          importDraft = ''; importTitle = ''; parsedImport = null;
          TW.toast('课程已加入，可以开始练习了', 'ok');
          go();
        });
      } catch (error) { parsedImport = null; result.innerHTML = '<p class="sentence-warning" role="alert">' + esc(error.message || '无法识别素材格式') + '</p>'; }
    };
    TW.$('#sentence-import-example', host).onclick = function () {
      download('sentence-course-example.json', { title: '我的第一门句子课', level: 'A1', description: '从短句练到完整表达', units: [{ title: '每天阅读', steps: [
        { en: 'I read.', zh: '我阅读。' }, { en: 'I read a book.', zh: '我读一本书。' }, { en: 'I read a book every evening.', zh: '我每天晚上读一本书。' }
      ] }] });
    };
  }

  function renderPractice(host, session, alive) {
    var timer = null;
    var composing = false;
    function persist() { S.saveSession(session); }
    function currentUnit() { return S.unit(session.ids[session.index]); }
    function currentStage() {
      var unit = currentUnit();
      return unit.steps[session.mode === 'build' ? Math.min(session.step, unit.steps.length - 1) : unit.steps.length - 1];
    }
    function indexInUnit() { return session.mode === 'build' ? session.step : currentUnit().steps.length - 1; }
    function stageCount() { return session.mode === 'build' ? currentUnit().steps.length : 1; }
    function focus() {
      clearTimeout(timer);
      timer = setTimeout(function () { if (alive()) { var input = TW.$('#sentence-input', host); if (input) input.focus({ preventScroll: true }); } }, 40);
    }
    function markResult(ok) {
      var unit = currentUnit();
      if (session.recorded[unit.id] != null) return;
      S.recordResult(unit.id, ok, { attemptId: session.id + ':' + unit.id, mode: session.mode, hinted: !!session.hints[unit.id], seconds: Math.round((Date.now() - session.stageStartedAt) / 1000) });
      session.recorded[unit.id] = ok;
      session.answered++; if (ok) session.correct++;
    }
    function switchMode(mode) {
      if (session.mode === mode) return;
      session.mode = mode; S.setSetting('mode', mode);
      session.phase = 'typing'; session.input = ''; session.step = 0;
      session.revealed = false; session.checked = false;
      composing = false;
      persist(); draw();
      if (mode === 'listen') say(currentStage().en);
    }
    function submit() {
      if (composing || session.completed) return;
      if (session.phase === 'correct') { next(); return; }
      var input = TW.$('#sentence-input', host);
      if (!input || !input.value.trim()) { if (input) input.focus(); return; }
      session.input = input.value;
      var stage = currentStage();
      if (S.compare(input.value, stage.en, stage.alternatives)) {
        session.phase = 'correct'; session.checked = false;
        if (session.mode !== 'build' || session.step === currentUnit().steps.length - 1) markResult(!session.mistakes[currentUnit().id] && !session.hints[currentUnit().id]);
        persist(); sound('correct'); draw();
        if (S.settings().autoSpeak) say(stage.en);
      } else {
        session.mistakes[currentUnit().id] = true; session.checked = true;
        S.noteDifficulty(currentUnit().id);
        persist(); sound('wrong');
        var feedback = TW.$('#sentence-feedback', host);
        feedback.className = 'sentence-feedback is-error';
        feedback.textContent = '还有几个词需要调整。红色部分可以直接修改，正确的内容会保留。';
        updateWords(); selectFirstError();
      }
    }
    function hint() {
      if (session.phase === 'correct') return;
      session.revealed = !session.revealed;
      if (session.revealed) { session.hints[currentUnit().id] = true; S.noteDifficulty(currentUnit().id); }
      persist();
      var reveal = TW.$('#sentence-target', host);
      reveal.hidden = !session.revealed;
      reveal.textContent = currentStage().en;
      TW.$('#sentence-hint', host).textContent = session.revealed ? '收起答案' : '查看答案';
      if (session.revealed) {
        var feedback = TW.$('#sentence-feedback', host);
        feedback.className = 'sentence-feedback';
        feedback.textContent = '这组将记为辅助练习并加入复习，之后独立答对再延长间隔。';
      }
      focus();
    }
    function next() {
      if (session.phase !== 'correct') return;
      if (session.mode === 'build' && session.step < currentUnit().steps.length - 1) session.step++;
      else { session.index++; session.step = 0; }
      session.phase = 'typing'; session.input = ''; session.revealed = false; session.checked = false; session.stageStartedAt = Date.now();
      if (session.index >= session.ids.length) session.completed = true;
      persist(); draw();
      if (session.completed) sound('complete');
      else if (session.mode === 'listen') say(currentStage().en);
    }
    function skip() {
      session.mistakes[currentUnit().id] = true; markResult(false);
      session.phase = 'correct'; session.step = currentUnit().steps.length - 1;
      next();
    }
    function previous() {
      if (session.mode === 'build' && session.step > 0) session.step--;
      else if (session.index > 0) { session.index--; session.step = 0; }
      else return;
      session.phase = 'typing'; session.input = ''; session.revealed = false; session.checked = false;
      persist(); draw();
    }
    function words(text) { return S.normalize(text).split(/\s+/).filter(Boolean); }
    function feedbackAnswer(text) {
      var stage = currentStage(), candidates = [stage.en].concat(stage.alternatives || []);
      var exact = candidates.find(function (answer) { return S.compare(text, answer); });
      if (exact) return exact;
      var got = words(text), best = candidates[0], bestScore = -1;
      candidates.forEach(function (answer) {
        var target = words(answer), score = 0, prefix = true;
        got.forEach(function (word, index) {
          if (word === target[index]) score += prefix ? 3 : 1;
          else prefix = false;
        });
        if (score > bestScore) { best = answer; bestScore = score; }
      });
      return best;
    }
    function updateWords() {
      var stage = currentStage(), input = TW.$('#sentence-input', host), output = TW.$('#sentence-words', host);
      if (!input || !output) return;
      var expected = words(feedbackAnswer(input.value)), got = words(input.value);
      output.innerHTML = expected.map(function (word, index) {
        var text = got[index];
        return '<span class="sentence-word ' + (!text ? 'pending' : word === text ? 'good' : 'bad') + '">' + (text ? esc(text) : '<i>' + '·'.repeat(Math.min(word.length, 9)) + '</i>') + '</span>';
      }).join('') + got.slice(expected.length).map(function (word) { return '<span class="sentence-word bad">' + esc(word) + '</span>'; }).join('');
    }
    function selectFirstError() {
      var input = TW.$('#sentence-input', host), expected = words(feedbackAnswer(input.value)), got = words(input.value);
      var index = expected.findIndex(function (word, i) { return word !== got[i]; });
      if (index < 0) index = expected.length;
      var matches = [], match, pattern = /\S+/g;
      while ((match = pattern.exec(input.value))) matches.push(match);
      var selected = matches[index];
      input.focus(); input.setSelectionRange(selected ? selected.index : input.value.length, selected ? selected.index + selected[0].length : input.value.length);
    }
    function drawComplete() {
      var elapsed = Math.max(1, Math.round((Date.now() - session.startedAt) / 1000));
      var nextExcluded = (session.roundDone || []).concat(session.ids);
      var candidates = session.source === 'course' ? S.units(session.courseId).filter(function (unit) { return !S.progress(unit.id).seen; }) : session.source === 'unit' ? [] : S.reviewList(session.source);
      var remaining = session.source === 'course' ? candidates.length : candidates.filter(function (unit) { return nextExcluded.indexOf(unit.id) < 0; }).length;
      var primaryLabel = session.source === 'unit' ? '再练这组' : remaining ? '学习下一组 · ' + remaining + ' 组待练' : session.source === 'course' || candidates.length ? '再练一轮' : '回到课程';
      host.innerHTML = '<div class="wrap-narrow sentence-complete" id="sentence-complete"><span class="sentence-eyebrow">ONE STEP FURTHER</span><div class="sentence-complete-mark">' + TW.icon('check', 36) + '</div>' +
        '<h1>又多了一些，能说出口的表达。</h1><p class="muted">这一轮完成了 ' + session.ids.length + ' 组句子。每一次认真写下，都会留下进步。</p>' +
        '<div class="sentence-result-stats"><div><strong>' + session.correct + '</strong><span>独立答对</span></div><div><strong>' + (session.answered - session.correct) + '</strong><span>需要再练</span></div><div><strong>' + TW.fmtTime(elapsed) + '</strong><span>本轮用时</span></div></div>' +
        '<div class="sentence-complete-actions"><button class="btn primary" id="sentence-next-group">' + primaryLabel + TW.icon('arrowRight', 16) + '</button><button class="btn" id="sentence-back-courses">回到课程</button><button class="btn ghost" id="sentence-open-review">去复习错句</button></div>' +
        '<p class="small muted">答错、跳过或看过答案的句子已加入复习。句子记录只保存在本机。</p></div>';
      TW.$('#sentence-next-group', host).onclick = guarded(function () {
        var course = session.courseId, source = session.source;
        S.clearSession();
        if (source === 'unit') startSession(course, 'unit', session.ids[0], true);
        else if (source === 'course') startSession(course, 'course', '', !remaining);
        else if (remaining) startSession('', source, '', true, nextExcluded);
        else if (candidates.length) startSession('', source, '', true);
        else { go(); TW.toast('这一组已完成，选一门新课程继续吧'); }
      });
      TW.$('#sentence-back-courses', host).onclick = function () { go(); };
      TW.$('#sentence-open-review', host).onclick = function () { go('?tab=review'); };
    }
    function draw() {
      if (!alive()) return;
      if (session.completed || session.index >= session.ids.length) { drawComplete(); return; }
      var unit = currentUnit();
      if (!unit) { S.clearSession(); go(); TW.toast('这门自定义课程已不存在，请重新选课'); return; }
      var stage = currentStage(), correct = session.phase === 'correct', finalStep = session.mode !== 'build' || session.step === unit.steps.length - 1;
      if (!stage.zh && !session.hints[unit.id]) { session.hints[unit.id] = true; S.noteDifficulty(unit.id); persist(); }
      var previousStage = session.mode === 'build' && session.step > 0 ? unit.steps[session.step - 1] : null;
      var progress = S.progress(unit.id);
      var revealed = !!session.revealed || !stage.zh;
      host.innerHTML = '<div class="wrap sentence-practice-page" id="sentence-practice"><div class="sentence-practice-top"><button class="btn ghost" id="sentence-exit">' + TW.icon('arrowLeft', 16) + ' 返回课程</button><span>' + esc(unit.courseTitle) + ' <span class="sentence-level">' + esc(unit.level || '自选') + '</span></span><span class="small muted">进度自动保存在本机</span></div>' +
        modePicker(session.mode) +
        '<div class="sentence-session-progress"><div><span>第 <b>' + (session.index + 1) + '</b> / ' + session.ids.length + ' 组</span><span>' + (session.mode === 'build' ? '递进第 ' + (session.step + 1) + ' / ' + stageCount() + ' 步' : '完整句子') + '</span></div><div class="progress-line"><i style="width:' + Math.round((session.index + (correct && finalStep ? 1 : 0)) / session.ids.length * 100) + '%"></i></div></div>' +
        '<section class="sentence-workspace"><div class="sentence-workspace-meta"><span class="sentence-eyebrow">' + (session.mode === 'listen' ? 'LISTEN & TYPE · 听音写句' : session.mode === 'build' ? 'BUILD IT UP · 逐步扩展' : 'MAKE IT YOURS · 整句翻译') + '</span><button id="sentence-favorite" class="icon-btn' + (progress.favorite ? ' is-favorite' : '') + '" aria-label="' + (progress.favorite ? '取消收藏' : '收藏句子') + '" aria-pressed="' + !!progress.favorite + '">' + TW.icon('star', 18) + '</button></div>' +
        (previousStage ? '<div class="sentence-previous"><span>上一小步</span><span lang="en">' + esc(previousStage.en) + '</span></div>' : '') +
        '<div class="sentence-prompt"><span class="sentence-prompt-label">' + (session.mode === 'listen' ? '听一听，把这句话写下来' : '用英文写出这句表达') + '</span><h1>' + esc(session.mode === 'listen' ? '让耳朵先认识这句话。' : stage.zh || '这条素材没有中文，请看英文跟打。') + '</h1></div>' +
        '<div id="sentence-target" class="sentence-target" lang="en"' + (revealed || correct ? '' : ' hidden') + '>' + esc(stage.en) + '</div>' +
        '<div class="sentence-input-shell' + (correct ? ' is-correct' : '') + '"><label for="sentence-input" class="sr-only">输入英文句子</label><textarea id="sentence-input" rows="2" lang="en" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-describedby="sentence-input-help sentence-feedback" placeholder="Type your answer here…"' + (correct ? ' readonly' : '') + '>' + esc(session.input || '') + '</textarea><div id="sentence-words" class="sentence-words" aria-hidden="true"></div></div>' +
        '<p id="sentence-input-help" class="sentence-input-help">忽略大小写与常见标点；需要使用题目对应的词语和语序。</p>' +
        '<div id="sentence-feedback" class="sentence-feedback' + (correct ? ' is-success' : session.checked ? ' is-error' : '') + '" role="status" aria-live="polite">' +
          (correct ? (finalStep ? session.recorded[unit.id] ? '很好，这组已独立完成。' : '这组练完了，之后独立再练一次会更牢。' : '写对了，再把它扩展一点。') : session.checked ? '修改标红的部分再试一次，正确的内容会保留。' : !stage.zh ? '这组为英文跟打，计入辅助练习，不会延长复习间隔。' : '') + '</div>' +
        '<div class="sentence-submit-row"><div class="row"><button class="btn" id="sentence-speak">' + TW.icon('volume', 17) + ' ' + (session.mode === 'listen' ? '播放 / 重听' : '朗读') + '<kbd>Alt S</kbd></button><button class="btn ghost" id="sentence-hint"' + (correct ? ' disabled' : '') + '>' + (revealed ? '收起答案' : '查看答案') + '<kbd>Alt H</kbd></button></div>' +
          (correct ? '<button class="btn primary" id="sentence-next">' + (finalStep ? session.index === session.ids.length - 1 ? '查看本轮结果' : '下一组句子' : '下一小步') + TW.icon('arrowRight', 17) + '<kbd>Enter</kbd></button>' : '<button class="btn primary" id="sentence-submit">检查答案 ' + TW.icon('check', 17) + '<kbd>Enter</kbd></button>') + '</div>' +
        '<div class="sentence-bottom-tools"><button class="btn ghost sm" id="sentence-prev"' + (session.index === 0 && session.step === 0 ? ' disabled' : '') + '>上一小步</button><span class="small muted">' + (session.hints[unit.id] || session.mistakes[unit.id] ? '本组将加入错句复习' : 'Alt F 收藏 · Esc 暂停并返回') + '</span>' + (correct ? '<button class="btn ghost sm" id="sentence-retry">同句再练</button>' : '<button class="btn ghost sm" id="sentence-skip">先跳过这组</button>') + '</div></section>' +
        '<p class="sentence-practice-note">' + (session.mode === 'build' ? '每一组从简短表达开始。你只需要专注眼前这一步。' : '翻译可能有多种表达；本练习按课程目标句及预设等价答案判题。') + '</p></div>';
      var input = TW.$('#sentence-input', host);
      input.oncompositionstart = function () { composing = true; };
      input.oncompositionend = function () { composing = false; session.input = input.value; guarded(persist)(); updateWords(); };
      input.oninput = function () { session.input = input.value; guarded(persist)(); updateWords(); };
      TW.$('#sentence-exit', host).onclick = guarded(function () { persist(); go(); });
      TW.$$('[data-sentence-mode]', host).forEach(function (button) { button.onclick = guarded(function () { switchMode(button.dataset.sentenceMode); }); });
      TW.$('#sentence-favorite', host).onclick = guarded(function () { S.toggleFavorite(unit.id); var active = S.progress(unit.id).favorite; this.classList.toggle('is-favorite', active); this.setAttribute('aria-pressed', active); this.setAttribute('aria-label', active ? '取消收藏' : '收藏句子'); });
      TW.$('#sentence-speak', host).onclick = function () { say(stage.en); focus(); };
      TW.$('#sentence-hint', host).onclick = guarded(hint);
      TW.$('#sentence-prev', host).onclick = guarded(previous);
      if (correct) {
        TW.$('#sentence-next', host).onclick = guarded(next);
        TW.$('#sentence-retry', host).onclick = guarded(function () { session.phase = 'typing'; session.input = ''; session.revealed = false; persist(); draw(); });
      } else {
        TW.$('#sentence-submit', host).onclick = guarded(submit);
        TW.$('#sentence-skip', host).onclick = guarded(skip);
      }
      updateWords();
      if (!correct) focus();
    }
    var keyboard = guarded(function (event) {
      if (!alive() || event.isComposing || composing || event.keyCode === 229) return;
      if (event.key === 'Escape') { event.preventDefault(); persist(); go(); return; }
      if (session.completed) return;
      var key = event.key.toLowerCase();
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        if (key === 's') { event.preventDefault(); say(currentStage().en); }
        if (key === 'h') { event.preventDefault(); hint(); }
        if (key === 'f') { event.preventDefault(); TW.$('#sentence-favorite', host).click(); }
        if (/^[123]$/.test(key)) { event.preventDefault(); switchMode(modes[Number(key) - 1].id); }
        return;
      }
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target.closest('button, select, a')) return;
      event.preventDefault(); submit();
    });
    document.addEventListener('keydown', keyboard);
    previousCleanup = function () { document.removeEventListener('keydown', keyboard); clearTimeout(timer); };
    draw();
  }
  TW.views.sentences = { render: render };
})();
