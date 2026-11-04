(function () {
  'use strict';
  var TW = window.TW = window.TW || {};
  TW.newWordChat = function (word, context) {
    var messages = [], busy = false;
    return {
      messages: function () { return messages.slice(); },
      ask: function (question) {
        question = String(question || '').trim();
        if (!question || busy) return Promise.reject(new Error('请输入问题，或等待上一条回答完成'));
        busy = true;
        var input = {role:'user',content:question};
        return TW.ai.chat({system:'你是英语词汇教练。围绕单词 '+word+' 解答用户追问，结合词典资料：'+context+'。用中文准确简洁回答，举英文例句；如果不确定应说明。',messages:messages.concat([input]).slice(-16),maxTokens:900,temperature:0.5}).then(function (response) {
          messages.push(input, {role:'assistant',content:response.text});
          return response.text;
        }).finally(function () { busy = false; });
      }
    };
  };
})();
