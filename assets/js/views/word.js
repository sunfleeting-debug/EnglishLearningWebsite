/* 单词详情页：一词一卡的词典详解（搭配 / 派生 / 辨析 / 近义 / 反义 / 例句 / 词源）
   近义词、反义词、例句中的单词 —— 只要存在于本地词库，均可点击跳转 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  /* 🔴 上一次详情页挂在 #view 容器上的 click 委托。#view 是路由复用的同一个容器，
     innerHTML 重建子节点**不会**移除挂在容器上的监听 —— 不拆旧的就会层层叠加：
     点一次美音读 N 遍（N = 本次页面加载内进过详情页的次数）、收藏反复横跳。 */
  var prevActionsCleanup = null;

  function sec(title, icon, body, cls) {
    if (!body) return '';
    return '<div class="card dc-sec' + (cls ? ' ' + cls : '') + '">' +
      '<div class="dc-sec-title">' + TW.icon(icon || 'list', 16) + '<span>' + TW.esc(title) + '</span></div>' +
      body + '</div>';
  }

  function transHtml(w) {
    if (!w.trans || !w.trans.length) return '<div class="muted">（暂无释义）</div>';
    return '<ul class="dc-means">' + w.trans.map(function (line) {
      var t = TW.data.parseTrans(line);
      return '<li>' + (t.pos ? '<span class="dc-pos">' + TW.esc(t.pos) + '</span>' : '') +
        '<span>' + TW.esc(t.text) + '</span></li>';
    }).join('') + '</ul>';
  }

  function render(host, query) {
    // 拆掉上一次详情页的委托监听（见 prevActionsCleanup 说明）
    if (prevActionsCleanup) { prevActionsCleanup(); prevActionsCleanup = null; }
    // 路由复用同一个 #view，用 token 认领，避免异步回调写进别的页面
    var token = 'wd' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    host.dataset.owner = token;
    function alive() { return host.dataset.owner === token; }

    var id = query.id == null ? '' : String(query.id);
    var w = id ? TW.data.byId(id) : null;

    // 词典词条是懒加载的，id 形如 "<deck>:<word>"：先把对应词典载进来再找
    if (!w && id.indexOf(':') > 0) {
      var deckId = id.slice(0, id.indexOf(':'));
      if (TW.data.isDeck(deckId)) {
        host.innerHTML = '<div class="wrap wrap-narrow">' + loadQuoteHtml() + '</div>';
        TW.data.loadBook(deckId, function () {
          if (!alive()) return;
          var ww = TW.data.byId(id);
          if (ww) paintWithDict(host, ww, alive);
          else paintMissing(host);
        });
        return;
      }
    }

    var term = null;
    /* 库外词的 id（`x:词面`，笔记/收藏列表、生词本跳过来）：转成 term 走扩展词条/在线链；
       词面若后来进了本地词库则优先走本地详解 */
    if (!w && id && id.indexOf('x:') === 0) {
      term = id.slice(2);
      w = TW.data.byWord(term) || null;
    }
    if (!w && query.w) {
      w = TW.data.byWord(query.w);
      if (!w) {
        // 复习页是「?w=单词」跳过来的，词可能属于尚未加载的词典：查复习记录里的来源再加载
        var rec = TW.store.srs.get(query.w);
        if (rec && rec.s && TW.data.isDeck(rec.s)) {
          host.innerHTML = '<div class="wrap wrap-narrow">' + loadQuoteHtml() + '</div>';
          TW.data.loadBook(rec.s, function () {
            if (!alive()) return;
            var ww = TW.data.byWord(query.w);
            paintWithDict(host, ww || null, alive, ww ? undefined : query.w);
          });
          return;
        }
        term = query.w;                    // 本地词库没有 → 可能是扩展词条
      }
    }

    if (!w && !term) { paintMissing(host); return; }
    paintWithDict(host, w, alive, term);
  }

  /** 等词典数据的空档：随机来一条名句/习语（sunfleeting：与其白等，不如积累）。
      语料在 data/quotes.js（静态引入）；缺失时回退原提示。 */
  function loadQuoteHtml() {
    var Q = (TW.QUOTES && TW.QUOTES.quotes) || [];
    var I = (TW.QUOTES && TW.QUOTES.idioms) || [];
    var inner = '';
    if (Q.length && (!I.length || Math.random() < 0.55)) {
      var q = Q[Math.floor(Math.random() * Q.length)];
      inner = '<div class="lq-text">' + TW.esc(q.t) + '</div>' +
              '<div class="lq-src">—— ' + TW.esc(q.s) + '</div>';
    } else if (I.length) {
      var it = I[Math.floor(Math.random() * I.length)];
      inner = '<div class="lq-text lq-idiom">' + TW.esc(it.t) + '</div>' +
              '<div class="lq-src">' + TW.esc(it.m) + '</div>';
    }
    if (!inner) return '<div class="card card-pad muted">正在加载词典数据…</div>';
    return '<div class="card card-pad load-quote">' + inner +
      '<div class="lq-foot">名句积累 · 词典数据加载中</div></div>';
  }

  /** 加载词典卡数据（按需），随后渲染详情 */
  function paintWithDict(host, w, alive, term) {
    host.innerHTML = '<div class="wrap wrap-narrow">' + loadQuoteHtml() + '</div>';
    var pending = w ? 2 : 1;               // 本地词要「词典卡 + 扩展词条（供链接跳转）」；扩展词只需要后者
    function ready() {
      if (alive && !alive()) return;        // 已离开该页面，别再写 DOM
      if (--pending > 0) return;
      if (w) { paintLocal(host, w, alive); return; }
      var e = TW.data.ext(term);
      if (e) renderExt(host, term, e); else paintOnlineOnly(host, term, alive);
    }
    if (w) TW.data.loadDict(ready, w.word);            // 只载这个词所在字母块（~150KB）
    TW.data.loadDictExt(ready, w ? w.word : term);
  }

  function paintMissing(host) {
    host.innerHTML = '<div class="wrap"><div class="card card-pad">' +
      TW.ui.empty('未找到这个单词', '🔍') +
      '<div class="row" style="justify-content:center"><button class="btn" id="dc-back">' + TW.icon('arrowLeft', 16) + ' 返回</button></div>' +
      '</div></div>';
    var bb = TW.$('#dc-back', host);
    if (bb) bb.addEventListener('click', back);
  }

  /** 本地词库和扩展词库都没有的词（首页搜索在线兜底跳过来的）：
      现查在线词典展示释义，不再干巴巴一句「未找到」（sunfleeting：点了搜索结果要能看到东西） */
  function paintOnlineOnly(host, term, alive) {
    host.innerHTML = '<div class="wrap wrap-narrow"><div class="card card-pad muted">正在查询「' +
      TW.esc(term) + '」…</div></div>';
    TW.data.lookupChain(term, function (res) {
      if (alive && !alive()) return;            // 已离开该页面
      if (!res || !res.word) { paintMissing(host); return; }
      var means = (res.ms || []).map(function (m) {
        return '<div style="margin:.5rem 0">' +
          (m.pos ? '<span class="dc-pos">' + TW.esc(m.pos) + '</span>' : '') +
          '<div style="margin-top:.2rem">' + m.defs.map(function (d) { return TW.esc(d); }).join('<br>') + '</div>' +
        '</div>';
      }).join('');
      host.innerHTML = '<div class="wrap wrap-narrow dc-wrap">' +
        '<div class="card card-pad dc-head">' +
          '<div class="dc-crumb"><button class="btn sm ghost" id="dc-back">' + TW.icon('arrowLeft', 15) + ' 返回</button>' +
            '<span class="muted small">在线词典 · 该词不在本地词库，练习/收藏需先加入词库</span></div>' +
          '<div class="dc-title"><div class="dc-word">' + TW.esc(res.word) + '</div>' +
            '<div class="dc-actions"><button class="dc-phon" id="dc-online-speak" title="朗读">' +
              TW.icon('volume', 16) + '</button></div></div>' +
          (res.ph ? '<div class="dc-phons"><span class="dc-phon">/' + TW.esc(res.ph) + '/</span></div>' : '') +
        '</div>' +
        '<div class="card card-pad">' + (means || '<div class="muted">（在线词典暂无释义）</div>') + '</div>' +
      '</div>';
      var bb = TW.$('#dc-back', host);
      if (bb) bb.addEventListener('click', back);
      var sb = TW.$('#dc-online-speak', host);
      if (sb) sb.addEventListener('click', function () { TW.speech.speak(res.word, TW.store.settings.accent); });
    });
  }

  function paintLocal(host, w, alive) {
    var card = TW.data.card(w.word) || {};
    var book = TW.data.getBook(w.book);
    var siblings = TW.data.byBook(w.book);
    var pos = siblings.map(function (x) { return x.id; }).indexOf(w.id);
    var prev = pos > 0 ? siblings[pos - 1] : null;
    var next = pos >= 0 && pos < siblings.length - 1 ? siblings[pos + 1] : null;

    /* ---- 头部 ---- */
    var phon = '';
    if (w.us) phon += '<button class="dc-phon" data-act="speak" data-say="' + TW.esc(w.word) + '" data-accent="us">美 /' + TW.esc(w.us) + '/</button>';
    if (w.uk) phon += '<button class="dc-phon" data-act="speak" data-say="' + TW.esc(w.word) + '" data-accent="uk">英 /' + TW.esc(w.uk) + '/</button>';

    var exams = (card.exam || []).map(function (e) { return '<span class="tag">' + TW.esc(e) + '</span>'; }).join('');

    var p = TW.store.get(w.id) || {};

    // 复习队列状态（艾宾浩斯）
    var srs = TW.store.srs.get(w.word);
    var srsChip = '';
    if (srs) {
      var dt = TW.store.diffDays(TW.store.today(), srs.d);
      srsChip = '<span class="tag srs">' + TW.icon('refresh', 12) + ' 复习第 ' + (srs.b + 1) + ' 档 · ' +
        (dt <= 0 ? '今天到期' : dt + ' 天后') + '</span>';
    }

    var head = '<div class="card card-pad dc-head">' +
      '<div class="dc-crumb"><button class="btn sm ghost" id="dc-back">' + TW.icon('arrowLeft', 15) + ' 返回</button>' +
        '<span class="muted small">' + TW.esc(book ? book.name : '') + ' · 第 ' + (w.idx + 1) + ' 词</span>' +
        '<span class="dc-nav-sp">' +
          (prev ? '<a class="btn sm ghost" href="#/word?id=' + encodeURIComponent(prev.id) + '">' + TW.icon('arrowLeft', 15) + '</a>' : '') +
          (next ? '<a class="btn sm ghost" href="#/word?id=' + encodeURIComponent(next.id) + '">' + TW.icon('arrowRight', 15) + '</a>' : '') +
        '</span></div>' +
      '<div class="dc-title">' +
        '<div class="dc-word">' + TW.esc(w.word) + '</div>' +
        '<div class="dc-actions">' +
          '<button class="star-btn' + (p.fav ? ' on' : '') + '" data-act="fav" title="收藏">' + TW.icon('star') + '</button>' +
          '<button class="star-btn master' + (p.master ? ' on' : '') + '" data-act="master" title="已掌握">' + TW.icon('check') + '</button>' +
          '<button class="star-btn' + (srs ? ' on' : '') + '" data-act="srs" title="' + (srs ? '移出复习队列' : '加入复习队列') + '">' + TW.icon('refresh') + '</button>' +
          '<button class="star-btn" data-act="speak" data-say="' + TW.esc(w.word) + '" title="朗读">' + TW.icon('volume') + '</button>' +
        '</div>' +
      '</div>' +
      (phon ? '<div class="dc-phons">' + phon + '</div>' : '') +
      (w.note ? '<div class="muted small">字幕原形：' + TW.esc(w.note) + '</div>' : '') +
      (w.deck ? '<div class="muted small">该词条来自词典「' + TW.esc(book ? book.name : '') + '」，仅提供音标与释义</div>' : '') +
      '<div class="muted small" style="margin-top:.5rem">快捷键：<kbd>Esc</kbd> 返回 · <kbd>←</kbd>/<kbd>→</kbd> 上/下一个词 · ' +
        '<kbd>S</kbd> 发音 · <kbd>F</kbd> 收藏 · <kbd>M</kbd> 掌握 · <kbd>R</kbd> 复习队列 · <kbd>Alt+V</kbd> 看答案</div>' +
      '<div class="row dc-tags">' + exams + srsChip + (book && book.audio ? '<a class="tag link" href="#/audio?book=' + book.id + '&t=' + w.time + '">' + TW.icon('headphone', 13) + ' 转到音频</a>' : '') + '</div>' +
    '</div>';

    /* ---- 各板块 ---- */
    var secs = '';

    // 释义（始终有）
    secs += sec('释义', 'file', transHtml(w));

    // 学习笔记（sunfleeting：想记点背单词的心得）。自动保存，随进度云同步。
    var savedNote = (TW.store.get(w.id) || {}).note || '';
    secs += sec('学习笔记', 'edit',
      '<textarea class="dc-note" id="dc-note" rows="4" maxlength="2000" ' +
        'placeholder="记点心得：怎么记住它、哪里容易混、例句造一个…">' + TW.esc(savedNote) + '</textarea>' +
      '<div class="dc-note-foot"><span class="muted small" id="dc-note-hint">' +
        (savedNote ? '已保存' : '自动保存 · 随进度云同步') + '</span></div>');

    // 拼写练习（sunfleeting：详解页也要能练打单词）。本地校验，答对/答错都计入进度
    //（markRight/markWrong），与练习页同一套判分口径（括号变体也算对）。
    secs += sec('拼写练习', 'check',
      '<div class="dc-spell">' +
        '<div class="muted small">看释义，拼出这个单词：</div>' +
        '<div style="margin-top:.3rem;font-size:1.05rem">' + TW.esc(TW.data.brief(w)) + '</div>' +
        '<div class="row" style="gap:.5rem;margin-top:.6rem">' +
          '<input class="typing-input" id="dc-spell-input" autocomplete="off" autocorrect="off" ' +
            'autocapitalize="off" spellcheck="false" placeholder="在这里打出这个单词…" style="flex:1" />' +
          '<button class="btn sm primary" id="dc-spell-check" title="快捷键 Enter">检查 <kbd>Enter</kbd></button>' +
          '<button class="btn sm ghost" id="dc-spell-reveal" title="快捷键 Alt+V（输入框里也能按）">看答案 <kbd>Alt+V</kbd></button>' +
          '<button class="btn sm ghost" id="dc-spell-retry" title="清空重打，再来一遍（快捷键 Alt+R，输入框里也能按）">重练 <kbd>Alt+R</kbd></button>' +
        '</div>' +
        '<div id="dc-spell-fb" style="margin-top:.6rem"></div>' +
      '</div>');

    // 搭配
    if (card.colloc && card.colloc.length) {
      secs += sec('搭配', 'shuffle', '<ul class="dc-list">' + card.colloc.map(function (c) {
        return '<li><span class="dc-en">' + TW.ui.linkify(c.en, { self: w.word }) + '</span>' +
          (c.zh ? '<span class="dc-zh">' + TW.esc(c.zh) + '</span>' : '') + '</li>';
      }).join('') + '</ul>');
    } else if (card.colloc_raw && card.colloc_raw.length) {
      secs += sec('语料搭配', 'shuffle', '<div class="muted small" style="margin-bottom:.35rem">以下为例句中与该词高频共现的搭配</div>' +
        '<div class="dc-chips">' + card.colloc_raw.map(function (c) {
          return '<span class="dc-chip">' + TW.ui.linkify(c, { self: w.word }) + '</span>';
        }).join('') + '</div>');
    }

    // 派生词
    if (card.deriv && card.deriv.length) {
      secs += sec('派生词', 'refresh', '<ul class="dc-list">' + card.deriv.map(function (d) {
        return '<li>' + (d.pos ? '<span class="dc-pos">' + TW.esc(d.pos) + '</span>' : '') +
          '<span class="dc-en">' + TW.ui.linkWord(d.word) + '</span>' +
          (d.zh ? '<span class="dc-zh">' + TW.esc(d.zh) + '</span>' : '') + '</li>';
      }).join('') + '</ul>');
    }

    // 近义词
    if (card.syn && card.syn.length) {
      secs += sec('近义词', 'check', card.syn.map(function (s) {
        return '<div class="dc-synrow">' +
          (s.pos ? '<span class="dc-pos">' + TW.esc(s.pos) + '</span>' : '') +
          '<span class="dc-synwords">' + s.words.map(function (x) { return TW.ui.linkWord(x); }).join('<span class="dc-sep">、</span>') + '</span>' +
          (s.zh ? '<div class="dc-zh small">' + TW.esc(s.zh) + '</div>' : '') + '</div>';
      }).join(''));
    }

    // 反义词
    if (card.ant && card.ant.length) {
      secs += sec('反义词', 'x', '<div class="dc-synwords">' +
        card.ant.map(function (x) { return TW.ui.linkWord(x); }).join('<span class="dc-sep">、</span>') + '</div>');
    }

    // 辨析
    if (card.discrim && card.discrim.items && card.discrim.items.length) {
      secs += sec('辨析', 'lightbulb', (card.discrim.tran ? '<div class="muted small" style="margin-bottom:.4rem">' + TW.esc(card.discrim.tran) + '</div>' : '') +
        '<ul class="dc-list">' + card.discrim.items.map(function (it) {
          return '<li><span class="dc-en">' + TW.ui.linkWord(it.word) + '</span><span class="dc-zh">' + TW.esc(it.zh) + '</span></li>';
        }).join('') + '</ul>');
    }

    // 经典例句
    if (card.ex && card.ex.length) {
      secs += sec('经典例句', 'file', '<ol class="dc-ex">' + card.ex.map(function (e) {
        return '<li><div class="dc-ex-en">' + TW.ui.linkify(e.en, { self: w.word }) + '</div>' +
          (e.zh ? '<div class="dc-ex-zh">' + TW.esc(e.zh) + '</div>' : '') + '</li>';
      }).join('') + '</ol>');
    }

    // 词源
    if (card.etym) {
      secs += sec('词源', 'book', '<div class="dc-etym">' + TW.esc(card.etym) + '</div>');
    }

    if (!card.syn && !card.ant && !card.deriv && !card.discrim && !card.colloc && !card.colloc_raw && !card.ex) {
      secs += '<div class="card card-pad muted">' + (w.deck
        ? '词典词条仅提供音标与释义；搭配 / 派生 / 例句等详解目前只覆盖「六级词汇周计划」词库。'
        : '该词暂无词典卡数据。') + '</div>';
    }

    host.innerHTML = '<div class="wrap wrap-narrow dc-wrap">' + head + secs + '</div>';

    // 交互
    var backBtn = TW.$('#dc-back', host);
    if (backBtn) backBtn.addEventListener('click', back);
    var clicksCleanup = TW.ui.bindWordActions(host, w.id);

    /* ---- 键盘快捷键（sunfleeting：详解页也要有键盘快捷键）----
       Esc 返回 · ←/→ 上/下一个词 · S 发音 · F 收藏 · M 掌握 · R 复习队列
       焦点在输入框（学习笔记 / 拼写练习）里时不响应 —— 裸字母得还是字母本身。
       🔴 监听挂 document 上，必须随 prevActionsCleanup 一起拆（见模块顶部说明）。 */
    function onKey(e) {
      if (!alive() || e.isComposing) return;
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;   // 正在打字
      var k = (e.key || '').toLowerCase();
      if (e.key === 'Escape') { e.preventDefault(); back(); }
      else if (e.key === 'ArrowLeft' && prev) {
        e.preventDefault(); TW.app.go('#/word?id=' + encodeURIComponent(prev.id));
      }
      else if (e.key === 'ArrowRight' && next) {
        e.preventDefault(); TW.app.go('#/word?id=' + encodeURIComponent(next.id));
      }
      else if (k === 's') { TW.speech.speak(w.word, TW.store.settings.accent); }
      else if (k === 'f') {
        var on = TW.store.toggleFav(w.id);
        var fb = TW.$('[data-act="fav"]', host);
        if (fb) fb.classList.toggle('on', on);
        TW.toast(on ? '已收藏' : '已取消收藏');
      }
      else if (k === 'm') {
        var m = TW.store.toggleMaster(w.id);
        var mb = TW.$('[data-act="master"]', host);
        if (mb) mb.classList.toggle('on', m);
        TW.toast(m ? '已标记掌握' : '已取消掌握');
      }
      else if (k === 'r') {
        if (TW.store.srs.has(w.word)) {
          TW.store.srs.remove(w.word); TW.toast('已移出复习队列');
        } else {
          TW.store.srs.enroll(w.word, w.book || '', TW.data.brief(w)); TW.toast('已加入复习队列');
        }
        var sb = TW.$('[data-act="srs"]', host);
        if (sb) sb.classList.toggle('on', TW.store.srs.has(w.word));
      }
      else if (k === 'v') { spReveal(); }   // V = 拼写练习「看答案」（焦点在输入框里时用 Alt+V）
    }
    document.addEventListener('keydown', onKey);
    prevActionsCleanup = function () {
      clicksCleanup();
      document.removeEventListener('keydown', onKey);
    };

    // 笔记自动保存（600ms 防抖；离开页面/f5 前 save() 的 120ms 落盘足够快）
    var noteEl = TW.$('#dc-note', host);
    var noteHint = TW.$('#dc-note-hint', host);
    var noteTimer = null;
    if (noteEl) {
      noteEl.addEventListener('input', function () {
        clearTimeout(noteTimer);
        if (noteHint) noteHint.textContent = '输入中…';
        noteTimer = setTimeout(function () {
          TW.store.saveNote(w.id, noteEl.value);
          if (noteHint) noteHint.textContent = '已保存 ' +
            new Date().toTimeString().slice(0, 5);
        }, 600);
      });
    }

    var srsBtn = TW.$('[data-act="srs"]', host);
    if (srsBtn) srsBtn.addEventListener('click', function () {
      if (TW.store.srs.has(w.word)) {
        TW.store.srs.remove(w.word);
        TW.toast('已移出复习队列');
      } else {
        TW.store.srs.enroll(w.word, w.book || '', TW.data.brief(w));
        TW.toast('已加入复习队列');
      }
      TW.app.render();
    });

    /* ---- 拼写练习 ---- */
    var spInput = TW.$('#dc-spell-input', host);
    var spFb = TW.$('#dc-spell-fb', host);
    var spRetyping = false;   // 看答案后：必须照答案重打对才算完（sunfleeting：不会也要打一遍）
    var spWrongTries = 0;
    /** 与 practice.js 的 answers() 同口径：括号变体也算对（如 "color(colour)"） */
    function spAnswers(word) {
      var set = [word];
      if (/[()]/.test(word)) {
        set.push(word.replace(/[()]/g, ''));
        set.push(word.replace(/\(([^)]*)\)/, '$1'));
        set.push(word.replace(/\([^)]*\)/, ''));
      }
      return set.map(function (s) { return s.trim(); }).filter(Boolean);
    }
    function spSay(ok, html) {
      if (spFb) spFb.innerHTML = '<div class="tag ' + (ok ? 'ok' : 'err') + '">' +
        TW.icon(ok ? 'check' : 'x', 13) + ' ' + html + '</div>';
      if (TW.speech && TW.speech.sound) TW.speech.sound[ok ? 'correct' : 'wrong']();
    }
    function spCheck() {
      if (!spInput) return;
      var val = (spInput.value || '').trim();
      if (!val) { spInput.focus(); return; }   // 空输入不判分（同练习页）
      var ok = spAnswers(w.word).some(function (a) { return TW.isCorrect(val, a); });
      if (ok) {
        var wasRetyping = spRetyping;
        spRetyping = false;
        spSay(true, wasRetyping ? '重打正确，这个词记住了' : '一次拼对，漂亮');
        if (TW.store.markRight) TW.store.markRight(w.id);   // 计入练习进度（连对走自动掌握）
        if (TW.speech && TW.speech.speak) TW.speech.speak(w.word);
      } else {
        spWrongTries++;
        if (spRetyping) {
          spSay(false, '还不对，照着上面的答案再打一遍');
        } else if (spWrongTries >= 2) {
          spReveal();   // 错两次自动揭答案，转入重打
        } else {
          spSay(false, '再试一次（' + (2 - spWrongTries) + ' 次机会）');
        }
        if (TW.store.markWrong) TW.store.markWrong(w.id);   // 答错进错词/复习链路
      }
    }
    function spReveal() {
      spRetyping = true;
      if (spFb) spFb.innerHTML =
        '<div class="tag err">' + TW.icon('x', 13) + ' 答案：<b style="font-size:1.15rem;letter-spacing:.06em">' +
          TW.esc(w.word) + '</b> —— 照着它再打一遍</div>';
      if (spInput) { spInput.value = ''; spInput.focus(); }
      if (TW.speech && TW.speech.speak) TW.speech.speak(w.word);
    }
    var spCheckBtn = TW.$('#dc-spell-check', host);
    if (spCheckBtn) spCheckBtn.addEventListener('click', spCheck);
    var spRevealBtn = TW.$('#dc-spell-reveal', host);
    if (spRevealBtn) spRevealBtn.addEventListener('click', spReveal);
    /** 重练：清空输入与反馈，从头再打（sunfleeting：拼对了还想再练一遍） */
    function spRetry() {
      spRetyping = false;
      spWrongTries = 0;
      if (spFb) spFb.innerHTML = '';
      if (spInput) { spInput.value = ''; spInput.focus(); }
    }
    var spRetryBtn = TW.$('#dc-spell-retry', host);
    if (spRetryBtn) spRetryBtn.addEventListener('click', spRetry);
    if (spInput) spInput.addEventListener('keydown', function (e) {
      if (e.isComposing) return;
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); spCheck(); }
      /* Alt+V = 看答案：打字中也能用（裸 V 是字母本体），与练习页 Alt+ 组合惯例一致 */
      else if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyV') {
        e.preventDefault(); e.stopPropagation(); spReveal();
      }
      /* Alt+R = 重练（裸 R 已被「复习队列」占用） */
      else if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyR') {
        e.preventDefault(); e.stopPropagation(); spRetry();
      }
    });
  }

  function back() {
    if (history.length > 1) history.back();
    else TW.app.go('/books');
  }

  /** 扩展词条（不在本地六级词库中的近义/反义词）：只展示音标 + 释义 */
  function renderExt(host, term, e) {
    var phon = '';
    if (e.u) phon += '<button class="dc-phon" data-act="speak" data-say="' + TW.esc(term) + '" data-accent="us">美 /' + TW.esc(e.u) + '/</button>';
    if (e.k) phon += '<button class="dc-phon" data-act="speak" data-say="' + TW.esc(term) + '" data-accent="uk">英 /' + TW.esc(e.k) + '/</button>';

    /* 库外词（`x:词面`）也走完整学习闭环（sunfleeting：收藏/掌握/拼写练习/笔记都要有）。
       进度按 x:词面 存，收藏/掌握进生词本列表（词面快照已补齐），拼写计入连对。 */
    var noteId = 'x:' + term;
    var p = TW.store.get(noteId) || {};
    var savedNote = p.note || '';

    var host_ = '<div class="wrap wrap-narrow dc-wrap">' +
      '<div class="card card-pad dc-head">' +
        '<div class="dc-crumb"><button class="btn sm ghost" id="dc-back">' + TW.icon('arrowLeft', 15) + ' 返回</button>' +
          '<span class="muted small">扩展词条</span></div>' +
        '<div class="dc-title"><div class="dc-word">' + TW.esc(term) + '</div>' +
          '<div class="dc-actions">' +
            '<button class="star-btn' + (p.fav ? ' on' : '') + '" data-act="fav" title="收藏（F）">' + TW.icon('star') + '</button>' +
            '<button class="star-btn master' + (p.master ? ' on' : '') + '" data-act="master" title="已掌握（M）">' + TW.icon('check') + '</button>' +
            '<button class="star-btn" data-act="speak" data-say="' + TW.esc(term) + '" title="朗读">' + TW.icon('volume') + '</button>' +
          '</div></div>' +
        (phon ? '<div class="dc-phons">' + phon + '</div>' : '') +
        '<div class="muted small">该词不在本地六级词书中，为词典卡的扩展词条。收藏/掌握/笔记随账号云同步。</div>' +
      '</div>' +
      sec('释义', 'file', transHtml({ trans: e.t })) +
      sec('拼写练习', 'check',
        '<div class="dc-spell">' +
          '<div class="muted small">看释义，拼出这个单词：</div>' +
          '<div style="margin-top:.3rem;font-size:1.05rem">' + TW.esc(transBrief(e.t)) + '</div>' +
          '<div class="row" style="gap:.5rem;margin-top:.6rem">' +
            '<input class="typing-input" id="dc-spell-input" autocomplete="off" autocorrect="off" ' +
              'autocapitalize="off" spellcheck="false" placeholder="在这里打出这个单词…" style="flex:1" />' +
            '<button class="btn sm primary" id="dc-spell-check" title="快捷键 Enter">检查 <kbd>Enter</kbd></button>' +
            '<button class="btn sm ghost" id="dc-spell-reveal" title="快捷键 Alt+V（输入框里也能按）">看答案 <kbd>Alt+V</kbd></button>' +
            '<button class="btn sm ghost" id="dc-spell-retry" title="清空重打，再来一遍（快捷键 Alt+R，输入框里也能按）">重练 <kbd>Alt+R</kbd></button>' +
          '</div>' +
          '<div id="dc-spell-fb" style="margin-top:.6rem"></div>' +
        '</div>') +
      sec('学习笔记', 'edit',
        '<textarea class="dc-note" id="dc-note" rows="4" maxlength="2000" ' +
          'placeholder="记点心得：怎么记住它、哪里容易混、例句造一个…">' + TW.esc(savedNote) + '</textarea>' +
        '<div class="dc-note-foot"><span class="muted small" id="dc-note-hint">' +
          (savedNote ? '已保存' : '自动保存 · 随进度云同步') + '</span></div>') +
      '<div class="row" style="justify-content:center"><button class="btn" id="dc-ext-back">' + TW.icon('arrowLeft', 16) + ' 返回上一页</button></div>' +
    '</div>';

    host.innerHTML = host_;
    var b1 = TW.$('#dc-back', host), b2 = TW.$('#dc-ext-back', host);
    if (b1) b1.addEventListener('click', back);
    if (b2) b2.addEventListener('click', back);
    prevActionsCleanup = TW.ui.bindWordActions(host, noteId);   // 收藏/掌握/发音按 x:词面 记进度

    /* ---- 键盘快捷键（同本地词条页：Esc 返回 · S 发音 · F 收藏 · M 掌握 · V 看答案；
       扩展词条没有词表兄弟，没有 ←/→ 换词）---- */
    function extSay(ok, html) {
      var fb = TW.$('#dc-spell-fb', host);
      if (fb) fb.innerHTML = '<div class="tag ' + (ok ? 'ok' : 'err') + '">' +
        TW.icon(ok ? 'check' : 'x', 13) + ' ' + html + '</div>';
      if (TW.speech && TW.speech.sound) TW.speech.sound[ok ? 'correct' : 'wrong']();
    }
    function extAnswers() { return [term]; }
    var spRetyping = false, spWrongTries = 0;
    function extCheck() {
      var input = TW.$('#dc-spell-input', host);
      if (!input) return;
      var val = (input.value || '').trim();
      if (!val) { input.focus(); return; }
      var ok = extAnswers().some(function (a) { return TW.isCorrect(val, a); });
      if (ok) {
        var wasRetyping = spRetyping;
        spRetyping = false;
        extSay(true, wasRetyping ? '重打正确，这个词记住了' : '一次拼对，漂亮');
        if (TW.store.markRight) TW.store.markRight(noteId);
        if (TW.speech && TW.speech.speak) TW.speech.speak(term);
      } else {
        spWrongTries++;
        if (spRetyping) extSay(false, '还不对，照着上面的答案再打一遍');
        else if (spWrongTries >= 2) extReveal();
        else extSay(false, '再试一次（' + (2 - spWrongTries) + ' 次机会）');
        if (TW.store.markWrong) TW.store.markWrong(noteId);
      }
    }
    function extReveal() {
      spRetyping = true;
      var fb = TW.$('#dc-spell-fb', host);
      if (fb) fb.innerHTML =
        '<div class="tag err">' + TW.icon('x', 13) + ' 答案：<b style="font-size:1.15rem;letter-spacing:.06em">' +
          TW.esc(term) + '</b> —— 照着它再打一遍</div>';
      var input = TW.$('#dc-spell-input', host);
      if (input) { input.value = ''; input.focus(); }
      if (TW.speech && TW.speech.speak) TW.speech.speak(term);
    }
    var cb = TW.$('#dc-spell-check', host);
    if (cb) cb.addEventListener('click', extCheck);
    var rb = TW.$('#dc-spell-reveal', host);
    if (rb) rb.addEventListener('click', extReveal);
    /** 重练：清空输入与反馈，从头再打（同本地词条页） */
    function extRetry() {
      spRetyping = false;
      spWrongTries = 0;
      var fb = TW.$('#dc-spell-fb', host);
      if (fb) fb.innerHTML = '';
      var input = TW.$('#dc-spell-input', host);
      if (input) { input.value = ''; input.focus(); }
    }
    var eb = TW.$('#dc-spell-retry', host);
    if (eb) eb.addEventListener('click', extRetry);
    var spInput = TW.$('#dc-spell-input', host);
    if (spInput) spInput.addEventListener('keydown', function (e) {
      if (e.isComposing) return;
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); extCheck(); }
      else if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyV') {
        e.preventDefault(); e.stopPropagation(); extReveal();
      }
      else if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyR') {
        e.preventDefault(); e.stopPropagation(); extRetry();
      }
    });

    function onKey(e) {
      if (!alive() || e.isComposing) return;
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      var k = (e.key || '').toLowerCase();
      if (e.key === 'Escape') { e.preventDefault(); back(); }
      else if (k === 's') { TW.speech.speak(term, TW.store.settings.accent); }
      else if (k === 'f') {
        var on = TW.store.toggleFav(noteId);
        var fb = TW.$('[data-act="fav"]', host);
        if (fb) fb.classList.toggle('on', on);
        TW.toast(on ? '已收藏' : '已取消收藏');
      }
      else if (k === 'm') {
        var m = TW.store.toggleMaster(noteId);
        var mb = TW.$('[data-act="master"]', host);
        if (mb) mb.classList.toggle('on', m);
        TW.toast(m ? '已标记掌握' : '已取消掌握');
      }
      else if (k === 'v') { extReveal(); }
    }
    document.addEventListener('keydown', onKey);
    var prevCleanup = prevActionsCleanup;
    prevActionsCleanup = function () {
      prevCleanup();
      document.removeEventListener('keydown', onKey);
    };

    // 笔记自动保存（600ms 防抖，同 paintLocal）
    var noteEl = TW.$('#dc-note', host);
    var noteHint = TW.$('#dc-note-hint', host);
    var noteTimer = null;
    if (noteEl) {
      noteEl.addEventListener('input', function () {
        clearTimeout(noteTimer);
        if (noteHint) noteHint.textContent = '输入中…';
        noteTimer = setTimeout(function () {
          TW.store.saveNote(noteId, noteEl.value);
          if (noteHint) noteHint.textContent = '已保存 ' +
            new Date().toTimeString().slice(0, 5);
        }, 600);
      });
    }
  }

  /** 取释义第一条的中文文本（扩展词条拼写练习的提示） */
  function transBrief(trans) {
    if (!trans || !trans.length) return '';
    var parsed = TW.data.parseTrans(trans[0]);
    return parsed.text || trans[0];
  }

  TW.views.word = { render: render };
})();
