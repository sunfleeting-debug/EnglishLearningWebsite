/* 动效层：把 Lenval Properties（lenvalproperties.com）的几招标志性动效搬进来。
   原站用的是 GSAP + ScrollTrigger + barba + Lenis（商业授权 + 体积大），
   这里按同样的观感手写零依赖等价物 —— 本仓库硬性约定「零依赖零构建」。

   提供：
     TW.motion.enter(host)      路由渲染后调用：进场 reveal + 滚动 reveal + 数字滚动
     TW.motion.reveal(host)     [data-rv]      逐个上移淡入（stagger）
     TW.motion.scrollReveal(h)  [data-rv-io]   进入视口才淡入（IntersectionObserver）
     TW.motion.counts(host)     [data-count]   数字滚动（easeOutQuart）
     TW.motion.preloader()      首次进站的全屏幕布开场（sessionStorage 记一次）

   🔴 失败安全：所有「初始隐藏态」都由 JS 加类（.rv），CSS 里不预设 ——
      脚本没加载 / 报错时页面照常完整显示，绝不会出现「白屏等动画」。
   🔴 navigator.webdriver（Playwright 等）一律跳过装饰性动画：
      核验脚本要在动画开始前就读 DOM / 点按钮，overlay 盖着会挡 actionability。 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};

  var reduced = !!(window.matchMedia &&
    matchMedia('(prefers-reduced-motion: reduce)').matches);
  var auto = !reduced && !navigator.webdriver;   // 真浏览器才播动画

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  /* ---------------- 1) 进场 reveal ---------------- */
  function reveal(host) {
    if (!auto) return;
    var els = (host || document).querySelectorAll('[data-rv]');
    each(els, function (el, i) {
      if (el.__rv) return;
      el.__rv = true;
      el.classList.add('rv');
      var base = parseInt(el.getAttribute('data-rv-delay') || '0', 10);
      el.style.setProperty('--rv-delay', (base + Math.min(i, 7) * 60) + 'ms');
      void el.offsetWidth;                       // 强制重排，transition 才播得出来
      requestAnimationFrame(function () { el.classList.add('rv-in'); });
    });
  }

  /* ---------------- 2) 滚动 reveal ---------------- */
  var io = null;
  function getIO() {
    if (io) return io;
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('rv-in');
        io.unobserve(en.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    return io;
  }
  function scrollReveal(host) {
    if (!auto || !('IntersectionObserver' in window)) return;
    each((host || document).querySelectorAll('[data-rv-io]'), function (el) {
      if (el.__rvIO) return;
      el.__rvIO = true;
      el.classList.add('rv');
      getIO().observe(el);
    });
  }

  /* ---------------- 3) 数字滚动 ----------------
     统计卡上的数字从 0 滚到目标值。数据本身不变，只是呈现 ——
     断言若要读数值，等 1s 或直接读 store（测试里都这么干的）。 */
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    if (isNaN(target)) return;
    if (!auto) { el.textContent = target; return; }
    var dur = 850, t0 = null, start = 0;
    function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 4);            // easeOutQuart
      el.textContent = Math.round(start + (target - start) * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function counts(host) {
    // 显式标了 data-count 的 + 自动发现的 .stat-num（纯整数才滚，带 % / 单位的跳过）
    each((host || document).querySelectorAll('[data-count]'), countUp);
    each((host || document).querySelectorAll('.stat-num'), function (el) {
      if (el.__counted) return;
      var t = (el.textContent || '').trim();
      if (!/^\d+$/.test(t) || parseInt(t, 10) === 0) return;
      el.__counted = true;
      el.setAttribute('data-count', t);
      countUp(el);
    });
  }

  /* ---------------- 自动打标记 ----------------
     视图文件里不手写 data-rv：进场时按选择器统一补，改动面小、也不会漏。
     只挑这几类（hero / 页头 / 卡片网格的子项），练习页那种要立即操作的
     区域不掺和（它只有路由级的 130ms 淡入淡出）。 */
  var AUTO_RV = '.hero, .page-head, .srs-callout, .grid.books > *, .grid.stats > *';
  function autoTag(host) {
    if (!host) return;
    each(host.querySelectorAll(AUTO_RV), function (el) {
      if (!el.hasAttribute('data-rv')) el.setAttribute('data-rv', '');
    });
  }

  /* ---------------- 4) 磁吸按钮 ----------------
     原站 hero 的主按钮会朝鼠标方向轻微偏移（GSAP 做）。
     只在精确指针（鼠标）设备上生效，触屏没有 hover 本来就看不到。 */
  var magnetOn = false;
  function magnetic() {
    if (magnetOn || !auto) return;
    if (!(window.matchMedia && matchMedia('(pointer: fine)').matches)) return;
    magnetOn = true;
    var cur = null;
    document.addEventListener('mousemove', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-magnetic]') : null;
      if (cur && cur !== t) { cur.style.transform = ''; cur = null; }
      if (!t) return;
      cur = t;
      var r = t.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      var dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      t.style.transform = 'translate(' + (dx * 6).toFixed(1) + 'px,' + (dy * 4).toFixed(1) + 'px)';
    }, { passive: true });
    document.addEventListener('mouseleave', function () {
      if (cur) { cur.style.transform = ''; cur = null; }
    });
  }

  /* ---------------- 5) 首访入场动画 ----------------
     仿 Lenval new-preloader 的完整时间线（零依赖手写）：
       ① 深棕幕布（竖向发丝线 + 叶影纹理 multiply）盖住页面
       ② 标题「六级单词速记」逐字从遮罩升起（stagger 70ms）
       ③ 中央打字机照片纵向剖开揭示（clip-path inset 50%→0 + 内图 1.2→1）
       ④ 底部 Loading 00%→100%（2.2s，easeInOutCubic）+ 1px 进度线同步
       ⑤ 收尾：幕布从中缝向上下退开（下半错缝 70ms），#app 从 scale .62 放大到 1
     只在**首次**进站播（sessionStorage 记一次）——练词工具，回回都放会挨骂。
     幕布做成上下两块窗口各自渲染整屏内容（见 style.css .intro 注释），
     百分比与进度线两份同步更新。 */
  var INTRO_HOLD = 2900;    // 计数结束后开始收尾
  var INTRO_GONE = 4200;    // 收尾动画播完、移除节点
  function preloader(force) {
    if (!auto && !force) return;
    var seen = false;
    try {
      seen = !!sessionStorage.getItem('tw.intro');
      sessionStorage.setItem('tw.intro', '1');
    } catch (e) { seen = true; }                 // 存储被禁时宁可不放动画
    if (seen && !force) return;

    var inner =
      '<div class="intro-lines"><i></i><i></i><i></i></div>' +
      '<div class="intro-shadow"></div>' +
      '<div class="intro-brand">CET-6 VOCAB</div>' +
      '<div class="intro-tag">TYPE TO REMEMBER</div>' +
      '<div class="intro-title">' +
        '六级单词速记'.split('').map(function (c, i) {
          return '<span style="--wi:' + i + '">' + c + '</span>';
        }).join('') +
      '</div>' +
      '<div class="intro-img-w"><img src="assets/img/intro-typewriter.webp" alt=""></div>' +
      '<div class="intro-sub">A QUIETER WAY TO LEARN WORDS</div>' +
      '<div class="intro-loader"><div class="intro-loader-row"><span>Loading</span>' +
        '<span class="intro-pct">00%</span></div>' +
        '<div class="intro-line"><i></i></div></div>';

    var el = document.createElement('div');
    el.className = 'intro';
    el.innerHTML =
      '<div class="intro-half intro-half-t"><div class="intro-in">' + inner + '</div></div>' +
      '<div class="intro-half intro-half-b"><div class="intro-in">' + inner + '</div></div>';
    document.body.appendChild(el);

    // 播放期间锁滚动（免得底下页面被滚走），结束兜底恢复
    document.documentElement.style.overflow = 'hidden';

    requestAnimationFrame(function () { el.classList.add('run'); });

    // ④ 计数 00→100 + 进度线（easeInOutCubic，2.2s）
    var pcts = el.querySelectorAll('.intro-pct');
    var bars = el.querySelectorAll('.intro-line i');
    var t0 = null, DUR = 2200;
    function tick(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / DUR);
      var e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      var v = Math.round(e * 100);
      var txt = (v < 10 ? '0' : '') + v + '%';
      pcts.forEach(function (n) { n.textContent = txt; });
      bars.forEach(function (n) { n.style.transform = 'scaleX(' + e.toFixed(4) + ')'; });
      if (p < 1) requestAnimationFrame(tick);
    }
    setTimeout(function () { requestAnimationFrame(tick); }, 400);

    // ⑤ 收尾：中缝退开 + 页面放大
    setTimeout(function () {
      el.classList.add('done');
      document.body.classList.add('intro-zoom');
    }, INTRO_HOLD);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      document.body.classList.remove('intro-zoom');
      document.documentElement.style.overflow = '';
    }, INTRO_GONE);
  }

  /* ---------------- 汇总入口 ---------------- */
  function enter(host) {
    autoTag(host);
    reveal(host);
    scrollReveal(host);
    counts(host);
  }

  TW.motion = {
    enter: enter, reveal: reveal, scrollReveal: scrollReveal,
    counts: counts, magnetic: magnetic, preloader: preloader, autoTag: autoTag,
    /* 暴露给核验脚本：直接把动画关掉（verify 里 setUp 用） */
    disable: function () { auto = false; },
    isOff: function () { return !auto; }
  };
})();
