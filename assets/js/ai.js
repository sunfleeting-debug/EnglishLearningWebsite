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
    return fetch(pack.baseUrl + '/models', {
      headers: pack.apiKey ? { 'Authorization': 'Bearer ' + pack.apiKey } : {}
    }).then(function (res) {
      return res.text().then(function (t) {
        var d = null;
        try { d = t ? JSON.parse(t) : null; } catch (e) {}
        if (!res.ok) throw new Error('获取模型失败：' + ((d && d.error && (d.error.message || d.error)) || ('HTTP ' + res.status)));
        var arr = (d && (d.data || d.models)) || [];
        var ids = arr.map(function (m) { return typeof m === 'string' ? m : (m && (m.id || m.name)); });
        var list = sortModels(ids);
        if (!list.length) throw new Error('这个接口没返回模型列表');
        return list;
      });
    }, function () {
      throw new Error('连不上本地接口（检查地址，以及是否允许跨域）');
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

  /* ---------------- 请求 ---------------- */

  function directFetch(pack) {
    var url = String(pack.baseUrl || '').replace(/\/+$/, '') + '/chat/completions';
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
        if (!res.ok) throw new Error('本地模型返回错误：' + ((d && d.error && (d.error.message || d.error)) || t || ('HTTP ' + res.status)));
        var ch = d && d.choices && d.choices[0];
        var out = ch && ch.message ? ch.message.content : '';
        if (!out) throw new Error('本地模型没有返回内容');
        return { text: String(out).trim(), model: d.model || pack.model };
      });
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw new Error('连不上本地接口（' + ((err && err.message) || 'network') + '）——检查地址、是否允许跨域');
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

    /* 本地自定义接口由浏览器直连：Worker 有 SSRF 防护，会拒绝 127.0.0.1 */
    if (c.provider === 'custom' && isLocal(pack.baseUrl)) return directFetch(pack);

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

    var local = c.provider === 'custom' && isLocal(pack.baseUrl);
    var url, headers;
    if (local) {
      url = pack.baseUrl + '/chat/completions';
      headers = { 'Content-Type': 'application/json' };
      if (pack.apiKey) headers['Authorization'] = 'Bearer ' + pack.apiKey;
    } else {
      if (!TW.api || !TW.api.configured || !TW.api.configured()) {
        return Promise.reject(new Error('后端地址未配置，AI 转发不可用（可在「账号」页填写后端地址）'));
      }
      url = TW.api.base() + '/api/ai/chat';
      headers = { 'Content-Type': 'application/json' };
      if (TW.api.token && TW.api.token()) headers['Authorization'] = 'Bearer ' + TW.api.token();
    }

    var body = local
      ? {
        model: pack.model,
        messages: (pack.system ? [{ role: 'system', content: pack.system }] : []).concat(pack.messages),
        temperature: pack.temperature, max_tokens: pack.maxTokens, stream: true
      }
      : pack;

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
          var msg = (d && d.error) || t || ('HTTP ' + res.status);
          var err = new Error(String(msg).slice(0, 300));
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
      throw e2;
    }).then(function (r) {
      if (r && !r.text) throw new Error('模型没有返回内容');
      return { text: (r && r.text) || acc };
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

  /**
   * 汇总当前学习情况（纯本地、确定性计算 —— 模型只负责解释，数字都由这里给）。
   * 输出刻意做小：整个 JSON 控制在 4KB 上下，避免把上下文塞满。
   */
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
      wrongOrder: wrongOrder
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
    return L.join('\n');
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
    bookName: bookName
  };
})();
