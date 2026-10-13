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
    { key: 'account', label: '账号', path: '/account', icon: 'user' },
    { key: 'settings', label: '设置', path: '/settings', icon: 'settings' }
  ];

  /** 管理看板只对管理员显示（真正的权限判定在后端） */
  function navList() {
    var list = NAV.slice();
    if (TW.api && TW.api.isAdmin()) {
      list.splice(list.length - 1, 0, { key: 'admin', label: '管理看板', path: '/admin', icon: 'shield' });
    }
    return list;
  }

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
      reading: TW.views.reading, resources: TW.views.resources, settings: TW.views.settings,
      account: TW.views.account, admin: TW.views.admin
    };
    return { name: name, view: map[name] || TW.views.home };
  }

  function renderNav(active) {
    var c = TW.store.counts();
    var due = TW.store.srs.dueCount();
    var host = document.getElementById('sidebar');
    var items = navList().map(function (n) {
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

    // 底部：账号入口（带同步状态点）+ 主题切换
    var u = (TW.api && TW.api.token()) ? TW.api.user() : null;
    var snap = TW.sync ? TW.sync.snapshot() : { status: 'off' };
    var footUser = '<button class="foot-user" data-path="/account" title="账号与同步">' +
      TW.icon('user', 14) +
      '<span class="fu-text">' + TW.esc(u ? u.email : '登录 / 注册') + '</span>' +
      '<i class="sync-dot ' + snap.status + '" title="' + TW.esc(snap.status) + '"></i>' +
      '</button>';

    host.innerHTML =
      '<div class="brand">' +
        '<div class="brand-logo">A</div>' +
        '<div class="brand-text"><span class="brand-name">六级单词速记</span>' +
        '<span class="brand-sub">本地词库</span></div>' +
      '</div>' +
      '<nav class="nav">' + items + '</nav>' +
      '<div class="sidebar-foot">' +
        footUser +
        '<button class="icon-btn" id="theme-btn" title="切换主题">' + TW.icon(TW.store.settings.theme === 'dark' ? 'sun' : 'moon') + '</button>' +
      '</div>';

    TW.$$('.nav-item', host).forEach(function (b) {
      b.addEventListener('click', function () { go(b.dataset.path); });
    });
    var fu = TW.$('.foot-user', host);
    if (fu) fu.addEventListener('click', function () { go(fu.dataset.path); });
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

    /* 路由过渡（参考站用 barba 做整页过渡）：旧内容 130ms 淡出 → 换新 → 进场 reveal。
       首次渲染 / 动画被关掉时直接换，不多等这一下。 */
    var doRender = function () {
      host.classList.remove('view-out');
      host.innerHTML = '';
      try {
        r.view.render(host, route.query);
      } catch (e) {
        host.innerHTML = '<div class="empty"><div class="em-ico">⚠️</div><div>页面渲染出错</div><pre class="small muted">' + TW.esc(e && e.message) + '</pre></div>';
        console.error(e);
      }
      window.scrollTo({ top: 0 });
      if (TW.motion) TW.motion.enter(host);
    };

    if (host.childElementCount && TW.motion && !TW.motion.isOff()) {
      host.classList.add('view-out');
      setTimeout(doRender, 130);
    } else {
      doRender();
    }
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
  // 云端数据合并回来后界面跟着刷新 —— 但🔴**只在「读数型」视图**整页重渲染：
  // 练习/详解这类交互中视图被 render() 重建会丢输入、闪屏（sunfleeting：打着字单词
  // 突然消失——正是答题后 3.5s 防抖同步的响应回来触发了整页 render）。
  // 练习页的进度本来就走 markRight/markWrong 实时落库 + 会话续接快照，无需重渲染。
  TW.store.on('remote', function () {
    renderNav(current.name);
    if (current.name === 'review' || current.name === 'home' || current.name === 'srs') render();
  });

  function boot() {
    TW.store.load();
    TW.store.migrate();          // 补词面快照 + 首次把历史错词导入复习队列
    applyTheme();
    TW.speech.sound.enabled = TW.store.settings.keySound;
    if (!location.hash) location.hash = '/';
    if (TW.sync) TW.sync.onChange(function () { renderNav(current.name); });
    if (TW.motion) {             // 幕布开场（只播一次）+ 磁吸按钮
      TW.motion.preloader();
      TW.motion.magnetic();
    }
    render();
    // 同步层放在最后初始化：此时 store 已 load/migrate，视图已就绪
    if (TW.sync) TW.sync.init();
  }

  TW.app = { go: go, render: render, boot: boot, current: function () { return current; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
