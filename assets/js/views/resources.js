/* 阅读资料：六级阅读 PDF 与配套音频/字幕 */
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

    var pdfHtml = PDFS.map(function (p) {
      return '<div class="card res-card">' +
        '<div class="res-ico">PDF</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:600">' + TW.esc(p.name) + '</div>' +
          '<div class="small muted">' + TW.esc(p.desc) + ' · ' + p.size + '</div>' +
        '</div>' +
        '<a class="btn sm" href="' + p.file + '" target="_blank" rel="noopener">' + TW.icon('download', 15) + ' 打开</a>' +
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
        TW.ui.pageHead('阅读资料', '这里收录了你整理的全部学习资料') +

        '<div class="card-title" style="margin:0 0 .6rem">六级阅读 PDF</div>' +
        '<div class="grid" style="margin-bottom:1.4rem">' + pdfHtml + '</div>' +

        '<div class="card-title" style="margin:0 0 .6rem">词汇音频（含字幕）</div>' +
        '<div class="card"><div class="wordlist">' + audioHtml + '</div></div>' +

        '<div class="card card-pad" style="margin-top:1.4rem">' +
          '<div class="card-title">关于词库来源</div>' +
          '<div class="small muted" style="margin-top:.4rem;line-height:1.8">' +
            '单词与时间轴来自「六级词汇周计划音频」目录下的 9 个 .lrc 字幕文件，' +
            '共 2714 个词条；中文释义与音标通过在线词典抓取后离线打包，' +
            '因此断网也能正常背单词（发音除外，发音依赖浏览器语音合成）。<br>' +
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
