/* 登录门：进入应用前的全屏登录/注册卡 + 游客模式
   规则（app.js boot/render 协作）：
   - 无登录态且未选过「游客模式」（typingcet.guest !== '1'）⇒ 强制进入本页；
   - 游客模式只记一次标记，数据仅存本机；登录/注册成功后标记清除，下次自动进应用；
   - 已登录用户手动访问 #/gate 会被 app.js 弹回首页。 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  var K_GUEST = 'typingcet.guest';

  function paint(host) {
    var token = 'gate' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    host.dataset.owner = token;
    function alive() { return host.dataset.owner === token; }

    var mode = 'login';

    host.innerHTML = '<div class="gate-hero">' +
      '<img class="gate-logo" src="assets/img/icon-512.png" alt="英语学习站" width="88" height="88" />' +
      '<h1 class="gate-title">英语学习站</h1>' +
      '<p class="gate-sub">打字背单词 · 递进句子练习 · 多端云同步</p>' +
      '<div class="card card-pad gate-card">' +
        '<div class="seg" id="g-tab">' +
          '<button data-val="login" class="active">登录</button>' +
          '<button data-val="register">注册</button>' +
        '</div>' +
        '<div class="auth-form">' +
          '<label class="auth-lb" for="g-email">邮箱</label>' +
          '<input class="field" id="g-email" type="email" autocomplete="email" placeholder="you@example.com" />' +
          '<label class="auth-lb" for="g-pass">密码</label>' +
          '<input class="field" id="g-pass" type="password" autocomplete="current-password" placeholder="至少 6 位" />' +
          '<div id="g-pass2-wrap" class="hide">' +
            '<label class="auth-lb" for="g-pass2">确认密码</label>' +
            '<input class="field" id="g-pass2" type="password" autocomplete="new-password" />' +
          '</div>' +
          '<div id="g-code-wrap" class="hide">' +
            '<label class="auth-lb" for="g-code">邮箱验证码</label>' +
            '<div class="row" style="gap:.5rem">' +
              '<input class="field" id="g-code" type="text" inputmode="numeric" maxlength="6" placeholder="6 位数字" style="flex:1" />' +
              '<button class="btn" id="g-code-send" type="button">获取验证码</button>' +
            '</div>' +
          '</div>' +
          '<div class="auth-err" id="g-err"></div>' +
          '<button class="btn primary" id="g-submit" style="width:100%">登录</button>' +
        '</div>' +
      '</div>' +
      '<div class="gate-divider"><span>或</span></div>' +
      '<button class="btn gate-guest" id="g-guest">游客模式 · 仅保存在本机</button>' +
      '<p class="small muted gate-foot">登录后进度自动云同步，换设备不丢；游客数据只存在这台设备，' +
      '之后随时可以在「账号」页登录合并。</p>' +
    '</div>';

    function setErr(msg) {
      var el = TW.$('#g-err', host);
      if (el) el.textContent = msg || '';
    }

    function busy(on) {
      var btn = TW.$('#g-submit', host);
      if (btn) { btn.disabled = on; btn.textContent = on ? '请稍候…' : (mode === 'register' ? '注册' : '登录'); }
    }

    function enter() {
      if (!alive()) return;
      try { localStorage.removeItem(K_GUEST); } catch (e) {}
      TW.toast('欢迎回来，' + ((TW.api.user() && TW.api.user().name) || '同学'), 'ok');
      if (TW.sync) TW.sync.flush(true);
      TW.app.go('/');
    }

    function startCodeFlow(email) {
      var wrap = TW.$('#g-code-wrap', host);
      var sendBtn = TW.$('#g-code-send', host);
      TW.api.request('POST', '/api/register/start', { email: email }).then(function () {
        if (!alive()) return;
        if (wrap) wrap.classList.remove('hide');
        var codeEl = TW.$('#g-code', host);
        if (codeEl) codeEl.focus();
        setErr('验证码已发送到邮箱，10 分钟内有效，请查收');
        var left = 60;
        if (sendBtn) {
          sendBtn.disabled = true;
          var timer = setInterval(function () {
            if (!alive()) { clearInterval(timer); return; }
            left--;
            sendBtn.textContent = left > 0 ? ('重新发送(' + left + ')') : '获取验证码';
            if (left <= 0) { clearInterval(timer); sendBtn.disabled = false; }
          }, 1000);
        }
        busy(false);
      }).catch(function (e) {
        setErr(e.message || '验证码发送失败');
        busy(false);
      });
    }

    function submit() {
      var email = (TW.$('#g-email', host) || {}).value || '';
      var pass = (TW.$('#g-pass', host) || {}).value || '';
      setErr('');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim())) { setErr('请输入正确的邮箱地址'); return; }
      if (String(pass).length < 6) { setErr('密码至少 6 位'); return; }
      if (mode === 'register') {
        var pass2 = (TW.$('#g-pass2', host) || {}).value || '';
        if (pass !== pass2) { setErr('两次输入的密码不一致'); return; }
      }
      busy(true);

      if (mode === 'register') {
        var codeEl = TW.$('#g-code', host);
        var code = codeEl && !codeEl.closest('.hide') ? String(codeEl.value || '').trim() : '';
        if (code) {
          TW.api.request('POST', '/api/register/verify', { email: email.trim(), code: code, password: pass })
            .then(function () { enter(); })
            .catch(function (err) { setErr(err.message || '注册失败'); busy(false); });
          return;
        }
        // 先试免码注册；后端开启了邮箱验证时自动切验证码流程
        TW.api.register(email.trim(), pass).then(function () {
          enter();
        }).catch(function (err) {
          if (!alive()) return;
          if (err.message && err.message.indexOf('邮箱验证') >= 0) { startCodeFlow(email.trim()); return; }
          setErr(err.message || '注册失败');
          busy(false);
        });
        return;
      }
      TW.api.login(email.trim(), pass).then(function () {
        enter();
      }).catch(function (err) {
        if (!alive()) return;
        setErr(err.message || '登录失败');
        busy(false);
      });
    }

    function guest() {
      try { localStorage.setItem(K_GUEST, '1'); } catch (e) {}
      TW.toast('已进入游客模式：数据只保存在这台设备');
      TW.app.go('/');
    }

    var tab = TW.$('#g-tab', host);
    TW.$$('button', tab).forEach(function (b) {
      b.addEventListener('click', function () {
        TW.$$('button', tab).forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        mode = b.dataset.val;
        var w = TW.$('#g-pass2-wrap', host);
        if (w) w.classList.toggle('hide', mode !== 'register');
        var sb = TW.$('#g-submit', host);
        if (sb) sb.textContent = mode === 'register' ? '注册' : '登录';
        setErr('');
      });
    });
    TW.$('#g-submit', host).addEventListener('click', submit);
    TW.$('#g-guest', host).addEventListener('click', guest);
    var codeSend = TW.$('#g-code-send', host);
    if (codeSend) codeSend.addEventListener('click', function () {
      var email = (TW.$('#g-email', host) || {}).value || '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim())) { setErr('请先填正确的邮箱地址'); return; }
      codeSend.disabled = true;
      startCodeFlow(email.trim());
    });
    ['#g-email', '#g-pass', '#g-pass2', '#g-code'].forEach(function (sel) {
      var el = TW.$(sel, host);
      if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    });

    var emailEl = TW.$('#g-email', host);
    if (emailEl) emailEl.focus();
  }

  TW.views.gate = { render: paint };
})();
