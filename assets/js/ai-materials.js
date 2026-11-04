(function () {
  'use strict';
  var TW = window.TW = window.TW || {}, KEY = 'typingcet.ai.materials.v1';
  function text(v, limit) { return String(v || '').trim().slice(0, limit); }
  function read() { try { var a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { throw new Error('AI 练习数据读取失败，原数据已保留'); } }
  function normalize(raw) {
    if (!raw || (raw.kind !== 'writing' && raw.kind !== 'listening')) throw new Error('练习类型不正确');
    var title = text(raw.title, 120); if (!title) throw new Error('练习缺少标题');
    var id = 'ai-material-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    if (raw.kind === 'writing') {
      var prompt = text(raw.prompt, 5000); if (!prompt) throw new Error('写作题缺少题目');
      return {id:id, type:raw.type === 'trans' ? 'trans' : 'essay', title:title, sub:'AI 原创练习', minutes:30, prompt:prompt, require:text(raw.require, 1000) || '根据题目完成练习。', sample:text(raw.sample, 5000), tips:[]};
    }
    var transcript = text(raw.transcript, 10000); if (!transcript) throw new Error('听力题缺少原文');
    if (!Array.isArray(raw.questions) || !raw.questions.length || raw.questions.length > 20) throw new Error('听力题需要 1 至 20 道题');
    var questions = raw.questions.map(function (q, i) {
      var stem=text(q.stem, 1000), opts=Array.isArray(q.options) ? q.options : [], ans=text(q.answer,10).toUpperCase();
      if (!stem || opts.length !== 4 || !/^[A-D]$/.test(ans) || opts.some(function (o) { return !text(o,500); })) throw new Error('听力题必须包含题干、四个选项和 A 至 D 的答案');
      return {n:i+1,stem:stem,options:opts.map(function (o,j) { return {k:String.fromCharCode(65+j),t:text(o,500)}; }),answer:ans,explain:text(q.explain,1000)};
    });
    return {id:id,title:title,kind:'lecture',kindName:'AI 原创听力',topic:'针对练习',source:'AI 原创模拟 · 浏览器语音朗读',minutes:5,intro:'先听后答，再查看解析。',segments:[{id:'s1',label:'Listening passage',transcript:[transcript],translation:text(raw.translation,10000),questions:questions}]};
  }
  function save(raw) { var item = normalize(raw), all=read(); all.unshift({kind:raw.kind,item:item}); localStorage.setItem(KEY,JSON.stringify(all.slice(0,100))); return item; }
  function list(kind) { return read().filter(function (x) { return x && x.kind === kind && x.item; }).map(function (x) { return x.item; }); }
  TW.aiMaterials = {save:save,list:list};
})();
