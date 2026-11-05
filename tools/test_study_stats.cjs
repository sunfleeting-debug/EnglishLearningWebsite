const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const records = {
  'typingcet.quiz.v1': {results: {q1: {right: 3, total: 5}, l1: {right: 8, total: 10}}},
  'typingcet.listen.v1': {results: {l2: {right: 2, total: 5}}},
  'typingcet.write.v1': {results: {t1: {score: 12, max: 15}, e1: {score: 9, max: 15}, e2: {score: null, max: 15}}}
};
const window = {TW: {quiz: {all: () => [{id: 'q1', type: 'reading'}, {id: 'l1', type: 'listening'}]}}};
window.TW_WRITING = {items: [{id: 't1', type: 'trans'}, {id: 'e1', type: 'essay'}, {id: 'e2', type: 'essay'}]};
const localStorage = {getItem: key => JSON.stringify(records[key] || {})};
vm.runInNewContext(fs.readFileSync('assets/js/study-stats.js', 'utf8'), {window, localStorage, Number});
const s = window.TW.studyStats.summary();
assert.equal(s.quiz.count, 1); assert.equal(s.quiz.average, 60);
assert.equal(s.listening.count, 2); assert.equal(s.listening.average, 60);
assert.deepEqual(Array.from(s.listening.bins), [1, 0, 1]);
assert.equal(s.trans.average, 80); assert.equal(s.essay.count, 1); assert.equal(s.essay.average, 60);
console.log('PASS independent subject statistics, combined listening and unscored writing');
