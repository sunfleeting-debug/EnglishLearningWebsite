/* 学习统计：指标卡 + 趋势（柱/线）+ 掌握构成环形 + 复习档位 + 热力 + 模式/时段 + 场次明细 + 分书进度
   ------------------------------------------------------------------
   sunfleeting 2026-11-04：「学习统计那里多一些图表，多一些指标，图表多一些交互」。
   交互都落在一个模块级状态 S 上（时间窗 / 选中的某一天 / 模式 / 时段），
   点图表 = 改 S + 重渲染，不动路由，所以刷新页面回到默认视图也不会困惑。
   图表全部是手写 SVG（零依赖），悬停用统一浮层 #st-tip，点击见各自的 data-* 属性。
*/
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  var S = {
    range: 14,       // 趋势图时间窗：7 / 14 / 30
    day: '',         // 选中的某天（ymd），为空=不筛选
    mode: '',        // 选中的练习模式
    hour: -1,        // 选中的时段 0~23，-1=不筛选
    sortBooks: 'master',  // 分书进度排序：master | count | name
    booksOpen: false,     // 分书进度是否展开到全部（21 本一次铺开会把页面拉得很长）
    sessOpen: false       // 场次是否展开到全部
  };
  var SESS_SHOW = 10;
  var BOOKS_SHOW = 8;

  var MODE_NAMES = { type: '看词打字', recall: '看中文拼写', listen: '听音写词', card: '翻卡记忆', ai: 'AI 出题' };
  var SRC_NAMES = { book: '词书', srs: '复习队列', collection: '生词本', ai: 'AI 助手' };

  /* ---------------- 小工具 ---------------- */

  function ymd(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function lastDays(n) {
    var arr = [];
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      arr.push({ key: ymd(d), label: (d.getMonth() + 1) + '/' + d.getDate() });
    }
    return arr;
  }
  function shortLabel(key) {
    var p = String(key || '').split('-');
    return p.length === 3 ? Number(p[1]) + '/' + Number(p[2]) : key;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function n1(v) { return Math.round(v * 10) / 10; }
  function esc(s) { return TW.esc(s); }

  /** 柱高 / 折线通用：把数值映射到绘图区 */
  function scale(v, max, h) { return max > 0 ? (v / max) * h : 0; }

  /* ---------------- 图表：趋势（柱=题量，线=正确率） ---------------- */

  function trendSvg(days) {
    var W = 760, H = 210, PL = 34, PR = 36, PT = 16, PB = 26;
    var iw = W - PL - PR, ih = H - PT - PB;
    var n = days.length;
    var maxDone = 1;
    days.forEach(function (d) { maxDone = Math.max(maxDone, d.done); });
    maxDone = Math.max(5, Math.ceil(maxDone / 5) * 5);     // 取整到 5 的倍数，刻度好看
    var step = iw / n;
    var bw = clamp(step * 0.46, 4, 22);

    var grid = '', i;
    for (i = 0; i <= 2; i++) {
      var gy = PT + ih * (i / 2);
      grid += '<line class="st-grid" x1="' + PL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + gy.toFixed(1) + '"/>';
      grid += '<text class="st-tick" x="' + (PL - 6) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="end">' +
        Math.round(maxDone * (1 - i / 2)) + '</text>';
      grid += '<text class="st-tick" x="' + (W - PR + 6) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="start">' +
        Math.round(100 * (1 - i / 2)) + '%</text>';
    }

    var bars = '', dots = '', xlabels = '';
    days.forEach(function (d, k) {
      var cx = PL + step * k + step / 2;
      var h = d.done ? Math.max(2, scale(d.done, maxDone, ih)) : 0;
      var accTxt = d.done ? '正确率 ' + Math.round((d.right / d.done) * 100) + '%（对 ' + d.right + ' / ' + d.done + '）' : '这天没有练习';
      bars += '<rect class="st-bar' + (S.day === d.key ? ' sel' : '') + '" x="' + (cx - bw / 2).toFixed(1) +
        '" y="' + (PT + ih - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="1.5"' +
        ' data-day="' + d.key + '" data-tip="<b>' + esc(d.label) + '</b>　' + d.done + ' 题<br>' + esc(accTxt) + '"/>';
      if (d.done) {
        var ay = PT + ih - scale(d.right / d.done * 100, 100, ih);
        dots += '<circle class="st-dot' + (S.day === d.key ? ' sel' : '') + '" cx="' + cx.toFixed(1) + '" cy="' + ay.toFixed(1) +
          '" r="3.2" data-day="' + d.key + '" data-tip="<b>' + esc(d.label) + '</b>　' + esc(accTxt) + '"/>';
      }
      var every = n <= 14 ? 1 : (n <= 21 ? 2 : 5);
      if (k % every === 0 || k === n - 1) {
        xlabels += '<text class="st-tick" x="' + cx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(d.label) + '</text>';
      }
    });

    /* 正确率折线：连续有练习的天才连起来（断档不连，免得看起来像「一直 100%」） */
    var segs = [], cur = [];
    days.forEach(function (d, k) {
      if (d.done) {
        cur.push([PL + step * k + step / 2, PT + ih - scale(d.right / d.done * 100, 100, ih)]);
      } else if (cur.length) { segs.push(cur); cur = []; }
    });
    if (cur.length) segs.push(cur);
    var path = segs.filter(function (s) { return s.length > 1; }).map(function (s) {
      return '<polyline class="st-line" points="' + s.map(function (p) {
        return p[0].toFixed(1) + ',' + p[1].toFixed(1);
      }).join(' ') + '"/>';
    }).join('');

    return '<svg class="st-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="近期练习量与正确率">' +
      grid + path + bars + dots + xlabels + '</svg>';
  }

  /* ---------------- 图表：掌握构成环形 ---------------- */

  function donutSvg(parts) {
    var size = 168, cx = size / 2, cy = size / 2, r = 56, sw = 17;
    var C = 2 * Math.PI * r;
    var total = parts.reduce(function (a, p) { return a + p.value; }, 0) || 1;
    var acc = 0;
    var arcs = parts.map(function (p) {
      var len = C * p.value / total;
      /* 占比极小的档（比如刚起步时「已掌握 2 词 / 2714」）按比例只剩 0 像素，
         既看不见也点不到 —— 给个最小可见弧长，宁可略失真也别让图看起来是空的 */
      var draw = p.value > 0 ? Math.max(2.2, len - 1.5) : 0;
      var s = '<circle class="st-seg" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + p.color +
        '" stroke-width="' + sw + '" stroke-linecap="butt" stroke-dasharray="' +
        draw.toFixed(2) + ' ' + (C - draw).toFixed(2) + '" stroke-dashoffset="' +
        (-acc).toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"' +
        ' data-go="' + (p.go || '') + '" data-tip="<b>' + esc(p.label) + '</b>　' + p.value + ' 词 · ' +
        (p.value / total * 100).toFixed(1) + '%' + (p.go ? '<br>点击查看' : '') + '"/>';
      acc += len;
      return s;
    }).join('');
    var ratio = (parts[2] ? parts[2].value : 0) / total * 100;
    var pct = ratio > 0 && ratio < 1 ? ratio.toFixed(1) : String(Math.round(ratio));
    return '<svg class="st-svg st-donut" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="掌握构成">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--line-soft)" stroke-width="' + sw + '"/>' +
      arcs +
      '<text class="st-donut-num" x="' + cx + '" y="' + (cy + 2) + '" text-anchor="middle">' + pct + '%</text>' +
      '<text class="st-donut-cap" x="' + cx + '" y="' + (cy + 20) + '" text-anchor="middle">掌握率</text>' +
      '</svg>';
  }

  /* ---------------- 图表：近 12 周热力 ---------------- */

  function heatSvg(daily) {
    var weeks = 12, cell = 13, gap = 3;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var dow = (today.getDay() + 6) % 7;           // 周一=0
    var start = new Date(today);
    start.setDate(today.getDate() - dow - (weeks - 1) * 7);
    var W = 26 + weeks * (cell + gap), H = 16 + 7 * (cell + gap);
    var cells = '', marks = '';
    for (var w = 0; w < weeks; w++) {
      for (var d = 0; d < 7; d++) {
        var dt = new Date(start);
        dt.setDate(start.getDate() + w * 7 + d);
        if (dt > today) continue;
        var k = ymd(dt);
        var rec = daily[k] || { done: 0, right: 0 };
        var lv = rec.done === 0 ? 0 : rec.done < 5 ? 1 : rec.done < 15 ? 2 : rec.done < 30 ? 3 : 4;
        var x = 26 + w * (cell + gap), y = 16 + d * (cell + gap);
        var tip = '<b>' + k + '</b>　' + rec.done + ' 题' +
          (rec.done ? ' · 正确率 ' + Math.round(rec.right / rec.done * 100) + '%' : '');
        cells += '<rect class="st-cell lv' + lv + (S.day === k ? ' sel' : '') + '" x="' + x + '" y="' + y +
          '" width="' + cell + '" height="' + cell + '" rx="2.5" data-day="' + k + '" data-tip="' + esc(tip) + '"/>';
      }
      // 月份角标：这一列第一天所在月份，和上一列不同才写
      var firstOfWeek = new Date(start);
      firstOfWeek.setDate(start.getDate() + w * 7);
      var prev = new Date(firstOfWeek); prev.setDate(firstOfWeek.getDate() - 7);
      if (w === 0 || firstOfWeek.getMonth() !== prev.getMonth()) {
        marks += '<text class="st-tick" x="' + (26 + w * (cell + gap)) + '" y="10">' + (firstOfWeek.getMonth() + 1) + '月</text>';
      }
    }
    ['一', '', '三', '', '五', '', '日'].forEach(function (t, i) {
      if (t) marks += '<text class="st-tick" x="0" y="' + (16 + i * (cell + gap) + 10) + '">' + t + '</text>';
    });
    return '<svg class="st-svg st-heat" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="近 12 周练习热力">' +
      marks + cells + '</svg>';
  }

  /* ---------------- 图表：24 小时分布 ---------------- */

  function hourSvg(hours) {
    var W = 560, H = 88, PL = 4, PR = 4, PT = 10, PB = 16;
    var iw = W - PL - PR, ih = H - PT - PB;
    var max = 1;
    hours.forEach(function (h) { max = Math.max(max, h.n); });
    var step = iw / 24, bw = Math.max(6, step * 0.56);
    var bars = hours.map(function (h, i) {
      var hh = h.n ? Math.max(2, scale(h.n, max, ih)) : 0;
      var x = PL + step * i + step / 2;
      var tip = h.h + ':00–' + h.h + ':59　' + h.n + ' 题' + (h.n ? ' · 对 ' + h.right : '');
      return '<rect class="st-bar sm' + (S.hour === h.h ? ' sel' : '') + '" x="' + (x - bw / 2).toFixed(1) + '" y="' +
        (PT + ih - hh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="1.5"' +
        ' data-hour="' + h.h + '" data-tip="' + esc(tip) + '"/>';
    }).join('');
    var labels = '';
    [0, 6, 12, 18, 23].forEach(function (h) {
      labels += '<text class="st-tick" x="' + (PL + step * h + step / 2).toFixed(1) + '" y="' + (H - 4) +
        '" text-anchor="middle">' + h + '</text>';
    });
    return '<svg class="st-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="学习时段分布">' +
      bars + labels + '</svg>';
  }

  /* ---------------- 主渲染 ---------------- */

  function render(host) {
    var c = TW.store.counts();
    var daily = TW.store.state.daily || {};
    var sentenceStats = TW.sentences ? TW.sentences.summary() : null;

    /* --- 场次（新→旧；导入的旧数据可能乱序，按时间兜底排） --- */
    var sessAll = TW.store.sessions().slice().sort(function (a, b) { return (b.t || 0) - (a.t || 0); });

    /* --- 时间序列 --- */
    var days = lastDays(S.range).map(function (d) {
      var rec = daily[d.key] || { done: 0, right: 0 };
      return { key: d.key, label: d.label, done: rec.done || 0, right: rec.right || 0 };
    });

    /* --- 指标 --- */
    var allKeys = Object.keys(daily);
    var totalDone = 0, activeDays = 0;
    allKeys.forEach(function (k) {
      if (daily[k] && daily[k].done > 0) { totalDone += daily[k].done; activeDays++; }
    });
    var periodDone = 0, periodRight = 0;
    days.forEach(function (d) { periodDone += d.done; periodRight += d.right; });
    var periodAcc = periodDone ? Math.round(periodRight / periodDone * 100) : 0;

    var streak = 0;
    for (var i = 0; i < 400; i++) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var k = ymd(d);
      if (daily[k] && daily[k].done > 0) streak++;
      else if (i > 0) break;
      else break;
    }
    /* 历史最长连续：按日期升序滚一遍 */
    var bestStreak = 0, run = 0, prevDt = null;
    allKeys.filter(function (x) { return daily[x] && daily[x].done > 0; }).sort().forEach(function (x) {
      var dt = new Date(x + 'T00:00:00');
      run = (prevDt && Math.round((dt - prevDt) / 86400000) === 1) ? run + 1 : 1;
      bestStreak = Math.max(bestStreak, run);
      prevDt = dt;
    });

    var avgPerSession = sessAll.length
      ? Math.round(sessAll.reduce(function (a, s) { return a + (s.total || 0); }, 0) / sessAll.length) : 0;
    var srsStats = TW.store.srs.stats();
    var dueCount = TW.store.srs.dueCount();
    var masterRate = c.total ? Math.round(c.master / c.total * 100) : 0;
    var touchedRate = c.total ? Math.round(c.touched / c.total * 100) : 0;

    /* --- 按 S 过滤场次 --- */
    var sessList = sessAll.filter(function (s) {
      var dt = new Date(s.t || 0);
      if (S.day && ymd(dt) !== S.day) return false;
      if (S.mode && s.mode !== S.mode) return false;
      if (S.hour >= 0 && dt.getHours() !== S.hour) return false;
      return true;
    });

    /* --- 模式 / 时段聚合（用全量，不受过滤影响，否则点一下图就全空了） --- */
    var modeAgg = {};
    var hourAgg = [];
    for (var h = 0; h < 24; h++) hourAgg.push({ h: h, n: 0, right: 0 });
    sessAll.forEach(function (s) {
      var m = s.mode || 'type';
      var o = modeAgg[m] = modeAgg[m] || { mode: m, n: 0, total: 0 };
      o.n++;
      o.total += s.total || 0;
      var hh = new Date(s.t || 0).getHours();
      if (hourAgg[hh]) { hourAgg[hh].n += s.total || 0; hourAgg[hh].right += s.right || 0; }
    });
    var modeRows = Object.keys(modeAgg).map(function (m) { return modeAgg[m]; })
      .sort(function (a, b) { return b.total - a.total; });
    var modeTotal = modeRows.reduce(function (a, r) { return a + r.total; }, 0) || 1;

    /* --- 复习档位 --- */
    var LV = TW.store.srs.INTERVALS.length;
    var lvCount = [];
    for (var l = 0; l <= LV; l++) lvCount.push(0);
    Object.keys(TW.store.state.srs || {}).forEach(function (w) {
      var r = TW.store.state.srs[w];
      var b = clamp(Number(r.b) || 0, 0, LV);
      lvCount[b]++;
    });
    var lvTotal = lvCount.reduce(function (a, b) { return a + b; }, 0) || 1;

    /* --- 分书进度 --- */
    var srcList = TW.data.books.map(function (b) {
      return { id: b.id, name: b.name, count: b.count };
    }).concat(TW.data.decks.map(function (d) {
      return { id: d.id, name: d.name, count: d.count };
    })).map(function (b) {
      var s = TW.store.srcStats(b.id);
      return { id: b.id, name: b.name, count: b.count, master: s.master, touched: s.touched,
        pct: TW.pct(s.master, b.count) };
    });
    if (S.sortBooks === 'count') srcList.sort(function (a, b) { return b.count - a.count; });
    else if (S.sortBooks === 'name') srcList.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); });
    else srcList.sort(function (a, b) { return b.pct - a.pct || b.count - a.count; });

    /* --- 错词 Top --- */
    var wrongs = TW.data.progressItems('wrong').map(function (w) {
      return { w: w, p: TW.store.get(w.id) || {} };
    }).sort(function (a, b) { return b.p.w - a.p.w || b.p.ts - a.p.ts; }).slice(0, 12);
    var wrongMax = wrongs.reduce(function (a, x) { return Math.max(a, x.p.w || 0); }, 1);

    /* ---------------- 拼接 ---------------- */

    var filters = [];
    if (S.day) filters.push({ k: 'day', label: '只看 ' + shortLabel(S.day) });
    if (S.mode) filters.push({ k: 'mode', label: '模式：' + (MODE_NAMES[S.mode] || S.mode) });
    if (S.hour >= 0) filters.push({ k: 'hour', label: S.hour + ' 点这一小时' });

    var kpis = [
      { n: totalDone, label: '累计做题', cls: '', go: '' },
      { n: activeDays, label: '学习天数', cls: '', go: '' },
      { n: c.touched, label: '练过的词', cls: 'accent', go: '#/review?tab=learned' },
      { n: c.master, label: '已掌握', cls: 'ok', go: '#/review?tab=master' },
      { n: c.wrong, label: '待攻克错词', cls: 'err', go: '#/review?tab=wrong' },
      { n: dueCount, label: '今日待复习', cls: 'accent', go: '#/srs' },
      { n: streak, label: '连续天数 · 最长 ' + bestStreak, cls: 'accent', go: '' },
      { n: periodAcc + '%', label: '近 ' + S.range + ' 天正确率', cls: periodAcc >= 80 ? 'ok' : periodAcc >= 60 ? '' : 'err', go: '' }
    ];

    function relTime(t) {
      var dd = new Date(t), now = new Date();
      var hm = function (x) { return x.getHours() + ':' + (x.getMinutes() < 10 ? '0' : '') + x.getMinutes(); };
      var same = function (a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
      if (same(dd, now)) return '今天 ' + hm(dd);
      var yd = new Date(now); yd.setDate(now.getDate() - 1);
      if (same(dd, yd)) return '昨天 ' + hm(dd);
      return (dd.getMonth() + 1) + '/' + dd.getDate() + ' ' + hm(dd);
    }
    function sdChip(x) {
      var mark = '<span class="sd-mark">' + (x.ok ? '✓' : '✗') + '</span>';
      var cls = 'sd-chip ' + (x.ok ? 'ok' : 'err');
      if (String(x.id || '').indexOf('x:') === 0) {
        return '<span class="' + cls + '">' + esc(x.word) + mark + '</span>';
      }
      return '<a class="' + cls + '" href="#/word?id=' + encodeURIComponent(x.id) + '">' + esc(x.word) + mark + '</a>';
    }
    function detailHtml(s, si) {
      if (!s.detail || !s.detail.length) {
        return '<div class="sess-detail" id="sd-' + si + '" hidden>' +
          '<div class="small muted">这一场没有记录明细（升级前的旧场次，只有总正确率）。</div></div>';
      }
      var w = s.detail.filter(function (x) { return !x.ok; });
      var r = s.detail.filter(function (x) { return x.ok; });
      return '<div class="sess-detail" id="sd-' + si + '" hidden>' +
        '<div class="sd-head">' +
          '<span class="small muted">错 <b class="sd-n-err">' + w.length + '</b> · 对 <b class="sd-n-ok">' +
            r.length + '</b> · 点单词可进详解</span>' +
          (w.length ? '<a class="sd-more" href="#/review?tab=wrong">去生词本</a>' : '') +
        '</div>' +
        '<div class="sd-grid">' + w.map(sdChip).join('') + r.map(sdChip).join('') + '</div>' +
      '</div>';
    }
    function sessRow(s, si) {
      var cls = s.acc >= 80 ? 'ok' : s.acc >= 60 ? '' : 'err';
      var srcName = SRC_NAMES[s.src] || '';
      var has = !!(s.detail && s.detail.length);
      return '<div class="sess-row sess-click" data-si="' + si + '" role="button" tabindex="0" ' +
          'aria-expanded="false" title="' + (has ? '点开看这一场的答题明细' : '这一场没有明细') + '">' +
        '<div class="sess-meta">' +
          '<span class="sess-mode">' + esc(MODE_NAMES[s.mode] || s.mode || '练习') +
            (has ? '<span class="sess-chev">' + TW.icon('arrowRight', 12) + '</span>' : '') + '</span>' +
          '<span class="small muted">' + (srcName ? esc(srcName) + ' · ' : '') + relTime(s.t) + ' · ' + s.total + ' 题</span>' +
        '</div>' +
        '<div class="sess-bar">' +
          '<div class="progress-line ' + cls + '"><i style="width:' + Math.max(2, s.acc) + '%"></i></div>' +
          '<span class="sess-acc ' + cls + '">' + s.acc + '%</span>' +
        '</div></div>' + detailHtml(s, si);
    }

    var shownSess = S.sessOpen ? sessList : sessList.slice(0, SESS_SHOW);
    var sessHtml = sessList.length
      ? '<div class="sess-list" id="st-sess">' + shownSess.map(sessRow).join('') + '</div>' +
        (sessList.length > shownSess.length
          ? '<button class="btn sm ghost" id="st-sess-more" style="margin-top:.6rem">查看更早的场次（还有 ' +
            (sessList.length - shownSess.length) + ' 条）</button>'
          : S.sessOpen && sessList.length > SESS_SHOW
            ? '<button class="btn sm ghost" id="st-sess-more" data-close="1" style="margin-top:.6rem">收起</button>'
            : '')
      : TW.ui.empty(filters.length ? '这个筛选条件下没有场次' : '完成一轮练习或复习后，这里会记录每场的正确率', '📈');

    host.innerHTML = '<div class="wrap">' +
      TW.ui.pageHead('学习统计', '数据保存在本机浏览器，换设备不会同步') +
      (sentenceStats ? '<div class="sentence-overview-link"><div><h3>句子练习</h3><p>已练 ' + sentenceStats.learned +
        ' / ' + sentenceStats.total + ' 组 · 今日完成 ' + sentenceStats.doneToday + ' 组 · 独立答对 ' +
        sentenceStats.rightToday + ' 组 · 到期复习 ' + sentenceStats.due + ' 组（仅本机记录）</p></div>' +
        '<a class="btn" href="#/sentences">查看句子课程 ' + TW.icon('arrowRight', 15) + '</a></div>' : '') +

      /* ---- 指标卡 ---- */
      '<div class="st-kpi">' + kpis.map(function (x) {
        return '<div class="stat-card stat-link' + (x.go ? ' has-go' : '') + '"' + (x.go ? ' data-go="' + x.go + '" role="link" tabindex="0"' : '') + '>' +
          '<div class="stat-num ' + x.cls + '">' + x.n + '</div>' +
          '<div class="stat-label">' + esc(x.label) + '</div>' +
          (x.go ? '<span class="st-kpi-go">' + TW.icon('arrowRight', 12) + '</span>' : '') +
        '</div>';
      }).join('') + '</div>' +

      '<div class="st-two">' +
        /* ---- 掌握构成 ---- */
        '<div class="card card-pad st-card">' +
          '<div class="st-head"><div class="card-title">掌握构成</div>' +
            '<span class="small muted">共 ' + c.total + ' 词 · 练过 ' + touchedRate + '%</span></div>' +
          '<div class="st-donut-wrap">' +
            donutSvg([
              { k: 'new', label: '还没碰过', value: Math.max(0, c.total - c.touched), color: 'rgba(33,26,25,.10)', go: '#/books' },
              { k: 'learn', label: '练过未掌握', value: Math.max(0, c.touched - c.master), color: 'var(--warn)', go: '#/review?tab=learned' },
              { k: 'master', label: '已掌握', value: c.master, color: 'var(--ok)', go: '#/review?tab=master' }
            ]) +
            '<div class="st-legend">' +
              '<div class="st-legend-row"><i class="dot" style="background:var(--ok)"></i>已掌握 <b>' + c.master + '</b></div>' +
              '<div class="st-legend-row"><i class="dot" style="background:var(--warn)"></i>练过未掌握 <b>' + Math.max(0, c.touched - c.master) + '</b></div>' +
              '<div class="st-legend-row"><i class="dot" style="background:rgba(33,26,25,.12)"></i>还没碰过 <b>' + Math.max(0, c.total - c.touched) + '</b></div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* ---- 复习档位 ---- */
        '<div class="card card-pad st-card">' +
          '<div class="st-head"><div class="card-title">复习档位分布</div>' +
            '<a class="small muted" href="#/srs">去复习 ' + TW.icon('arrowRight', 12) + '</a></div>' +
          '<div class="st-lv">' + lvCount.map(function (n, i) {
            var label = i === 0 ? '0 档 新错' : i === LV ? '满档' : i + ' 档';
            return '<div class="st-lv-row" data-tip="<b>' + esc(label) + '</b>　' + n + ' 词，占队列 ' +
                Math.round(n / lvTotal * 100) + '%">' +
              '<span class="st-lv-l">' + esc(label) + '</span>' +
              '<span class="st-lv-bar"><i style="width:' + (n ? Math.max(2, n / lvTotal * 100) : 0) + '%"></i></span>' +
              '<span class="st-lv-n">' + n + '</span></div>';
          }).join('') + '</div>' +
          '<div class="small muted" style="margin-top:.5rem">队列 ' + srsStats.total + ' 词 · 到期 ' + srsStats.due +
            ' · 满档 ' + srsStats.mastered + '</div>' +
        '</div>' +
      '</div>' +

      /* ---- 趋势 ---- */
      '<div class="card card-pad st-card">' +
        '<div class="st-head">' +
          '<div class="card-title">练习趋势</div>' +
          '<div class="st-segbtns">' +
            [7, 14, 30].map(function (n) {
              return '<button class="st-segb' + (S.range === n ? ' active' : '') + '" data-range="' + n + '">近 ' + n + ' 天</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="st-legend" style="margin-bottom:.2rem">' +
          '<span><i class="dot" style="background:var(--accent)"></i>题目数（左轴）</span>' +
          '<span><i class="dot" style="background:var(--warn);border-radius:50%"></i>正确率（右轴）</span>' +
          '<span class="small muted">点某天的柱子 = 只看那天</span>' +
        '</div>' +
        trendSvg(days) +
      '</div>' +

      /* ---- 热力 ---- */
      '<div class="card card-pad st-card">' +
        '<div class="st-head"><div class="card-title">近 12 周打卡</div>' +
          '<span class="small muted">颜色越深题越多 · 点格子只看那天</span></div>' +
        '<div class="st-heat-wrap">' + heatSvg(daily) + '</div>' +
      '</div>' +

      '<div class="st-two">' +
        /* ---- 模式分布 ---- */
        '<div class="card card-pad st-card">' +
          '<div class="st-head"><div class="card-title">练习方式分布</div>' +
            '<span class="small muted">点一行只看这种模式</span></div>' +
          (modeRows.length ? '<div class="st-rows">' + modeRows.map(function (r) {
            return '<div class="st-row' + (S.mode === r.mode ? ' sel' : '') + '" data-mode="' + r.mode + '"' +
                ' data-tip="<b>' + esc(MODE_NAMES[r.mode] || r.mode) + '</b>　' + r.n + ' 场 · ' + r.total + ' 题，占 ' +
                Math.round(r.total / modeTotal * 100) + '%<br>点击只看这种模式">' +
              '<span class="st-row-l">' + esc(MODE_NAMES[r.mode] || r.mode) + '</span>' +
              '<span class="st-row-bar"><i style="width:' + Math.max(2, r.total / modeTotal * 100) + '%"></i></span>' +
              '<span class="st-row-n">' + r.total + ' 题 · ' + Math.round(r.total / modeTotal * 100) + '%</span></div>';
          }).join('') + '</div>' : '<div class="small muted">还没有场次记录</div>') +
        '</div>' +

        /* ---- 时段分布 ---- */
        '<div class="card card-pad st-card">' +
          '<div class="st-head"><div class="card-title">学习时段</div>' +
            '<span class="small muted">点一根柱子只看那个小时</span></div>' +
          hourSvg(hourAgg) +
          '<div class="small muted" style="margin-top:.3rem">按每场开始时间统计，共 ' + sessAll.length + ' 场</div>' +
        '</div>' +
      '</div>' +

      /* ---- 场次 ---- */
      '<div class="card card-pad st-card">' +
        '<div class="st-head">' +
          '<div class="card-title">近期场次正确率</div>' +
          '<span class="small muted">' + (filters.length ? '筛选后 ' + sessList.length + ' / ' + sessAll.length + ' 场'
            : sessAll.length ? '共 ' + sessAll.length + ' 轮 · 点任意一场看答题明细' : '') + '</span>' +
        '</div>' +
        (filters.length ? '<div class="st-chips">' + filters.map(function (f) {
          return '<button class="st-chip" data-clear="' + f.k + '">' + esc(f.label) + ' ✕</button>';
        }).join('') + (filters.length > 1 ? '<button class="st-chip ghost" data-clear="all">全部清除</button>' : '') + '</div>' : '') +
        sessHtml +
      '</div>' +

      /* ---- 分书 ---- */
      '<div class="card card-pad st-card">' +
        '<div class="st-head"><div class="card-title">分书掌握进度</div>' +
          '<div class="st-segbtns">' +
            [['master', '按掌握率'], ['count', '按词数'], ['name', '按名称']].map(function (x) {
              return '<button class="st-segb' + (S.sortBooks === x[0] ? ' active' : '') + '" data-sort="' + x[0] + '">' + x[1] + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
        (S.booksOpen ? srcList : srcList.slice(0, BOOKS_SHOW)).map(function (b) {
          return '<a class="st-book" href="#/books?book=' + encodeURIComponent(b.id) + '">' +
            '<div class="row" style="justify-content:space-between;margin-bottom:.3rem">' +
              '<span style="font-weight:600">' + esc(b.name) + '</span>' +
              '<span class="small muted">掌握 ' + b.master + ' / ' + b.count + ' · 已练 ' + b.touched + ' · ' + b.pct + '%</span>' +
            '</div>' +
            '<div class="progress-line ok"><i style="width:' + b.pct + '%"></i></div>' +
          '</a>';
        }).join('') +
        (srcList.length > BOOKS_SHOW
          ? '<button class="btn sm ghost" id="st-books-more" style="margin-top:.2rem">' +
            (S.booksOpen ? '收起（只看前 ' + BOOKS_SHOW + ' 本）' : '展开全部 ' + srcList.length + ' 本') + '</button>'
          : '') +
      '</div>' +

      /* ---- 错词 ---- */
      '<div class="card card-pad st-card">' +
        '<div class="st-head"><div class="card-title">错得最多的词</div>' +
          '<button class="btn sm ghost" id="st-review">查看生词本 ' + TW.icon('arrowRight', 14) + '</button></div>' +
        (wrongs.length ? '<div class="wordlist" id="st-wrong">' + wrongs.map(function (it) {
          return '<div class="wl-row" data-say="' + esc(it.w.word) + '"><div class="wl-main">' +
            '<div class="wl-word">' + esc(it.w.word) + '<span class="tag err">错 ' + it.p.w + ' 次</span></div>' +
            '<div class="wl-trans">' + esc(TW.data.brief(it.w)) + '</div>' +
            '<div class="st-wbar"><i style="width:' + Math.max(4, (it.p.w || 0) / wrongMax * 100) + '%"></i></div>' +
            '</div>' +
            '<a class="st-wgo" href="#/word?id=' + encodeURIComponent(it.w.id) + '" title="看详解">' + TW.icon('arrowRight', 13) + '</a>' +
            '</div>';
        }).join('') + '</div>' : TW.ui.empty('暂无错词，保持住！', '✅')) +
      '</div>' +

      '<div class="st-tip" id="st-tip"></div>' +
    '</div>';

    bind(host, { days: days, sessList: sessList, sessAll: sessAll, srcList: srcList });
  }

  /* ---------------- 交互 ---------------- */

  function bind(host, ctx) {
    var tip = TW.$('#st-tip', host);
    function move(e) {
      if (!tip) return;
      var r = tip.getBoundingClientRect();
      var x = e.clientX + 13, y = e.clientY + 13;
      if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 13;
      if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 13;
      tip.style.left = Math.max(4, x) + 'px';
      tip.style.top = Math.max(4, y) + 'px';
    }
    /* 只有带 data-tip 的元素才有浮层；SVG 里是 rect/circle/text */
    TW.$$('[data-tip]', host).forEach(function (el) {
      el.addEventListener('mouseenter', function (e) {
        if (!tip) return;
        tip.innerHTML = el.getAttribute('data-tip') || '';
        tip.classList.add('show');
        move(e);
      });
      el.addEventListener('mousemove', move);
      el.addEventListener('mouseleave', function () { if (tip) tip.classList.remove('show'); });
    });

    /* 点柱子 / 点格子 → 选中那天（再点一次取消） */
    function pickDay(key) {
      S.day = (S.day === key) ? '' : key;
      render(host);
    }
    TW.$$('[data-day]', host).forEach(function (el) {
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', '查看 ' + el.dataset.day + ' 的练习记录');
      el.addEventListener('click', function () { pickDay(el.dataset.day); });
      el.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pickDay(el.dataset.day); } });
    });
    TW.$$('[data-hour]', host).forEach(function (el) {
      el.addEventListener('click', function () {
        var h = Number(el.dataset.hour);
        S.hour = (S.hour === h) ? -1 : h;
        render(host);
      });
    });
    TW.$$('[data-mode]', host).forEach(function (el) {
      el.addEventListener('click', function () {
        var m = el.dataset.mode;
        S.mode = (S.mode === m) ? '' : m;
        render(host);
      });
    });
    TW.$$('[data-range]', host).forEach(function (el) {
      el.addEventListener('click', function () {
        S.range = Number(el.dataset.range);
        render(host);
      });
    });
    TW.$$('[data-sort]', host).forEach(function (el) {
      el.addEventListener('click', function () {
        S.sortBooks = el.dataset.sort;
        render(host);
      });
    });
    TW.$$('[data-clear]', host).forEach(function (el) {
      el.addEventListener('click', function () {
        var k = el.dataset.clear;
        if (k === 'all' || k === 'day') S.day = '';
        if (k === 'all' || k === 'mode') S.mode = '';
        if (k === 'all' || k === 'hour') S.hour = -1;
        render(host);
      });
    });
    TW.$$('[data-go]', host).forEach(function (el) {
      var go = function () { if (el.dataset.go) TW.app.go(el.dataset.go.replace(/^#/, '')); };
      el.addEventListener('click', go);
      if (el.getAttribute('role') === 'link') {
        el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      }
    });

    var lw = TW.$('#st-wrong', host);
    if (lw) lw.addEventListener('click', function (e) {
      if (e.target.closest('.st-wgo')) return;          // 「详解」是链接，交给它自己跳
      var row = e.target.closest('.wl-row');
      if (!row) return;
      var say = row.dataset.say || '';
      if (say) TW.speech.speak(say, TW.store.settings.accent);
    });
    var rv = TW.$('#st-review', host);
    if (rv) rv.addEventListener('click', function () { TW.app.go('/review?tab=wrong'); });

    var sessBox = TW.$('#st-sess', host);
    if (sessBox) {
      function toggle(row) {
        var panel = TW.$('#sd-' + row.dataset.si, host);
        if (!panel) return;
        var open = panel.hasAttribute('hidden');
        if (open) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
        row.classList.toggle('open', open);
        row.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      sessBox.addEventListener('click', function (e) {
        var row = e.target.closest('.sess-row');
        if (row && sessBox.contains(row)) toggle(row);
      });
      sessBox.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var row = e.target.closest('.sess-row');
        if (!row) return;
        e.preventDefault();
        toggle(row);
      });
    }
    var bm = TW.$('#st-books-more', host);
    if (bm) bm.addEventListener('click', function () {
      S.booksOpen = !S.booksOpen;
      render(host);
    });
    var more = TW.$('#st-sess-more', host);
    if (more) more.addEventListener('click', function () {
      S.sessOpen = !more.dataset.close;
      render(host);
    });
  }

  TW.views.stats = { render: render };
})();
