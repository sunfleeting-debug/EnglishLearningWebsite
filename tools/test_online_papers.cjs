const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const window = { TW: {}, addEventListener() {} };
vm.runInNewContext(fs.readFileSync('data/personal-papers.js', 'utf8'), {window});
vm.runInNewContext(fs.readFileSync('data/personal-notes.js', 'utf8'), {window});
vm.runInNewContext(fs.readFileSync('assets/js/personal-materials.js', 'utf8'), {window, console, Promise, Set, URL});
const api = window.TW.personalMaterials;
const sets = api.validateQuizBundle(window.TW_PERSONAL_PAPERS);
assert(sets.length > 0);
assert(api.writingItems().length > 0);
for (const set of sets.filter(s => s.type === 'listening')) {
  assert.equal(set.audioOnline, true);
  assert.match(set.audio, /^audio\/personal-papers\/[a-z0-9-]+\.mp3$/);
  assert(fs.statSync(set.audio).size > 0);
}
assert.equal(new Set(api.quizSets().map(s => s.id)).size, sets.length);
const withNotes = api.quizSets().find(s => s.id === 'personal-cet6-202012-1-reading-1');
assert(withNotes.translation.includes('卢浮宫'));
assert(withNotes.questions[0].explain.includes('卢浮宫'));
assert.equal(withNotes.translationSource, 'reference');
const original = window.TW_PERSONAL_PAPERS.sets.find(s => s.id === withNotes.id).questions[0];
const savedAnswer = original.answer;
original.answer = savedAnswer === 'A' ? 'B' : 'A';
assert.equal(api.quizSets().find(s => s.id === withNotes.id).questions[0].explain, original.explain);
original.answer = savedAnswer;
console.log('PASS online papers, unique identifiers, writing and all audio paths');
