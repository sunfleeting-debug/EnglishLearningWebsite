/* Run: node tools/test_sentences.cjs — no browser or external dependencies. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/sentences.js'), 'utf8');
const KEY = 'typingcet.sentences.v1';
const fixture = [{ id: 'a1', title: '入门', level: 'A1', units: [{ id: 'hello', title: '问候', steps: [{ en: 'I like tea.', zh: '我喜欢茶。' }, { en: 'I would like some tea.', zh: '我想要一些茶。', alternatives: ["I'd like some tea."] }] }, { id: 'book', steps: [{ en: 'This is a book.', zh: '这是一本书。' }] }] }];
let passed = 0;
function setup(storage = new Map(), opts = {}) {
  const DateMock = class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-15T04:00:00Z'])); } static now() { return new Date('2026-10-15T04:00:00Z').getTime(); } };
  const context = { window: { TW_SENTENCE_COURSES: fixture }, localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => { if (opts.fail) throw new Error('quota'); storage.set(k, v); } }, Date: DateMock, console };
  vm.runInNewContext(source, context, { filename: 'sentences.js' });
  return { api: context.window.TW.sentences, storage };
}
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function session(overrides = {}) {
  return Object.assign({ id: 'test-session', courseId: 'a1', source: 'course', ids: ['hello', 'book'], index: 0, step: 0, mode: 'build', input: '', phase: 'typing', mistakes: {}, hints: {}, recorded: {}, correct: 0, answered: 0, startedAt: 1792036800000, stageStartedAt: 1792036800000, completed: false }, overrides);
}

test('课程拍平、默认数据隔离及布尔判题', () => {
  const { api } = setup();
  assert.equal(api.units().length, 2); assert.equal(api.unit('hello').courseId, 'a1');
  assert.equal(api.progress('hello').seen, 0); assert.equal(api.settings().size, 8);
  assert(api.compare(' i LIKE   tea! ', 'I like tea.'));
  assert(api.compare('I’d like some tea.', 'I would like some tea.', ["I'd like some tea."]));
  assert(!api.compare('Tea like I', 'I like tea.')); assert(!api.compare('I likes tea', 'I like tea.'));
  assert(api.compare("'hello'", 'Hello!')); assert(api.compare('a well-known book', 'A well known book.'));
  assert(!api.compare('', 'I like tea.')); assert(!api.compare('dont', "don't"));
});
test('错句当天入队、干净正确按七档递增、重复提交幂等', () => {
  const { api } = setup();
  api.recordResult('hello', false, { attemptId: 'first' }); api.recordResult('hello', false, { attemptId: 'first' });
  assert.equal(api.progress('hello').seen, 1); assert.equal(api.summary().due, 1); assert.equal(api.summary().wrong, 1);
  assert.equal(api.progress('hello').due, '2026-10-15');
  assert.equal(api.summary('a1').doneToday, 1);
  api.recordResult('hello', true, { attemptId: 'second' });
  assert.equal(api.progress('hello').bucket, 1); assert.equal(api.progress('hello').due, '2026-10-16');
  assert.equal(api.summary().wrong, 0); assert.equal(api.summary().due, 0);
  api.recordResult('hello', true); assert.equal(api.progress('hello').due, '2026-10-17');
  for (let i = 0; i < 6; i++) api.recordResult('hello', true);
  assert.equal(api.progress('hello').bucket, 7); assert.equal(api.summary().mastered, 1);
  assert.equal(api.progress('hello').due, '2026-12-14');
  api.recordResult('hello', true, { usedHint: true });
  assert.equal(api.progress('hello').bucket, 0); assert(api.progress('hello').needsPractice);
});
test('一次就答对的句子不自动加入复习，收藏与复习独立', () => {
  const { api } = setup();
  api.recordResult('book', true); assert.equal(api.reviewList('due').length, 0);
  assert(api.toggleFavorite('book')); assert.equal(api.reviewList('favorite').length, 1);
  api.enroll('book'); assert.equal(api.reviewList('due').length, 1);
  api.removeReview('book'); assert.equal(api.reviewList('due').length, 0); assert(api.progress('book').favorite);
});
test('未完成单元的答错或看答案立即落盘，但不增加完成与答题统计', () => {
  const { api, storage } = setup();
  api.noteDifficulty('hello'); api.noteDifficulty('hello');
  let p = api.progress('hello');
  assert(p.needsPractice && p.review); assert.equal(p.due, '2026-10-15'); assert.equal(p.bucket, 0); assert.equal(p.streak, 0);
  assert.equal(p.seen, 0); assert.equal(p.right, 0); assert.equal(p.wrong, 0);
  assert.equal(api.summary().learned, 0); assert.equal(api.summary().doneToday, 0); assert.equal(api.summary().wrong, 1); assert.equal(api.summary().due, 1);
  const reloaded = setup(storage).api;
  assert.equal(reloaded.reviewList('wrong')[0].id, 'hello'); assert.equal(reloaded.reviewList('due')[0].id, 'hello');
  reloaded.recordResult('hello', true, { attemptId: 'after-resume' }); p = reloaded.progress('hello');
  assert.equal(p.seen, 1); assert.equal(p.right, 1); assert.equal(p.due, '2026-10-16'); assert(!p.needsPractice);
});
test('JSON 课程、句对数组和 alternatives 导入', () => {
  const { api } = setup();
  let parsed = api.parseImport('[{"en":"Good morning.","zh":"早上好。","alternatives":["Morning."]}]', '问候.json');
  assert.equal(parsed.course.title, '问候'); assert.equal(parsed.course.units[0].steps[0].alternatives[0], 'Morning.');
  const id = api.importCourse(parsed.course); assert(id.startsWith('custom:'));
  assert.equal(api.units(id).length, 1); assert.equal(api.exportCourse(id).custom, true);
  parsed = api.parseImport(JSON.stringify({ title: '递进', units: [{ title: '一', steps: [{ en: 'tea', zh: '茶' }, { en: 'some tea', zh: '一些茶' }] }] }));
  assert.equal(parsed.course.units[0].steps.length, 2);
  assert.equal(api.parseImport('[["Thanks!","谢谢！"]]').course.units[0].steps[0].zh, '谢谢！');
});
test('CSV 引号、逗号、多行与中英反序 TSV', () => {
  const { api } = setup();
  const csv = 'en,zh\r\n"Hello, world!","你好，世界！"\r\n"She said ""yes"".","她说\n好的。"';
  const units = api.parseImport(csv, 'x.csv').course.units;
  assert.equal(units.length, 2); assert.equal(units[0].steps[0].en, 'Hello, world!');
  assert.equal(units[1].steps[0].en, 'She said "yes".'); assert.equal(units[1].steps[0].zh, '她说\n好的。');
  assert.equal(api.parseImport('中文\t英文\n谢谢\tThanks.', 'x.tsv').course.units[0].steps[0].en, 'Thanks.');
});
test('行分隔、交替中英与英语文章无中文警告', () => {
  const { api } = setup();
  assert.equal(api.parseImport('Good morning. | 早上好。\nThank you. | 谢谢。').course.units.length, 2);
  assert.equal(api.parseImport('Good morning.|早上好。').course.units[0].steps[0].en, 'Good morning.');
  assert.equal(api.parseImport('Good morning.\n早上好。\nThank you.\n谢谢。').course.units.length, 2);
  const parsed = api.parseImport('Dr. Smith is here. He has 3.5 cups of tea! Are you ready?');
  assert.equal(parsed.course.units.length, 3); assert.equal(parsed.course.units[0].steps[0].en, 'Dr. Smith is here.');
  assert.equal(parsed.course.units[1].steps[0].zh, ''); assert(parsed.warnings.some(x => x.includes('没有中文')));
});
test('SRT 双语 cue 配对、多行英文合并、编号和时间码不入题', () => {
  const { api } = setup();
  const srt = '1\r\n00:00:01,000 --> 00:00:04,000\r\n<i>I drink a glass</i>\r\nof water every morning.\r\n我每天早上\r\n喝一杯水。\r\n\r\n2\r\n00:00:05,000 --> 00:00:08,000\r\nThank you!\r\n谢谢！';
  const parsed = api.parseImport(srt, '日常.srt'), units = parsed.course.units;
  assert.equal(units.length, 2); assert.equal(units[0].steps[0].en, 'I drink a glass of water every morning.');
  assert.equal(units[0].steps[0].zh, '我每天早上喝一杯水。'); assert.equal(units[1].steps[0].zh, '谢谢！');
  assert(!JSON.stringify(units).includes('-->')); assert(!JSON.stringify(units).includes('<i>')); assert.equal(parsed.warnings.length, 0);
});
test('VTT 元数据注释排除、HTML实体和标签剥除、纯英文警告', () => {
  const { api } = setup();
  const vtt = 'WEBVTT\nKind: captions\nLanguage: en\n\nNOTE this is a comment\nDo not turn me into a sentence.\n\nSTYLE\n::cue { color: red; }\n\nintro\n00:01.000 --> 00:03.000 align:start\n<v Bob><b>Tom &amp; I read.</b></v><br>汤姆和我阅读。\n\n00:04.000 --> 00:06.000\n<script>alert("x")</script><c.green>We enjoy learning.</c>\n\n00:07.000 --> 00:08.000\n仅有中文，没有英文。';
  const parsed = api.parseImport(vtt, '听力.vtt'), units = parsed.course.units;
  assert.equal(units.length, 2); assert.equal(units[0].steps[0].en, 'Tom & I read.'); assert.equal(units[0].steps[0].zh, '汤姆和我阅读。');
  assert.equal(units[1].steps[0].en, 'We enjoy learning.'); assert.equal(units[1].steps[0].zh, '');
  assert(parsed.warnings.some(x => x.includes('没有中文'))); assert(parsed.warnings.some(x => x.includes('没有英文')));
  assert(!JSON.stringify(units).includes('WEBVTT')); assert(!JSON.stringify(units).includes('comment')); assert(!JSON.stringify(units).includes('alert'));
  assert.throws(() => api.parseImport('WEBVTT\n\nNOTE only metadata', 'empty.vtt'), /时间码/);
});
test('无需文件扩展名也能识别字幕，同一行双语与没有空行的 cue 正确处理', () => {
  const { api } = setup();
  const parsed = api.parseImport('1\n00:00:01,000 --> 00:00:02,000\nHello!|你好！\n2\n00:00:03,000 --> 00:00:04,000\nGood morning. 早上好。');
  assert.equal(parsed.course.units.length, 2); assert.equal(parsed.course.units[0].steps[0].en, 'Hello!');
  assert.equal(parsed.course.units[1].steps[0].en, 'Good morning.'); assert.equal(parsed.course.units[1].steps[0].zh, '早上好。');
  const mixed = api.parseImport('1\n00:00:01,000 --> 00:00:02,000\nTom and I read.\nTom 和我阅读。', 'name.srt').course.units[0].steps[0];
  assert.equal(mixed.en, 'Tom and I read.'); assert.equal(mixed.zh, 'Tom 和我阅读。');
});
test('自定义课程和会话持久化、完整备份往返与清空保留课程', () => {
  const { api, storage } = setup();
  const id = api.importCourse(api.parseImport('Hello! | 你好！').course), uid = api.units(id)[0].id;
  api.recordResult(uid, false); api.toggleFavorite(uid); api.setSetting('mode', 'recall');
  api.saveSession(session({ id: 'session', courseId: id, ids: [uid], index: 1, completed: true, answered: 1, recorded: { [uid]: false } }));
  const reloaded = setup(storage).api;
  assert.equal(reloaded.progress(uid).wrong, 1); assert.equal(reloaded.settings().mode, 'recall'); assert.equal(reloaded.getSession().index, 1);
  const backup = api.exportState(); reloaded.resetProgress(); assert.equal(reloaded.summary().learned, 0); assert.equal(reloaded.units(id).length, 1);
  reloaded.importState(backup); assert.deepEqual(plain(reloaded.exportState()), plain(backup));
  reloaded.deleteCourse(id); assert.equal(reloaded.course(id), null); assert.equal(reloaded.getSession(), null);
  assert.throws(() => reloaded.deleteCourse('a1'), /只能删除/);
});
test('真实会话结构验证与保存、恢复畸形会话均为原子操作', () => {
  const { api, storage } = setup(); api.saveSession(session()); const saved = storage.get(KEY), snapshot = api.exportState();
  const bad = [
    { ids: [] }, { ids: [''] }, { ids: [' hello'] }, { ids: ['missing'] }, { ids: ['hello', 'hello'] }, { ids: 'hello' },
    { index: -1 }, { index: 0.5 }, { index: 2 }, { index: NaN }, { step: -1 }, { step: 2 }, { mode: 'bad' }, { source: 'bad' },
    { phase: 'bad' }, { mistakes: [] }, { hints: null }, { recorded: {} , answered: 1 }, { hints: { missing: true } },
    { mistakes: { hello: 'yes' } }, { correct: 1 }, { startedAt: 'now' }, { stageStartedAt: Infinity }, { completed: 'false' },
    { input: {} }, { revealed: 'true' }, { checked: 1 }, { courseId: 'missing' }, { mode: 'recall', step: 1 },
    { roundDone: 'hello' }, { roundDone: [null] }, { roundDone: ['missing'] }, { roundDone: ['hello', 'hello'] }
  ];
  for (const malformed of bad) {
    assert.throws(() => api.saveSession(session(malformed)), /会话/);
    assert.equal(storage.get(KEY), saved);
    const brokenBackup = plain(snapshot); brokenBackup.session = session(malformed);
    assert.throws(() => api.importState(brokenBackup), /会话/);
    assert.equal(storage.get(KEY), saved);
  }
  const valid = session({ ids: ['hello'], source: 'unit', index: 1, step: 0, completed: true, answered: 1, correct: 1, recorded: { hello: true } });
  api.saveSession(valid); assert.equal(setup(storage).api.getSession().answered, 1);
  api.saveSession(session({ ids: ['book'], source: 'favorite', courseId: '', roundDone: ['hello'] }));
  assert.deepEqual(plain(setup(storage).api.getSession().roundDone), ['hello']);
  assert.throws(() => api.saveSession(session({ completed: true, index: 2 })), /计数/);
  const empty = setup().api; empty.importState({ version: 1 }); assert.equal(empty.getSession(), null);
});
test('损坏会话刷新被识别，保留原备份且不会暴露不安全会话给界面', () => {
  const original = setup().api.exportState(); original.session = session({ ids: [null], index: 'zero', recorded: null });
  const serialized = JSON.stringify(original), storage = new Map([[KEY, serialized]]), { api } = setup(storage);
  assert(api.storageError().includes('会话')); assert.equal(api.getSession(), null); assert.equal(storage.get(KEY), serialized);
  assert.throws(() => api.saveSession(session()), /读取失败/);
});
test('拒绝原型危险字段、超量内容、坏备份且验证原子化', () => {
  const { api, storage } = setup(); const before = api.exportState();
  assert.throws(() => api.parseImport('{"units":[{"en":"Hi","__proto__":{"x":1}}]}'), /不安全/);
  assert.throws(() => api.parseImport('x'.repeat(1024 * 1024 + 1)), /过大/);
  assert.throws(() => api.parseImport(JSON.stringify(Array.from({ length: 301 }, () => ({ en: 'Hello', zh: '你好' })))), /300/);
  assert.throws(() => api.importState({ progress: { hello: { seen: 1, right: 2, wrong: 0 } } }), /不一致/);
  assert.deepEqual(plain(api.exportState()), plain(before)); assert.equal(storage.has(KEY), false);
});
test('保存失败明确报错且内存和磁盘均不改变', () => {
  const storage = new Map(), opts = { fail: false }, { api } = setup(storage, opts);
  api.toggleFavorite('hello'); const saved = storage.get(KEY); opts.fail = true;
  assert.throws(() => api.recordResult('hello', false), /保存失败/);
  assert.equal(api.progress('hello').seen, 0); assert.equal(storage.get(KEY), saved);
});
test('损坏本机存储不会被静默覆盖，可以导入备份修复', () => {
  const storage = new Map([[KEY, '{broken']]), { api } = setup(storage);
  assert(api.storageError()); assert.throws(() => api.recordResult('hello', true), /读取失败/); assert.equal(storage.get(KEY), '{broken');
  api.importState({ version: 1 }); assert.equal(api.storageError(), null); assert.equal(api.summary().learned, 0);
});
test('订阅可取消、返回数据无法绕过持久化修改内部状态', () => {
  const { api } = setup(); let events = 0; const off = api.subscribe(() => events++);
  api.toggleFavorite('hello'); off(); api.toggleFavorite('hello'); assert.equal(events, 1);
  const p = api.progress('hello'); p.seen = 100; assert.equal(api.progress('hello').seen, 0);
  const c = api.course('a1'); c.units[0].steps[0].en = 'changed'; assert.equal(api.unit('hello').steps[0].en, 'I like tea.');
});
console.log('\n' + passed + ' sentence core tests passed.');
