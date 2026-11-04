const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('assets/js/sentences.js', 'utf8');
const storage = { getItem: () => null, setItem: () => {} };
let reply = '{"correct":true,"feedback":"表达自然"}';
const window = {TW_SENTENCE_COURSES: [], TW: {ai: {chat: async () => ({text: reply}), parseJson: JSON.parse}}};
vm.runInNewContext(source, {window, localStorage: storage, Date, console});
(async () => {
  const api = window.TW.sentences;
  const result = await api.judgeTranslation('I enjoy reading.', {en:'I like reading.',zh:'我喜欢阅读。'});
  assert.equal(result.correct, true);
  reply = '{"correct":"yes"}';
  await assert.rejects(api.judgeTranslation('wrong', {en:'I like reading.',zh:'我喜欢阅读。'}), /判定/);
  console.log('PASS semantic translation judgement validates model output');
})().catch(e => { console.error(e); process.exitCode = 1; });
