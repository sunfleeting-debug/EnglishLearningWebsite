/* 发音（Web Speech API）与音效（WebAudio，无外部音频依赖） */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};

  /* ---------------- 单词发音：在线音频 + 系统语音 双通道 ----------------
     为什么要两条通道：
       1) 系统语音合成（Web Speech API）依赖运行环境的语音包与播放策略。移动端有两个
          「JS 根本检测不到」的静默失败：iOS 物理静音键打开时事件照常触发却不出声；
          Android 未装英文语音包时直接哑掉。
       2) 在线音频（有道 dictvoice 真人 mp3）走 <audio> 元素，不受 iOS 静音键影响，
          跨平台表现一致。代价是需要联网。
     默认 auto：先放音频，失败再退回系统语音。
  */
  var AUDIO_TYPE = { us: 2, uk: 1 };   // 有道 dictvoice：type=1 英音，type=2 美音

  function audioUrl(text, accent) {
    return 'https://dict.youdao.com/dictvoice?audio=' +
      encodeURIComponent(text) + '&type=' + (AUDIO_TYPE[accent] || 2);
  }

  /* 按「词|口音」缓存音频元素，重复点击不再重复请求 */
  var audioCache = {};
  var currentAudio = null;
  var speaking = false;

  function stopAudio() {
    if (!currentAudio) return;
    try { currentAudio.pause(); currentAudio.currentTime = 0; } catch (e) {}
    currentAudio = null;
  }

  /**
   * 在线音频通道。
   * 成功开始播放 → onOk；加载出错 / play() 被拒 / 2.5 秒仍起不来 → onFail（交上层回退）。
   */
  function speakAudio(text, accent, onOk, onFail) {
    var a = audioCache[text + '|' + accent];
    if (!a) {
      a = audioCache[text + '|' + accent] = new Audio(audioUrl(text, accent));
      a.preload = 'auto';
    }
    stopAudio();
    currentAudio = a;

    var settled = false;
    var timer = setTimeout(function () { if (!settled) { settled = true; onFail && onFail(); } }, 2500);
    function settle(ok) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ok) { speaking = true; onOk && onOk(); } else { onFail && onFail(); }
    }

    a.onerror = function () { settle(false); };
    a.onended = function () { speaking = false; };
    try { a.currentTime = 0; } catch (e) {}
    var p = a.play();
    if (p && typeof p.then === 'function') p.then(function () { settle(true); }, function () { settle(false); });
  }

  /* ---------------- 系统语音合成（兜底通道） ---------------- */
  var voices = [];
  function pickVoice(lang) {
    if (!voices.length) voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    var pref = lang === 'uk'
      ? [/en[-_]GB/i, /en[-_]UK/i]
      : [/en[-_]US/i, /en[-_]American/i];
    for (var i = 0; i < pref.length; i++) {
      var v = voices.find(function (x) { return pref[i].test(x.lang); });
      if (v) return v;
    }
    return voices.find(function (x) { return /^en/i.test(x.lang); }) || null;
  }

  if (window.speechSynthesis) {
    speechSynthesis.onvoiceschanged = function () { voices = speechSynthesis.getVoices(); };
    voices = speechSynthesis.getVoices();
  }

  function speakTTS(text, accent, onFail) {
    if (!window.speechSynthesis) { onFail && onFail(); return; }
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = accent === 'uk' ? 'en-GB' : 'en-US';
      u.rate = 0.92;
      u.pitch = 1;
      var v = pickVoice(accent);
      if (v) u.voice = v;
      u.onstart = function () { speaking = true; };
      u.onend = function () { speaking = false; };
      u.onerror = function () { speaking = false; onFail && onFail(); };
      // 🔴 Chrome 在 cancel() 之后紧接着 speak() 会静默丢弃这一次朗读（长期存在的 bug）。
      //    推迟到下一个宏任务里调用可稳定规避。
      setTimeout(function () {
        try { speechSynthesis.speak(u); } catch (e) { onFail && onFail(); }
      }, 60);
    } catch (e) { onFail && onFail(); }
  }

  /* 两条通道都走不通时提示一次，避免连续点击刷屏 */
  var warned = false;
  function warnUnavailable() {
    if (warned) return;
    warned = true;
    if (TW.toast) TW.toast('发音不可用：请联网或检查系统语音设置', 'warn');
  }

  function speak(text, accent) {
    if (!text) return;
    accent = accent || 'us';
    var mode = (TW.store && TW.store.settings.speakMode) || 'auto';
    if (mode === 'tts') { speakTTS(text, accent, warnUnavailable); return; }
    speakAudio(text, accent, null, function () {
      if (mode === 'audio') { warnUnavailable(); return; }
      speakTTS(text, accent, warnUnavailable);   // auto：音频失败 → 退回系统语音
    });
  }

  /* ---------------- 音效 ---------------- */
  var ctx = null;
  function ac() {
    if (!ctx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, gain, delay) {
    var c = ac();
    if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain == null ? 0.05 : gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  var S = {
    enabled: true,
    key: function () { if (S.enabled) tone(2000 + Math.random() * 400, 0.03, 'square', 0.018); },
    correct: function () { if (!S.enabled) return; tone(880, 0.09, 'sine', 0.06); tone(1320, 0.12, 'sine', 0.05, 0.07); },
    wrong: function () { if (!S.enabled) return; tone(200, 0.16, 'sawtooth', 0.045); },
    complete: function () {
      if (!S.enabled) return;
      [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.16, 'sine', 0.055, i * 0.1); });
    }
  };

  TW.speech = { speak: speak, sound: S, isSpeaking: function () { return speaking; } };
})();
