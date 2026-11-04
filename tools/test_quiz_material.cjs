const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const data=new Map(),localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
const window={TW:{},localStorage};vm.runInNewContext(fs.readFileSync('assets/js/quiz.js','utf8'),{window,Date,Math});
const quiz=window.TW.quiz, saved=quiz.publish({body:['Reading passage'],exercises:[{question:'What happened?',type:'choice',options:['One','Two'],answer:'One'}]});
assert.equal(quiz.get(saved.id).body[0],'Reading passage');
console.log('PASS published AI quiz retains reading material');
