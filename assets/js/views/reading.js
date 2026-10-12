/* 六级阅读真题（DRJ172 简·六级阅读）—— 网页版「看题 + 做题」
 *
 * 设计要点
 * - 原文/译文/题源文章一律用渲染好的 WebP 页面图展示，100% 保真（扫描件 OCR 有噪声，
 *   拿 OCR 文本给学生看会误导，故只把 OCR 用于提取答案）。
 * - 答题卡是真正的交互：点字母选题 → 提交判分 → 错题标红并给出正确答案。
 * - 答题记录存 localStorage，关掉页面再回来还在。
 * - 图片按需懒加载；点图弹全屏灯箱，可左右翻页、Esc 关闭。
 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  var LS_KEY = 'typingcet.reading.v1';
  var IMG_BASE = 'assets/reading/';
  var DOC_ALIAS = { mt1: 'practice', mt2: 'practice' };

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /** 页面图路径：doc = practice | translation | source */
  function imgPath(doc, n) { return IMG_BASE + doc + '/p' + pad2(n) + '.webp'; }

  /* ---------------- 答题记录（localStorage） ---------------- */
  var picks = {};   // "mt1|a|1" -> "F"
  var graded = {};  // "mt1" -> true
  function loadPicks() {
    try {
      var d = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      picks = d.picks || {};
      graded = d.graded || {};
    } catch (e) { picks = {}; graded = {}; }
  }
  function savePicks() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ picks: picks, graded: graded })); } catch (e) {}
  }
  function pk(test, sec, no) { return test + '|' + sec + '|' + no; }

  /* ---------------- 灯箱 ---------------- */
  function openLightbox(host, doc, pages, startIdx) {
    if (host.querySelector('.rd-lightbox')) return;
    var i = startIdx;
    var box = TW.h(
      '<div class="rd-lightbox">' +
        '<div class="lb-bar">' +
          '<span class="lb-count"></span>' +
          '<button class="lb-btn" data-lb="close" title="关闭 (Esc)">' + TW.icon('x', 20) + '</button>' +
        '</div>' +
        '<button class="lb-nav lb-prev" data-lb="prev" title="上一页">' + TW.icon('arrowLeft', 26) + '</button>' +
        '<img class="lb-img" alt="页面" />' +
        '<button class="lb-nav lb-next" data-lb="next" title="下一页">' + TW.icon('arrowRight', 26) + '</button>' +
      '</div>');
    host.appendChild(box);
    var img = box.querySelector('.lb-img');
    var cnt = box.querySelector('.lb-count');

    function draw() {
      img.src = imgPath(doc, pages[i]);
      cnt.textContent = '第 ' + pages[i] + ' 页 · ' + (i + 1) + ' / ' + pages.length;
      box.querySelector('.lb-prev').disabled = i <= 0;
      box.querySelector('.lb-next').disabled = i >= pages.length - 1;
    }
    function step(d) {
      var n = i + d;
      if (n < 0 || n >= pages.length) return;
      i = n; draw();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    }
    function close() {
      document.removeEventListener('keydown', onKey);
      box.remove();
    }
    box.querySelector('[data-lb="close"]').addEventListener('click', close);
    box.querySelector('[data-lb="prev"]').addEventListener('click', function () { step(-1); });
    box.querySelector('[data-lb="next"]').addEventListener('click', function () { step(1); });
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    document.addEventListener('keydown', onKey);
    draw();
  }

  /* ---------------- 页面阅读器 ---------------- */
  /**
   * @param {string} doc    practice | translation | source
   * @param {number[]} pages 页码数组（1 起）
   * @param {string} tag    小标题（可选）
   */
  function readerHtml(doc, pages, tag) {
    var jump = pages.map(function (p, idx) {
      return '<button class="pj" data-jump="' + idx + '">' + p + '</button>';
    }).join('');
    var imgs = pages.map(function (p, idx) {
      return '<figure class="rd-page" data-pg="' + idx + '" id="rd-pg-' + idx + '">' +
        '<img class="rd-img" loading="lazy" src="' + imgPath(doc, p) + '" alt="' + doc + ' 第 ' + p + ' 页" data-idx="' + idx + '" />' +
        '<figcaption class="rd-cap">第 ' + p + ' 页' +
        '<a class="rd-open" href="' + imgPath(doc, p) + '" target="_blank" rel="noopener">原图</a>' +
        '</figcaption></figure>';
    }).join('');
    return '<div class="rd-reader" data-doc="' + doc + '">' +
      (tag ? '<div class="rd-tag">' + TW.esc(tag) + '</div>' : '') +
      '<div class="rd-jump"><span class="small muted">跳页</span>' + jump + '</div>' +
      '<div class="rd-pages">' + imgs + '</div>' +
      '</div>';
  }

  function bindReader(host, pages) {
    TW.$$('.rd-reader', host).forEach(function (rd) {
      var doc = rd.dataset.doc;
      // 点图开灯箱
      TW.$$('.rd-img', rd).forEach(function (img) {
        img.addEventListener('click', function () {
          openLightbox(host, doc, pages, parseInt(img.dataset.idx, 10) || 0);
        });
      });
      // 跳页
      TW.$$('[data-jump]', rd).forEach(function (b) {
        b.addEventListener('click', function () {
          var el = TW.$('#rd-pg-' + b.dataset.jump, rd);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    });
  }

  /* ---------------- 答题卡 ---------------- */
  function wordListHtml(sec) {
    if (!sec.words) return '';
    var w = sec.words.map(function (o) {
      return '<span class="wl-chip"><b>' + o.k + '</b>' + TW.esc(o.w) + '</span>';
    }).join('');
    return '<div class="ans-words"><div class="ans-words-t">备选词</div>' + w + '</div>';
  }

  function sectionHtml(test, sec) {
    var opts = sec.alpha.split('');
    var items = [];
    for (var n = sec.from; n <= sec.to; n++) {
      var cur = picks[pk(test, sec.id, n)] || '';
      var chips = opts.map(function (L) {
        return '<button class="ans-opt' + (cur === L ? ' on' : '') +
          '" data-q="' + n + '" data-l="' + L + '">' + L + '</button>';
      }).join('');
      items.push('<div class="ans-q" data-q="' + n + '">' +
        '<span class="ans-no">' + n + '</span>' +
        '<div class="ans-opts">' + chips + '</div>' +
        '<span class="ans-mark"></span></div>');
    }
    return '<div class="ans-sec" data-sec="' + sec.id + '">' +
      '<div class="ans-sec-head">' +
        '<span class="ans-badge">' + TW.esc(sec.en) + '</span>' +
        '<span class="ans-sec-name">' + TW.esc(sec.label) + '</span>' +
        '<span class="small muted">第 ' + sec.from + '–' + sec.to + ' 题 · ' + opts.length + ' 选 1</span>' +
      '</div>' +
      '<div class="small muted ans-hint">' + TW.esc(sec.hint) + '</div>' +
      wordListHtml(sec) +
      '<div class="ans-grid">' + items.join('') + '</div>' +
      '</div>';
  }

  function cardHtml(test) {
    var t = findTest(test);
    if (!t) return TW.ui.empty('未找到该套题');
    var secs = t.sections.map(function (s) { return sectionHtml(test, s); }).join('');
    return '<div class="ans-card" data-test="' + test + '">' + secs + '</div>' +
      '<div class="ans-bar">' +
        '<button class="btn" data-act="submit">' + TW.icon('check', 16) + ' 提交判分</button>' +
        '<button class="btn ghost" data-act="clear">' + TW.icon('refresh', 16) + ' 清空重做</button>' +
        '<button class="btn ghost" data-act="key">' + TW.icon('list', 16) + ' 查看答案</button>' +
        '<span class="ans-score" id="ans-score"></span>' +
      '</div>';
  }

  function totalOf(t) {
    return t.sections.reduce(function (a, s) { return a + (s.to - s.from + 1); }, 0);
  }

  /** 重新给答题卡着色（提交后 / 查看答案时）
   * mode: 'grade' 判分（对/错/未答三态） | 'answer' 只揭示正确答案 | 'none' 清空 */
  function paint(test, mode) {
    var t = findTest(test);
    if (!t) return 0;
    var right = 0, answered = 0;
    var judge = mode === 'grade';
    var reveal = mode === 'answer';
    t.sections.forEach(function (sec) {
      var card = TW.$('.ans-card[data-test="' + test + '"] .ans-sec[data-sec="' + sec.id + '"]');
      if (!card) return;
      for (var n = sec.from; n <= sec.to; n++) {
        var q = TW.$('.ans-q[data-q="' + n + '"]', card);
        if (!q) continue;
        var cur = picks[pk(test, sec.id, n)] || '';
        var correct = sec.ans[n - sec.from];
        var ok = cur === correct;
        if (cur) answered++;
        if (ok) right++;

        var missed = judge && !cur;
        q.classList.toggle('ok', judge && !!cur && ok);
        q.classList.toggle('bad', judge && !!cur && !ok);
        q.classList.toggle('miss', missed);

        var mark = TW.$('.ans-mark', q);
        if (mark) {
          if (mode === 'none') {
            mark.innerHTML = ''; mark.className = 'ans-mark';
          } else if (reveal) {
            mark.innerHTML = '<span class="mk-correct">' + correct + '</span>';
            mark.className = 'ans-mark show';
          } else if (missed) {
            mark.innerHTML = '<span class="mk-miss">未答</span><span class="mk-correct">' + correct + '</span>';
            mark.className = 'ans-mark show';
          } else if (ok) {
            mark.innerHTML = '<span class="mk-ok">✓</span>';
            mark.className = 'ans-mark show';
          } else {
            mark.innerHTML = '<span class="mk-bad">✗</span><span class="mk-correct">' + correct + '</span>';
            mark.className = 'ans-mark show';
          }
        }
        // 判分/看答案时，正确选项一律标绿（便于回看）
        TW.$$('.ans-opt', q).forEach(function (b) {
          b.classList.remove('good');
          if ((judge || reveal) && b.dataset.l === correct) b.classList.add('good');
        });
      }
    });
    return { right: right, answered: answered };
  }

  function findTest(id) {
    var R = TW.READING;
    if (!R || !R.practice) return null;
    return R.practice.tests.filter(function (t) { return t.id === id; })[0] || null;
  }

  function findDoc(id) {
    var R = TW.READING;
    if (!R) return null;
    return (R.docs || []).filter(function (d) { return d.id === id; })[0] || null;
  }

  function bindCard(host, test) {
    var card = TW.$('.ans-card[data-test="' + test + '"]', host);
    if (!card) return;

    // 选题
    TW.$$('.ans-opt', card).forEach(function (b) {
      b.addEventListener('click', function () {
        var q = b.dataset.q, L = b.dataset.l;
        var qEl = b.closest('.ans-q');
        var sec = b.closest('.ans-sec').dataset.sec;
        picks[pk(test, sec, q)] = L;
        // 同题其它选项取消选中
        TW.$$('.ans-opt', qEl).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        qEl.classList.remove('ok', 'bad');
        var mk = TW.$('.ans-mark', qEl); if (mk) { mk.className = 'ans-mark'; mk.innerHTML = ''; }
        savePicks();
        updateScore(host, test);
      });
    });

    var bar = TW.$('.ans-bar', host);
    if (!bar) return;
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.dataset.act;
      if (act === 'clear') {
        findTest(test).sections.forEach(function (s) {
          for (var n = s.from; n <= s.to; n++) delete picks[pk(test, s.id, n)];
        });
        delete graded[test];
        savePicks();
        render(host, { tab: 'practice', test: test, mode: 'card' });
        TW.toast('已清空本套作答');
        return;
      }
      if (act === 'submit') {
        var r = paint(test, 'grade');
        graded[test] = true;
        savePicks();
        updateScore(host, test);
        TW.toast('已判分：答对 ' + r.right + ' / ' + totalOf(findTest(test)) + ' 题', r.right ? '' : 'warn');
        return;
      }
      if (act === 'key') {
        paint(test, 'answer');
        TW.toast('已显示全部正确答案');
      }
    });
    updateScore(host, test);
  }

  function updateScore(host, test) {
    var el = TW.$('#ans-score', host);
    if (!el) return;
    var t = findTest(test);
    var total = totalOf(t);
    var right = 0, answered = 0;
    t.sections.forEach(function (s) {
      for (var n = s.from; n <= s.to; n++) {
        var cur = picks[pk(test, s.id, n)] || '';
        if (cur) answered++;
        if (cur && cur === s.ans[n - s.from]) right++;
      }
    });
    if (graded[test] || answered) {
      el.innerHTML = '已作答 <b>' + answered + '</b>/' + total +
        (graded[test] ? ' · 正确 <b class="sc-ok">' + right + '</b> · 正确率 <b>' + TW.pct(right, total) + '%</b>' :
          '<span class="muted">（未提交）</span>');
    } else {
      el.innerHTML = '<span class="muted">共 ' + total + ' 题，点字母作答后提交</span>';
    }
  }

  /* ---------------- 主渲染 ---------------- */
  var TABS = [
    { id: 'practice', label: '海量练习' },
    { id: 'translation', label: '参考译文' },
    { id: 'source', label: '题源文章' }
  ];
  var MODES = [
    { id: 'quiz', label: '原文' },
    { id: 'card', label: '答题卡' },
    { id: 'answer', label: '答案解析' }
  ];

  function render(host, query) {
    var R = TW.READING;
    if (!R) {
      host.innerHTML = '<div class="wrap-narrow">' + TW.ui.empty('阅读数据未加载', '📄') + '</div>';
      return;
    }
    loadPicks();

    var q = query || {};
    var tab = TABS.filter(function (t) { return t.id === q.tab; })[0] ? q.tab : 'practice';
    var test = findTest(q.test) ? q.test : R.practice.tests[0].id;
    var mode = MODES.filter(function (m) { return m.id === q.mode; })[0] ? q.mode : 'quiz';

    var tabsHtml = TABS.map(function (t) {
      return '<button class="rd-tab' + (t.id === tab ? ' active' : '') + '" data-tab="' + t.id + '">' +
        TW.esc(t.label) + '</button>';
    }).join('');

    var body = '';
    if (tab === 'practice') {
      var t = findTest(test);
      var testTabs = R.practice.tests.map(function (x) {
        return '<button class="rd-sub' + (x.id === test ? ' active' : '') + '" data-test="' + x.id + '">' +
          TW.esc(x.name) + '</button>';
      }).join('');
      var modeTabs = MODES.map(function (m) {
        return '<button class="rd-sub' + (m.id === mode ? ' active' : '') + '" data-mode="' + m.id + '">' +
          TW.esc(m.label) + '</button>';
      }).join('');

      if (mode === 'card') {
        body = cardHtml(test);
      } else {
        var pages = mode === 'answer' ? t.answerPages : t.quizPages;
        var tag = mode === 'answer' ? t.name + ' · 答案与解析' : t.name + ' · 试题原文';
        body = readerHtml('practice', pages, tag) +
          '<div class="rd-tip">' + TW.icon('lightbulb', 15) +
          '<span>在上方切换「答题卡」即可逐题作答并判分；点任意页面可全屏放大。</span></div>';
      }
      var headRight = '';
      body = '<div class="rd-subbar">' +
          '<div class="rd-subbar-l">' + testTabs + '</div>' +
          '<div class="rd-subbar-r">' + modeTabs + '</div>' +
        '</div>' + body +
        '<div class="rd-practice-desc small muted">' + TW.esc(R.practice.desc) + '</div>';
      // 记录当前 mode/test 以便切换
      host.innerHTML = shell(tabsHtml, body);
      bindSubbar(host, tab);
      if (mode === 'card') bindCard(host, test);
      else bindReader(host, mode === 'answer' ? t.answerPages : t.quizPages);
    } else {
      var doc = findDoc(tab);
      var n = doc ? doc.pages : 0;
      var pages2 = TW.range(n).map(function (i) { return i + 1; });
      body = readerHtml(tab, pages2, doc ? doc.title : '') +
        '<div class="rd-tip">' + TW.icon('lightbulb', 15) +
        '<span>' + TW.esc(doc ? doc.desc : '') + ' · 共 ' + n + ' 页，点图可全屏放大。</span></div>';
      host.innerHTML = shell(tabsHtml, body);
      bindSubbar(host, tab);
      bindReader(host, pages2);
    }
  }

  function shell(tabsHtml, body) {
    return '<div class="wrap">' +
      TW.ui.pageHead('六级阅读真题', '星火英语《简·六级阅读》· 可直接阅读、作答，无需下载') +
      '<div class="rd-tabs">' + tabsHtml + '</div>' +
      '<div class="rd-body">' + body + '</div>' +
      '</div>';
  }

  function bindSubbar(host, tab) {
    TW.$$('.rd-tab', host).forEach(function (b) {
      b.addEventListener('click', function () {
        TW.app.go('/reading?tab=' + b.dataset.tab);
      });
    });
    TW.$$('.rd-sub', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var cur = host.querySelector('.rd-subbar');
        if (!cur) return;
        // 依据被点的是 test 还是 mode 决定跳转参数
        if (b.dataset.test) {
          var mode = (TW.$('.rd-sub.active[data-mode]', host) || {}).dataset;
          var m = mode && mode.mode ? mode.mode : 'quiz';
          TW.app.go('/reading?tab=practice&test=' + b.dataset.test + '&mode=' + m);
        } else if (b.dataset.mode) {
          var tEl = TW.$('.rd-sub.active[data-test]', host);
          var t = tEl ? tEl.dataset.test : '';
          TW.app.go('/reading?tab=practice&test=' + t + '&mode=' + b.dataset.mode);
        }
      });
    });
  }

  TW.views.reading = { render: render };
})();
