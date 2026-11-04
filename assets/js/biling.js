/* 逐句对照（英文原句 + 紧随其下的中文）
   ------------------------------------------------------------------
   sunfleeting 2026-11-05：「题目文章的翻译，我希望一句一句地放在英文原句下面，方便对比查看」。

   数据里只存了「整段中文译文」（以及少量整段英文原文），没有现成的句对。
   这里做一个确定性的对齐器：
     · 断句：英文按句末标点（缩写白名单挡掉 Mr./e.g./U.S.），中文按 。！？；…
     · 对齐：动态规划（Gale-Church 思路），在 1:1 / 1:2 / 2:1 / 1:0 / 0:1 五种切法里
       找「累计字符长度比最稳定」的那条路径。允许 1:2 / 2:1 是关键 —— 英文一个长句常被
       译成两句中文，按比例硬分会让后面每一句都错位一格（实测 mt1-p3 就是这样），
       必须让对齐器自己决定在哪一句上「多吞一句中文」。
     · 兜底：真的对不上（长度比离谱）时，宁可一句留空也不硬塞。
   之所以不用模型来对齐：这一步必须离线、即时、可复现。
*/
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};

  /* 英文断句：句末标点 + 空白 + 大写/引号开头。
     缩写（Mr. / e.g. / U.S.）用白名单挡掉，避免把一句话切碎。 */
  var ABBR = /(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr|vs|etc|e\.g|i\.e|U\.S|U\.K|No|Fig|approx)\.$/i;

  function splitEn(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return [];
    var parts = [], buf = '';
    var re = /[.!?]["'”’)]?\s+/g, m;
    while ((m = re.exec(s))) {
      var cut = m.index + m[0].length;
      buf = s.slice(0, cut);
      if (ABBR.test(buf) || /\b[A-Z]\.$/.test(buf)) continue;   // 缩写别断
      parts.push(buf.trim());
      s = s.slice(cut);
      re.lastIndex = 0;
    }
    if (s.trim()) parts.push(s.trim());
    return parts;
  }

  /** 中文断句：按 。！？；… 切，保留标点 */
  function splitZh(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return [];
    var out = [], buf = '';
    for (var i = 0; i < s.length; i++) {
      buf += s[i];
      if ('。！？；…!?;'.indexOf(s[i]) >= 0) {
        var nxt = s[i + 1];
        if (s[i] === '.' && nxt && /\d/.test(nxt)) continue;   // 小数别断
        if (!nxt || '。！？；…!?;"”’）)」』'.indexOf(nxt) >= 0) continue;
        out.push(buf.trim());
        buf = '';
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out.filter(Boolean);
  }

  function flat(list) {
    var out = [];
    list.forEach(function (x) { out = out.concat(x); });
    return out;
  }

  /**
   * 句对对齐（动态规划）。
   * 目标：把 n 句英文和 m 句中文切成若干组，每组 1:1 / 1:2 / 2:1 / 1:0 / 0:1，
   * 使每组「中文长度 / 英文长度」都贴近全局比例 r（= 中文总字 / 英文总字母）。
   * 代价用对数比 |ln(z / (r·e))|：比值翻倍和减半罚得一样重，天然对称。
   * 「一句没配到」的组单独给高一点的固定代价，逼对齐器优先找 1:2 / 2:1 而不是留空。
   * @returns {{en:number[], zh:number[]}[]} 每组的句子下标
   */
  function align(enList, zhList) {
    var n = enList.length, m = zhList.length;
    var enLen = enList.map(function (s) { return Math.max(4, s.length); });
    var zhLen = zhList.map(function (s) { return Math.max(2, s.length); });
    var enPre = [0], zhPre = [0], i, j;
    for (i = 0; i < n; i++) enPre.push(enPre[i] + enLen[i]);
    for (j = 0; j < m; j++) zhPre.push(zhPre[j] + zhLen[j]);
    var r = zhPre[m] / enPre[n];

    var INF = 1e9;
    var dp = [], back = [];
    for (i = 0; i <= n; i++) {
      var rowDp = [], rowBk = [];
      for (j = 0; j <= m; j++) { rowDp.push(INF); rowBk.push(null); }
      dp.push(rowDp); back.push(rowBk);
    }
    dp[0][0] = 0;

    var MOVES = [[1, 1], [1, 2], [2, 1], [1, 0], [0, 1]];
    function stepCost(i, j, di, dj) {
      if (i + di > n || j + dj > m) return -1;
      if (dj === 0) return 3.0 + di * 0.25;          // 英文多出来（这句没有译文）
      if (di === 0) return 3.0 + dj * 0.25;          // 中文多出来（这句没有原文）
      var e = enPre[i + di] - enPre[i];
      var z = zhPre[j + dj] - zhPre[j];
      return Math.abs(Math.log(z / (r * e))) + (di + dj - 2) * 0.15;
    }

    for (i = 0; i <= n; i++) {
      for (j = 0; j <= m; j++) {
        if (dp[i][j] >= INF) continue;
        for (var k = 0; k < MOVES.length; k++) {
          var di = MOVES[k][0], dj = MOVES[k][1];
          var c = stepCost(i, j, di, dj);
          if (c < 0) continue;
          var v = dp[i][j] + c;
          if (v < dp[i + di][j + dj]) { dp[i + di][j + dj] = v; back[i + di][j + dj] = [i, j]; }
        }
      }
    }

    /* 回溯成「组」序列 */
    var out = [], ci = n, cj = m, guard = 0;
    while ((ci > 0 || cj > 0) && guard++ < n + m + 5) {
      var p = back[ci][cj];
      if (!p) { p = [Math.max(0, ci - 1), Math.max(0, cj - 1)]; }  // 保险，理论上走不到
      var g = { en: [], zh: [] };
      for (i = p[0]; i < ci; i++) g.en.push(i);
      for (j = p[1]; j < cj; j++) g.zh.push(j);
      out.unshift(g);
      ci = p[0]; cj = p[1];
    }
    return out;
  }

  /**
   * @param {string[]} paras 英文段落（cloze 的正文 / match 的段落正文 / reading 的 body）
   * @param {string}   zh    中文译文（可能带 \n 分段）
   * @returns {{level:string, rows:{en:string, zh:string, pstart?:boolean}[]}|null}
   *   level: sentence（全 1:1）/ aligned（段数相同）/ approx（段数不同，靠 DP 兜）
   */
  function pair(paras, zh) {
    var enParas = (paras || []).map(function (p) { return String(p || '').trim(); }).filter(Boolean);
    if (!enParas.length || !String(zh || '').trim()) return null;

    var enSent = enParas.map(splitEn);
    var enFlat = flat(enSent), enParaOf = [];
    enSent.forEach(function (list, pi) {
      list.forEach(function () { enParaOf.push(pi); });
    });
    if (!enFlat.length) return null;

    var zhParas = String(zh).split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var zhFlat = flat(zhParas.map(splitZh));
    if (!zhFlat.length) return null;

    var groups = align(enFlat, zhFlat);
    var rows = [], prevPara = -1, pairs11 = 0;
    groups.forEach(function (g) {
      if (!g.en.length) return;                       // 纯中文组（无原文）不单独成行
      var para = enParaOf[g.en[0]];
      var row = {
        en: g.en.map(function (i) { return enFlat[i]; }).join(' '),
        zh: g.zh.map(function (j) { return zhFlat[j]; }).join('')
      };
      if (para !== prevPara) { row.pstart = true; prevPara = para; }
      if (g.en.length === 1 && g.zh.length === 1) pairs11++;
      rows.push(row);
    });
    if (!rows.length) return null;

    var level = (pairs11 === rows.length && groups.length === enFlat.length)
      ? 'sentence'
      : (zhParas.length === enParas.length ? 'aligned' : 'approx');
    return { level: level, rows: rows };
  }

  function esc(s) { return TW.esc(s); }

  /** 渲染成「英文一行 + 中文一行」的对照块（段落第一句加 .bi-p 拉开段落间距） */
  function html(paras, zh) {
    var r = pair(paras, zh);
    if (!r) return '';
    return '<div class="bi">' + r.rows.map(function (row) {
      return '<div class="bi-row' + (row.pstart ? ' bi-p' : '') + '">' +
        '<p class="bi-en">' + esc(row.en) + '</p>' +
        (row.zh ? '<p class="bi-zh">' + esc(row.zh) + '</p>' : '') +
      '</div>';
    }).join('') + '</div>';
  }

  /** 取一套题目的「英文段落」，三种题型各自不同 */
  function parasOf(set) {
    if (!set) return [];
    if (set.type === 'match') {
      return (set.paras || []).map(function (p) { return p.text; });
    }
    return set.body || [];
  }

  TW.biling = {
    pair: pair,
    html: html,
    align: align,
    splitEn: splitEn,
    splitZh: splitZh,
    parasOf: parasOf,
    /** 给核验用：这套题能对齐到什么程度 */
    info: function (set) {
      var r = pair(parasOf(set), set && set.translation);
      return r ? { level: r.level, rows: r.rows.length } : null;
    }
  };
})();
