/* 管理看板：所有用户的进度总览 + 单人下钻（错词/已掌握/收藏/复习队列）+ CSV 导出
   权限由后端 ADMIN_EMAILS 环境变量控制；前端只是入口，真正的判定在 Worker 里。 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtTime(ms) {
    if (!ms) return '—';
    var d = new Date(ms);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
      ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function fmtDay(ms) {
    if (!ms) return '—';
    var d = new Date(ms);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  function ago(ms) {
    if (!ms) return '';
    var n = Math.floor((Date.now() - ms) / 86400000);
    if (n <= 0) return '今天';
    if (n === 1) return '昨天';
    return n + ' 天前';
  }
  function download(name, text) {
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  var activePaint = null;
  if (TW.sync) TW.sync.onChange(function () { if (activePaint) activePaint(); });

  /* 记住「当前展开的是谁」：后台同步拉回数据会触发整页重渲染（app.js 监听 'remote'），
     render() 一重建闭包，局部的 detail 就没了。用模块级变量跨重渲染把它恢复回来，
     否则管理员正看着某个人的错词列表时，面板会被一次后台同步莫名关掉。 */
  var lastOpenId = null;

  function render(host) {
    var token = 'adm' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    host.dataset.owner = token;
    function alive() { return host.dataset.owner === token; }

    var users = [];
    var detail = null;        // { user, progress, daily, srs }
    var dtab = 'wrong';
    var busy = false;
    var fatal = '';

    function gate(msg, cta) {
      return '<div class="wrap-narrow">' + TW.ui.pageHead('管理看板', '') +
        '<div class="card card-pad">' +
          '<div class="empty"><div class="em-ico">🔒</div><div>' + TW.esc(msg) + '</div>' +
          (cta ? '<div style="margin-top:.9rem"><a class="btn primary" href="' + cta + '">去账号页设置</a></div>' : '') +
          '</div></div></div>';
    }

    function paintShell() {
      if (!alive()) return;
      if (!TW.api.configured()) { host.innerHTML = gate('还没有配置后端地址，无法读取云端数据。', '#/account'); return; }
      if (!TW.api.token()) { host.innerHTML = gate('请先登录管理员账号。', '#/account'); return; }
      if (!TW.api.isAdmin()) {
        host.innerHTML = gate('当前账号不是管理员。管理员由后端 ADMIN_EMAILS 环境变量指定。', '#/account');
        return;
      }

      var sum = { users: users.length, touched: 0, master: 0, wrong: 0, srs: 0 };
      users.forEach(function (u) {
        sum.touched += u.touched || 0; sum.master += u.mastered || 0;
        sum.wrong += u.wrong || 0; sum.srs += u.srs_total || 0;
      });

      host.innerHTML = '<div class="wrap">' +
        TW.ui.pageHead('管理看板', '共 ' + sum.users + ' 位用户的学习进度（数据来自云端）',
          '<button class="btn" id="adm-refresh">' + TW.icon('refresh', 15) + ' 刷新</button>') +
        (fatal ? '<div class="card card-pad" style="margin-bottom:1rem;color:var(--err)">' + TW.esc(fatal) + '</div>' : '') +
        '<div class="grid stats" style="margin-bottom:1.2rem">' +
          statCard(sum.users, '用户数', '') +
          statCard(sum.touched, '已学单词（人次）', 'accent') +
          statCard(sum.master, '已掌握（人次）', 'ok') +
          statCard(sum.wrong, '错词（人次）', 'err') +
          statCard(sum.srs, '复习队列（人次）', '') +
        '</div>' +
        (busy && !users.length ? '<div class="card card-pad muted">正在读取…</div>' : usersTable()) +
        (detail ? detailPanel() : '') +
      '</div>';

      bind();
    }

    function statCard(n, label, cls) {
      return '<div class="stat-card"><div class="stat-num ' + (cls || '') + '">' + n + '</div>' +
        '<div class="stat-label">' + TW.esc(label) + '</div></div>';
    }

    function usersTable() {
      if (!users.length) return '<div class="card card-pad">' + TW.ui.empty('还没有用户数据', '👥') + '</div>';
      return '<div class="card adm-table-wrap" style="margin-bottom:1.2rem">' +
        '<table class="adm-table"><thead><tr>' +
          '<th>邮箱</th><th>注册</th><th>最近同步</th>' +
          '<th class="num">已学</th><th class="num">掌握</th><th class="num">错词</th><th class="num">复习</th><th></th>' +
        '</tr></thead><tbody>' +
        users.map(function (u) {
          return '<tr' + (detail && detail.user.id === u.id ? ' class="on"' : '') + '>' +
            '<td><div class="adm-mail">' + TW.esc(u.email) + '</div>' +
              '<div class="small muted">' + TW.esc(u.name || '') + '</div></td>' +
            '<td class="small">' + fmtDay(u.created_at) + '</td>' +
            '<td class="small">' + fmtTime(u.synced_at || u.last_seen) +
              '<div class="small muted">' + ago(u.synced_at || u.last_seen) + '</div></td>' +
            '<td class="num">' + (u.touched || 0) + '</td>' +
            '<td class="num ok">' + (u.mastered || 0) + '</td>' +
            '<td class="num err">' + (u.wrong || 0) + '</td>' +
            '<td class="num">' + (u.srs_total || 0) + (u.srs_due ? '<span class="small muted">（' + u.srs_due + ' 待复习）</span>' : '') + '</td>' +
            '<td class="adm-ops">' +
              '<button class="btn sm" data-open="' + TW.esc(u.id) + '">查看</button>' +
              '<button class="btn sm" data-csv="' + TW.esc(u.id) + '" data-mail="' + TW.esc(u.email) + '">CSV</button>' +
            '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div>';
    }

    function wordList(items, kind) {
      if (!items.length) return '<div class="muted small" style="padding:.5rem .2rem">（暂无）</div>';
      var shown = items.slice(0, 300);
      return '<div class="adm-words">' + shown.map(function (it) {
        var badge = '';
        if (kind === 'wrong') badge = '<span class="tag err">错 ' + it.w + '</span>';
        else if (kind === 'master') badge = '<span class="tag ok">已掌握</span>';
        else if (kind === 'fav') badge = '<span class="tag">收藏</span>';
        else if (kind === 'srs') badge = '<span class="tag srs">' + TW.esc(it.d || '') + '</span>';
        return '<a class="adm-word" href="#/word?id=' + encodeURIComponent(it.id) + '" title="打开词典详解">' +
          '<b>' + TW.esc(it.word || it.id) + '</b>' +
          '<span class="adm-brief">' + TW.esc(it.brief || '') + '</span>' + badge + '</a>';
      }).join('') + '</div>' + (items.length > shown.length
        ? '<div class="small muted" style="margin-top:.5rem">另有 ' + (items.length - shown.length) + ' 条未显示</div>' : '');
    }

    function detailPanel() {
      var d = detail;
      var P = d.progress || {}, S = d.srs || {};
      var wrong = [], master = [], fav = [], srs = [];
      Object.keys(P).forEach(function (id) {
        var p = P[id];
        var base = { id: id, word: p.word, brief: p.brief, src: p.src, w: p.w };
        if (p.w > 0 && !p.master) wrong.push(base);
        if (p.master) master.push(base);
        if (p.fav) fav.push(base);
      });
      wrong.sort(function (a, b) { return b.w - a.w; });
      Object.keys(S).forEach(function (k) {
        var s = S[k];
        srs.push({ id: k, word: s.w, brief: s.m, w: s.b, d: s.d });
      });
      srs.sort(function (a, b) { return String(a.d) < String(b.d) ? -1 : 1; });

      var tabs = [['wrong', '错词 ' + wrong.length], ['master', '已掌握 ' + master.length],
                  ['fav', '收藏 ' + fav.length], ['srs', '复习队列 ' + srs.length]];
      var list = dtab === 'master' ? master : dtab === 'fav' ? fav : dtab === 'srs' ? srs : wrong;

      var lastDays = Object.keys(d.daily || {}).sort().slice(-14);

      return '<div class="card card-pad adm-detail">' +
        '<div class="page-head" style="margin-bottom:.6rem">' +
          '<div><h3 class="page-title" style="font-size:1.15rem">' + TW.esc(d.user.email) + '</h3>' +
          '<div class="page-desc">注册 ' + fmtDay(d.user.createdAt) + ' · 最近同步 ' + fmtTime(d.user.syncedAt) +
            ' · 记录 ' + Object.keys(P).length + ' 词 · 复习队列 ' + Object.keys(S).length + ' 词</div></div>' +
          '<div class="row">' +
            '<button class="btn sm" data-csv="' + TW.esc(d.user.id) + '" data-mail="' + TW.esc(d.user.email) + '">' + TW.icon('download', 14) + ' 导出 CSV</button>' +
            '<button class="btn sm" data-pw="' + TW.esc(d.user.id) + '">重置密码</button>' +
            '<button class="btn sm" id="adm-close">关闭</button>' +
          '</div>' +
        '</div>' +
        '<div class="rd-subbar-l" id="adm-tabs" style="margin-bottom:.8rem">' +
          tabs.map(function (t) {
            return '<button class="rd-sub' + (dtab === t[0] ? ' active' : '') + '" data-tab="' + t[0] + '">' + TW.esc(t[1]) + '</button>';
          }).join('') +
        '</div>' +
        wordList(list, dtab) +
        (lastDays.length ? '<div class="small muted" style="margin-top:.9rem">最近练习日：' +
          lastDays.map(function (day) {
            var v = d.daily[day] || {};
            return day + '（' + (v.done || 0) + ' 题 / 对 ' + (v.right || 0) + '）';
          }).join('，') + '</div>' : '') +
      '</div>';
    }

    function load(keepDetail) {
      busy = true; fatal = ''; paintShell();
      return TW.api.adminUsers().then(function (list) {
        if (!alive()) return;
        users = list; busy = false;
        if (keepDetail && detail) {
          var still = users.some(function (u) { return u.id === detail.user.id; });
          if (!still) detail = null;
        }
        paintShell();
      }).catch(function (err) {
        if (!alive()) return;
        busy = false;
        if (err.status === 401) { TW.api.clearSession(); fatal = '登录已过期，请重新登录。'; }
        else fatal = err.message || '读取失败';
        paintShell();
      });
    }

    function openUser(id) {
      lastOpenId = id || null;
      detail = null;
      TW.api.adminUser(id).then(function (d) {
        if (!alive()) return;
        detail = d; dtab = 'wrong';
        paintShell();
        var el = TW.$('.adm-detail', host);
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
      }).catch(function (err) {
        if (!alive()) return;
        TW.toast(err.message || '读取失败', 'err');
      });
    }

    function csv(id, mail) {
      TW.toast('正在导出…');
      TW.api.adminExportCsv(id).then(function (text) {
        if (!alive()) return;
        download('progress-' + String(mail || id).replace(/[^\w.-]/g, '_') + '.csv', text);
        TW.toast('已导出', 'ok');
      }).catch(function (err) { if (alive()) TW.toast(err.message || '导出失败', 'err'); });
    }

    function bind() {
      if (!alive()) return;
      var r = TW.$('#adm-refresh', host);
      if (r) r.addEventListener('click', function () { load(true); });

      var c = TW.$('#adm-close', host);
      if (c) c.addEventListener('click', function () { detail = null; lastOpenId = null; paintShell(); });

      var tabs = TW.$('#adm-tabs', host);
      if (tabs) TW.$$('button', tabs).forEach(function (b) {
        b.addEventListener('click', function () { dtab = b.dataset.tab; paintShell(); });
      });
    }

    /* 事件委托只挂一次：host(#view) 是路由复用的同一个节点，
       若跟着 paint() 重挂会不断叠加监听（点一次「查看」触发 N 次请求）。 */
    host.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-open],[data-csv],[data-pw]') : null;
      if (!b) return;
      if (b.dataset.open) openUser(b.dataset.open);
      else if (b.dataset.csv) csv(b.dataset.csv, b.dataset.mail);
      else if (b.dataset.pw) {
        var np = prompt('给该账号设置新密码（至少 6 位）。该用户当前的登录状态会失效。');
        if (np == null) return;
        if (String(np).length < 6) { TW.toast('密码至少 6 位', 'err'); return; }
        TW.api.adminResetPassword(b.dataset.pw, np).then(function () {
          TW.toast('密码已重置', 'ok');
        }).catch(function (err) { TW.toast(err.message || '重置失败', 'err'); });
      }
    });

    paintShell();
    var ready = load(false);
    // 重渲染后把上次展开的用户恢复回来（后台同步 / 刷新页面后回到看板）
    if (lastOpenId) ready.then(function () { if (alive() && !detail) openUser(lastOpenId); });
    activePaint = function () { if (alive()) paintShell(); };
  }

  TW.views.admin = { render: render };
})();
