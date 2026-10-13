/* 账号：后端地址、邮箱注册/登录、同步状态
   刻意不做邮箱验证与找回密码（用户要求「邮箱注册即可」）；忘记密码由管理员重置。 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(ms) {
    if (!ms) return '—';
    var d = new Date(ms);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  function backendCard() {
    var b = TW.api.base();
    return '<div class="card card-pad" style="margin-bottom:1rem">' +
      '<div class="card-title">后端地址</div>' +
      '<div class="set-hint" style="margin:.35rem 0 .7rem">' +
        (b ? '当前：<code class="mono">' + TW.esc(b) + '</code>'
           : '未配置 —— 现在是<b>纯本地模式</b>，数据只存在这台设备上。') +
      '</div>' +
      '<div class="row">' +
        '<input class="field" id="api-base" style="flex:1;min-width:200px" ' +
          'placeholder="https://xxx.workers.dev" value="' + TW.esc(b) + '" />' +
        '<button class="btn" id="api-save">保存</button>' +
        '<button class="btn" id="api-test">测试连接</button>' +
      '</div>' +
      '<div class="small ' + (b ? 'muted' : '') + '" id="api-msg" style="margin-top:.55rem">' +
        '部署方法见仓库 <code class="mono">worker/README.md</code>；留空即回到纯本地模式。' +
      '</div>' +
    '</div>';
  }

  function authCard() {
    return '<div class="card card-pad">' +
      '<div class="seg" id="auth-tab" style="margin-bottom:1rem">' +
        '<button data-val="login" class="active">登录</button>' +
        '<button data-val="register">注册</button>' +
      '</div>' +
      '<div class="auth-form">' +
        '<label class="auth-lb" for="auth-email">邮箱</label>' +
        '<input class="field" id="auth-email" type="email" autocomplete="email" placeholder="you@example.com" />' +
        '<label class="auth-lb" for="auth-pass">密码</label>' +
        '<input class="field" id="auth-pass" type="password" autocomplete="current-password" placeholder="至少 6 位" />' +
        '<div id="auth-pass2-wrap" class="hide">' +
          '<label class="auth-lb" for="auth-pass2">确认密码</label>' +
          '<input class="field" id="auth-pass2" type="password" autocomplete="new-password" />' +
        '</div>' +
        '<div class="auth-err" id="auth-err"></div>' +
        '<button class="btn primary" id="auth-submit" style="width:100%">登录</button>' +
      '</div>' +
      '<div class="small muted" style="margin-top:.9rem;line-height:1.7">' +
        '本站<b>不发验证邮件</b>，注册填邮箱 + 密码即可；也没有「找回密码」，忘记密码请让管理员重置。<br>' +
        '登录后本机的练习记录会自动上传并与其他设备合并：错次数/答题数取较大值，收藏与掌握状态以最后操作为准。' +
      '</div>' +
    '</div>';
  }

  function accountCard(u, snap) {
    var c = TW.store.counts();
    var s = TW.store.srs.stats();
    return '<div class="card card-pad" style="margin-bottom:1rem">' +
      '<div class="card-title">当前账号</div>' +
      '<div class="set-row"><div style="min-width:0">' +
        '<div class="set-label" style="word-break:break-all">' + TW.esc(u.email) + '</div>' +
        '<div class="set-hint">注册于 ' + fmtDate(u.createdAt) + (u.admin ? ' · 管理员' : '') + '</div>' +
      '</div><span class="sync-pill ' + snap.status + '">' + TW.esc(TW.sync.label()) + '</span></div>' +
      '<div class="set-row"><div>' +
        '<div class="set-label">本机数据概览</div>' +
        '<div class="set-hint">已学 ' + c.touched + ' · 掌握 ' + c.master + ' · 错词 ' + c.wrong + ' · 复习队列 ' + s.total + '</div>' +
      '</div><button class="btn sm" id="acct-sync">' + TW.icon('refresh', 14) + ' 立即同步</button></div>' +
      (snap.error ? '<div class="small" style="color:var(--err);margin-top:.5rem">' + TW.esc(snap.error) + '</div>' : '') +
      '<div class="row" style="margin-top:.9rem">' +
        '<button class="btn" id="acct-logout">' + TW.icon('logout', 15) + ' 退出登录</button>' +
        (u.admin ? '<a class="btn" href="#/admin">' + TW.icon('shield', 15) + ' 管理看板</a>' : '') +
      '</div>' +
    '</div>';
  }

  /* 同步状态变化时刷新本页（只注册一次：#view 是路由复用的同一节点，
     若跟着 render 注册，监听器会不断叠加） */
  var activePaint = null;
  if (TW.sync) TW.sync.onChange(function () { if (activePaint) activePaint(); });

  function render(host) {
    var token = 'acct' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    host.dataset.owner = token;
    function alive() { return host.dataset.owner === token; }

    var mode = 'login';

    function paint() {
      if (!alive()) return;
      var u = TW.api.user();
      var logged = !!(u && TW.api.token());
      var snap = TW.sync.snapshot();

      host.innerHTML = '<div class="wrap-narrow">' +
        TW.ui.pageHead('账号与同步', logged ? '已登录，进度会自动同步到云端' : '登录后可在多台设备之间同步学习进度') +
        backendCard() +
        (logged ? accountCard(u, snap) : authCard()) +
        '</div>';

      bind();
    }

    function setErr(msg) {
      var el = TW.$('#auth-err', host);
      if (el) el.textContent = msg || '';
    }

    function submit() {
      var email = (TW.$('#auth-email', host) || {}).value || '';
      var pass = (TW.$('#auth-pass', host) || {}).value || '';
      var btn = TW.$('#auth-submit', host);
      setErr('');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim())) { setErr('请输入正确的邮箱地址'); return; }
      if (String(pass).length < 6) { setErr('密码至少 6 位'); return; }
      if (mode === 'register') {
        var pass2 = (TW.$('#auth-pass2', host) || {}).value || '';
        if (pass !== pass2) { setErr('两次输入的密码不一致'); return; }
      }
      if (btn) { btn.disabled = true; btn.textContent = mode === 'register' ? '注册中…' : '登录中…'; }

      var p = mode === 'register' ? TW.api.register(email.trim(), pass) : TW.api.login(email.trim(), pass);
      p.then(function (user) {
        if (!alive()) return;
        TW.toast(mode === 'register' ? '注册成功，已开始同步' : '登录成功', 'ok');
        paint();                                  // 立刻切到「已登录」界面
        if (TW.sync) TW.sync.flush(true);         // 登录后立刻与云端对齐
      }).catch(function (err) {
        if (!alive()) return;
        setErr(err.message || '操作失败');
        if (btn) { btn.disabled = false; btn.textContent = mode === 'register' ? '注册' : '登录'; }
      });
    }

    function bind() {
      if (!alive()) return;
      var tab = TW.$('#auth-tab', host);
      if (tab) {
        TW.$$('button', tab).forEach(function (b) {
          b.addEventListener('click', function () {
            TW.$$('button', tab).forEach(function (x) { x.classList.remove('active'); });
            b.classList.add('active');
            mode = b.dataset.val;
            var w = TW.$('#auth-pass2-wrap', host);
            if (w) w.classList.toggle('hide', mode !== 'register');
            var sb = TW.$('#auth-submit', host);
            if (sb) sb.textContent = mode === 'register' ? '注册' : '登录';
            setErr('');
          });
        });
      }
      var sb = TW.$('#auth-submit', host);
      if (sb) sb.addEventListener('click', submit);
      ['#auth-email', '#auth-pass', '#auth-pass2'].forEach(function (sel) {
        var el = TW.$(sel, host);
        if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
      });

      var save = TW.$('#api-save', host);
      if (save) save.addEventListener('click', function () {
        TW.api.setBase((TW.$('#api-base', host) || {}).value || '');
        TW.toast(TW.api.configured() ? '后端地址已保存' : '已切回纯本地模式', 'ok');
        paint();
      });
      var test = TW.$('#api-test', host);
      if (test) test.addEventListener('click', function () {
        TW.api.setBase((TW.$('#api-base', host) || {}).value || '');
        var msg = TW.$('#api-msg', host);
        if (!TW.api.configured()) { if (msg) msg.textContent = '先填一个地址再测试。'; return; }
        if (msg) msg.textContent = '正在连接…';
        TW.api.health().then(function (r) {
          if (msg) msg.innerHTML = '连接成功 ✅ 服务 ' + TW.esc((r && r.service) || 'ok');
        }).catch(function (e) {
          if (msg) msg.innerHTML = '<span style="color:var(--err)">连接失败：' + TW.esc(e.message) + '</span>';
        });
      });

      var sy = TW.$('#acct-sync', host);
      if (sy) sy.addEventListener('click', function () {
        TW.toast('正在同步…');
        TW.sync.flush(true).then(function (ok) {
          if (!alive()) return;
          TW.toast(ok ? '同步完成' : '同步失败，请检查网络或后端地址', ok ? 'ok' : 'err');
          paint();
        });
      });
      var lo = TW.$('#acct-logout', host);
      if (lo) lo.addEventListener('click', function () {
        if (!confirm('退出登录？本机数据会保留，之后仍可继续离线使用。')) return;
        TW.api.logout().then(function () {
          if (!alive()) return;
          TW.toast('已退出登录');
          paint();
        });
      });
    }

    paint();
    activePaint = function () { if (alive()) paint(); };
  }

  TW.views.account = { render: render };
})();
