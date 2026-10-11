/* =======================================================================
 * LUCIFER · 多智能体中枢  ——  核心逻辑（Part 1 / 4）
 * ===================================================================== */

/* ------------------------- 基础工具 ------------------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = (p) => (p || 'x') + Math.random().toString(36).slice(2, 9);
const now = () => Date.now();
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fmtTime(ts) {
  const d = new Date(ts); const p = (n) => String(n).padStart(2, '0');
  return d.getMonth() + 1 + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function relTime(ts) {
  const s = (now() - ts) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
  if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
  return Math.floor(s / 86400) + ' 天前';
}
function fmtNum(n) {
  n = n || 0;
  if (n < 1000) return String(Math.round(n));
  if (n < 1000000) return (n / 1000).toFixed(n < 10000 ? 2 : 1).replace(/\.0+$/, '') + 'k';
  return (n / 1000000).toFixed(2) + 'M';
}

/* ------------------------- Token 估算 ------------------------- */
/* 优先使用服务端返回的 usage；没有则按「中日韩字符≈1 token，其余≈4 字符/token」估算 */
function estimateTokens(text) {
  if (!text) return 0;
  const s = String(text);
  let cjk = 0, other = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if ((c >= 0x2e80 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xffef)) cjk++;
    else other++;
  }
  return Math.max(1, Math.round(cjk * 0.95 + other / 4));
}
function estimateMessages(msgs) {
  return (msgs || []).reduce((n, m) => n + estimateTokens(m.content) + 4, 0);
}

/* ------------------------- Markdown（极简渲染） ------------------------- */
function mdRender(src) {
  const codes = [];
  let s = String(src == null ? '' : src);
  s = s.replace(/```([a-zA-Z0-9_+\-.#]*)[ \t]*\r?\n?([\s\S]*?)```/g, (m, lang, code) => {
    codes.push({ lang: lang || 'text', code: code.replace(/\n$/, '') });
    return '\n\u0000C' + (codes.length - 1) + '\u0000\n';
  });
  const lines = esc(s).split(/\r?\n/);
  const inline = (t) => t
    .replace(/`([^`\n]+)`/g, '<code class="ic">$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(（])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out = []; let i = 0;
  const isPh = (L) => /^\s*\u0000C\d+\u0000\s*$/.test(L);
  const isStart = (L) => isPh(L) || /^#{1,6}\s/.test(L) || /^\s*>/.test(L) || /^\s*[-*+]\s+/.test(L) || /^\s*\d+[.)]\s+/.test(L);
  while (i < lines.length) {
    const L = lines[i]; let m;
    if (isPh(L)) {
      const idx = +L.trim().replace(/[\u0000C]/g, '');
      const c = codes[idx];
      out.push('<pre class="code"><div class="bar"><span>' + esc(c.lang) + '</span><button class="copybtn" data-idx="' + idx + '">复制</button></div><code>' + esc(c.code) + '</code></pre>');
      i++; continue;
    }
    if ((m = L.match(/^(#{1,6})\s+(.*)$/))) { out.push('<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>'); i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(L)) { out.push('<hr>'); i++; continue; }
    if (/^\s*>/.test(L)) {
      const b = []; while (i < lines.length && /^\s*>/.test(lines[i])) { b.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      out.push('<blockquote>' + inline(b.join('<br>')) + '</blockquote>'); continue;
    }
    if (/^\s*[-*+]\s+/.test(L)) {
      const it = []; while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { it.push(inline(lines[i].replace(/^\s*[-*+]\s+/, ''))); i++; }
      out.push('<ul>' + it.map((x) => '<li>' + x + '</li>').join('') + '</ul>'); continue;
    }
    if (/^\s*\d+[.)]\s+/.test(L)) {
      const it = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { it.push(inline(lines[i].replace(/^\s*\d+[.)]\s+/, ''))); i++; }
      out.push('<ol>' + it.map((x) => '<li>' + x + '</li>').join('') + '</ol>'); continue;
    }
    if (!L.trim()) { i++; continue; }
    const b = []; while (i < lines.length && lines[i].trim() && !isStart(lines[i])) { b.push(lines[i]); i++; }
    out.push('<p>' + inline(b.join('<br>')) + '</p>');
  }
  return out.join('');
}

/* ------------------------- 预设 Provider ------------------------- */
/* 主力：DeepSeek / 智谱 GLM / 小米 MiMo；中转站用于走 GPT 等海外模型 */
/* 不再维护厂商预设列表：统一按 OpenAI 兼容协议配置。
 * 任何兼容服务（官方 / 中转站 / 自建 / 本地）只需填 Base URL + Key。 */
const PRESETS = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1',
    hint: '任何兼容 OpenAI 协议的服务都可以：官方地址、中转站、自建代理、本地推理，填 Base URL 即可' },
];

/* 主题预设（主色相 h / 饱和 s / 明度 l）—— 默认靛紫，与第一版配色一致 */
const THEMES = [
  { id: 'indigo', name: '靛紫', h: 248, s: '100%', l: '71%' },
  { id: 'violet', name: '紫罗兰', h: 268, s: '88%', l: '70%' },
  { id: 'azure',  name: '天青', h: 212, s: '90%', l: '66%' },
  { id: 'cyan',   name: '碧青', h: 186, s: '82%', l: '60%' },
  { id: 'jade',   name: '青玉', h: 158, s: '62%', l: '56%' },
  { id: 'rose',   name: '玫瑰', h: 340, s: '82%', l: '68%' },
  { id: 'amber',  name: '琥珀', h: 34,  s: '78%', l: '62%' },
  { id: 'gold',   name: '鎏金', h: 40,  s: '50%', l: '58%' },
];
const EMOJIS = ['🧠','🤖','👨‍💻','👩‍💻','🕵️','📚','🔬','✍️','🎨','🎬','🎵','⚙️','🛠️','📊','🧩','🗂️','📝','🌐','🚀','🛡️','🧪','💡','🧭','🎯','🐧','🐳','☁️','🔮','🦾','🪄'];

/* ------------------------- 默认状态 ------------------------- */
const MAIN_PROMPT = `你是「总控 Agent」，一支多智能体团队的指挥官。职责：拆解目标 → 分派任务 → 汇总结果 → 沉淀文档。

【可调用的指令】直接写在回复正文里，前端会自动执行并把结果回传给你：

1. 派发任务给子 Agent：
<call agent="@角色名">要派发的具体任务（写清目标、约束、期望产出）</call>

2. 文档操作（交接与知识沉淀）：
<doc op="create" title="文档标题">正文内容</doc>
<doc op="append" title="文档标题">追加内容</doc>
<doc op="update" title="文档标题">替换后的全文</doc>
<doc op="read" title="文档标题"/>
<doc op="list"/>
<doc op="delete" title="文档标题"/>

【工作规则】
- 一条回复里可以包含多个指令，前端按顺序执行。
- 需要子 Agent 的产出时用 <call>；收到回执后再输出最终答复，不要把任务原样复述给用户。
- 面向用户的话要简洁、结论先行，不要暴露内部指令语法。
- 重要结论与交接信息必须写进文档，而不是只留在对话里。`;

function defaultState() {
  const pid = 'deepseek';
  return {
    v: 3,
    settings: {
      providers: [{ id: pid, name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', models: ['gpt-4o', 'gpt-4o-mini'] }],
      activeProviderId: pid,
      defaultModel: 'deepseek-chat',
      sandbox: { mode: 'builtin', endpoint: '', apiKey: '', execPath: '/exec', enabled: false, provider: 'e2b', lastOk: 0, note: '' },
      search: { provider: 'none', endpoint: '', enabled: false, count: 5, lastOk: 0 },
      github: { token: '', user: '', enabled: false, lastOk: 0, defaultPrivate: true },
      maxRounds: 6,
      ctx: { autoCompact: true, tokenBudget: 24000, keepMessages: 12 },
      receiptLimit: 1200,
      mcp: { servers: [] },
      theme: {
        mode: 'dark', preset: 'gold', h: 42, s: '56%', l: '62%',
        radius: 1, fontScale: 1, glassBlur: 22, aurora: true, custom: false,
      },
    },
    agents: [{
      id: 'main', isMain: true, name: '总控', roleName: 'main', avatar: '🧠',
      desc: '团队指挥官，负责任务拆解与分派',
      systemPrompt: MAIN_PROMPT, providerId: '', model: '',
      skills: [], tools: { delegate: true, docs: true, sandbox: false, search: false },
    }],
    docs: [{
      id: uid('d'), title: '交接说明', ownerId: 'main', shared: true, updatedAt: now(),
      content: '# 交接说明\n\n这里是团队共享文档区。任何 Agent 都可以通过文档指令读写，用于任务交接与知识沉淀。\n\n## 用法\n\n- 总控在派活前后，把背景 / 约束 / 产出写进文档，子 Agent 可读取。\n- 长任务建议一任务一文档，标题写清楚。\n',
    }],
    topics: [],
    ui: {
      view: 'chat', activeAgentId: 'main', activeTopicId: null, editAgentId: null,
      editTab: 'base', activeDocId: null, collapsed: false, drafting: '', statsOpen: false, _q: '',
      sideOpen: false, search: '', searchScope: 'all', tab: 'chat', docView: null,
      pending: [], gh: { repo: null, path: null, tab: 'repos', runs: [], repos: [] },
    },
  };
}

/* ------------------------- 状态 ------------------------- */
const KEY = 'lucifer.state.v1';
const LEGACY_KEYS = ['agenthub.state.v2', 'agenthub.state.v1', 'lucifer.state.v0'];
function readStored() {
  try {
    const v = Store.get(KEY);
    if (v) return v;
    for (const k of LEGACY_KEYS) { const o = Store.get(k); if (o) return o; }
  } catch (e) {}
  return null;
}
let S = null, ABORT = null, RUNNING = false;

function load() {
  try {
    const raw = readStored();
    if (!raw) return defaultState();
    const o = JSON.parse(raw); const d = defaultState();
    o.settings = Object.assign(d.settings, o.settings || {});
    o.settings.sandbox = Object.assign(d.settings.sandbox, (o.settings || {}).sandbox || {});
    o.agents = Array.isArray(o.agents) && o.agents.length ? o.agents : d.agents;
    o.docs = Array.isArray(o.docs) ? o.docs : d.docs;
    o.topics = Array.isArray(o.topics) ? o.topics : [];
    o.ui = Object.assign(d.ui, o.ui || {});
    o.settings.ctx = Object.assign(d.settings.ctx, (o.settings || {}).ctx || {});
    o.settings.mcp = Object.assign(d.settings.mcp, (o.settings || {}).mcp || {});
    o.settings.theme = Object.assign(d.settings.theme, (o.settings || {}).theme || {});
    o.settings.search = Object.assign(d.settings.search, (o.settings || {}).search || {});
    o.settings.github = Object.assign(d.settings.github, (o.settings || {}).github || {});
    if (!o.agents.some((a) => a.isMain)) o.agents.unshift(d.agents[0]);
    o.agents.forEach((a) => {
      a.skills = a.skills || [];
      a.tools = Object.assign({ delegate: true, docs: true, sandbox: false, search: false }, a.tools || {});
    });
    o.topics.forEach((t) => { if (!t.stats) t.stats = blankStats(); });
    return o;
  } catch (e) { return defaultState(); }
}
/* ------------------------- 存储适配层 -------------------------
 * 所有本地读写都走 Store，便于以后换成 IndexedDB / Tauri 文件系统。
 * 原实现把写入异常静默吞掉：一旦超出配额，用户会在毫无提示的情况下丢数据。 */
const Store = {
  lastError: null,
  isAvailable() {
    try { const k = '__lucifer_probe__'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; }
    catch (e) { return false; }
  },
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) {
    try { localStorage.setItem(k, v); Store.lastError = null; return true; }
    catch (e) { Store.lastError = e; return false; }
  },
  del(k) { try { localStorage.removeItem(k); return true; } catch (e) { return false; } },
  /* 粗略估算占用字节（UTF-16 约 2 字节/字符） */
  usage() {
    try {
      let n = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        n += (k.length + (Store.get(k) || '').length) * 2;
      }
      return n;
    } catch (e) { return 0; }
  },
};
let SAVE_WARNED = false;
function save() {
  const ok = Store.set(KEY, JSON.stringify(S));
  if (!ok && !SAVE_WARNED) {
    SAVE_WARNED = true;
    const reason = (Store.lastError && (Store.lastError.name || Store.lastError.message)) || '未知错误';
    toast('⚠️ 本地保存失败：' + reason + '（可能超出存储配额）。请到「设置 → 上下文与数据」导出备份并清理旧会话。', 'err');
  }
  return ok;
}

const getAgent = (id) => S.agents.find((a) => a.id === id) || null;
const mainAgent = () => S.agents.find((a) => a.isMain) || S.agents[0];
const curAgent = () => getAgent(S.ui.activeAgentId) || mainAgent();
const getProvider = (id) => S.settings.providers.find((p) => p.id === id) || null;
const providerFor = (a) => getProvider(a && a.providerId) || getProvider(S.settings.activeProviderId) || S.settings.providers[0] || null;
const modelFor = (a) => (a && a.model) || S.settings.defaultModel || ((providerFor(a) || {}).models || [])[0] || '';
const isMain = (a) => !!(a && a.isMain);

const docsFor = (agentId) => S.docs.filter((d) => d.shared || d.ownerId === agentId);
function findDoc(title) {
  if (!title) return null;
  const t = String(title).trim();
  return S.docs.find((d) => d.id === t) || S.docs.find((d) => d.title === t) || null;
}
function ensureTopic(agentId) {
  let t = S.topics.find((x) => x.id === S.ui.activeTopicId && x.agentId === agentId);
  if (!t) {
    t = S.topics.filter((x) => x.agentId === agentId)[0];
    if (!t) { t = { id: uid('t'), agentId, title: '新会话', messages: [], createdAt: now(), stats: blankStats() }; S.topics.unshift(t); }
    S.ui.activeTopicId = t.id;
  }
  if (!t.stats) t.stats = blankStats();
  return t;
}
function newTopic(agentId) {
  const t = { id: uid('t'), agentId, title: '新会话', messages: [], createdAt: now(), stats: blankStats() };
  S.topics.unshift(t); S.ui.activeTopicId = t.id; return t;
}
function blankStats() {
  return { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, estimated: false, agents: {}, startedAt: null, lastAt: null, ms: 0 };
}
/* 记录一次请求的用量 */
function bumpStats(topic, agent, usage, promptText, completionText, ms) {
  const st = topic.stats || (topic.stats = blankStats());
  st.requests++;
  st.startedAt = st.startedAt || now();
  st.lastAt = now();
  st.ms += ms || 0;
  let pt, ct, est = false;
  if (usage && (usage.prompt_tokens || usage.completion_tokens || usage.total_tokens)) {
    pt = usage.prompt_tokens || 0; ct = usage.completion_tokens || 0;
  } else {
    pt = estimateMessages(promptText); ct = estimateTokens(completionText); est = true;
  }
  if (est) st.estimated = true;
  st.promptTokens += pt; st.completionTokens += ct;
  st.totalTokens = st.promptTokens + st.completionTokens;
  if (agent) {
    const k = agent.id;
    if (!st.agents[k]) st.agents[k] = { name: agent.name, role: agent.roleName, avatar: agent.avatar, calls: 0, tokens: 0 };
    st.agents[k].calls++;
    st.agents[k].tokens += (pt + ct);
    st.agents[k].name = agent.name; st.agents[k].avatar = agent.avatar;
  }
  return st;
}

/* ------------------------- Toast / Modal ------------------------- */
function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = msg;
  const wrap = document.getElementById('toasts');
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 320);
  }, 2600);
}
function modal(html, onMount) {
  const m = document.createElement('div');
  m.className = 'mask';
  m.innerHTML = '<div class="dlg glass">' + html + '</div>';
  document.body.appendChild(m);
  requestAnimationFrame(() => m.classList.add('in'));
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); }
  };
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    m.classList.remove('in');
    setTimeout(() => m.remove(), 220);
  };
  document.addEventListener('keydown', onKey, true);
  m.addEventListener('mousedown', (e) => { if (e.target === m) close(); });
  if (onMount) onMount(m, close);
}

/* ------------------------- API ------------------------- */
/* 没写协议时的默认协议判定。
 * 之前一律补 https://，导致指向 http 的自建中转 / 本地服务必然 fetch 失败。
 * 规则：本机、局域网、无点主机名（nas、server 等）→ http://，其余 → https:// */
function pickScheme(u) {
  const host = String(u).split('/')[0].replace(/^\[[^\]]+\]/, (m) => m).split('@').pop();
  const name = host.replace(/:\d+$/, '');
  const isLocal =
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i.test(name) ||
    /^10\./.test(name) || /^192\.168\./.test(name) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(name) ||
    /\.local$/i.test(name) ||
    !name.includes('.');
  return isLocal ? 'http://' : 'https://';
}
function joinUrl(base, path) {
  if (!base) return '';
  let b = String(base).trim().replace(/\/+$/, '');
  if (!/^[a-z][a-z0-9+.\-]*:\/\//i.test(b)) b = pickScheme(b) + b;
  return b + path;
}
/* 把 fetch 失败翻译成人能看懂的原因，并带上真实 URL */
function fetchHint(url, e) {
  const u = String(url || '');
  if (location.protocol === 'https:' && /^http:\/\//i.test(u))
    return '页面是 https，却请求 http 接口 —— 被浏览器按混合内容拦下。改用 https，或使用桌面端 / 安卓端。';
  if (/localhost|127\.0\.0\.1|192\.168\.|10\.|\[::1\]|\.local/i.test(u))
    return '本地/内网地址不可达 —— 确认服务已启动、端口正确；网页版受浏览器限制时请改用桌面端。';
  if (e && e.name === 'AbortError') return '请求被取消。';
  return '地址不可达 / DNS 解析失败 / 被网络策略拦截（也可能是该服务不允许浏览器直连）。';
}
function apiHeaders(p, isGet) {
  const h = {};
  if (!isGet) h['Content-Type'] = 'application/json';
  if (p.apiKey) h['Authorization'] = 'Bearer ' + p.apiKey;
  return h;
}
async function pullModels(p) {
  const url = joinUrl(p.baseUrl, '/models');
  if (!url) throw new Error('未填写 API 地址');
  let r;
  try { r = await fetch(url, { headers: apiHeaders(p, true) }); }
  catch (e) {
    /* 裸 fetch 抛的 TypeError('Failed to fetch') 毫无信息量，这里补全上下文 */
    throw new Error('请求失败 → ' + url + '\n原因：' + (e.name || '') + ' ' + (e.message || e) + '\n' + fetchHint(url, e)
      + '\n（拉取模型失败不影响使用：在「服务商与模型 → 编辑」里把模型名直接填进「模型列表」即可）');
  }
  const txt = await r.text();
  if (!r.ok) throw new Error('HTTP ' + r.status + ' · ' + txt.slice(0, 180));
  let j; try { j = JSON.parse(txt); } catch (e) { throw new Error('返回内容不是合法 JSON'); }
  const arr = j.data || j.models || j.result || [];
  const ids = arr.map((m) => (typeof m === 'string' ? m : (m.id || m.name || m.model))).filter(Boolean);
  if (!ids.length) throw new Error('接口未返回模型列表（试试手动填写模型名）');
  return ids;
}

/* 流式调用；onDelta 增量；onUsage 拿到真实用量 */
async function streamChat(agent, messages, onDelta, signal, onUsage) {
  const p = providerFor(agent);
  if (!p) throw new Error('没有可用的 API 配置，请到「设置」添加');
  if (!p.baseUrl) throw new Error('API 地址为空，请到「设置」填写');
  const model = modelFor(agent);
  if (!model) throw new Error('未选择模型，请到「设置」拉取并选择模型');
  const url = joinUrl(p.baseUrl, '/chat/completions');
  const body = {
    model, messages, stream: true, temperature: 0.6,
    stream_options: { include_usage: true },   // 支持的服务商会回传 usage
  };
  let r;
  const doFetch = () => fetch(url, { method: 'POST', headers: apiHeaders(p), body: JSON.stringify(body), signal });
  try { r = await doFetch(); }
  catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new Error('请求失败 → ' + url + '\n原因：' + (e.message || e) + '\n' + fetchHint(url, e));
  }
  // 少数服务商不认 stream_options，回退重试一次
  if (!r.ok && (r.status === 400 || r.status === 422)) {
    delete body.stream_options;
    try { r = await doFetch(); } catch (e2) { if (e2 && e2.name === 'AbortError') throw e2; }
  }
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('HTTP ' + r.status + ' · ' + t.slice(0, 300)); }
  if (!r.body || !r.body.getReader) {
    const j = await r.json();
    const txt = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content || '' : '';
    if (onUsage && j.usage) onUsage(j.usage);
    if (onDelta) onDelta(txt);
    return txt;
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder('utf-8');
  let buf = '', full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n');
    buf = parts.pop();
    for (const line of parts) {
      const t = line.trim();
      if (!t || t.startsWith(':')) continue;
      const d = t.startsWith('data:') ? t.slice(5).trim() : t;
      if (!d || d === '[DONE]') continue;
      try {
        const j = JSON.parse(d);
        if (onUsage && j.usage) onUsage(j.usage);
        const ch = j.choices && j.choices[0];
        const c = ch && ch.delta ? ch.delta.content : (ch && ch.message ? ch.message.content : null);
        if (c) { full += c; if (onDelta) onDelta(c); }
      } catch (e) { /* 忽略分片 */ }
    }
  }
  return full;
}

/* ------------------------- 指令解析 ------------------------- */
const RE_CALL = /<call\s+agent\s*=\s*["']([^"']+)["']\s*>([\s\S]*?)<\/call>/g;
const RE_SANDBOX = /<sandbox(?:\s+lang\s*=\s*["']([^"']+)["'])?\s*>([\s\S]*?)<\/sandbox>/g;
const RE_SEARCH = /<search(?:\s+count\s*=\s*["'](\d+)["'])?\s*>([\s\S]*?)<\/search>/g;
const RE_GH = /<gh\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/gh>)/g;
const RE_DOC = /<doc\s+op\s*=\s*["']([^"']+)["']\s*([^>]*?)(?:\/>|>([\s\S]*?)<\/doc>)/g;

function extractDirectives(text) {
  const ops = []; let m;
  RE_CALL.lastIndex = 0;
  while ((m = RE_CALL.exec(text))) ops.push({ type: 'call', agent: m[1].trim(), task: m[2].trim(), index: m.index });
  RE_DOC.lastIndex = 0;
  while ((m = RE_DOC.exec(text))) {
    const attrs = m[2] || '';
    const title = (attrs.match(/title\s*=\s*["']([^"']*)["']/) || [])[1] || '';
    ops.push({ type: 'doc', op: (m[1] || '').toLowerCase(), title: title.trim(), content: (m[3] || '').trim(), index: m.index });
  }
  RE_SANDBOX.lastIndex = 0;
  while ((m = RE_SANDBOX.exec(text))) ops.push({ type: 'sandbox', lang: m[1] || 'python', code: m[2].trim(), index: m.index });
  RE_SEARCH.lastIndex = 0;
  while ((m = RE_SEARCH.exec(text))) ops.push({ type: 'search', count: m[1] ? +m[1] : 0, query: m[2].trim(), index: m.index });
  RE_GH.lastIndex = 0;
  while ((m = RE_GH.exec(text))) {
    const a = m[1] || '';
    const g = (k) => (a.match(new RegExp(k + '\\s*=\\s*["\']([^"\']*)["\']')) || [])[1] || '';
    ops.push({ type: 'gh', op: g('op') || 'list', repo: g('repo'), path: g('path'), name: g('name'), branch: g('branch') || 'main', message: g('message') || g('msg'), workflow: g('workflow'), priv: g('private'), content: (m[2] || '').trim(), index: m.index });
  }
  ops.sort((a, b) => a.index - b.index);
  return ops;
}
function stripDirectives(text) {
  RE_CALL.lastIndex = 0; RE_DOC.lastIndex = 0; RE_SANDBOX.lastIndex = 0;
  RE_SEARCH.lastIndex = 0; RE_GH.lastIndex = 0;
  return String(text)
    .replace(RE_CALL, '').replace(RE_DOC, '').replace(RE_SANDBOX, '')
    .replace(RE_SEARCH, '').replace(RE_GH, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

/* ------------------------- 提示词拼装 ------------------------- */
function teamRoster(excludeId) {
  const subs = S.agents.filter((a) => a.id !== excludeId);
  if (!subs.length) return '（当前没有其他 Agent）';
  return subs.map((a) => '- @' + a.roleName + ' · 名称「' + a.name + '」' + (a.isMain ? '（主控）' : '') + (a.desc ? ' · ' + a.desc : '')).join('\n');
}
function buildSystem(agent) {
  const parts = [agent.systemPrompt || ''];
  if (agent.tools && agent.tools.delegate) parts.push('\n\n【团队成员名录】\n' + teamRoster(agent.id) + '\n\n派发任务时使用 @角色名。');
  if (agent.skills && agent.skills.length) parts.push('\n\n【已装载 Skills】\n' + agent.skills.map((s) => '### ' + s.name + '\n' + (s.content || '').slice(0, 2200)).join('\n\n'));
  const ds = docsFor(agent.id);
  if (ds.length) {
    const rich = ds.map((d) => {
      const c = d.content || '';
      const head = '### ' + d.title + '（' + c.length + ' 字 · ' + relTime(d.updatedAt) + '）';
      if (c.length <= 1500) return head + '\n' + c;
      return head + '\n摘要：' + c.slice(0, 700) + '…';
    }).join('\n\n');
    parts.push('\n\n【团队文档库】以下文档你可以直接阅读，无需额外请求：\n\n' + rich +
      '\n\n若需要某篇的完整正文，用 <doc op="read" title="标题"/>；查看全部标题用 <doc op="list"/>。');
  }
  const rl = [];
  const sb = S.settings.sandbox || {};
  const se = S.settings.search || {};
  const gh = S.settings.github || {};
  if (sb.enabled && sb.endpoint) {
    rl.push('- 云沙盒（可执行代码）：\n  <sandbox>print("hello")</sandbox>\n  支持 Python（默认）与 shell，返回 stdout/stderr。');
  }
  if (se.enabled && se.provider !== 'none') {
    rl.push('- 联网检索：\n  <search>要查的关键词</search>\n  返回标题 / 链接 / 摘要，可用于查最新资料。');
  }
  if (gh.enabled && gh.token) {
    rl.push('- GitHub 仓库操作（当前账号 @' + (gh.user || '未知') + '）：\n' +
      '  <gh op="list" repo="owner/name"/>  列出仓库根目录文件\n' +
      '  <gh op="read" repo="owner/name" path="src/a.js"/>  读取文件\n' +
      '  <gh op="write" repo="owner/name" path="docs/x.md" message="docs: 更新">文件内容</gh>  写入并提交\n' +
      '  <gh op="create" name="my-repo" private="true">仓库描述</gh>  新建仓库\n' +
      '  <gh op="runs" repo="owner/name"/>  查看最近的 CI 运行\n' +
      '  <gh op="run" repo="owner/name" workflow="ci.yml"/>  触发 CI');
  }
  parts.push(rl.length
    ? '\n\n【可用工具】你可以直接使用以下工具，写指令即可，前端会执行并把结果回传：\n' + rl.join('\n')
    : '\n\n【可用工具】当前未启用任何工具（云沙盒 / 联网检索 / GitHub 均未配置或未开启）。');
  return parts.join('');
}
/* 上下文预算：中文约 1.6 字符/token，粗估够用（只用于闸门判断） */
function estTokens(str) { return Math.ceil(String(str || '').length / 1.6); }

function apiMessages(agent, topic, maxHist) {
  const sys = { role: 'system', content: buildSystem(agent) };
  const out = [sys];
  /* 被压缩掉的旧轮次用摘要代替，UI 里的完整历史不受影响 */
  if (topic && topic.summary) out.push({ role: 'system', content: '【更早对话的摘要（已压缩）】\n' + topic.summary });
  const hist = topic.messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && !m.compacted)
    .slice(-(maxHist || 24));
  return out.concat(hist.map((m) => ({ role: m.role, content: toApiContent(m) })));
}

function topicTokens(agent, topic) {
  let n = estTokens(buildSystem(agent)) + 8;
  if (topic.summary) n += estTokens(topic.summary);
  for (const m of topic.messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    if (m.compacted) continue;
    n += estTokens(toApiContent(m)) + 8;
  }
  return n;
}

/* 接近预算就把最旧的轮次交给模型压成摘要，并标记为已压缩（只影响下发给 API 的内容） */
async function compactTopic(agent, topic) {
  const cx = S.settings.ctx || (S.settings.ctx = { autoCompact: true, tokenBudget: 24000, keepMessages: 12 });
  if (cx.autoCompact === false) return false;
  const budget = Math.max(4000, Number(cx.tokenBudget) || 24000);
  if (topicTokens(agent, topic) < budget * 0.75) return false;
  const keep = Math.max(4, Number(cx.keepMessages) || 12);
  const older = topic.messages.filter((m) => (m.role === 'user' || m.role === 'assistant') && !m.compacted);
  if (older.length <= keep + 2) return false;
  const cut = older.slice(0, older.length - keep);
  const prev = topic.summary ? '【已有摘要】\n' + topic.summary + '\n\n' : '';
  const body = cut.map((m) => (m.role === 'user' ? '用户：' : '助手：') + String(m.content || '').slice(0, 1500)).join('\n\n');
  const sys = { role: 'system', content:
    '你是上下文压缩器。把给定对话压成一份供后续推理继续使用的摘要，必须保留：目标任务、已达成的结论、关键事实与数据（含数字、路径、ID）、未完成事项、用户的偏好与约束。删掉寒暄、过程叙述与重复内容。只输出摘要正文，不要客套。' };
  try {
    let acc = '';
    await streamChat(agent, [sys, { role: 'user', content: (prev + body).slice(0, 24000) }],
      (c) => { acc += c; }, ABORT ? ABORT.signal : undefined, null);
    if (!acc.trim()) return false;
    topic.summary = acc.trim();
    topic.summarizedCount = (topic.summarizedCount || 0) + cut.length;
    topic.compactedAt = now();
    cut.forEach((m) => { m.compacted = true; });
    save();
    return true;
  } catch (e) { return false; }
}

/* ------------------------- 子 Agent 回执 ------------------------- */
/* 子 Agent 的价值是「上下文隔离」：给它独立的小上下文，只回传结论 */
const RECEIPT_RULE = '\n\n【回执要求】你的输出会被回传给主控 Agent，请直接给结论：'
  + '① 结论（做了什么、结果如何）② 产物（文档标题 / 文件路径 / 关键数据）③ 引用来源。'
  + '不要复述思考过程，不要寒暄，不要重复任务描述。';
function buildReceipt(target, raw) {
  const txt = String(raw || '').trim();
  const limit = Math.max(300, Number((S.settings || {}).receiptLimit) || 1200);
  const docs = []; const re = /<doc[^>]*\btitle\s*=\s*["']([^"']+)["']/g;
  let m; while ((m = re.exec(txt))) docs.push(m[1]);
  const body = txt.length > limit
    ? txt.slice(0, limit) + '\n…（回执已截断，原始 ' + txt.length + ' 字）'
    : txt;
  return '【' + target.name + ' @' + target.roleName + ' 的回执】\n' + body
    + (docs.length ? '\n· 本次产出文档：' + Array.from(new Set(docs)).join('、') : '');
}

/* ------------------------- 连接诊断 -------------------------
 * 目标：把「Failed to fetch」这种零信息量的报错，变成能直接发给开发者定位的报告。 */
async function diagnoseProvider(p) {
  const out = []; const push = (s) => out.push(s);
  push('=== LUCIFER 连接诊断 ===');
  push('时间：' + new Date().toLocaleString());
  push('运行环境：' + location.protocol + '//' + location.host + '  origin=' + location.origin);
  push('配置名：' + ((p && p.name) || '(无)'));
  const rawBase = (p && p.baseUrl) || '';
  push('Base URL（原始）：' + (rawBase || '(空)'));
  const url = joinUrl(rawBase, '/models');
  push('实际请求 URL：' + (url || '(空)'));
  if (!url) { push(''); push('结论：地址为空，请先填 Base URL。'); return out.join('\n'); }
  if (!/^[a-z][a-z0-9+.\-]*:\/\//i.test(String(rawBase).trim())) {
    push('协议补全：原地址没写 http/https，已按规则判为 ' + url.split('://')[0] + '://（本机/局域网走 http，公网走 https）');
  }
  if (location.protocol === 'https:' && /^http:\/\//i.test(url)) {
    push('⚠️ 混合内容：页面是 https 却请求 http 接口 —— 浏览器会在发出前就拦掉，必然 Failed to fetch。');
    push('   解决：接口改 https，或改用桌面端 / 安卓端。');
  }
  push('鉴权头：' + (p && p.apiKey
    ? '已带 Bearer（前缀 ' + String(p.apiKey).slice(0, 4) + '…，长度 ' + p.apiKey.length + '）'
    : '未填 API Key'));
  push('');
  push('--- 探测 1/2：CORS 预检 OPTIONS ---');
  try {
    const r0 = await fetch(url, { method: 'OPTIONS', headers: {
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization,content-type',
    } });
    const acao = r0.headers.get('access-control-allow-origin');
    push('HTTP ' + r0.status + ' ｜ access-control-allow-origin: ' + (acao || '(缺失)'));
    push(acao ? '✓ 预检通过' : '✗ 服务端没返回 CORS 头 → 浏览器会直接拒绝，表现为 Failed to fetch（需要服务端开 CORS，或走桌面端）');
  } catch (e) {
    push('✗ OPTIONS 失败：' + (e.name || '') + ' ' + (e.message || e));
    push('  ' + fetchHint(url, e));
  }
  push('');
  push('--- 探测 2/2：GET ' + url + ' ---');
  try {
    const r = await fetch(url, { headers: apiHeaders(p, true) });
    const body = (await r.text()).slice(0, 400);
    push('HTTP ' + r.status + ' ｜ CORS: ' + (r.headers.get('access-control-allow-origin') || '(缺失)'));
    push('响应片段：' + body.replace(/\s+/g, ' ').slice(0, 220));
    if (r.ok) push('✓ 连通正常');
    else if (r.status === 401 || r.status === 403) push('→ 网络通的，是鉴权问题：检查 API Key 是否正确、是否有该权限');
    else if (r.status === 404) push('→ 网络通的，但路径不存在：确认 Base URL 是否多/少了一个 /v1');
    else push('→ 服务端返回 ' + r.status + '，把这段报告发给开发者');
  } catch (e) {
    push('✗ GET 失败：' + (e.name || '') + ' ' + (e.message || e));
    push('  ' + fetchHint(url, e));
    push('');
    push('结论：请求没到服务器。常见原因：');
    push('  ① 地址本身不可达 / 被网络墙（例如在国内直连 api.openai.com）');
    push('  ② 该服务不允许浏览器直连（未开 CORS）→ 换桌面端，或用你自己的服务器做代理');
    push('  ③ 在手机上填了 localhost / 局域网地址，但手机访问不到那台机器');
    push('  ④ 服务端把 OPTIONS 预检拦掉了');
  }
  push('');
  push('--- 备用方案 ---');
  push('拉取模型失败不影响使用：在「服务商与模型 → 编辑」里，直接把模型名填进「模型列表」输入框（逗号分隔）即可。');
  return out.join('\n');
}

/* ------------------------- 文档操作 ------------------------- */
function execDocOp(op) {
  const agentId = S.ui.activeAgentId;
  switch (op.op) {
    case 'create': {
      const ex = findDoc(op.title);
      if (ex) { ex.content = op.content; ex.updatedAt = now(); return '文档「' + op.title + '」已存在，已覆盖全文。'; }
      S.docs.unshift({ id: uid('d'), title: op.title || '未命名文档', content: op.content, ownerId: agentId, shared: true, updatedAt: now() });
      return '已创建文档「' + op.title + '」。';
    }
    case 'append': {
      const d = findDoc(op.title);
      if (!d) return '未找到文档「' + op.title + '」，请先用 create 创建。';
      d.content = (d.content || '') + '\n\n' + op.content; d.updatedAt = now();
      return '已向「' + op.title + '」追加内容（当前 ' + d.content.length + ' 字）。';
    }
    case 'update': {
      const d = findDoc(op.title);
      if (!d) return '未找到文档「' + op.title + '」。';
      d.content = op.content; d.updatedAt = now();
      return '已更新文档「' + op.title + '」。';
    }
    case 'read': {
      const d = findDoc(op.title);
      if (!d) return '未找到文档「' + op.title + '」。';
      return '【文档「' + d.title + '」正文】\n' + d.content;
    }
    case 'list':
      return '【文档列表】\n' + (S.docs.length ? S.docs.map((d) => '- ' + d.title + '（' + relTime(d.updatedAt) + '）').join('\n') : '（空）');
    case 'delete': {
      const d = findDoc(op.title);
      if (!d) return '未找到文档「' + op.title + '」。';
      S.docs = S.docs.filter((x) => x.id !== d.id);
      return '已删除文档「' + op.title + '」。';
    }
    default:
      return '不支持的文档操作：' + op.op;
  }
}

/* ------------------------- Skill：从 GitHub 拉取 ------------------------- */
function normalizeSkillUrl(input) {
  let u = String(input || '').trim();
  if (!u) return '';
  if (/^lobehub\.com\//i.test(u)) u = 'https://' + u;
  let m;
  if ((m = u.match(/^https?:\/\/lobehub\.com\/skills\/([^\/\s?#]+)/i))) return 'https://lobehub.com/skills/' + m[1] + '/skill.md';
  if ((m = u.match(/^https?:\/\/github\.com\/([^\/\s]+)\/([^\/\s]+)\/(?:tree|blob)\/([^\/\s]+)\/?(.*)$/i))) {
    const sub = m[4] ? m[4].replace(/\/+$/, '') + '/' : '';
    return 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' + m[3] + '/' + sub + 'SKILL.md';
  }
  if ((m = u.match(/^https?:\/\/github\.com\/([^\/\s]+)\/([^\/\s]+?)(?:\.git)?\/?$/i)))
    return 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/HEAD/SKILL.md';
  return u;
}
function parseSkill(text, source) {
  let name = '', desc = '', body = text;
  const m = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (m) {
    const fm = m[1]; body = text.slice(m[0].length);
    const g = (k) => { const r = fm.match(new RegExp('^' + k + '\\s*:\\s*(.+)$', 'mi')); return r ? r[1].trim().replace(/^["']|["']$/g, '') : ''; };
    name = g('name'); desc = g('description');
  }
  if (!name) {
    const h = body.match(/^#\s+(.+)$/m);
    name = (h ? h[1] : (source || '').split('/').pop() || 'skill').trim();
  }
  return { id: uid('sk'), name, desc, source, content: text, addedAt: now() };
}
async function fetchSkill(url) {
  const r = await fetch(url, { headers: { Accept: 'text/plain,*/*' } });
  if (!r.ok) throw new Error('HTTP ' + r.status + '（' + url + '）');
  const t = await r.text();
  if (/^\s*<(!doctype|html)/i.test(t)) throw new Error('拿到的是网页而不是 SKILL.md，请改用 raw 链接');
  return t;
}
