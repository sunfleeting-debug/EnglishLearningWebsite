/* 学习资料：真题阅读（网页版，主入口）+ 原始 PDF / 词汇音频 */
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.views = TW.views || {};

  var PDFS = [
    { name: 'DRJ172 阅读参考译文', file: 'resources/DRJ172-阅读参考译文扫一扫.pdf', desc: '六级阅读真题参考译文，扫码版', size: '约 23 MB' },
    { name: 'DRJ172 阅读海量练习', file: 'resources/DRJ172-阅读海量练习扫一扫.pdf', desc: '配套阅读练习册，扫码版', size: '约 34 MB' },
    { name: 'DRJ172 阅读题源文章', file: 'resources/DRJ172-阅读题源文章扫一扫.pdf', desc: '阅读题源文章汇编，扫码版', size: '约 9 MB' }
  ];

  function render(host) {
    var audioBooks = TW.data.books.filter(function (b) { return b.audio; });

    // 网页版阅读入口（把扫描件渲染成页面图，可直接阅读并按题作答，无需下载）
    var R = TW.READING;
    var hero = R ? (
      '<a class="card res-hero" href="#/reading">' +
        '<div class="rh-ico">' + TW.icon('file', 26) + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div class="rh-title">真题阅读 · 网页版</div>' +
          '<div class="small muted">' +
            TW.esc(R.practice.desc) + '；另含参考译文与题源文章。' +
            '点开即可阅读、作答、判分，<b>无需下载</b>。' +
          '</div>' +
        '</div>' +
        '<span class="btn primary sm">进入做题 ' + TW.icon('arrowRight', 15) + '</span>' +
      '</a>'
    ) : '';

    var pdfHtml = PDFS.map(function (p) {
      return '<div class="card res-card">' +
        '<div class="res-ico">PDF</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:600">' + TW.esc(p.name) + '</div>' +
          '<div class="small muted">' + TW.esc(p.desc) + ' · ' + p.size + '</div>' +
        '</div>' +
        '<a class="btn sm" href="' + p.file + '" target="_blank" rel="noopener">' + TW.icon('download', 15) + ' 原始 PDF</a>' +
      '</div>';
    }).join('');

    var audioHtml = audioBooks.map(function (b) {
      var lrc = b.lrc;
      return '<div class="wl-row">' +
        '<div class="wl-main"><div class="wl-word" style="font-size:14px">' + TW.esc(b.name) + '.mp3</div>' +
        '<div class="wl-trans">' + b.count + ' 个单词 · 点击进入跟读页</div></div>' +
        '<div class="wl-side">' +
          '<a class="btn sm ghost" href="' + lrc + '" download>字幕</a>' +
          '<button class="btn sm" data-audio="' + b.id + '">跟读</button>' +
        '</div>' +
      '</div>';
    }).join('');

    host.innerHTML =
      '<div class="wrap-narrow">' +
        TW.ui.pageHead('学习资料', '真题阅读已做成网页版，可直接阅读与作答') +

        hero +

        '<div class="card-title" style="margin:1.4rem 0 .6rem">原始扫描 PDF（备份留档）</div>' +
        '<div class="grid" style="margin-bottom:1.4rem">' + pdfHtml + '</div>' +

        '<div class="card-title" style="margin:0 0 .6rem">词汇音频（含字幕）</div>' +
        '<div class="card"><div class="wordlist">' + audioHtml + '</div></div>' +

        '<div class="card card-pad" style="margin-top:1.4rem">' +
          '<div class="card-title">关于资料来源</div>' +
          '<div class="small muted" style="margin-top:.4rem;line-height:1.8">' +
            '阅读材料来自「星火英语《简·六级阅读》」（DRJ172）三份扫描件，' +
            '已逐页渲染为网页可用的图片，因此阅读体验与纸质原书一致；' +
            '原版 PDF 仍保留在上方供留档。<br>' +
            '单词与时间轴来自「六级词汇周计划音频」目录下的 9 个 .lrc 字幕文件，' +
            '共 2714 个词条；中文释义与音标通过在线词典抓取后离线打包，' +
            '因此断网也能正常背单词（发音除外，发音依赖浏览器语音合成或在线音频）。<br>' +
            '交互风格参考开源项目 ' +
            '<a href="https://github.com/zyronon/TypeWords" target="_blank" rel="noopener">TypeWords</a>。' +
          '</div>' +
        '</div>' +
      '</div>';

    TW.$$('[data-audio]', host).forEach(function (b) {
      b.addEventListener('click', function () { TW.app.go('/audio?book=' + b.dataset.audio); });
    });
  }

  TW.views.resources = { render: render };
})();
