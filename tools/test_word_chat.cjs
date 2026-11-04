const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const calls=[]; const window={TW:{ai:{chat: async p => {calls.push(p);return {text:'answer '+calls.length};}}}};
vm.runInNewContext(fs.readFileSync('assets/js/word-chat.js','utf8'),{window});
(async()=>{const chat=window.TW.newWordChat('apple','苹果'); await chat.ask('用法？'); await chat.ask('有什么搭配？'); assert.equal(calls[1].messages.length,3); assert(calls[1].system.includes('apple')); assert.equal(chat.messages().length,4); const fresh=window.TW.newWordChat('apple','苹果'); assert.equal(fresh.messages().length,0); console.log('PASS ephemeral word chat supports follow-up and resets');})().catch(e=>{console.error(e);process.exitCode=1});
