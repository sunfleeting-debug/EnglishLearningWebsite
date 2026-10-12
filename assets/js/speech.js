/* 发音（Web Speech API）与音效（WebAudio，无外部音频依赖） */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};

  /* ---------------- 语音合成 ---------------- */
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

  var speaking = false;
  function speak(text, accent) {
    if (!window.speechSynthesis || !text) return;
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
      speechSynthesis.speak(u);
    } catch (e) {}
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
