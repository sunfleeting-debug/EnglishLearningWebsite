/* 应用外壳：侧边导航、hash 路由、主题 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  var NAV = [
    { key: 'home', label: '首页', path: '/', icon: 'home' },
    { key: 'books', label: '词库', path: '/books', icon: 'book' },
    { key: 'practice', label: '练习', path: '/practice', icon: 'keyboard' },
    { key: 'srs', label: '复习', path: '/srs', icon: 'refresh', badge: 'srs' },
    { key: 'review', label: '生词本', path: '/review', icon: 'star', badge: 'review' },
    { key: 'audio', label: '音频跟读', path: '/audio', icon: 'headphone' },
    { key: 'stats', label: '学习统计', path: '/stats', icon: 'chart' },
    { key: 'reading', label: '真题阅读', path: '/reading', icon: 'file' },
    { key: 'resources', label: '学习资料', path: '/resources', icon: 'download' },
    { key: 'settings', label: '设置', path: '/settings', icon: 'settings' }
  ];

  /* ---------------- 路由 ---------------- */
  function parseHash() {
    var raw = location.hash.replace(/^#/, '') || '/';
    var qIdx = raw.indexOf('?');
    var path = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
    var query = {};
    if (qIdx >= 0) {
      raw.slice(qIdx + 1).split('&').forEach(function (kv) {
        if (!kv) return;
        var i = kv.indexOf('=');
        var k = decodeURIComponent(i >= 0 ? kv.slice(0, i) : kv);
        var v = i >= 0 ? decodeURIComponent(kv.slice(i + 1)) : '';
        query[k] = v;
      });
    }
    if (path === '') path = '/';
    return { path: path, query: query };
  }

  function resolve(path) {
    if (path === '/') return { name: 'home', view: TW.views.home };
    var m = /^\/([a-z-]+)/.exec(path);
    var name = m ? m[1] : 'home';
    var map = {
      home: TW.views.home, books: TW.views.books, word: TW.views.word,
      practice: TW.views.practice, srs: TW.views.srs,
      review: TW.views.review, audio: TW.views.audio, stats: TW.views.stats,
      reading: TW.views.reading, resources: TW.views.resources, settings: TW.views.settings
    };
    return { name: name, view: map[name] || TW.views.home };
  }

  function renderNav(active) {
    var c = TW.store.counts();
    var due = TW.store.srs.dueCount();
    var host = document.getElementById('sidebar');
    var items = NAV.map(function (n) {
      var badge = '';
      if (n.badge === 'review') {
        var num = c.wrong + c.fav;
        badge = num ? '<span class="nav-badge">' + num + '</span>' : '';
      } else if (n.badge === 'srs') {
        badge = due ? '<span class="nav-badge srs">' + due + '</span>' : '';
      }
      return '<button class="nav-item' + (n.key === active ? ' active' : '') + '" data-path="' + n.path + '">' +
        '<span class="nav-ico">' + TW.icon(n.icon) + '</span>' +
        '<span class="nav-label">' + n.label + '</span>' + badge + '</button>';
    }).join('');

    // 移动端只显示前 5 个高频入口
    host.innerHTML =
      '<div class="brand">' +
        '<div class="brand-logo">A</div>' +
        '<div class="brand-text"><span class="brand-name">六级单词速记</span>' +
        '<span class="brand-sub">本地词库</span></div>' +
      '</div>' +
      '<nav class="nav">' + items + '</nav>' +
      '<div class="sidebar-foot">' +
        '<span class="small muted">本地存储 · 无需登录</span>' +
        '<button class="icon-btn" id="theme-btn" title="切换主题">' + TW.icon(TW.store.settings.theme === 'dark' ? 'sun' : 'moon') + '</button>' +
      '</div>';

    TW.$$('.nav-item', host).forEach(function (b) {
      b.addEventListener('click', function () { go(b.dataset.path); });
    });
    var tb = TW.$('#theme-btn', host);
    if (tb) tb.addEventListener('click', toggleTheme);
  }

  function applyTheme() {
    var t = TW.store.settings.theme;
    document.documentElement.classList.toggle('dark', t === 'dark');
  }

  function toggleTheme() {
    var next = TW.store.settings.theme === 'dark' ? 'light' : 'dark';
    TW.store.setSetting('theme', next);
    applyTheme();
    renderNav(current.name);
  }

  /* ---------------- 渲染 ---------------- */
  var current = { name: 'home' };

  function render() {
    var route = parseHash();
    var r = resolve(route.path);
    current = r;
    // 详情页归属「词库」高亮
    renderNav(r.name === 'word' ? 'books' : r.name);
    var host = document.getElementById('view');
    host.innerHTML = '';
    try {
      r.view.render(host, route.query);
    } catch (e) {
      host.innerHTML = '<div class="empty"><div class="em-ico">⚠️</div><div>页面渲染出错</div><pre class="small muted">' + TW.esc(e && e.message) + '</pre></div>';
      console.error(e);
    }
    window.scrollTo({ top: 0 });
  }

  function go(path) {
    if (location.hash.replace(/^#/, '') === path) { render(); return; }
    location.hash = path;
  }

  window.addEventListener('hashchange', render);
  TW.store.on('progress', function () {
    renderNav(current.name);
    // 生词本 / 复习 / 首页需要实时刷新
    if (current.name === 'review' || current.name === 'home' || current.name === 'srs') render();
  });

  function boot() {
    TW.store.load();
    TW.store.migrate();          // 补词面快照 + 首次把历史错词导入复习队列
    applyTheme();
    TW.speech.sound.enabled = TW.store.settings.keySound;
    if (!location.hash) location.hash = '/';
    render();
  }

  TW.app = { go: go, render: render, boot: boot, current: function () { return current; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
