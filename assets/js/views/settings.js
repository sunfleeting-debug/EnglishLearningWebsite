/* 设置：练习偏好、发音、主题、数据管理 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  function render(host) {
    var s = TW.store.settings;

    function switchRow(key, label, hint) {
      return '<div class="set-row"><div><div class="set-label">' + label + '</div>' +
        (hint ? '<div class="set-hint">' + hint + '</div>' : '') + '</div>' +
        '<button class="switch' + (s[key] ? ' on' : '') + '" data-switch="' + key + '"></button></div>';
    }

    host.innerHTML =
      '<div class="wrap-narrow">' +
        TW.ui.pageHead('设置', '所有设置保存在本机浏览器') +

        '<div class="card card-pad" style="margin-bottom:1rem">' +
          '<div class="card-title" style="margin-bottom:.3rem">练习偏好</div>' +
          '<div class="set-row"><div><div class="set-label">出题顺序</div><div class="set-hint">顺序练习便于按音频推进，随机练习用于抽查</div></div>' +
            '<div class="seg" id="set-order">' +
              '<button data-val="seq" class="' + (s.order === 'seq' ? 'active' : '') + '">顺序</button>' +
              '<button data-val="random" class="' + (s.order === 'random' ? 'active' : '') + '">随机</button>' +
            '</div></div>' +
          '<div class="set-row"><div><div class="set-label">每轮单词数</div><div class="set-hint">一轮练习包含的单词数量</div></div>' +
            '<select class="field" id="set-size">' +
              [10, 20, 30, 50, 100, 0].map(function (n) {
                return '<option value="' + n + '"' + (n === s.sessionSize ? ' selected' : '') + '>' + (n === 0 ? '全部' : n + ' 个') + '</option>';
              }).join('') +
            '</select></div>' +
          switchRow('autoNext', '答对后自动进入下一词', '关闭后可自己按 Enter 继续') +
          switchRow('showPhonetic', '显示音标', '') +
          switchRow('srsAuto', '答错的词自动加入复习队列', '开启后按艾宾浩斯曲线安排复习；关闭则只在单词页手动加入') +
        '</div>' +

        '<div class="card card-pad" style="margin-bottom:1rem">' +
          '<div class="card-title" style="margin-bottom:.3rem">发音与音效</div>' +
          switchRow('autoPronounce', '出题时自动发音', '看词 / 听音模式下自动朗读') +
          switchRow('keySound', '键盘与提示音效', '打字、答对、答错时的轻提示音') +
          '<div class="set-row"><div><div class="set-label">发音口音</div><div class="set-hint">美音 / 英音</div></div>' +
            '<div class="seg" id="set-accent">' +
              '<button data-val="us" class="' + (s.accent === 'us' ? 'active' : '') + '">美音</button>' +
              '<button data-val="uk" class="' + (s.accent === 'uk' ? 'active' : '') + '">英音</button>' +
            '</div></div>' +
          '<div class="set-row set-row-col"><div><div class="set-label">发音方式</div><div class="set-hint">自动＝在线真人音频优先，失败时退回系统语音</div></div>' +
            '<div class="seg" id="set-speakmode">' +
              '<button data-val="auto" class="' + (s.speakMode === 'auto' ? 'active' : '') + '">自动</button>' +
              '<button data-val="audio" class="' + (s.speakMode === 'audio' ? 'active' : '') + '">在线音频</button>' +
              '<button data-val="tts" class="' + (s.speakMode === 'tts' ? 'active' : '') + '">系统语音</button>' +
            '</div></div>' +
          '<div class="set-row"><div><div class="set-label">试听</div><div class="set-hint">用当前口音读一个单词</div></div>' +
            '<button class="btn sm" id="set-test">' + TW.icon('volume', 15) + ' 试听 "memory"</button></div>' +
        '</div>' +

        '<div class="card card-pad" style="margin-bottom:1rem">' +
          '<div class="card-title" style="margin-bottom:.3rem">外观</div>' +
          '<div class="set-row"><div><div class="set-label">主题</div><div class="set-hint">浅色 / 深色</div></div>' +
            '<div class="seg" id="set-theme">' +
              '<button data-val="light" class="' + (s.theme === 'light' ? 'active' : '') + '">浅色</button>' +
              '<button data-val="dark" class="' + (s.theme === 'dark' ? 'active' : '') + '">深色</button>' +
            '</div></div>' +
        '</div>' +

        '<div class="card card-pad">' +
          '<div class="card-title" style="margin-bottom:.3rem">数据管理</div>' +
          '<div class="card-title" style="font-weight:400;font-size:13px;color:var(--text-3);margin:.5rem 0 .8rem">' +
            '当前共有 ' + TW.store.counts().touched + ' 个单词的学习记录，复习队列 ' +
            TW.store.srs.stats().total + ' 词。数据仅存本机，清理浏览器数据会丢失。' +
          '</div>' +
          '<div class="row">' +
            '<button class="btn" id="data-export">' + TW.icon('download', 15) + ' 导出备份</button>' +
            '<button class="btn" id="data-import">导入备份</button>' +
            '<input type="file" id="data-file" accept="application/json" style="display:none" />' +
            '<button class="btn" id="data-srs-clear">清空复习队列</button>' +
            '<button class="btn danger" id="data-reset">' + TW.icon('trash', 15) + ' 清空学习记录</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    /* 交互 */
    TW.$$('[data-switch]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.switch;
        TW.store.setSetting(k, !TW.store.settings[k]);
        b.classList.toggle('on', TW.store.settings[k]);
        if (k === 'keySound') TW.speech.sound.enabled = TW.store.settings[k];
      });
    });

    function bindSeg(sel, key) {
      var el = TW.$(sel, host);
      if (!el) return;
      TW.$$('button', el).forEach(function (b) {
        b.addEventListener('click', function () {
          TW.$$('button', el).forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
          TW.store.setSetting(key, b.dataset.val);
          if (key === 'theme') {
            document.documentElement.classList.toggle('dark', b.dataset.val === 'dark');
          }
        });
      });
    }
    bindSeg('#set-order', 'order');
    bindSeg('#set-accent', 'accent');
    bindSeg('#set-speakmode', 'speakMode');
    bindSeg('#set-theme', 'theme');

    TW.$('#set-size', host).addEventListener('change', function (e) {
      TW.store.setSetting('sessionSize', parseInt(e.target.value, 10) || 20);
      TW.toast('已设置每轮 ' + (e.target.value === '0' ? '全部' : e.target.value) + ' 个单词');
    });

    TW.$('#set-test', host).addEventListener('click', function () {
      TW.speech.speak('memory', TW.store.settings.accent);
    });

    /* 导入导出 */
    TW.$('#data-export', host).addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(TW.store.state, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'typingcet-backup-' + TW.store.today() + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      TW.toast('已导出备份', 'ok');
    });
    TW.$('#data-import', host).addEventListener('click', function () { TW.$('#data-file', host).click(); });
    TW.$('#data-file', host).addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var d = JSON.parse(fr.result);
          if (d.settings) TW.store.state.settings = Object.assign({}, TW.store.settings, d.settings);
          if (d.progress) TW.store.state.progress = d.progress;
          if (d.daily) TW.store.state.daily = d.daily;
          if (d.srs) TW.store.state.srs = d.srs;
          if (d.srsInit != null) TW.store.state.srsInit = !!d.srsInit;
          TW.store.migrate();
          TW.store.save();
          TW.toast('导入成功', 'ok');
          TW.app.render();
        } catch (err) { TW.toast('文件格式不正确', 'err'); }
      };
      fr.readAsText(f);
    });
    TW.$('#data-srs-clear', host).addEventListener('click', function () {
      if (confirm('确定清空复习队列吗？学习记录不受影响。')) {
        TW.store.srs.reset();
        TW.toast('复习队列已清空');
        TW.app.render();
      }
    });
    TW.$('#data-reset', host).addEventListener('click', function () {
      if (confirm('确定清空全部学习记录吗？此操作不可撤销。')) {
        TW.store.resetAll();
        TW.toast('已清空学习记录');
        TW.app.render();
      }
    });
  }

  TW.views.settings = { render: render };
})();
