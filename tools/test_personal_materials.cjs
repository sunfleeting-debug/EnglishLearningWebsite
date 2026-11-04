const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const window = { TW: {}, addEventListener() {} };
vm.runInNewContext(fs.readFileSync('assets/js/personal-materials.js','utf8'), {window, console, Promise, Set, URL});
const api = window.TW.personalMaterials;
function file(name) { return { kind:'file', name, getFile: async () => ({name}) }; }
function dir(name, entries) { return { kind:'directory', name, async *values() { yield* entries; } }; }
(async()=>{
 const tree=dir('星火六级',[
   dir('2024年六级真题',[file('试卷一.pdf'),file('答案解析.pdf'),file('听力.mp3')]),
   dir('写作与翻译',[file('写作练习.pdf'),file('翻译.docx')]),
   dir('赠送',[dir('四级资料',[file('四级模拟卷.pdf')]),dir('四六级资料',[file('2024年六级试题.pdf')])]),
   file('unrelated.jpg')
 ]);
 const result=await api.scanDirectory(tree);
 assert.equal(result.files.length,7);
 const by=name=>result.files.find(x=>x.name===name);
 assert(by('听力.mp3').categories.includes('listening'));
 assert(by('试卷一.pdf').categories.includes('quiz'));
 assert(by('试卷一.pdf').categories.includes('writing'));
 assert(by('试卷一.pdf').categories.includes('listening'));
 assert(by('写作练习.pdf').categories.includes('writing'));
 assert(by('翻译.docx').categories.includes('writing'));
 assert.equal(by('听力.mp3').path,'2024年六级真题/听力.mp3');
 assert.equal(by('四级模拟卷.pdf').level,'cet4');
 assert.equal(by('2024年六级试题.pdf').level,'cet6');
 assert.equal(result.errors,0);
 console.log('PASS local material scan preserves paths and categorizes papers, writing and audio');
})().catch(e=>{console.error(e);process.exitCode=1});
