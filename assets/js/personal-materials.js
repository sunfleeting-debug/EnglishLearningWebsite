/* Local learning material library. Source files stay in the directory chosen by the learner. */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  var state = {root: null, files: [], quizSets: [], scanning: false, progress: 0, errors: 0, message: '', loaded: false, generation: 0};
  var mounted = null, activeUrls = {audio: '', viewer: ''}, openCounters = {audio: 0, viewer: 0}, restorePromise = null;
  var KINDS = {pdf: 'PDF', mp3: '音频', wav: '音频', m4a: '音频', doc: 'Word', docx: 'Word', txt: '文本', lrc: '字幕', zip: '压缩包', xls: '表格', xlsx: '表格', png: '图片', jpg: '图片', jpeg: '图片'};
  function classify(path, name) {
    var ext = String(name).split('.').pop().toLowerCase();
    if (!KINDS[ext]) return [];
    var text = (path + '/' + name).toLowerCase(), cats = [];
    if (/^(mp3|wav|m4a|lrc)$/.test(ext)) return ['listening'];
    var paper = /真题|试题|试卷|模拟|预测|押题|考卷|考试|测试卷|全真|model\s*test|mock\s*test/i.test(text);
    if (paper || /阅读|完形|匹配|选词|reading|cloze|练习|题库|题目|解析|答案/i.test(text)) cats.push('quiz');
    if (paper || /作文|写作|翻译|写译|essay|writing|translation/i.test(text)) cats.push('writing');
    if (paper || /听力|听读|听写|listen|录音/i.test(text)) cats.push('listening');
    return cats;
  }
  function levelOf(path) {
    var parts = String(path).split('/');
    for (var i = parts.length - 1; i >= 0; i--) {
      var part = parts[i];
      var four = /四级|(?:cet[-_ ]?4)|(?:^|[^0-9])4级/i.test(part);
      var six = /六级|(?:cet[-_ ]?6)|(?:^|[^0-9])6级/i.test(part);
      if (four && !six && !/四六级/.test(part)) return 'cet4';
      if (six && !four && !/四六级/.test(part)) return 'cet6';
    }
    return 'common';
  }
  async function scanDirectory(root, onProgress) {
    var files = [], errors = 0, seen = 0;
    async function visit(dir, prefix) {
      try {
        for await (var entry of dir.values()) {
          var path = prefix ? prefix + '/' + entry.name : entry.name;
          if (entry.kind === 'directory') await visit(entry, path);
          else if (entry.kind === 'file') {
            var cats = classify(prefix, entry.name);
            if (cats.length) files.push({name: entry.name, path: path, categories: cats, level: levelOf(path), kind: KINDS[entry.name.split('.').pop().toLowerCase()], handle: entry});
            seen++;
            if (onProgress && seen % 75 === 0) onProgress(seen);
          }
        }
      } catch (error) { errors++; }
    }
    await visit(root, '');
    files.sort(function (a, b) { return a.path.localeCompare(b.path, 'zh-CN', {numeric: true}); });
    return {files: files, errors: errors, total: seen};
  }
  function db() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('typingcet.personal-materials', 1);
      req.onupgradeneeded = function () { if (!req.result.objectStoreNames.contains('directory')) req.result.createObjectStore('directory'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  async function saveRoot(root) {
    var d = await db();
    try { await new Promise(function (resolve, reject) {
      var tx = d.transaction('directory', 'readwrite'); tx.objectStore('directory').put(root, 'root');
      tx.oncomplete = resolve; tx.onerror = function () { reject(tx.error); }; tx.onabort = function () { reject(tx.error); };
    }); } finally { d.close(); }
  }
  async function readRoot() {
    var d = await db();
    try { return await new Promise(function (resolve, reject) {
      var req = d.transaction('directory').objectStore('directory').get('root');
      req.onsuccess = function () { resolve(req.result || null); }; req.onerror = function () { reject(req.error); };
    }); } finally { d.close(); }
  }
  function notify() { if (mounted && mounted.root.isConnected) mounted.draw(); }
  function quizChanged() {
    if (typeof window.dispatchEvent === 'function' && typeof window.Event === 'function')
      window.dispatchEvent(new window.Event('tw-personal-quiz-change'));
  }
  function validateQuizBundle(bundle) {
    if (!bundle || bundle.version !== 1 || !Array.isArray(bundle.sets)) throw new Error('题库格式不正确');
    var ids = {};
    bundle.sets.forEach(function (set) {
      if (!set || typeof set.id !== 'string' || !/^personal-[a-z0-9-]+$/.test(set.id) || ids[set.id] ||
          ['reading', 'match', 'cloze'].indexOf(set.type) < 0 || typeof set.test !== 'string' || typeof set.title !== 'string' ||
          !Array.isArray(set.body) || !set.body.every(function (p) { return typeof p === 'string' && p.trim(); }) ||
          (set.type === 'reading' && !set.body.length) ||
          (set.type === 'cloze' && (!set.body.length || !Array.isArray(set.bank) || !set.bank.length || !set.bank.every(function (b, i) { return b && b.k === 'ABCDEFGHIJKLMNO'[i] && typeof b.w === 'string' && b.w.trim(); }))) ||
          (set.type === 'match' && (!Array.isArray(set.paras) || !set.paras.length || !set.paras.every(function (p, i) { return p && p.k === 'ABCDEFGHIJKLMNO'[i] && typeof p.text === 'string' && p.text.trim(); }))) ||
          !Array.isArray(set.questions) || !set.questions.length) throw new Error('题库中存在不完整的题组');
      ids[set.id] = true;
      var numbers = {};
      set.questions.forEach(function (q) {
        if (!q || !Number.isInteger(q.n) || numbers[q.n] || typeof q.stem !== 'string' || !q.stem.trim() ||
            !Array.isArray(q.options) || (set.type === 'reading' && (q.options.length !== 4 || !/^[ABCD]$/.test(q.answer) ||
            !q.options.every(function (o, i) { return o && o.k === 'ABCD'[i] && typeof o.t === 'string' && o.t.trim(); }))) ||
            (set.type === 'match' && (q.options.length !== 0 || !set.paras.some(function (p) { return p.k === q.answer; }))) ||
            (set.type === 'cloze' && (q.options.length !== 0 || !set.bank.some(function (b) { return b.k === q.answer; }) || set.body.join('').indexOf('【' + q.n + '】') < 0)))
          throw new Error('题库中存在缺少题干、选项或答案的题目');
        numbers[q.n] = true;
      });
    });
    return bundle.sets;
  }
  async function loadQuizBundle(root) {
    var handle;
    try { handle = await root.getFileHandle('英语学习站-自动判分题库.json'); }
    catch (error) { if (error.name === 'NotFoundError') return []; throw error; }
    var file = await handle.getFile();
    if (file.size > 20 * 1024 * 1024) throw new Error('本机题库文件过大');
    return validateQuizBundle(JSON.parse(await file.text()));
  }
  function cleanupUrl(target) { if (activeUrls[target]) { URL.revokeObjectURL(activeUrls[target]); activeUrls[target] = ''; } }
  window.addEventListener('hashchange', function () { cleanupUrl('audio'); cleanupUrl('viewer'); mounted = null; });
  async function indexRoot(root) {
    var gen = ++state.generation;
    state.root = root; state.files = []; state.quizSets = []; state.scanning = true; state.progress = 0; state.errors = 0; state.message = ''; notify(); quizChanged();
    try {
      try {
        var quizSets = await loadQuizBundle(root);
        if (state.generation !== gen) return;
        state.quizSets = quizSets; quizChanged();
      } catch (error) {
        if (state.generation !== gen) return;
        state.message = '本机自动判分题库未能加载：' + (error.message || '请检查题库文件');
      }
      var result = await scanDirectory(root, function (n) { if (state.generation === gen) { state.progress = n; notify(); } });
      if (state.generation !== gen) return;
      state.files = result.files; state.errors = result.errors; state.scanning = false; notify();
    } catch (error) {
      if (state.generation !== gen) return;
      state.scanning = false; state.message = '读取文件夹失败：' + (error.message || '请重新选择'); notify();
    }
  }
  function restore() {
    if (restorePromise) return restorePromise;
    restorePromise = (async function () {
      state.loaded = true;
      try {
        var root = await readRoot();
        if (!root || state.root) return;
        state.root = root;
        var permission = await root.queryPermission({mode: 'read'});
        if (permission === 'granted') await indexRoot(root);
        else { state.message = '请重新授权访问已选文件夹。'; notify(); }
      } catch (error) { /* Persistence is optional; the picker still works. */ }
    })();
    return restorePromise;
  }
  function mount(host, category) {
    var node = TW.$('#personal-materials', host);
    if (!node) return;
    var view = {root: node, category: category, search: '', page: 0, kind: 'all', level: 'six'};
    node.innerHTML = '<section class="card card-pad pm-card"><div id="pm-content"></div><div id="pm-audio"></div><div id="pm-viewer"></div></section>';
    mounted = view;
    function draw() {
      if (mounted !== view || !node.isConnected) return;
      var term = view.search.trim().toLowerCase();
      var matching = state.files.filter(function (f) { return f.categories.indexOf(category) >= 0 && (!term || f.path.toLowerCase().indexOf(term) >= 0) && (view.kind === 'all' || f.kind === view.kind) && (view.level === 'all' || (view.level === 'six' ? f.level !== 'cet4' : f.level === 'cet4')); });
      if (category === 'listening') matching.sort(function (a, b) { return (b.kind === '音频') - (a.kind === '音频'); });
      var maxPages = Math.max(1, Math.ceil(matching.length / 24)); view.page = Math.min(view.page, maxPages - 1);
      var controls = '';
      if (state.scanning) controls = '<p class="small muted" role="status">正在建立目录，已检查 ' + state.progress + ' 个文件…</p>';
      else if (state.files.length) {
        controls = '<div class="pm-tools"><label class="sr-only" for="pm-search">搜索本机资料</label><input id="pm-search" class="field" placeholder="搜索年份、试卷、题型或文件名" value="' + TW.esc(view.search) + '">' +
          '<select id="pm-level" class="field" aria-label="考试级别"><option value="six">六级及通用</option><option value="all">全部级别</option><option value="four">四级</option></select>' +
          '<select id="pm-kind" class="field" aria-label="资料类型"><option value="all">全部类型</option><option value="PDF">PDF</option><option value="音频">音频</option><option value="Word">Word</option><option value="文本">文本</option><option value="字幕">字幕</option><option value="压缩包">压缩包</option><option value="图片">图片</option><option value="表格">表格</option></select></div>' +
          '<p class="small muted">找到 ' + matching.length + ' 份资料 · 点击 PDF 阅读，音频可直接播放</p>' +
          (matching.length ? '<div class="pm-list">' + matching.slice(view.page * 24, view.page * 24 + 24).map(function (f, index) {
            return '<button type="button" class="pm-file" data-pm-index="' + (view.page * 24 + index) + '"><span class="pm-type">' + TW.esc(f.kind) + '</span><span><b>' + TW.esc(f.name) + '</b><small>' + TW.esc(f.path) + '</small></span><span aria-hidden="true">↗</span></button>';
          }).join('') + '</div>' : '<p class="small muted">没有匹配的资料，请换个关键词或类型。</p>') +
          (maxPages > 1 ? '<div class="pm-pages"><button class="btn sm" id="pm-prev"' + (view.page === 0 ? ' disabled' : '') + '>上一页</button><span class="small muted">' + (view.page + 1) + ' / ' + maxPages + '</span><button class="btn sm" id="pm-next"' + (view.page + 1 === maxPages ? ' disabled' : '') + '>下一页</button></div>' : '');
      } else if (state.root && state.message) controls = '<button type="button" class="btn sm" id="pm-authorize">重新授权访问</button>';
      else if (state.root) controls = '<p class="small muted">未找到可显示的题目、写作或听力文件，请检查文件夹。</p>';
      var unsupported = typeof window.showDirectoryPicker !== 'function';
      TW.$('#pm-content', node).innerHTML = '<div class="pm-head"><div><div class="card-title">我的本机资料</div>' +
        '<p class="small muted">选择「星火六级」文件夹，按题目、作文和听力浏览；文件保留在本机。已核对并转换的题目会显示在下方题库中；原始文件不会自动判分。</p>' +
        (state.quizSets.length ? '<p class="small muted">已加载本机可判分题目：' + state.quizSets.length + ' 组、' + state.quizSets.reduce(function (n, s) { return n + s.questions.length; }, 0) + ' 题。</p>' : '') + '</div>' +
        '<button type="button" class="btn sm" id="pm-choose"' + (state.scanning || unsupported ? ' disabled' : '') + '>' + (state.root ? '更换 / 更新文件夹' : '选择资料文件夹') + '</button></div>' +
        (unsupported ? '<p class="small muted">当前浏览器不支持选择文件夹，请在电脑上的新版 Edge 或 Chrome 中通过 HTTPS 打开网站。</p>' : '') +
        (state.message ? '<p class="small muted" role="status">' + TW.esc(state.message) + '</p>' : '') +
        (state.errors ? '<p class="small muted">有 ' + state.errors + ' 个子文件夹无法读取，其他资料仍可使用。</p>' : '') + controls +
        '';
      var choose = TW.$('#pm-choose', node);
      choose.onclick = function () {
        // The picker itself must run synchronously in the user click handler.
        var request = window.showDirectoryPicker({mode: 'read'});
        request.then(async function (root) {
          try { await saveRoot(root); } catch (e) { /* May be unavailable; session access still works. */ }
          await indexRoot(root);
        }).catch(function (e) { if (e.name !== 'AbortError') { state.message = '无法选择文件夹：' + (e.message || '请重试'); notify(); } });
      };
      var authorize = TW.$('#pm-authorize', node);
      if (authorize) authorize.onclick = function () {
        state.root.requestPermission({mode: 'read'}).then(function (permission) {
          if (permission === 'granted') indexRoot(state.root); else { state.message = '没有获得读取权限。'; notify(); }
        }).catch(function (error) { state.message = '授权失败：' + (error.message || '请重试'); notify(); });
      };
      var search = TW.$('#pm-search', node), select = TW.$('#pm-kind', node), level = TW.$('#pm-level', node);
      if (level) { level.value = view.level; level.onchange = function () { view.level = level.value; view.page = 0; draw(); }; }
      if (select) { select.value = view.kind; select.onchange = function () { view.kind = select.value; view.page = 0; draw(); }; }
      if (search) search.oninput = function () {
        var cursor = search.selectionStart; view.search = search.value; view.page = 0; draw();
        var fresh = TW.$('#pm-search', node); if (fresh) { fresh.focus(); try { fresh.setSelectionRange(cursor, cursor); } catch (e) {} }
      };
      var prev = TW.$('#pm-prev', node), next = TW.$('#pm-next', node);
      if (prev) prev.onclick = function () { view.page--; draw(); };
      if (next) next.onclick = function () { view.page++; draw(); };
      TW.$$('[data-pm-index]', node).forEach(function (button) {
        button.onclick = async function () {
          var item = matching[Number(button.dataset.pmIndex)]; if (!item) return;
          var target = item.kind === '音频' ? 'audio' : 'viewer';
          var seq = ++openCounters[target];
          var viewer = TW.$('#pm-' + target, node); viewer.innerHTML = '<p class="small muted">正在打开…</p>';
          try {
            var file = await item.handle.getFile();
            if (mounted !== view || !viewer.isConnected || seq !== openCounters[target]) return;
            cleanupUrl(target); var activeUrl = activeUrls[target] = URL.createObjectURL(file);
            if (item.kind === '音频') viewer.innerHTML = '<div class="pm-view-head"><b>' + TW.esc(item.name) + '</b><button class="btn sm ghost" id="pm-close">关闭</button></div><audio controls preload="metadata" src="' + activeUrl + '"></audio>';
            else if (item.kind === 'PDF') viewer.innerHTML = '<div class="pm-view-head"><b>' + TW.esc(item.name) + '</b><a class="btn sm" href="' + activeUrl + '" target="_blank" rel="noopener">在新标签打开</a><button class="btn sm ghost" id="pm-close">关闭</button></div><iframe title="PDF 资料" src="' + activeUrl + '"></iframe>';
            else if (item.kind === '图片') viewer.innerHTML = '<div class="pm-view-head"><b>' + TW.esc(item.name) + '</b><button class="btn sm ghost" id="pm-close">关闭</button></div><img class="pm-image" alt="' + TW.esc(item.name) + '" src="' + activeUrl + '">';
            else if (item.kind === '文本' || item.kind === '字幕') { var content = await file.slice(0, 1024 * 1024).text(); if (mounted !== view || !viewer.isConnected || seq !== openCounters[target]) return; viewer.innerHTML = '<div class="pm-view-head"><b>' + TW.esc(item.name) + '</b><button class="btn sm ghost" id="pm-close">关闭</button></div><pre>' + TW.esc(content) + '</pre>'; }
            else viewer.innerHTML = '<div class="pm-view-head"><b>' + TW.esc(item.name) + '</b><a class="btn sm" href="' + activeUrl + '" download="' + TW.esc(item.name) + '">下载或用本机应用打开</a><button class="btn sm ghost" id="pm-close">关闭</button></div>';
            var close = TW.$('#pm-close', viewer); if (close) close.onclick = function () { openCounters[target]++; cleanupUrl(target); viewer.innerHTML = ''; };
            viewer.scrollIntoView({block: 'nearest'});
          } catch (error) { if (viewer.isConnected) viewer.innerHTML = '<p class="small" role="alert">无法打开文件，可能已移动或权限失效，请重新选择文件夹。</p>'; }
        };
      });
    }
    view.draw = draw;
    draw(); restore();
  }
  TW.personalMaterials = {mount: mount, scanDirectory: scanDirectory, classify: classify, restore: restore,
    quizSets: function () { return state.quizSets.slice(); }, validateQuizBundle: validateQuizBundle};
})();
