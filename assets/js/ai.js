/* AI 英语助手内核：模型配置、请求转发、学习数据快照
   ------------------------------------------------------------------
   设计取舍（sunfleeting 2026-10-18 提的需求，实现时定的三条边界）：
   1) **Key 只存本机**：单独用 localStorage 键 typingcet.ai.v1，不进 store.state
      —— store 的「导出备份」会把 state 整个序列化，key 混进去就等于跟着备份文件
      到处跑；也不进同步协议，换设备要重新填（安全 > 方便）。
   2) **请求走自己的 Worker**（/api/ai/chat）：DeepSeek / 通义 / OpenAI 都不给浏览器
      CORS 预检响应，直连必被拦。Worker 只转发、不落库。自定义接口如果是本机地址
      （Ollama / LM Studio 之类），Worker 侧按 SSRF 规则拒绝，这里直接浏览器直连。
   3) **「Agent」是客户端的三段式**：读数据 → 出诊断/出题 → 判分后复盘。
      不依赖各家的 function calling（deepseek/qwen/claude 的参数格式各不相同，
      统一成工具调用会把兼容性做崩），改成「本地先用确定性代码把学习数据算好，
      再让模型只做归因和建议」——结果更稳，也不给模型编造数字的机会。
*/
(function () {
  'use strict';
  var TW = window.TW = window.TW || {};

  var K = 'typingcet.ai.v1';

  /* 提供方清单：id / 展示名 / 默认模型 / 说明。custom 的 baseUrl 由用户填。 */
  var PROVIDERS = [
    { id: 'deepseek', name: 'DeepSeek', model: 'deepseek-chat', base: 'https://api.deepseek.com/v1', hint: '便宜、中文解释到位，默认推荐' },
    { id: 'qwen', name: '通义千问', model: 'qwen-plus', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', hint: '阿里云百炼，国内直连最稳' },
    { id: 'openai', name: 'ChatGPT', model: 'gpt-4o-mini', base: 'https://api.openai.com/v1', hint: '需要能访问 api.openai.com' },
    { id: 'claude', name: 'Claude', model: 'claude-3-5-sonnet-latest', base: 'https://api.anthropic.com/v1', hint: 'Anthropic 官方接口' },
    { id: 'custom', name: '自定义', model: '', base: '', hint: '任何 OpenAI 兼容接口（含本地 Ollama / LM Studio）' }
  ];

  function provider(id) {
    for (var i = 0; i < PROVIDERS.length; i++) if (PROVIDERS[i].id === id) return PROVIDERS[i];
    return PROVIDERS[0];
  }

  function defaults() {
    return { provider: 'deepseek', keys: {}, models: {}, baseUrl: '', modelLists: {} };
  }

  var cache = null;
  function config() {
    if (cache) return cache;
    var c = defaults();
    try {
      var raw = localStorage.getItem(K);
      if (raw) {
        var d = JSON.parse(raw) || {};
        c.provider = provider(d.provider).id;
        c.keys = d.keys || {};
        c.models = d.models || {};
        c.baseUrl = String(d.baseUrl || '');
        c.modelLists = d.modelLists || {};
      }
    } catch (e) { /* 配置损坏 → 用默认值，不影响主流程 */ }
    cache = c;
    return c;
  }

  function save(patch) {
    var c = config();
    Object.keys(patch || {}).forEach(function (k) { c[k] = patch[k]; });
    try { localStorage.setItem(K, JSON.stringify(c)); } catch (e) {}
    return c;
  }

  function apiKey() { var c = config(); return String(c.keys[c.provider] || ''); }
  function modelName() {
    var c = config();
    var m = String(c.models[c.provider] || '').trim();
    return m || provider(c.provider).model || '';
  }
  function baseUrl() { return String(config().baseUrl || '').trim().replace(/\/+$/, ''); }

  /** 配好了没：自定义接口允许不带 key（本地模型通常不校验） */
  function configured() {
    var c = config();
    if (c.provider === 'custom') return !!baseUrl() && (!!apiKey() || isLocal(baseUrl()));
    return apiKey().length >= 8;
  }

  function isLocal(url) {
    return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(String(url || ''));
  }

  function setKey(v) {
    var c = config();
    var keys = Object.assign({}, c.keys);
    keys[c.provider] = String(v || '').trim();
    save({ keys: keys });
  }
  function setModel(v) {
    var c = config();
    var m = Object.assign({}, c.models);
    m[c.provider] = String(v || '').trim();
    save({ models: m });
  }
  function setProvider(id) { save({ provider: provider(id).id }); }

  /* ---------------- 模型列表（不让用户手打模型名） ----------------
     各家的 GET /models 也不给浏览器 CORS，所以同样走 Worker 转发；
     自定义 + 本机地址（Ollama / LM Studio）由浏览器直连。
     列表按 provider 缓存到配置里，换 Key 后旧缓存自动失效（比对后 6 位）。 */

  var NO_CHAT = /embed|whisper|tts|dall|audio|moderation|rerank|image|vision-ocr|bge|text-embedding/i;

  function sortModels(ids) {
    var uniq = [], seen = {};
    (ids || []).forEach(function (x) {
      var id = String(x || '').trim();
      if (!id || seen[id]) return;
      seen[id] = 1;
      uniq.push(id);
    });
    uniq.sort(function (a, b) {
      var d = (NO_CHAT.test(a) ? 1 : 0) - (NO_CHAT.test(b) ? 1 : 0);
      return d || a.localeCompare(b);
    });
    return uniq;
  }

  /** 缓存里的列表（换 Key / 换 provider 后自动为空） */
  function cachedModels() {
    var c = config();
    var rec = (c.modelLists || {})[c.provider];
    if (!rec || !Array.isArray(rec.list) || !rec.list.length) return [];
    if (String(rec.key || '') !== apiKey().slice(-6)) return [];
    return rec.list.slice();
  }

  function saveModels(list) {
    var c = config();
    var ml = Object.assign({}, c.modelLists || {});
    ml[c.provider] = { key: apiKey().slice(-6), at: Date.now(), list: list };
    save({ modelLists: ml });
  }

  function directModels(pack) {
    return fetch(baseOf(pack) + '/models', {
      headers: pack.apiKey ? { 'Authorization': 'Bearer ' + pack.apiKey } : {}
    }).then(function (res) {
      return res.text().then(function (t) {
        var d = null;
        try { d = t ? JSON.parse(t) : null; } catch (e) {}
        if (!res.ok) {
          var e2 = new Error('获取模型失败：' + ((d && d.error && (d.error.message || d.error)) || ('HTTP ' + res.status)));
          e2.status = res.status;
          throw e2;
        }
        var arr = (d && (d.data || d.models)) || [];
        var ids = arr.map(function (m) { return typeof m === 'string' ? m : (m && (m.id || m.name)); });
        var list = sortModels(ids);
        if (!list.length) throw new Error('这个接口没返回模型列表');
        return list;
      });
    }, function () {
      var e3 = new Error('连不上该接口（检查地址，以及是否允许跨域）');
      e3.network = true;
      throw e3;
    });
  }

  /**
   * 拉取当前 provider + Key 可用的模型。
   * @param {boolean} force 忽略缓存
   * @returns {Promise<string[]>}
   */
  function listModels(force) {
    var c = config();
    if (!force) {
      var hit = cachedModels();
      if (hit.length) return Promise.resolve(hit);
    }
    var key = apiKey();
    if (c.provider !== 'custom' && key.length < 8) {
      return Promise.reject(new Error('先填 API Key 才能拉模型列表'));
    }
    if (c.provider === 'custom' && !baseUrl()) {
      return Promise.reject(new Error('先填接口地址（例如 https://xxx/v1）'));
    }
    var pack = { provider: c.provider, apiKey: key, baseUrl: c.provider === 'custom' ? baseUrl() : '' };

    if (c.provider === 'custom' && isLocal(pack.baseUrl)) {
      return directModels(pack).then(function (list) { saveModels(list); return list; });
    }
    if (!TW.api || !TW.api.configured || !TW.api.configured()) {
      return Promise.reject(new Error('后端地址未配置，拉不到模型列表'));
    }
    return TW.api.request('POST', '/api/ai/models', pack, { timeout: 30000 }).then(function (r) {
      var list = sortModels(r && r.models);
      if (!list.length) throw new Error('没有拿到可用模型');
      saveModels(list);
      return list;
    });
  }

  /* ---------------- 请求 ----------------

     🔴 自定义接口走哪条通道：**先浏览器直连，CORS 不通再退回 Worker 转发**。
     免费/中转网关大多挂在 Cloudflare 后面，并按「来源 IP」限流——Worker 的出口 IP 是
     成千上万个 Worker 共用的，特别容易吃到 1015（You are being rate limited）；
     换成用户自己家宽的 IP 往往就没事。直连还顺带省一次转发。
     通道结果按 baseUrl 记在内存里（transportMemo），别每条消息都去试探一遍。 */

  var transportMemo = {};   // baseUrl -> 'direct' | 'worker'

  /** 这条错误值不值得换通道再试一次？
      网络/CORS 被拦 → 值得；上游 1015/1020/429（按 IP 限流）→ 也值得，换个出口 IP 可能就通了；
      401/403（Key 无效）、404（路径不对）、400（参数错）→ 换通道没用，直接抛给用户看。 */
  function retryOther(e) {
    if (!e) return false;
    if (e.network) return true;
    if (e.status === 429) return true;
    return /1015|1020|1010|rate limit|too many requests/i.test(String(e.message || ''));
  }

  function baseOf(pack) { return String(pack.baseUrl || '').replace(/\/+$/, ''); }

  function directFetch(pack) {
    var url = baseOf(pack) + '/chat/completions';
    var headers = { 'Content-Type': 'application/json' };
    if (pack.apiKey) headers['Authorization'] = 'Bearer ' + pack.apiKey;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 90000) : null;
    return fetch(url, {
      method: 'POST',
      headers: headers,
      signal: ctrl ? ctrl.signal : undefined,
      body: JSON.stringify({
        model: pack.model,
        messages: (pack.system ? [{ role: 'system', content: pack.system }] : []).concat(pack.messages),
        temperature: pack.temperature,
        max_tokens: pack.maxTokens,
        stream: false
      })
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.text().then(function (t) {
        var d = null;
        try { d = t ? JSON.parse(t) : null; } catch (e) {}
        if (!res.ok) {
          var msg = (d && d.error && (d.error.message || d.error)) || t || ('HTTP ' + res.status);
          var e = new Error(String(msg).slice(0, 300));
          e.status = res.status;
          throw e;
        }
        var ch = d && d.choices && d.choices[0];
        var out = ch && ch.message ? ch.message.content : '';
        if (!out) throw new Error('模型没有返回内容');
        return { text: String(out).trim(), model: d.model || pack.model };
      });
    }, function (err) {
      if (timer) clearTimeout(timer);
      /* 真正的网络差/CORS 拦截才标 network —— 上层据此决定换 Worker 再试一次 */
      var e = new Error('连不上该接口（' + ((err && err.message) || 'network') + '）——检查地址、是否允许跨域');
      e.network = true;
      throw e;
    });
  }

  /**
   * 发一次对话请求。
   * @param {{system?:string, messages:Array, maxTokens?:number, temperature?:number}} opts
   * @returns {Promise<{text:string, model?:string}>}
   */
  function chat(opts) {
    opts = opts || {};
    var c = config();
    var pack = {
      provider: c.provider,
      apiKey: apiKey(),
      model: modelName(),
      baseUrl: c.provider === 'custom' ? baseUrl() : '',
      system: opts.system || '',
      messages: opts.messages || [],
      maxTokens: opts.maxTokens || 1600,
      temperature: opts.temperature == null ? 0.7 : opts.temperature
    };
    if (!configured()) {
      var e = new Error('还没配置 AI 模型：请在下方填入 API Key');
      e.needSetup = true;
      return Promise.reject(e);
    }
    if (!pack.model) return Promise.reject(new Error('还没填模型名'));

    /* 自定义接口：先直连（用自己的出口 IP），换成 Worker 再试一次的条件见 retryOther() */
    function viaWorker() {
      if (!TW.api || !TW.api.configured || !TW.api.configured()) {
        return Promise.reject(new Error('后端地址未配置，AI 转发不可用（可在「账号」页填写后端地址）'));
      }
      return TW.api.request('POST', '/api/ai/chat', pack, { timeout: 95000 }).then(function (r) {
        if (!r || !r.text) throw new Error('模型没有返回内容');
        return { text: r.text, model: r.model, usage: r.usage };
      }, function (err) {
        if (err && err.status === 404) {
          throw new Error('后端还是旧版本（没有 /api/ai/chat），请等部署更新后再试');
        }
        throw err;
      });
    }

    var custom = c.provider === 'custom';
    var burl = baseOf(pack);
    if (!custom || !burl) return viaWorker();
    if (transportMemo[burl] === 'worker') return viaWorker();
    return directFetch(pack).then(function (r) {
      transportMemo[burl] = 'direct';
      return r;
    }, function (e) {
      if (!retryOther(e) || !/^https:/i.test(burl)) throw e;   // http 的本地接口 Worker 进不去，别白跑
      transportMemo[burl] = 'worker';
      return viaWorker();
    });
  }

  /* ---------------- 流式对话（聊天界面用） ----------------
     Worker 把上游 SSE 原样转发，这里只认两种增量：
       · OpenAI 兼容：{"choices":[{"delta":{"content":"..."}}]}
       · Anthropic ：{"type":"content_block_delta","delta":{"text":"..."}}
     任何一家的报错事件都当异常抛出，不要静默变成「空回答」。 */

  function deltaOf(obj) {
    if (!obj || typeof obj !== 'object') return '';
    if (obj.type === 'error') throw new Error((obj.error && obj.error.message) || '模型返回错误');
    if (obj.error) throw new Error(obj.error.message || String(obj.error));
    if (obj.choices && obj.choices[0]) {
      var d = obj.choices[0].delta || {};
      if (typeof d.content === 'string') return d.content;
      if (Array.isArray(d.content)) {
        return d.content.map(function (p) { return (p && p.text) || ''; }).join('');
      }
      return '';
    }
    if (obj.type === 'content_block_delta' && obj.delta) return obj.delta.text || '';
    return '';
  }

  function consumeSse(res, onDelta) {
    function handleLine(line) {
      var s = String(line).replace(/\r$/, '');
      if (s.indexOf('data:') !== 0) return '';
      var payload = s.slice(5).trim();
      if (!payload || payload === '[DONE]') return '';
      var obj;
      try { obj = JSON.parse(payload); } catch (e) { return ''; }
      var t = deltaOf(obj);
      if (t) onDelta(t);
      return t;
    }
    if (!res.body || typeof res.body.getReader !== 'function') {
      /* 老浏览器/Safari 旧版没有 ReadableStream：退化成「等全文」，观感差但能用 */
      return res.text().then(function (txt) {
        var full = '';
        String(txt).split('\n').forEach(function (line) { full += handleLine(line); });
        return { text: full };
      });
    }
    var reader = res.body.getReader();
    var dec = new TextDecoder('utf-8');
    var buf = '', full = '';
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) {
          if (buf) { /* 最后一行没有换行符时补处理 */ }
          return { text: full };
        }
        buf += dec.decode(r.value, { stream: true });
        var idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          var line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          full += handleLine(line);
        }
        return pump();
      });
    }
    return pump();
  }

  /**
   * 流式对话。onDelta(textSoFar) 每收到一段就回调一次。
   * @param {{system?:string, messages:Array, maxTokens?:number, temperature?:number, signal?:AbortSignal}} opts
   * @returns {Promise<{text:string}>}
   */
  function streamChat(opts, onDelta) {
    opts = opts || {};
    var c = config();
    if (!configured()) {
      var e0 = new Error('还没配置 AI 模型：请先填入 API Key');
      e0.needSetup = true;
      return Promise.reject(e0);
    }
    var pack = {
      provider: c.provider,
      apiKey: apiKey(),
      model: modelName(),
      baseUrl: c.provider === 'custom' ? baseUrl() : '',
      system: opts.system || '',
      messages: opts.messages || [],
      maxTokens: opts.maxTokens || 1600,
      temperature: opts.temperature == null ? 0.7 : opts.temperature,
      stream: true
    };
    if (!pack.model) return Promise.reject(new Error('还没填模型名'));

    var bodyDirect = {
      model: pack.model,
      messages: (pack.system ? [{ role: 'system', content: pack.system }] : []).concat(pack.messages),
      temperature: pack.temperature, max_tokens: pack.maxTokens, stream: true
    };

    function viaWorker() {
      if (!TW.api || !TW.api.configured || !TW.api.configured()) {
        return Promise.reject(new Error('后端地址未配置，AI 转发不可用（可在「账号」页填写后端地址）'));
      }
      var headers = { 'Content-Type': 'application/json' };
      if (TW.api.token && TW.api.token()) headers['Authorization'] = 'Bearer ' + TW.api.token();
      return streamOnce(TW.api.base() + '/api/ai/chat', headers, pack, opts, onDelta);
    }

    var custom = c.provider === 'custom';
    var burl = baseOf(pack);
    if (!custom || !burl || transportMemo[burl] === 'worker') return viaWorker();

    var dHeaders = { 'Content-Type': 'application/json' };
    if (pack.apiKey) dHeaders['Authorization'] = 'Bearer ' + pack.apiKey;
    return streamOnce(burl + '/chat/completions', dHeaders, bodyDirect, opts, onDelta).then(function (r) {
      transportMemo[burl] = 'direct';
      return r;
    }, function (e) {
      /* 已经吐了一半内容就别重来了（会把同一段话显示两遍）；http 的本地接口 Worker 也进不去 */
      if (e && e.partial) throw e;
      if (!retryOther(e) || !/^https:/i.test(burl)) throw e;
      transportMemo[burl] = 'worker';
      return viaWorker();
    });
  }

  /** 一次流式请求。网络层失败标 err.network，已吐过字标 err.partial —— 上层据此决定要不要换通道 */
  function streamOnce(url, headers, body, opts, onDelta) {
    var acc = '';
    return fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: opts.signal
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          var d = null;
          try { d = t ? JSON.parse(t) : null; } catch (e) {}
          var msg = (d && d.error && (d.error.message || d.error)) || d && d.error || t || ('HTTP ' + res.status);
          var err = new Error(String(typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 300));
          err.status = res.status;
          throw err;
        });
      }
      return consumeSse(res, function (t) {
        acc += t;
        if (onDelta) onDelta(acc);
      });
    }, function (err) {
      if (err && err.name === 'AbortError') {
        var e = new Error('已停止');
        e.aborted = true;
        throw e;
      }
      var e2 = new Error(err && err.message && err.message !== 'Failed to fetch'
        ? err.message : '网络不可用（或浏览器拦截了跨域请求）');
      e2.network = true;
      throw e2;
    }).then(function (r) {
      if (r && !r.text) throw new Error('模型没有返回内容');
      return { text: (r && r.text) || acc };
    }, function (e) {
      if (e && !e.aborted && acc) e.partial = true;
      throw e;
    });
  }

  /* ---------------- 输出解析 ---------------- */

  /** 从模型输出里抠 JSON：容忍 ```json 围栏、前后寒暄、单引号式错误由调用方兜底 */
  function parseJson(text) {
    var t = String(text || '').trim();
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    var i = t.indexOf('{');
    var j = t.lastIndexOf('}');
    if (i >= 0 && j > i) t = t.slice(i, j + 1);
    try { return JSON.parse(t); } catch (e) {
      /* 有些模型会把中文引号/尾逗号带进来，做一次温和修复再试 */
      var fixed = t.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(fixed);
    }
  }

  /** 极简 Markdown → HTML（先转义再放行少数格式，杜绝模型输出注入） */
  function md(text) {
    var lines = String(text == null ? '' : text).split(/\r?\n/);
    var out = [];
    var list = '';   // '' | 'ul' | 'ol'
    function closeList() {
      if (list) { out.push('</' + list + '>'); list = ''; }
    }
    function inline(s) {
      return TW.esc(s)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    }
    lines.forEach(function (ln) {
      var ul = /^\s*[-*•]\s+(.*)$/.exec(ln);
      if (ul) {
        if (list !== 'ul') { closeList(); out.push('<ul class="ai-ul">'); list = 'ul'; }
        out.push('<li>' + inline(ul[1]) + '</li>');
        return;
      }
      var ol = /^\s*(\d{1,2})[.、)]\s+(.*)$/.exec(ln);
      if (ol) {
        if (list !== 'ol') { closeList(); out.push('<ol class="ai-ol">'); list = 'ol'; }
        out.push('<li>' + inline(ol[2]) + '</li>');
        return;
      }
      closeList();
      if (!ln.trim()) { out.push('<div class="ai-gap"></div>'); return; }
      var h = /^\s*#{1,4}\s+(.*)$/.exec(ln);
      if (h) { out.push('<div class="ai-h">' + inline(h[1]) + '</div>'); return; }
      out.push('<p>' + inline(ln) + '</p>');
    });
    closeList();
    return out.join('');
  }

  /* ---------------- 学习数据快照（「Agent 的眼睛」） ---------------- */

  function bookName(src) {
    if (!src) return '未标注';
    if (TW.data && TW.data.getBook) {
      var b = TW.data.getBook(src);
      if (b && b.name) return b.name;
    }
    return src;
  }

  function relDay(t) {
    var d = new Date(t), now = new Date();
    var day = 86400000;
    var a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var n = Math.round((b - a) / day);
    if (n <= 0) return '今天';

    if (n === 1) return '昨天';
    return n + ' 天前';
  }

  /* ---------------- 写作 / 做题 / 听力 记录（2026-11-05 加） ----------------
     sunfleeting：「这个 AI 助手能获取该账号私人信息以外的所有信息」。
     原来快照只统计「背单词」那一侧，问「评价我刚写的那篇翻译」时模型只能回「看不到你的草稿」。
     这几个键都不在 store.state 里（故意不进云同步），所以要直接读 localStorage。
     只读学习产物，不碰账号、邮箱、token、AI Key —— 那些是私人信息。 */
  function readKey(k) {
    try {
      var raw = window.localStorage.getItem(k);
      return raw ? (JSON.parse(raw) || {}) : {};
    } catch (e) { return {}; }
  }

  function clip(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function worksSnapshot() {
    var out = { writing: [], drafts: [], quiz: [], listen: [] };

    /* ① 写作：已批改的 + 只写了草稿没批改的，各取最近几条 */
    var wr = readKey('typingcet.write.v1');
    var items = (window.TW_WRITING && window.TW_WRITING.items) || [];
    var byId = {};
    items.forEach(function (it) { byId[it.id] = it; });
    var results = wr.results || {}, drafts = wr.drafts || {};

    Object.keys(results).map(function (id) { return { id: id, r: results[id] }; })
      .filter(function (x) { return x.r && x.r.text; })
      .sort(function (a, b) { return (b.r.ts || 0) - (a.r.ts || 0); })
      .slice(0, 4).forEach(function (x) {
        var it = byId[x.id] || {}, d = x.r.data || {};
        out.writing.push({
          title: it.title || x.id,
          type: it.type === 'trans' ? '翻译' : '作文',
          when: relDay(x.r.ts || Date.now()),
          score: x.r.score,
          max: x.r.max || 15,
          words: (String(x.r.text).match(/[A-Za-z][A-Za-z'’-]*/g) || []).length,
          text: clip(x.r.text, 300),
          comment: clip(d.comment, 160),
          issues: (d.issues || []).slice(0, 3).map(function (k) {
            return clip(k.quote, 60) + ' → ' + clip(k.fix, 60);
          })
        });
      });

    Object.keys(drafts).filter(function (id) {
      return drafts[id] && String(drafts[id]).trim() && !(results[id] && results[id].text === drafts[id]);
    }).map(function (id) {
      var it = byId[id] || {};
      return { id: id, it: it, txt: String(drafts[id]).trim() };
    }).sort(function (a, b) { return b.txt.length - a.txt.length; })
      .slice(0, 3).forEach(function (x) {
        out.drafts.push({
          title: x.it.title || x.id,
          type: x.it.type === 'trans' ? '翻译' : '作文',
          words: (x.txt.match(/[A-Za-z][A-Za-z'’-]*/g) || []).length,
          text: clip(x.txt, 400)
        });
      });

    /* ② 题目板块：最近做过的几套，带对错 */
    var qz = readKey('typingcet.quiz.v1');
    var all = (window.TW.quiz && TW.quiz.bank) ? TW.quiz.bank() : [];
    var qmap = {};
    all.forEach(function (s) { qmap[s.id] = s; });
    var qr = qz.results || {};
    Object.keys(qr).map(function (id) { return { id: id, r: qr[id] }; })
      .filter(function (x) { return x.r && x.r.total; })
      .sort(function (a, b) { return (b.r.ts || 0) - (a.r.ts || 0); })
      .slice(0, 5).forEach(function (x) {
        var s = qmap[x.id] || {};
        out.quiz.push({
          title: (s.test ? s.test + ' ' : '') + (s.title || x.id),
          when: relDay(x.r.ts || Date.now()),
          right: x.r.right, total: x.r.total
        });
      });

    /* ③ 听力：同上（数据来自 data/listening.js + 本地记录） */
    var ls = readKey('typingcet.listen.v1');
    var lres = ls.results || {};
    var lmap = {};
    ((window.TW_LISTENING && window.TW_LISTENING.sets) || []).forEach(function (s) { lmap[s.id] = s; });
    Object.keys(lres).map(function (id) { return { id: id, r: lres[id] }; })
      .filter(function (x) { return x.r && x.r.total; })
      .sort(function (a, b) { return (b.r.ts || 0) - (a.r.ts || 0); })
      .slice(0, 4).forEach(function (x) {
        var s = lmap[x.id] || {};
        out.listen.push({
          title: s.title || x.id,
          when: relDay(x.r.ts || Date.now()),
          right: x.r.right, total: x.r.total
        });
      });

    return out;
  }

  /* ---------------- 题目板块：题库索引 + 按需注入原文 ----------------
     sunfleeting 2026-11-05：「AI 说看不到我的 Model Test 1，为什么不可以生成题目」。
     根因不是模型笨，而是 prompt 里从头到尾没给它题库内容 —— 它只拿到了做题**记录**。
     所以这里补两样：
       · quizIndex()：一张紧凑索引（id | 分组 | 题型 | 题数 | 标题），常驻 system；
       · quizContext(text)：这一轮用户提到哪套，就把那套的原文+题目+答案整段贴进去。
     两步都纯本地、同步、无网络，命中不了就什么都不加（不污染 prompt）。 */

  var QTYPE_CN = { cloze: '完形填空', match: '段落匹配', reading: '仔细阅读' };

  function quizBank() {
    return (window.TW.quiz && TW.quiz.bank) ? TW.quiz.bank() : [];
  }

  /** 索引：一行一套，够模型判断「有哪些题、怎么点名」 */
  function quizIndex() {
    var list = quizBank();
    if (!list.length) return [];
    return list.map(function (s) {
      return (s.id || '-') + ' | ' + (s.test || '-') + ' | '
        + (QTYPE_CN[s.type] || s.type || '-') + ' | '
        + ((s.questions || []).length) + '题 | ' + (s.title || '');
    });
  }

  /** 「Model Test 1」「MT2」「模拟题第9组」「真题（卷二）」「第 51 题」这些写法都要认 */
  function normText(s) {
    return String(s || '').toLowerCase()
      .replace(/[（）()【】\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  var CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

  /** 从文本里猜「第几组 / Model Test 几」 */
  function groupNo(t) {
    var m;
    if ((m = /(?:model\s*test|mt)\s*([0-9]{1,2})/.exec(t))) return parseInt(m[1], 10);
    if ((m = /第\s*([0-9]{1,2}|[一二三四五六七八九十])\s*(?:组|套|份)/.exec(t))) {
      return m[1].length === 1 && CN_NUM[m[1]] ? CN_NUM[m[1]] : parseInt(m[1], 10);
    }
    return 0;
  }

  /** 挑出用户这一句指向的题套；挑不出来返回 null */
  function pickSets(text) {
    var list = quizBank();
    if (!list.length) return null;
    var t = normText(text);
    if (!t) return null;

    /* ① 直接写了 id：最准，命中就只要这几套 */
    var byId = list.filter(function (s) {
      return s.id && t.indexOf(normText(s.id)) >= 0;
    });
    if (byId.length) return { sets: byId, how: '点名了套号' };

    var pool = list, tagged = false;

    /* ② 分组号：Model Test 1 / MT2 / 第9组 */
    var no = groupNo(t);
    if (no) {
      var gp = list.filter(function (s) {
        var g = normText(s.test);
        if (!g) return false;
        var gm = /(?:model\s*test|mt)\s*([0-9]{1,2})/.exec(g);
        if (gm) return parseInt(gm[1], 10) === no;
        var gn = /第\s*([0-9]{1,2})\s*组/.exec(g);
        if (gn) return parseInt(gn[1], 10) === no;
        return false;
      });
      if (gp.length) { pool = gp; tagged = true; }
    }
    /* ③ 分组名整段出现（「2024年12月真题（卷二）」） */
    if (!tagged) {
      var groups = [];
      list.forEach(function (s) {
        if (s.test && groups.indexOf(s.test) < 0) groups.push(s.test);
      });
      for (var i = 0; i < groups.length; i++) {
        if (t.indexOf(normText(groups[i])) >= 0) {
          pool = list.filter(function (s) { return s.test === groups[i]; });
          tagged = true;
          break;
        }
      }
    }
    /* ④ 「真题」「模拟题」这种大类 */
    if (!tagged && /真题/.test(t)) {
      var zt = list.filter(function (s) { return /真题/.test(String(s.test || '')); });
      if (zt.length) { pool = zt; tagged = true; }
    }

    /* ⑤ 题型收窄：提到「完形/匹配/阅读」就只留这一类 */
    var types = [];
    if (/完形|cloze|选词填空|填空/.test(t)) types.push('cloze');
    if (/匹配|match|段落/.test(t)) types.push('match');
    if (/仔细阅读|阅读理解|reading|阅读/.test(t)) types.push('reading');
    if (types.length && tagged) {
      var sub = pool.filter(function (s) { return types.indexOf(s.type) >= 0; });
      if (sub.length === 1) return { sets: sub, how: '分组 + 题型' };
      if (sub.length > 1) {
        /* 「第一篇阅读」这种序号：在筛出来的几套里按顺序取 */
        var om = /第\s*([一二三四五六1-9])\s*(?:篇|套|份)/.exec(t);
        if (om) {
          var n2 = CN_NUM[om[1]] || parseInt(om[1], 10);
          if (n2 >= 1 && n2 <= sub.length) {
            return { sets: [sub[n2 - 1]], how: '分组 + 题型 + 序号' };
          }
        }
        return { sets: sub, how: '分组 + 题型' };
      }
    }
    if (tagged) return { sets: pool, how: '分组' };

    /* ⑥ 只提题型、同时明显在说题库（避免「我阅读不好」这种闲聊也塞七套原文）。
       这类命中往往有 5~8 套，全贴会撑爆上下文 —— 只给候选清单，让模型问是「哪一套」。 */
    if (types.length && /(这套|那套|这组|那组|这道|那道|第\s*[0-9]+\s*题|题目板块|题库|做错)/.test(t)) {
      var only = list.filter(function (s) { return types.indexOf(s.type) >= 0; });
      if (only.length) return { sets: only, how: '只说了题型', compact: true };
    }

    /* ⑦ 标题/话题里的关键词（「美在观者眼中」「城区十五分钟」） */
    var kw = list.filter(function (s) {
      var ti = normText(s.title);
      return ti.length >= 2 && t.indexOf(ti) >= 0;
    });
    if (kw.length) return { sets: kw, how: '标题' };
    return null;
  }

  /** 把一套题渲染成给模型看的纯文本（含答案与解析 —— 讲解必须要，但要提醒它别提前报答案） */
  function setBlock(s) {
    var L = ['—— ' + s.id + '《' + (s.title || '') + '》　' + (s.test || '') + ' · '
      + (QTYPE_CN[s.type] || s.type || '') + ' ' + ((s.questions || []).length) + '题'
      + (s.topic ? '（' + s.topic + '）' : '')];
    if (s.type === 'match') {
      (s.paras || []).forEach(function (p) { L.push('[' + p.k + '] ' + p.text); });
    } else {
      (s.body || []).forEach(function (p, i) { L.push('¶' + (i + 1) + ' ' + p); });
    }
    if (s.bank && s.bank.length) L.push('词库：' + s.bank.join(' / '));
    if (s.translation) L.push('参考译文：' + String(s.translation).replace(/\s*\n+\s*/g, ' '));
    L.push('题目（附答案与解析）：');
    (s.questions || []).forEach(function (q) {
      L.push('  ' + q.n + '. ' + q.stem);
      (q.options || []).forEach(function (o) { L.push('     ' + o.k + '. ' + o.t); });
      L.push('     ✔ 答案 ' + q.answer + (q.explain ? '｜解析：' + q.explain : ''));
    });
    return L.join('\n');
  }

  /**
   * 按当前这句用户输入，拼出【题目板块 · 原文】段落。
   * 有预算上限：超了就先贴前面的、后面只留一行提示（比把上下文撑爆好）。
   */
  /** 概况版（一套只占几百字）：分组级提问时用，够模型说清「这组有几套、各练什么」 */
  function setBriefBlock(s) {
    var L = ['—— ' + s.id + '《' + (s.title || '') + '》　' + (s.test || '') + ' · '
      + (QTYPE_CN[s.type] || s.type || '') + ' ' + ((s.questions || []).length) + '题'
      + (s.topic ? '（' + s.topic + '）' : '')];
    if (s.type === 'match') {
      L.push('段落：' + (s.paras || []).map(function (p) {
        return '[' + p.k + '] ' + String(p.text).slice(0, 70) + '…';
      }).join(' '));
    } else {
      var body = (s.body || []).join(' ');
      L.push('开头：' + String(body).slice(0, 320) + (body.length > 320 ? '…' : ''));
    }
    L.push('题干：' + (s.questions || []).map(function (q) {
      return q.n + '. ' + String(q.stem).slice(0, 80);
    }).join(' / '));
    return L.join('\n');
  }

  /**
   * 按当前这句用户输入，拼出【题目板块 · 原文】段落。
   * 两种情况：
   *   · 指到 1~2 套 → 贴全文（正文 + 选项 + 答案 + 解析）
   *   · 指到 3 套以上（说了一整个分组）→ 每套只给概况，另附一句「点名套号可拿全文」
   * 组级提问若也贴全文，四套就 29k 字符，上下文直接翻倍 —— 不值。
   */
  function quizContext(text, cap) {
    var pick = pickSets(text);
    if (!pick || !pick.sets.length) return '';

    /* 只说了题型（阅读/完形…）：候选可能有七八套，全贴会撑爆上下文。
       这里只给清单 + 一句「问他是哪一套」，比瞎猜一套强。 */
    if (pick.compact) {
      return '【题目板块 · 候选】（用户只说了题型：' + pick.how + '）'
        + '下面是题库里符合的几套，篇幅原因没贴全文。'
        + '先按这张表告诉他有哪几套（报 id 与标题），问清是哪一套，再讲；别说看不到。\n'
        + pick.sets.map(function (s) {
          return '· ' + s.id + ' | ' + (s.test || '') + ' | '
            + (QTYPE_CN[s.type] || s.type) + ' ' + ((s.questions || []).length) + '题 | '
            + (s.title || '');
        }).join('\n');
    }

    if (pick.sets.length > 2) {
      return '【题目板块 · 概况】（用户这句指向这一整组题：' + pick.how + '）'
        + '下面是每套的概况（正文只给开头）。要讲某一道题，让他点名套号或「第几篇」，'
        + '系统下一轮会把那套全文贴进来；这一轮先按概况回答，别说看不到题库。\n'
        + pick.sets.map(setBriefBlock).join('\n');
    }

    cap = cap || 20000;
    var head = '【题目板块 · 原文】（用户这句指向本站题库：' + pick.how + '）'
      + '以下是真题面与答案，用它讲解或仿写都行；'
      + '但**用户还没作答时不要直接报答案**，先带他定位、再确认。';
    var out = [head], used = 0, skipped = 0;
    pick.sets.forEach(function (s) {
      var block = setBlock(s);
      if (used + block.length > cap) { skipped++; return; }
      used += block.length;
      out.push('', block);
    });
    if (skipped) {
      out.push('', '（另有 ' + skipped + ' 套因篇幅没贴全文，用户点名套号时可以再要。）');
    }
    return out.join('\n');
  }

  function snapshot() {
    var st = TW.store.state;
    var c = TW.store.counts();
    var today = TW.store.today();

    var days = [], weekDone = 0, weekRight = 0;
    for (var i = 6; i >= 0; i--) {
      var dk = TW.store.addDays(today, -i);
      var v = st.daily[dk] || { done: 0, right: 0 };
      weekDone += v.done || 0;
      weekRight += v.right || 0;
      days.push([dk.slice(5), v.done || 0, v.right || 0]);
    }

    var bySrc = {};
    Object.keys(st.progress).forEach(function (id) {
      var p = st.progress[id];
      if (!p || !p.seen) return;
      var k = p.src || '';
      var o = bySrc[k] || (bySrc[k] = { name: bookName(k), touched: 0, wrong: 0, master: 0 });
      o.touched++;
      if (p.w > 0 && !p.master) o.wrong++;
      if (p.master) o.master++;
    });
    var sources = Object.keys(bySrc).map(function (k) { return bySrc[k]; })
      .sort(function (a, b) { return b.touched - a.touched; }).slice(0, 8);

    /* 弱词：错得多、且没掌握；错数相同就按最近错的时间排 */
    var weak = Object.keys(st.progress).map(function (id) {
      return { id: id, p: st.progress[id] };
    }).filter(function (x) {
      var p = x.p;
      return p && p.seen > 0 && p.w > 0 && !p.master;
    }).sort(function (a, b) {
      return (b.p.w - a.p.w) || (b.p.ts - a.p.ts);
    }).slice(0, 24).map(function (x) {
      var p = x.p;
      var srs = TW.store.srs.get(p.word);
      return {
        id: x.id,
        word: p.word,
        cn: String(p.brief || '').slice(0, 40),
        src: bookName(p.src),
        wrong: p.w,
        right: p.r,
        streak: p.streak || 0,
        srs: srs ? srs.b : null
      };
    });

    var due = TW.store.srs.dueList().slice(0, 20).map(function (r) {
      return {
        word: r.w,
        cn: String(r.m || '').slice(0, 40),
        level: r.b,
        overdue: Math.max(0, TW.store.diffDays(r.d, today))
      };
    });

    var sessions = TW.store.sessions().slice(0, 8).map(function (s) {
      return {
        when: relDay(s.t),
        mode: s.mode,
        src: s.src,
        total: s.total,
        acc: s.acc
      };
    });

    var wrongOrder = TW.store.recentWrong().slice(0, 12).map(function (id) {
      var p = st.progress[id];
      return p && p.word ? p.word : '';
    }).filter(Boolean);

    return {
      profile: {
        totalWords: c.total,
        touchedWords: c.touched,
        masteredWords: c.master,
        wrongWords: c.wrong,
        accuracy7d: weekDone ? Math.round((weekRight / weekDone) * 100) : 0,
        studied7d: weekDone,
        todayDone: (st.daily[today] || {}).done || 0
      },
      daily: days,
      sources: sources,
      weakWords: weak,
      dueWords: due,
      srs: TW.store.srs.stats(),
      recentSessions: sessions,
      wrongOrder: wrongOrder,
      works: worksSnapshot()
    };
  }

  /** 给对话用的一段紧凑文本（比 JSON 省 token，模型也更好读） */
  function briefText(snap) {
    snap = snap || snapshot();
    var p = snap.profile;
    var L = [];
    L.push('【学习概况】词库 ' + p.totalWords + ' 词；已学 ' + p.touchedWords + '；已掌握 ' +
      p.masteredWords + '；错词（未掌握）' + p.wrongWords + '；近 7 天做题 ' + p.studied7d +
      ' 次，正确率 ' + p.accuracy7d + '%；今天已做 ' + p.todayDone + ' 题。');
    L.push('【复习队列】共 ' + snap.srs.total + ' 词，到期 ' + snap.srs.due + '，已排到最后一档 ' + snap.srs.mastered + '。');
    if (snap.sources.length) {
      L.push('【分书情况】' + snap.sources.map(function (s) {
        return s.name + '：学 ' + s.touched + '、错 ' + s.wrong + '、掌握 ' + s.master;
      }).join('；'));
    }
    if (snap.weakWords.length) {
      L.push('【最需要处理的词】' + snap.weakWords.slice(0, 12).map(function (w) {
        return w.word + '（' + w.cn + '，错 ' + w.wrong + ' 对 ' + w.right + '）';
      }).join('；'));
    }
    if (snap.dueWords.length) {
      L.push('【今天到期】' + snap.dueWords.slice(0, 12).map(function (w) { return w.word; }).join('、'));
    }
    if (snap.recentSessions.length) {
      L.push('【最近场次】' + snap.recentSessions.slice(0, 5).map(function (s) {
        return s.when + ' ' + s.mode + ' ' + s.total + '题/' + s.acc + '%';
      }).join('；'));
    }
    L.push('【近 7 天每日做题】' + snap.daily.map(function (d) { return d[0] + ' ' + d[1] + '题'; }).join('，'));

    /* 写作 / 题目 / 听力 —— 用户问「评价我写的那篇」「我做到哪了」时要能直接答 */
    var w = snap.works || {};
    (w.writing || []).forEach(function (x, i) {
      L.push('【写作' + (i === 0 ? '·最近批改' : '') + '】《' + x.title + '》（' + x.type + '，' + x.when +
        '，' + x.words + ' 词，得分 ' + (x.score == null ? '无' : x.score + '/' + x.max) + '）：' + x.text +
        (x.comment ? ' ｜ 批改意见：' + x.comment : '') +
        (x.issues && x.issues.length ? ' ｜ 主要问题：' + x.issues.join('；') : ''));
    });
    (w.drafts || []).forEach(function (x, i) {
      L.push('【写作草稿·未批改' + (i === 0 ? '（最新）' : '') + '】《' + x.title + '》（' + x.type + '，' +
        x.words + ' 词）：' + x.text);
    });
    if (w.quiz && w.quiz.length) {
      L.push('【题目板块最近】' + w.quiz.map(function (x) {
        return x.title + ' ' + x.right + '/' + x.total + '（' + x.when + '）';
      }).join('；'));
    }
    if (w.listen && w.listen.length) {
      L.push('【听力最近】' + w.listen.map(function (x) {
        return x.title + ' ' + x.right + '/' + x.total + '（' + x.when + '）';
      }).join('；'));
    }
    return L.join('\n');
  }

  /* ---------------- 联网检索 ----------------
     sunfleeting 2026-11-04：「为什么不能联网，你修一下呀」——
     模型本身没有浏览器，但本站可以替它去搜：Worker 用 Bing 的 RSS 出口拿结果
     （免费、不用 Key、给浏览器 CORS 拦不住），再把摘要塞进 system。
     所以真正的修法有两半：① 真要能搜到东西；② 搜不到时模型也不许说「我无法联网」。 */
  function searchWeb(q, count) {
    var text = String(q || '').trim();
    if (!text) return Promise.resolve({ results: [] });
    return TW.api.request('POST', '/api/ai/search', { q: text.slice(0, 120), count: count || 6 }, { timeout: 15000 })
      .then(function (r) { return { results: (r && r.results) || [], q: text, error: (r && r.error) || '' }; },
            function (e) { return { results: [], q: text, error: (e && e.message) || '检索失败' }; });
  }

  /* 哪些问题值得先搜一下：时间敏感 / 事实性 / 明确要好处的「最新」类问法。
     宁可多搜一次（一次 RSS 请求，几百毫秒），也别让模型凭记忆编考试时间。 */
  var WEB_HINT = new RegExp([
    '最新', '最近', '近来', '今年', '去年', '明年', '今天', '昨天', '明天', '现在', '目前', '当前', '实时',
    '新闻', '热点', '政策', '规定', '改革', '大纲', '题型变化',
    '考试时间', '报名', '准考证', '成绩查询', '查分', '分数线', '真题下载',
    '官网', '价格', '多少钱', '发布', '版本', '截止', '什么时候', '几月', '几号',
    '20(2[5-9]|[3-9]\d)'
  ].join('|'), 'i');

  /* 「帮我分析最近的学习情况」这种问的是自己的数据（快照里全都有），搜了纯浪费；
     而「我最近要不要报六级，报名时间几号」有外部事实对象，照常搜。
     判据：句子里有「我/本站」+ 学习类对象，且没有外部事实词。 */
  var EXTERNAL = /(考试|报名|政策|大纲|官网|真题|分数线|查分|成绩查询|新闻|改革|几月|几号|什么时候|时间|价格|多少钱|版本|发布|截止)/;
  var MINE = /(学习|词|进度|记录|成绩|统计|正确率|复习|掌握|场次|数据|表现|情况|错)/;

  function personal(t) {
    if (!/(我|自己|本站|这个站)/.test(t)) return false;
    if (EXTERNAL.test(t)) return false;
    return MINE.test(t);
  }

  function needsWeb(text) {
    var t = String(text || '');
    if (!t || t.length > 200) return false;
    if (/^(继续|好的|谢谢|嗯|ok|OK)$/.test(t.trim())) return false;
    if (personal(t)) return false;
    return WEB_HINT.test(t);
  }

  /** 把检索结果压成给模型看的短文本（带域名，方便它标注来源） */
  function searchBrief(pack) {
    var rs = (pack && pack.results) || [];
    if (!rs.length) return '';
    var L = ['【联网检索结果】（本站代你检索，' + fmtDate(new Date()) + '）'];
    rs.slice(0, 6).forEach(function (r, i) {
      L.push((i + 1) + '. ' + r.title + ' — ' + (r.snippet || '（无摘要）') + '（来源：' + r.host + '）');
    });
    L.push('用法：事实以这些结果为准，句末标一句来源域名；与问题无关的结果直接忽略。');
    return L.join('\n');
  }

  function fmtDate(d) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ---------------- 历史对话 ----------------
     存独立 localStorage 键（和 Key 分开）：对话里有学习数据、题目，体积大，
     没必要进同步协议；换设备重来也符合「Key 只在本机」的设定。
     每条消息截断到 4000 字、每条会话最多 40 条，避免长对话把 5MB 配额吃满。 */
  var TK = 'typingcet.ai.chat.v1';
  var THREAD_MAX = 30;

  function readThreads() {
    try {
      var raw = localStorage.getItem(TK);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(function (t) { return t && t.id && Array.isArray(t.messages); }) : [];
    } catch (e) { return []; }
  }
  function writeThreads(list) {
    try { localStorage.setItem(TK, JSON.stringify(list.slice(0, THREAD_MAX))); } catch (e) { /* 满了就算了 */ }
  }
  function trimMsg(m) {
    var o = { role: m.role, content: String(m.content || '').slice(0, 4000) };
    if (m.quiz) o.quiz = m.quiz;
    return o;
  }
  function threadTitle(messages) {
    for (var i = 0; i < messages.length; i++) {
      if (messages[i].role === 'user') {
        var t = String(messages[i].content || '').replace(/\s+/g, ' ').trim();
        return t.length > 24 ? t.slice(0, 24) + '…' : (t || '新对话');
      }
    }
    return '新对话';
  }
  function listThreads() {
    return readThreads().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  }
  function getThread(id) {
    var list = readThreads();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function saveThread(t) {
    if (!t || !t.id || !t.messages || !t.messages.length) return null;
    var list = readThreads().filter(function (x) { return x.id !== t.id; });
    var rec = {
      id: t.id, ts: Date.now(), title: threadTitle(t.messages),
      messages: t.messages.slice(-40).map(trimMsg)
    };
    list.unshift(rec);
    writeThreads(list);
    return rec;
  }
  function removeThread(id) {
    writeThreads(readThreads().filter(function (x) { return x.id !== id; }));
  }
  function newThreadId() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  TW.ai = {
    PROVIDERS: PROVIDERS,
    provider: provider,
    config: config,
    save: save,
    setProvider: setProvider,
    setKey: setKey,
    setModel: setModel,
    apiKey: apiKey,
    modelName: modelName,
    baseUrl: baseUrl,
    configured: configured,
    isLocal: isLocal,
    listModels: listModels,
    cachedModels: cachedModels,
    chat: chat,
    streamChat: streamChat,
    parseJson: parseJson,
    md: md,
    snapshot: snapshot,
    briefText: briefText,
    quizIndex: quizIndex,
    quizContext: quizContext,
    pickQuizSets: pickSets,
    searchWeb: searchWeb,
    needsWeb: needsWeb,
    searchBrief: searchBrief,
    listThreads: listThreads,
    getThread: getThread,
    saveThread: saveThread,
    removeThread: removeThread,
    newThreadId: newThreadId,
    bookName: bookName
  };
})();
