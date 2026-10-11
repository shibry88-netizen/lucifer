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
const PRESETS = [
  { id: 'deepseek', name: 'DeepSeek 深度求索', baseUrl: 'https://api.deepseek.com/v1', hint: '国内直连稳定' },
  { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', hint: 'glm-4.6 / glm-4-plus' },
  { id: 'mimo', name: '小米 MiMo', baseUrl: '', hint: '请填入你的 MiMo 接入地址' },
  { id: 'relay', name: '中转站 / 自建代理', baseUrl: '', hint: '兼容 OpenAI 协议即可，走 GPT 等海外模型' },
  { id: 'openai', name: 'OpenAI 官方', baseUrl: 'https://api.openai.com/v1', hint: '浏览器直连可能被 CORS 拦' },
  { id: 'moonshot', name: 'Moonshot / Kimi', baseUrl: 'https://api.moonshot.cn/v1', hint: '' },
  { id: 'dashscope', name: '通义千问 DashScope', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', hint: '' },
  { id: 'siliconflow', name: 'SiliconFlow 硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', hint: '' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', hint: '' },
  { id: 'ollama', name: 'Ollama（本地）', baseUrl: 'http://localhost:11434/v1', hint: '' },
  { id: 'lmstudio', name: 'LM Studio（本地）', baseUrl: 'http://localhost:1234/v1', hint: '' },
  { id: 'custom', name: '自定义地址', baseUrl: '', hint: '' },
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
      providers: [{ id: pid, name: 'DeepSeek 深度求索', baseUrl: 'https://api.deepseek.com/v1', apiKey: '', models: ['deepseek-chat', 'deepseek-reasoner'] }],
      activeProviderId: pid,
      defaultModel: 'deepseek-chat',
      sandbox: { endpoint: '', apiKey: '', enabled: false, provider: 'e2b', lastOk: 0, note: '' },
      search: { provider: 'none', endpoint: '', enabled: false, count: 5, lastOk: 0 },
      github: { token: '', user: '', enabled: false, lastOk: 0, defaultPrivate: true },
      maxRounds: 6,
      theme: {
        mode: 'dark', preset: 'indigo', h: 248, s: '100%', l: '71%',
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
    const v = localStorage.getItem(KEY);
    if (v) return v;
    for (const k of LEGACY_KEYS) { const o = localStorage.getItem(k); if (o) return o; }
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
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

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
function joinUrl(base, path) {
  if (!base) return '';
  let b = String(base).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(b)) b = 'https://' + b;
  return b + path;
}
function apiHeaders(p) {
  const h = { 'Content-Type': 'application/json' };
  if (p.apiKey) h['Authorization'] = 'Bearer ' + p.apiKey;
  return h;
}
async function pullModels(p) {
  const url = joinUrl(p.baseUrl, '/models');
  if (!url) throw new Error('未填写 API 地址');
  const r = await fetch(url, { headers: apiHeaders(p) });
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
    throw new Error('网络请求失败：' + (e.message || e) + '（可能是 CORS 或地址不可达）');
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
function apiMessages(agent, topic, maxHist) {
  const sys = { role: 'system', content: buildSystem(agent) };
  const hist = topic.messages.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-(maxHist || 24));
  return [sys].concat(hist.map((m) => ({ role: m.role, content: toApiContent(m) })));
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


/* =======================================================================
 * LUCIFER · 多智能体中枢  ——  渲染与交互（Part 2 / 5）
 * ===================================================================== */

/* ------------------------- 头像 ------------------------- */
function avatarHTML(a, cls) {
  const v = (a && a.avatar) || '🤖';
  const c = 'av ' + (cls || '');
  if (/^(data:|https?:|blob:)/.test(v)) return '<img class="' + c + '" src="' + esc(v) + '" alt="">';
  return '<span class="' + c + '">' + esc(v) + '</span>';
}

/* ------------------------- 外壳 ------------------------- */
function renderShell() {
  const a = curAgent();
  const m = modelFor(a);
  const p = providerFor(a);
  const v = S.ui.view;
  const right = (v === 'chat' ? '' : '<button class="btn sm keep" data-act="goto-chat">← 返回对话</button>') +
    '<button class="btn sm keep conv-btn" data-act="conv-menu" aria-expanded="false" title="会话列表">会话<span class="cnt">' + S.topics.filter((t) => t.agentId === a.id).length + '</span></button>' +
    '<button class="agent-menu-btn" data-act="agent-menu" aria-expanded="false" title="' + esc(a.name) + '">' +
      avatarHTML(a, 'sm') + '<span class="nm">' + esc(a.name) + '</span><span class="chev">⌄</span>' +
    '</button>';

  document.getElementById('app').innerHTML =
  '<aside class="side' + (S.ui.sideOpen ? ' open' : '') + '">' +
    '<div class="side-head">' +
      '<div class="logo">' + STAR_SVG + '</div>' +
      '<div class="brand"><b class="brand-text">LUCIFER</b><span>多智能体中枢 ' + VERSION + '</span></div>' +
    '</div>' +
    '<div class="side-search"><input id="agentSearch" placeholder="搜索会话 / Agent…" value="' + esc(S.ui._q || '') + '"></div>' +
    '<div class="side-scroll">' +
      '<div class="side-label">Agents <button data-act="addagent" title="新建 Agent">＋</button></div><div id="agentList"></div>' +
    '</div>' +
    '<div class="side-foot">' +
      '<button data-act="goto-search"><span class="ico">⌕</span><span>历史检索</span></button>' +
      '<button data-act="goto-docs"><span class="ico">▤</span><span>文档库</span></button>' +
      '<button data-act="goto-github"><span class="ico">⑂</span><span>GitHub</span>' + (S.settings.github.user ? '<span class="badge">@' + esc(S.settings.github.user) + '</span>' : '') + '</button>' +
      '<button data-act="goto-settings"><span class="ico">⚙</span><span>设置</span></button>' +
    '</div>' +
  '</aside>' +
  '<div class="side-mask" data-act="close-side"></div>' +
  '<main class="main">' +
    '<header class="top">' +
      '<button class="icon-btn burger" data-act="nav-menu" aria-expanded="false" title="菜单"><i></i><i></i><i></i></button>' +
      avatarHTML(a, 'lg' + (isMain(a) ? ' main-ring' : '')) +
      '<div class="top-info">' +
        '<div class="t1"><b>' + esc(a.name) + '</b><span class="tag ' + (isMain(a) ? 'main' : '') + '">@' + esc(a.roleName) + '</span></div>' +
        '<div class="t2">' + esc(m || '未选择模型') + ' · ' + esc(p ? p.name : '无 API 配置') + '</div>' +
      '</div>' +
      '<div class="spacer"></div>' +
      '<div class="top-actions">' + right + '</div>' +
    '</header>' +
    '<div class="body" id="body"></div>' +
    '<nav class="tabbar" id="tabbar"></nav>' +
  '</main>';

  const app = document.getElementById('app');
  if (S.ui.collapsed) app.classList.add('collapsed');
  if (S.ui.sideOpen) app.classList.add('side-open');
  renderAgentLists();
  renderTabbar();
  renderView();
}

function renderAgentLists() {
  const q = (S.ui._q || '').toLowerCase();
  const f = (a) => !q || a.name.toLowerCase().includes(q) || a.roleName.toLowerCase().includes(q);
  const item = (a) =>
    '<div class="agent-item' + (a.id === S.ui.activeAgentId ? ' on' : '') + (a.isMain ? ' is-main' : '') + '" data-agent="' + a.id + '">' +
      avatarHTML(a) +
      '<div class="meta"><div class="nm">' + esc(a.name) + (a.isMain ? ' ✦' : '') + '</div>' +
      '<div class="rl">@' + esc(a.roleName) + ((a.skills && a.skills.length) ? ' · ' + a.skills.length + ' skill' : '') + '</div></div>' +
    '</div>';
  const al = $('#agentList');
  const all = S.agents.filter(f).slice().sort((x, y) => (y.isMain ? 1 : 0) - (x.isMain ? 1 : 0));
  if (al) al.innerHTML = all.map(item).join('') || '<div class="kv pad">还没有 Agent，点上方 ＋ 新建</div>';
}

/* ------------------------- 视图分发 ------------------------- */
function renderView() {
  const v = S.ui.view;
  if (v === 'docs') renderDocs();
  else if (v === 'settings') renderSettings();
  else if (v === 'agent') renderAgentEdit();
  else if (v === 'providers') renderProviders();
  else if (v === 'search') renderSearch();
  else if (v === 'github') renderGithub();
  else renderChat();
  const tb = document.getElementById('tabbar');
  if (tb) Array.from(tb.querySelectorAll('.tab')).forEach((x) => x.classList.toggle('on', x.dataset.tab === (v === 'chat' ? 'chat' : v)));
}

/* ------------------------- 消息渲染 ------------------------- */
function msgHTML(m, agent) {
  if (m.role === 'user') {
    if (m._synthetic) {
      return '<div class="msg-sys"><div class="op">' +
        '<div class="oh"><span class="oi">⟲</span><span class="ttl">系统回执（已回传给 ' + esc(agent.name) + '）</span>' +
        '<span class="tag">' + (m.content || '').length + ' 字</span><span class="chev">⌄</span></div>' +
        '<div class="ob"><div class="prose">' + mdRender(m.content) + '</div></div></div></div>';
    }
    return '<div class="msg user">' + avatarHTML({ avatar: '🙋' }) +
      '<div class="bd">' + mediaHTML(m) + '<div class="prose">' + mdRender(m.content) + '</div></div></div>';
  }
  const ops = (m.ops || []).map((o, i) => opHTML(o, i)).join('');
  const dchips = docChipsFor(m);
  return '<div class="msg assistant">' + avatarHTML(agent, isMain(agent) ? 'main-ring' : '') + '<div class="bd">' +
    '<div class="hd"><b>' + esc(agent.name) + '</b><span class="tag">@' + esc(agent.roleName) + '</span>' +
    (m.round > 1 ? '<span class="tag">第 ' + m.round + ' 轮</span>' : '') + '</div>' +
    '<div class="prose">' + (m.content ? mdRender(m.content) : '<span class="dim">（无正文输出）</span>') + '</div>' +
    (dchips ? '<div style="margin-top:10px">' + dchips + '</div>' : '') +
    (ops ? '<div class="ops">' + ops + '</div>' : '') + '</div></div>';
}
function opHTML(o, i) {
  if (o.type === 'call') {
    const sub = S.agents.find((x) => x.roleName === String(o.agent).replace(/^@/, ''));
    const st = o.status === 'running' ? '<span class="tag warn">进行中</span>'
      : o.status === 'error' ? '<span class="tag err">失败</span>'
      : '<span class="tag ok">已完成</span>';
    return '<div class="op' + (o.status === 'running' || o.status === 'error' ? ' open' : '') + '" data-op="' + i + '">' +
      '<div class="oh"><span class="oi">↗</span><span class="ttl">派发 → ' + esc(o.agent) +
      (sub && sub.name !== String(o.agent).replace(/^@/, '') ? ' · ' + esc(sub.name) : '') + '</span>' + st + '<span class="chev">⌄</span></div>' +
      '<div class="ob"><div class="kv">任务</div><div class="prose">' + mdRender(o.task) + '</div>' +
      '<div class="kv mt">回执</div><div class="prose">' + (o.result ? mdRender(o.result) : '<span class="spin"></span>') + '</div></div></div>';
  }
  if (o.type === 'sandbox') return toolOpHTML(i, '⌘', '沙盒执行 · ' + esc(o.lang || 'python'),
    '```' + (o.lang || 'python') + '\n' + (o.code || '').slice(0, 2000) + '\n```\n\n**输出**\n' + (o.result || '_执行中…_'), o);
  if (o.type === 'search') return toolOpHTML(i, '⌕', '联网检索 · ' + esc(o.query), o.result || '', o);
  if (o.type === 'gh') return toolOpHTML(i, '⑂', 'GitHub · ' + esc(o.op) + (o.repo ? ' ' + esc(o.repo) : ''), o.result || (o.content || '').slice(0, 800), o);
  const label = ({ create: '创建', append: '追加', update: '更新', read: '读取', list: '列举', delete: '删除' })[o.op] || o.op;
  const doc = o.title ? findDoc(o.title) : null;
  const openBtn = doc
    ? '<button class="btn sm" style="margin-top:10px" data-act="viewdoc" data-id="' + doc.id + '">在对话内查看全文</button>'
    : '';
  return '<div class="op" data-op="' + i + '">' +
    '<div class="oh"><span class="oi">▤</span><span class="ttl">文档 · ' + esc(label) + (o.title ? '「' + esc(o.title) + '」' : '') + '</span>' +
    '<span class="tag ok">已执行</span><span class="chev">⌄</span></div>' +
    '<div class="ob"><div class="prose">' + mdRender((o.result || '').slice(0, 4000)) + '</div>' + openBtn + '</div></div>';
}

/* ------------------------- 统计气泡 ------------------------- */
function statsBubbleHTML(topic) {
  const st = topic.stats || blankStats();
  const ags = Object.keys(st.agents || {}).map((k) => st.agents[k]);
  const open = !!S.ui.statsOpen;
  const chips = ags.length
    ? ags.map((a) =>
        '<span class="bub-chip">' + avatarHTML({ avatar: a.avatar }, 'xs') +
        '<b>' + esc(a.name) + '</b><i>' + a.calls + ' 次 · ' + fmtNum(a.tokens) + '</i></span>').join('')
    : '<span class="kv">本次对话尚未调用 Agent</span>';
  return '<div class="bubble glass' + (open ? ' open' : '') + '" id="statsBubble">' +
    '<button class="bub-head" data-act="toggle-stats">' +
      '<span class="bub-orb"></span>' +
      '<span class="bub-mini">本次对话 · <b>' + fmtNum(st.totalTokens) + '</b> tokens</span>' +
      '<span class="bub-chev">⌄</span>' +
    '</button>' +
    '<div class="bub-body"><div class="bub-inner">' +
      '<div class="bub-lbl">参与 Agent <span class="kv">' + ags.length + ' 个</span></div>' +
      '<div class="bub-agents">' + chips + '</div>' +
      '<div class="bub-grid">' +
        '<div class="bub-stat"><b>' + fmtNum(st.totalTokens) + '</b><span>总 tokens' + (st.estimated ? ' · 含估算' : '') + '</span></div>' +
        '<div class="bub-stat"><b>' + st.requests + '</b><span>请求次数</span></div>' +
        '<div class="bub-stat"><b>' + fmtNum(st.promptTokens) + '</b><span>输入 tokens</span></div>' +
        '<div class="bub-stat"><b>' + fmtNum(st.completionTokens) + '</b><span>输出 tokens</span></div>' +
      '</div>' +
      '<div class="bub-foot"><span>累计耗时 ' + ((st.ms || 0) / 1000).toFixed(1) + 's</span><span>' + (st.lastAt ? relTime(st.lastAt) : '—') + '</span></div>' +
    '</div></div></div>';
}
function refreshBubble() {
  const old = $('#statsBubble');
  if (!old) return;
  const topic = ensureTopic(curAgent().id);
  const tmp = document.createElement('div');
  tmp.innerHTML = statsBubbleHTML(topic);
  old.replaceWith(tmp.firstElementChild);
}

/* ------------------------- 对话视图 ------------------------- */
function renderChat() {
  const a = curAgent();
  const topic = ensureTopic(a.id);
  const msgs = topic.messages;
  const inner = msgs.length ? msgs.map((m) => msgHTML(m, a)).join('') : welcomeHTML(a);
  $('#body').innerHTML =
    '<div class="scroll" id="msgs"><div class="msgs">' + inner + '</div></div>' +
    '<div class="composer"><div class="composer-in">' +
      '<div class="composer-meta">' + statsBubbleHTML(topic) + modelPillHTML() + '</div>' +
      pendingHTML() +
      '<div class="cbox glass">' +
        '<textarea id="input" rows="1" placeholder="给 ' + esc(a.name) + ' 发消息…"></textarea>' +
        '<div class="crow">' +
          '<button class="icon-btn" data-act="attach" title="添加图片 / 文件">⊕</button>' +
          '<button class="icon-btn' + (S.settings.sandbox.enabled ? ' on' : '') + '" data-act="evac" title="召集全员协作">⚡</button>' +
          '<button class="icon-btn" data-act="mention" title="提及 Agent">@</button>' +
          '<button class="send" data-act="send" title="发送">➤</button>' +
        '</div>' +
      '</div>' +
      '<div class="drop-hint">松开即添加图片或文件</div>' +
      '<input type="file" id="fileInput" multiple hidden accept="image/*,.txt,.md,.json,.js,.ts,.py,.html,.css,.csv,.yml,.yaml,.log">' +
      '<div class="hint">' +
        '<span>Enter 发送 · Shift+Enter 换行</span>' +
        '<button class="hint-toggle" data-act="toggle-syntax">指令语法 <i>⌃</i></button>' +
        '<span class="hint-syn">' +
          (a.tools.delegate ? '<span>派发 <code>&lt;call agent="@角色名"&gt;…&lt;/call&gt;</code></span>' : '') +
          (a.tools.docs ? '<span>文档 <code>&lt;doc op="create" title="…"&gt;…&lt;/doc&gt;</code></span>' : '') +
        '</span>' +
        '<span class="hint-syn">' +
          (S.settings.sandbox.enabled ? '<span>沙盒 <code>&lt;sandbox&gt;…&lt;/sandbox&gt;</code></span>' : '') +
          (S.settings.search.enabled ? '<span>检索 <code>&lt;search&gt;…&lt;/search&gt;</code></span>' : '') +
          (S.settings.github.enabled ? '<span>GitHub <code>&lt;gh op="write" …&gt;</code></span>' : '') +
        '</span>' +
        '<span style="margin-left:auto">' +
          (S.settings.sandbox.enabled ? '沙盒✓' : '沙盒✗') + ' · ' +
          (S.settings.search.enabled ? '检索✓' : '检索✗') + ' · ' +
          (S.settings.github.enabled ? 'GitHub✓' : 'GitHub✗') +
        '</span>' +
      '</div>' +
    '</div></div>';
  bindChat();
  const sc = $('#msgs'); if (sc) sc.scrollTop = sc.scrollHeight;
}

function welcomeHTML(a) {
  return '<div class="welcome"><h1>' + esc(a.name) + ' 待命中</h1>' +
    '<p>' + esc(a.desc || (isMain(a) ? '整个团队由我调度。给我一个目标，我来拆解、派发、汇总，并沉淀成文档。' : '直接说需求，我来处理。')) + '</p>' +
    '<div class="cards">' +
      '<div class="wcard glass" data-fill="帮我做一个本周工作计划，拆成 3 个子任务派给团队，并把结果写成一份文档。"><b>让主控调度团队</b><span>体验「拆解 → 派发 → 汇总 → 沉淀文档」全流程</span></div>' +
      '<div class="wcard glass" data-fill="列出当前所有文档。"><b>查看文档库</b><span>Agent 之间靠文档交接</span></div>' +
      '<div class="wcard glass" data-fill="介绍一下你的团队成员和各自擅长的领域。"><b>团队成员</b><span>看看有哪些角色可被调度</span></div>' +
      '<div class="wcard glass" data-act="goto-settings"><b>配置 API / 模型</b><span>填写地址、拉取可用模型、选默认模型</span></div>' +
    '</div></div>';
}

function bindChat() {
  const ta = $('#input');
  if (!ta) return;
  ta.value = S.ui.drafting || '';
  autoGrow(ta);
  ta.addEventListener('input', () => { S.ui.drafting = ta.value; autoGrow(ta); hideMention(); });
  ta.addEventListener('paste', (ev) => {
    const files = Array.from((ev.clipboardData && ev.clipboardData.files) || []);
    if (files.length) { ev.preventDefault(); addFiles(files); }
  });
  const fi = $('#fileInput');
  if (fi) fi.addEventListener('change', () => { addFiles(Array.from(fi.files || [])); fi.value = ''; });
  const box = document.querySelector('.composer');
  if (box && !box.dataset.dnd) {
    box.dataset.dnd = '1';
    box.addEventListener('dragover', (ev) => { ev.preventDefault(); box.classList.add('dragging'); });
    box.addEventListener('dragleave', () => box.classList.remove('dragging'));
    box.addEventListener('drop', (ev) => {
      ev.preventDefault(); box.classList.remove('dragging');
      addFiles(Array.from((ev.dataTransfer && ev.dataTransfer.files) || []));
    });
  }
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); doSend(); }
  });
}
function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 180) + 'px'; }

function showMention() {
  hideMention();
  const box = $('.cbox'); if (!box) return;
  const pop = document.createElement('div');
  pop.className = 'mention-pop glass'; pop.id = 'mentionPop';
  pop.innerHTML = S.agents.map((a) =>
    '<div class="mi" data-mention="@' + esc(a.roleName) + '">' + avatarHTML(a, 'sm') +
    '<div><div class="mi-n">' + esc(a.name) + '</div><div class="kv">@' + esc(a.roleName) + '</div></div></div>').join('');
  box.parentElement.appendChild(pop);
  pop.addEventListener('click', (e) => {
    const mi = e.target.closest('.mi'); if (!mi) return;
    const ta = $('#input');
    ta.value = (ta.value ? ta.value.replace(/\s*$/, ' ') : '') + mi.dataset.mention + ' ';
    S.ui.drafting = ta.value; ta.focus(); hideMention();
  });
}
function hideMention() { const p = $('#mentionPop'); if (p) p.remove(); }

/* ------------------------- 对话主流程 ------------------------- */
async function doSend() {
  if (RUNNING) { stopRun(); return; }
  const ta = $('#input'); if (!ta) return;
  const text = ta.value.trim(); if (!text) return;
  ta.value = ''; S.ui.drafting = '';
  hideMention();
  await runTurn(text);
}
function stopRun() { if (ABORT) { try { ABORT.abort(); } catch (e) {} } RUNNING = false; toast('已停止'); }

function appendTurn(html) {
  const wrap = $('#msgs .msgs');
  if (!wrap) return null;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const el = tmp.firstElementChild;
  wrap.appendChild(el);
  scrollDown();
  return el;
}
function scrollDown() { const sc = $('#msgs'); if (sc) sc.scrollTop = sc.scrollHeight; }
function setSendState(running) {
  const b = $('.send'); if (!b) return;
  b.classList.toggle('stop', running);
  b.textContent = running ? '■' : '➤';
}

async function runTurn(userText) {
  const agent = curAgent();
  const topic = ensureTopic(agent.id);
  if (topic.messages.length === 0) topic.title = userText.slice(0, 18);
  const atts = (S.ui.pending || []).slice();
  S.ui.pending = [];
  topic.messages.push({ role: 'user', content: userText, ts: now(), by: agent.id, attachments: atts });
  save();
  renderChat();

  RUNNING = true; ABORT = new AbortController();
  setSendState(true);
  const maxRounds = S.settings.maxRounds || 6;
  try {
    for (let round = 1; round <= maxRounds; round++) {
      // 先取上下文（此时不含本轮的空占位），再落一条助手消息占位
      const msgs = apiMessages(agent, topic);
      const msg = { role: 'assistant', content: '', ops: [], ts: now(), round, by: agent.id };
      topic.messages.push(msg);
      const el = appendTurn(msgHTML(agent, msg));
      if (!el) break;
      const bodyEl = el.querySelector('.prose');

      let usage = null;
      const t0 = now();
      let full = '', last = 0;
      full = await streamChat(agent, msgs, (c) => {
        full += c;
        const t = now();
        if (t - last > 60) { last = t; bodyEl.innerHTML = mdRender(stripDirectives(full)) + '<span class="caret">▍</span>'; scrollDown(); }
      }, ABORT.signal, (u) => { usage = u; });
      const dt = now() - t0;

      msg.raw = full;
      msg.content = stripDirectives(full);
      msg.ms = dt;
      bodyEl.innerHTML = mdRender(msg.content || '（无正文输出）');
      bumpStats(topic, agent, usage, msgs, full, dt);
      refreshBubble();
      save();

      const ops = extractDirectives(full);
      if (!ops.length) break;

      msg.ops = ops;
      const opsEl = document.createElement('div');
      opsEl.className = 'ops';
      el.querySelector('.bd').appendChild(opsEl);
      const results = [];

      for (let i = 0; i < ops.length; i++) {
        const o = ops[i];
        if (o.type !== 'call') {
          let r;
          try { r = await execToolOp(o); o.status = 'done'; }
          catch (err) { r = '执行失败：' + (err.message || err); o.status = 'error'; }
          o.result = r;
          opsEl.innerHTML = msg.ops.map((x, j) => opHTML(x, j)).join('');
          const tag = o.type === 'doc' ? '文档 ' + o.op + (o.title ? '「' + o.title + '」' : '')
            : o.type === 'sandbox' ? '沙盒执行'
            : o.type === 'search' ? '联网检索「' + o.query + '」'
            : o.type === 'gh' ? 'GitHub ' + o.op + (o.repo ? ' ' + o.repo : '')
            : o.type;
          results.push('【工具执行结果 · ' + tag + '】\n' + String(r).slice(0, 6000));
          save();
        } else {
          const key = String(o.agent).replace(/^@/, '');
          const target = S.agents.find((x) => x.roleName === key) || S.agents.find((x) => x.name === key);
          if (!target) {
            o.status = 'error'; o.result = '未找到该 Agent（请检查 @角色名）。';
            opsEl.innerHTML = msg.ops.map((x, j) => opHTML(x, j)).join('');
            results.push('【派发失败】' + o.agent + ' 不存在。');
            continue;
          }
          o.status = 'running';
          opsEl.innerHTML = msg.ops.map((x, j) => opHTML(x, j)).join('');
          scrollDown();
          /* 子 Agent 被主控调用时：前端不展示它的对话过程，只把结果回传给主控 */
          try {
            const subMsgs = [{ role: 'system', content: buildSystem(target) }, { role: 'user', content: o.task }];
            let acc = '', subUsage = null;
            const t1 = now();
            const r = await streamChat(target, subMsgs, (c) => { acc += c; }, ABORT.signal, (u) => { subUsage = u; });
            const dt1 = now() - t1;
            o.result = stripDirectives(r); o.status = 'done';
            bumpStats(topic, target, subUsage, subMsgs, r, dt1);
            refreshBubble();
            results.push('【' + target.name + ' @' + target.roleName + ' 的回执】\n' + o.result);
          } catch (e) {
            o.status = 'error'; o.result = '调用失败：' + (e.message || e);
            results.push('【' + target.name + ' 调用失败】' + (e.message || e));
          }
          opsEl.innerHTML = msg.ops.map((x, j) => opHTML(x, j)).join('');
          scrollDown();
        }
      }
      save();
      if (!results.length) break;
      if (round === maxRounds) {
        topic.messages.push({ role: 'user', content: '（系统）已达最大轮次，请直接给出最终答复。', _synthetic: true });
        break;
      }
      topic.messages.push({ role: 'user', content: '（系统回执，请据此继续；若已可收尾请直接输出最终答复）\n\n' + results.join('\n\n'), _synthetic: true });
    }
  } catch (e) {
    if (e && e.name === 'AbortError') {
      topic.messages.push({ role: 'assistant', content: '_已中止。_', ops: [], by: agent.id });
    } else {
      topic.messages.push({
        role: 'assistant', ops: [], by: agent.id,
        content: '⚠️ **调用失败**：' + (e.message || e) +
          '\n\n> 排查：API 地址是否正确、Key 是否有效、是否已拉取并选择模型。浏览器直连第三方接口若被 CORS 拦截，可换用支持浏览器直连的服务商，或自建一个本地代理。',
      });
      toast('调用失败：' + (e.message || e), 'err');
    }
  } finally {
    RUNNING = false; ABORT = null; save();
    renderChat();
  }
}

/* ------------------------- 文档库 ------------------------- */
function renderDocs() {
  if (!S.docs.length) S.docs.push({ id: uid('d'), title: '未命名文档', content: '', ownerId: 'main', shared: true, updatedAt: now() });
  if (!S.ui.activeDocId || !findDoc(S.ui.activeDocId)) S.ui.activeDocId = S.docs[0].id;
  const d = findDoc(S.ui.activeDocId);
  const list = S.docs.map((x) => {
    const o = getAgent(x.ownerId);
    return '<div class="di' + (x.id === d.id ? ' on' : '') + '" data-doc="' + x.id + '">' +
      '<div class="t">' + esc(x.title) + '</div>' +
      '<div class="m">' + (o ? esc(o.name) : '共享') + ' · ' + relTime(x.updatedAt) + '</div></div>';
  }).join('');
  $('#body').innerHTML =
  '<div class="docs">' +
    '<div class="docs-list glass">' +
      '<button class="btn pri full" data-act="newdoc">＋ 新建文档</button>' + list +
    '</div>' +
    '<div class="doc-edit">' +
      '<div class="doc-bar glass">' +
        '<input id="docTitle" value="' + esc(d.title) + '" placeholder="文档标题">' +
        '<span class="kv" id="docMeta">' + d.content.length + ' 字 · ' + relTime(d.updatedAt) + '</span>' +
        '<button class="btn sm" data-act="saveDoc">保存</button>' +
        '<button class="btn sm danger" data-act="delDoc">删除</button>' +
      '</div>' +
      '<div class="doc-area"><textarea id="docBody" placeholder="写点什么…（支持 Markdown）">' + esc(d.content) + '</textarea></div>' +
    '</div>' +
  '</div>';
  const ta = $('#docBody');
  if (ta) {
    ta.addEventListener('input', () => { const m = $('#docMeta'); if (m) m.textContent = ta.value.length + ' 字 · 未保存'; });
    ta.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveDoc(); } });
  }
}
function saveDoc() {
  const d = findDoc(S.ui.activeDocId); if (!d) return;
  const t = $('#docTitle'), b = $('#docBody');
  if (t) d.title = t.value.trim() || '未命名文档';
  if (b) d.content = b.value;
  d.updatedAt = now(); save();
  toast('已保存「' + d.title + '」', 'ok');
  renderDocs();
}

/* ------------------------- Agent 设置 ------------------------- */
function renderAgentEdit() {
  const a = getAgent(S.ui.editAgentId) || curAgent();
  const tab = S.ui.editTab || 'base';
  const tb = (k, t) => '<button class="' + (tab === k ? 'on' : '') + '" data-tab="' + k + '">' + t + '</button>';
  $('#body').innerHTML =
  '<div class="scroll"><div class="page">' +
    '<h2>Agent 设置 · ' + esc(a.name) + '</h2>' +
    '<div class="sub">角色名用于主模型识别与派发指令 —— <code>@' + esc(a.roleName) + '</code></div>' +
    '<div class="tabs">' + tb('base', '① 基础信息') + tb('skills', '② Skills') + tb('ability', '③ 模型与能力') + '</div>' +
    '<div id="tabBody"></div>' +
    '<div class="row mt">' +
      '<button class="btn pri fix" data-act="saveAgent">保存设置</button>' +
      '<button class="btn fix" data-act="goto-chat">返回对话</button>' +
      (a.isMain ? '' : '<button class="btn danger fix" data-act="delAgent">删除该 Agent</button>') +
    '</div>' +
  '</div></div>';
  renderTab(a, tab);
}

function renderTab(a, tab) {
  const el = $('#tabBody');
  if (tab === 'base') {
    const isImg = /^(data:|https?:)/.test(a.avatar || '');
    el.innerHTML =
    '<div class="card glass"><h3>头像</h3>' +
      '<div class="row" style="align-items:center">' + avatarHTML(a, 'lg') +
        '<div class="fix"><button class="btn sm" data-act="uploadAvatar">上传图片</button></div>' +
        '<div class="fix"><button class="btn sm" data-act="clearAvatar">用 Emoji</button></div>' +
        '<input type="file" id="avFile" accept="image/*" hidden>' +
      '</div>' +
      '<div class="fld mt"><label>或填写图片 URL</label><input id="fAvatarUrl" placeholder="https://…（留空则用下方 Emoji）" value="' + (isImg ? esc(a.avatar) : '') + '"></div>' +
      '<div class="emoji-grid" id="emojiGrid">' + EMOJIS.map((e) =>
        '<button data-emoji="' + e + '" class="' + (!isImg && a.avatar === e ? 'on' : '') + '">' + e + '</button>').join('') + '</div>' +
    '</div>' +
    '<div class="card glass"><h3>身份</h3>' +
      '<div class="row">' +
        '<div class="fld"><label>名字</label><input id="fName" value="' + esc(a.name) + '" placeholder="例如：调研员"></div>' +
        '<div class="fld"><label>角色名（主模型识别用）</label><input id="fRole" value="' + esc(a.roleName) + '" placeholder="例如：researcher"></div>' +
      '</div>' +
      '<div class="fld"><label>一句话简介</label><input id="fDesc" value="' + esc(a.desc || '') + '" placeholder="擅长做什么，供主控判断该派什么活"></div>' +
    '</div>' +
    '<div class="card glass"><h3>系统提示词</h3>' +
      '<div class="fld"><textarea id="fPrompt" rows="10" placeholder="定义这个 Agent 的身份、能力、输出规范">' + esc(a.systemPrompt || '') + '</textarea>' +
      '<div class="hint2">' + (a.isMain ? '主控提示词里已内置派发 / 文档指令协议，改动前建议先看看默认版本。' : '建议写清楚：专长、输出格式、边界。') + '</div></div>' +
      (a.isMain ? '<button class="btn sm" data-act="resetMainPrompt">恢复默认总控提示词</button>' : '') +
    '</div>';
  } else if (tab === 'skills') {
    const sk = a.skills || [];
    el.innerHTML =
    '<div class="card glass"><h3>从 GitHub 拉取 Skill</h3>' +
      '<div class="fld"><label>仓库 / 文件地址</label>' +
        '<input id="fSkillUrl" placeholder="https://github.com/owner/repo 或直接粘贴 SKILL.md 的 raw 链接">' +
        '<div class="hint2">支持：GitHub 仓库根目录（自动找 SKILL.md）、<code>github.com/o/r/tree/branch/path</code>、任意 <code>raw.githubusercontent.com</code> 链接、lobehub skill 页面链接。</div>' +
      '</div>' +
      '<button class="btn pri" data-act="pullSkill">拉取并装载</button>' +
    '</div>' +
    '<div class="card glass"><h3>已装载 Skills <span class="tag">' + sk.length + '</span></h3>' +
      (sk.length ? sk.map((s, i) =>
        '<div class="op"><div class="oh" data-skill="' + i + '"><span class="oi">◆</span><span class="ttl">' + esc(s.name) + '</span>' +
        '<span class="tag">' + (s.content || '').length + ' 字</span><button class="btn sm danger fix" data-delskill="' + i + '">移除</button><span class="chev">⌄</span></div>' +
        '<div class="ob"><div class="kv">' + esc(s.source || '') + '</div><div class="prose">' + mdRender((s.content || '').slice(0, 1600)) + '</div></div></div>').join('')
        : '<div class="empty">还没有装载 Skill。Skill 内容会被注入该 Agent 的系统提示词。</div>') +
    '</div>';
  } else {
    const opts = S.settings.providers.map((p) => '<option value="' + p.id + '"' + (a.providerId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('');
    const p = providerFor(a);
    const models = (p && p.models) || [];
    el.innerHTML =
    '<div class="card glass"><h3>模型</h3>' +
      '<div class="row">' +
        '<div class="fld"><label>API 配置</label><select id="fProv"><option value="">（跟随全局）</option>' + opts + '</select></div>' +
        '<div class="fld"><label>模型</label><select id="fModel"><option value="">（跟随全局：' + esc(S.settings.defaultModel || '未设置') + '）</option>' +
          models.map((m) => '<option value="' + esc(m) + '"' + (a.model === m ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select>' +
          '<div class="hint2">' + (models.length ? '' : '该 API 配置下还没有模型，先去「设置 → API」拉取。') + '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="card glass"><h3>能力开关</h3>' +
      sw('任务派发（多 Agent 协作）', '允许该 Agent 用 &lt;call&gt; 指令调度其他 Agent', a.tools.delegate, 'delegate') +
      sw('文档读写', '允许用 &lt;doc&gt; 指令创建 / 读取 / 修改文档（交接用）', a.tools.docs, 'docs') +
      sw('云沙盒', S.settings.sandbox.enabled ? '已配置：' + esc(S.settings.sandbox.endpoint) : '未配置 —— 需使用者自行添加（设置 → 云沙盒）', a.tools.sandbox, 'sandbox') +
      sw('联网检索', '预留开关（需自行接入搜索 API）', a.tools.search, 'search') +
    '</div>';
  }
}
function sw(label, desc, on, key) {
  return '<div class="switch"><div><div class="lbl">' + label + '</div><div class="dsc">' + desc + '</div></div>' +
    '<div class="tgl' + (on ? ' on' : '') + '" data-tool="' + key + '"></div></div>';
}

/* ------------------------- 设置 ------------------------- */
function renderSettings() {
  const ps = S.settings.providers;
  const ap = getProvider(S.settings.activeProviderId) || ps[0];
  const sb = S.settings.sandbox;
  const th = Object.assign({ mode: 'dark', preset: 'indigo', radius: 1, fontScale: 1, glassBlur: 22, aurora: true, custom: false }, S.settings.theme || {});
  const se = Object.assign({ provider: 'none', endpoint: '', enabled: false, count: 5, lastOk: 0 }, S.settings.search || {});
  const gh = Object.assign({ token: '', user: '', enabled: false, lastOk: 0 }, S.settings.github || {});
  $('#body').innerHTML =
  '<div class="scroll"><div class="page">' +
    '<h2>设置</h2>' +
    '<div class="sub">API 地址、可用模型、云沙盒 —— 数据仅保存在本机浏览器（localStorage），不会上传。</div>' +

    '<div class="card glass"><h3>① API 配置</h3>' +
      '<div class="row" style="margin-bottom:16px">' +
        '<button class="btn pri fix" data-act="goto-providers">打开「服务商与模型」』</button>' +
        '<span class="kv" style="flex:1">推荐用新面板：选预设自动填地址，支持多个服务商随时切换。下面的卡片仅作兼容保留。</span>' +
      '</div>' +
      '<div class="fld"><label>选择要编辑的配置</label><div class="row">' +
        '<select id="cfgPick">' + ps.map((p) => '<option value="' + p.id + '"' + (p.id === ap.id ? ' selected' : '') + '>' + esc(p.name) + ' — ' + esc(p.baseUrl || '未填地址') + '</option>').join('') + '</select>' +
        '<button class="btn fix" data-act="addProvider">＋ 新增</button></div></div>' +
      '<div class="fld"><label>预设（选中自动填地址，可再改）</label><select id="cfgPreset">' +
        PRESETS.map((p) => '<option value="' + p.id + '"' + (p.baseUrl === ap.baseUrl ? ' selected' : '') + '>' + esc(p.name) + (p.hint ? ' —— ' + esc(p.hint) : '') + '</option>').join('') + '</select></div>' +
      '<div class="fld"><label>名称</label><input id="cfgName" value="' + esc(ap.name) + '"></div>' +
      '<div class="fld"><label>API Base URL（需兼容 OpenAI 协议：/chat/completions、/models）</label><input id="cfgUrl" value="' + esc(ap.baseUrl) + '" placeholder="https://api.example.com/v1"></div>' +
      '<div class="fld"><label>API Key</label><input id="cfgKey" type="password" value="' + esc(ap.apiKey) + '" placeholder="sk-…"></div>' +
      '<div class="row">' +
        '<button class="btn pri fix" data-act="pullModels">拉取可用模型</button>' +
        '<button class="btn fix" data-act="testApi">测试连通</button>' +
        '<button class="btn danger fix" data-act="delProvider">删除该配置</button>' +
      '</div>' +
      '<div class="fld mt"><label>已获取模型 <span class="kv">' + (ap.models || []).length + ' 个</span></label>' +
        '<div class="chips">' + ((ap.models || []).length
          ? ap.models.map((m) => '<span class="chip"><a href="#" data-setdefault="' + esc(m) + '">设为默认</a> · ' + esc(m) + '</span>').join('')
          : '<span class="kv">还没有模型，点上方「拉取可用模型」</span>') + '</div></div>' +
      '<div class="fld"><label>全局默认模型</label><select id="cfgDefault"><option value="">（未设置）</option>' +
        (ap.models || []).map((m) => '<option value="' + esc(m) + '"' + (S.settings.defaultModel === m ? ' selected' : '') + '>' + esc(m) + '</option>').join('') +
        (S.settings.defaultModel && !(ap.models || []).includes(S.settings.defaultModel) ? '<option value="' + esc(S.settings.defaultModel) + '" selected>' + esc(S.settings.defaultModel) + '</option>' : '') +
        '</select></div>' +
      '<div class="fld"><label>协作最大轮次（主控派发-回执循环上限）</label><input id="cfgRounds" type="number" min="1" max="12" value="' + (S.settings.maxRounds || 6) + '"></div>' +
    '</div>' +

    '<div class="card glass"><h3>② 云沙盒 <span class="tag warn">需自行添加</span></h3>' +
      '<div class="fld"><label>服务商</label><select id="sbProvider">' +
        ['e2b', 'daytona', 'modal', '自建 / 其它'].map((x) => '<option' + (sb.provider === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div>' +
      '<div class="fld"><label>沙盒 API Endpoint</label><input id="sbEndpoint" value="' + esc(sb.endpoint) + '" placeholder="https://api.e2b.dev"></div>' +
      '<div class="fld"><label>沙盒 API Key</label><input id="sbKey" type="password" value="' + esc(sb.apiKey) + '" placeholder="填入你自己的沙盒密钥"></div>' +
      '<div class="switch"><div><div class="lbl">启用云沙盒</div><div class="dsc">仅在你填好 Endpoint / Key 后打开</div></div>' +
        '<div class="tgl' + (sb.enabled ? ' on' : '') + '" data-tool="sandbox"></div></div>' +
      '<div class="row mt"><button class="btn pri fix" data-act="sandbox-test">测试云沙盒</button>' +
        '<span class="kv">' + (sb.lastOk ? '上次连通：' + relTime(sb.lastOk) : '尚未测试连通') + '</span></div>' +
      '<div class="hint2 mt">协议：<code>POST /sandboxes</code> 创建 · <code>POST /sandboxes/{id}/code</code> 执行 · <code>DELETE /sandboxes/{id}</code> 销毁（e2b 兼容）。浏览器直连沙盒可能被 CORS 拦，桌面端不受影响。</div>' +
    '</div>' +

    '<div class="card glass"><h3>③ 主题外观</h3>' +
      '<div class="switch"><div><div class="lbl">配色模式</div><div class="dsc">暗金（默认）/ 亮白 / 跟随系统</div></div>' +
        '<div class="chips" style="margin:0">' + [['dark','暗金'],['light','亮白'],['auto','跟随系统']].map(([k, n]) =>
          '<span class="chip' + ((th.mode === k) ? ' on' : '') + '" data-theme-mode="' + k + '">' + n + '</span>').join('') + '</div>' +
      '</div>' +
      '<div class="fld mt"><label>主色</label><div class="swatches">' + THEMES.map((t) =>
        '<div class="swatch' + (th.preset === t.id && !th.custom ? ' on' : '') + '" data-theme-preset="' + t.id + '" title="' + esc(t.name) + '" style="background:linear-gradient(135deg,hsl(' + t.h + ' ' + t.s + ' ' + (parseInt(t.l, 10) - 20) + '%),hsl(' + t.h + ' ' + t.s + ' ' + t.l + '),hsl(' + t.h + ' ' + t.s + ' ' + (parseInt(t.l, 10) + 16) + '%))"></div>').join('') +
      '</div>' +
      '<div class="slider mt"><input type="range" min="0" max="360" value="' + (th.h || 40) + '" data-knob="h"><span class="val">' + (th.h || 40) + '°</span></div>' +
      '<div class="hint2">拖动色相环可自定义主色（0=红 · 40=金 · 165=青 · 232=靛）</div></div>' +
      '<div class="fld"><label>磨砂强度</label><div class="slider"><input type="range" min="0" max="40" value="' + th.glassBlur + '" data-knob="glassBlur"><span class="val">' + th.glassBlur + 'px</span></div></div>' +
      '<div class="fld"><label>圆角</label><div class="slider"><input type="range" min="0.6" max="1.5" step="0.05" value="' + th.radius + '" data-knob="radius"><span class="val">×' + th.radius + '</span></div></div>' +
      '<div class="fld"><label>字号</label><div class="slider"><input type="range" min="0.9" max="1.15" step="0.01" value="' + th.fontScale + '" data-knob="fontScale"><span class="val">×' + th.fontScale + '</span></div></div>' +
      '<div class="switch"><div><div class="lbl">背景薄光</div><div class="dsc">关闭后更沉稳、更省电</div></div>' +
        '<div class="tgl' + (th.aurora ? ' on' : '') + '" data-tgl-theme="aurora"></div></div>' +
      '<div class="row mt"><button class="btn fix" data-act="resetTheme">恢复默认外观</button></div>' +
    '</div>' +

    '<div class="card glass"><h3>④ 联网检索</h3>' +
      '<div class="fld"><label>检索服务商</label><select id="seProvider">' +
        [['none', '不启用'], ['searxng', 'SearXNG（自建实例 · 免费）'], ['tavily', 'Tavily API'], ['brave', 'Brave Search API'], ['serper', 'Serper (Google)']]
          .map(([k, n]) => '<option value="' + k + '"' + (se.provider === k ? ' selected' : '') + '>' + n + '</option>').join('') +
      '</select><div class="hint2">SearXNG 填实例地址；Tavily / Brave / Serper 填各自的 API Key。</div></div>' +
      '<div class="fld"><label>地址 或 API Key</label><input id="seEndpoint" value="' + esc(se.endpoint) + '" placeholder="https://searx.example.com  或  tvly-xxxx"></div>' +
      '<div class="fld"><label>每次返回条数</label><input id="seCount" type="number" min="1" max="20" value="' + (se.count || 5) + '"></div>' +
      '<div class="switch"><div><div class="lbl">启用联网检索</div><div class="dsc">开启后 Agent 可用 &lt;search&gt;关键词&lt;/search&gt; 查资料</div></div>' +
        '<div class="tgl' + (se.enabled ? ' on' : '') + '" data-tgl-search="1"></div></div>' +
      '<div class="row mt"><button class="btn pri fix" data-act="search-test">测试检索</button>' +
        '<span class="kv">' + (se.lastOk ? '上次成功：' + relTime(se.lastOk) : '尚未测试') + '</span></div>' +
    '</div>' +

    '<div class="card glass"><h3>⑤ GitHub</h3>' +
      '<div class="fld"><label>Personal Access Token</label><input id="ghToken" type="password" value="' + esc(gh.token) + '" placeholder="ghp_… / github_pat_…"></div>' +
      '<div class="switch"><div><div class="lbl">启用 GitHub 工具</div><div class="dsc">Agent 可创建仓库、提交文件、读取代码、触发 CI</div></div>' +
        '<div class="tgl' + (gh.enabled ? ' on' : '') + '" data-tgl-gh="1"></div></div>' +
      '<div class="row mt"><button class="btn pri fix" data-act="gh-connect">连接并读取账号</button>' +
        '<button class="btn fix" data-act="goto-github">打开 GitHub 面板</button>' +
        '<span class="kv">' + (gh.user ? '已连接：@' + esc(gh.user) : '未连接') + '</span></div>' +
      '<div class="hint2 mt">Token 仅存本机 localStorage。需要权限：<code>repo</code>（读写仓库）、<code>workflow</code>（触发 / 查看 Actions）。</div>' +
    '</div>' +

    '<div class="card glass"><h3>⑥ 数据</h3>' +
      '<div class="sub" style="margin:0 0 12px">Agent ' + S.agents.length + ' 个 · 文档 ' + S.docs.length + ' 篇 · 会话 ' + S.topics.length + ' 个</div>' +
      '<div class="row">' +
        '<button class="btn fix" data-act="exportData">导出全部数据 (JSON)</button>' +
        '<button class="btn fix" data-act="importData">导入数据</button>' +
        '<button class="btn danger fix" data-act="resetAll">清空并恢复初始状态</button>' +
      '</div>' +
      '<input type="file" id="impFile" accept="application/json" hidden>' +
    '</div>' +
  '</div></div>';

  const pick = $('#cfgPick');
  if (pick) pick.addEventListener('change', () => { persistCfg(); S.settings.activeProviderId = pick.value; save(); renderSettings(); });
  const pre = $('#cfgPreset');
  if (pre) pre.addEventListener('change', () => {
    const p = PRESETS.find((x) => x.id === pre.value);
    if (!p) return;
    const u = $('#cfgUrl'), n = $('#cfgName');
    if (u && p.baseUrl) u.value = p.baseUrl;
    if (n && p.id !== 'custom') n.value = p.name;
    if (!p.baseUrl && p.hint) toast(p.name + '：' + p.hint, '');
    else if (!p.baseUrl) toast('请在下方填入 ' + p.name + ' 的 API 地址', '');
  });
  ['#cfgName', '#cfgUrl', '#cfgKey', '#cfgDefault', '#cfgRounds', '#sbProvider', '#sbEndpoint', '#sbKey', '#seProvider', '#seEndpoint', '#seCount', '#ghToken'].forEach((sel) => {
    const e = $(sel); if (e) e.addEventListener('change', () => { persistCfg(); save(); });
  });
}

function persistCfg() {
  const p = getProvider(S.settings.activeProviderId);
  if (p) {
    const g = (id) => { const e = $(id); return e ? e.value : undefined; };
    if (g('#cfgName') !== undefined) p.name = g('#cfgName').trim() || '未命名配置';
    if (g('#cfgUrl') !== undefined) p.baseUrl = g('#cfgUrl').trim();
    if (g('#cfgKey') !== undefined) p.apiKey = g('#cfgKey').trim();
  }
  if ($('#cfgDefault')) S.settings.defaultModel = $('#cfgDefault').value;
  if ($('#cfgRounds')) S.settings.maxRounds = Math.max(1, Math.min(12, parseInt($('#cfgRounds').value, 10) || 6));
  const se = S.settings.search || (S.settings.search = {});
  if ($('#seProvider')) se.provider = $('#seProvider').value;
  if ($('#seEndpoint')) se.endpoint = $('#seEndpoint').value.trim();
  if ($('#seCount')) se.count = Math.max(1, Math.min(20, parseInt($('#seCount').value, 10) || 5));
  const ghc = S.settings.github || (S.settings.github = {});
  if ($('#ghToken')) ghc.token = $('#ghToken').value.trim();
  const sb = S.settings.sandbox;
  if ($('#sbProvider')) sb.provider = $('#sbProvider').value;
  if ($('#sbEndpoint')) sb.endpoint = $('#sbEndpoint').value.trim();
  if ($('#sbKey')) sb.apiKey = $('#sbKey').value.trim();
}

function persistAgentTab(a, tab) {
  const g = (id) => { const e = $(id); return e ? e.value : null; };
  if (tab === 'base') {
    if (g('#fName') !== null) a.name = g('#fName').trim() || a.name;
    if (g('#fRole') !== null) {
      const r = g('#fRole').trim().replace(/^@/, '').replace(/[^\w\u4e00-\u9fa5-]/g, '');
      a.roleName = r || a.roleName;
    }
    if (g('#fDesc') !== null) a.desc = g('#fDesc').trim();
    if (g('#fPrompt') !== null) a.systemPrompt = g('#fPrompt');
    const u = g('#fAvatarUrl');
    if (u !== null && u.trim()) a.avatar = u.trim();
  } else if (tab === 'ability') {
    if (g('#fProv') !== null) a.providerId = g('#fProv');
    if (g('#fModel') !== null) a.model = g('#fModel');
  }
}

/* ------------------------- 全局事件 ------------------------- */
function wireGlobal() {
  document.addEventListener('click', async (e) => {
    const t = e.target;

    /* 提及 / 复制 */
    const copy = t.closest('.copybtn');
    if (copy) {
      const pre = copy.closest('pre');
      const code = pre && pre.querySelector('code');
      if (code) { try { await navigator.clipboard.writeText(code.textContent); } catch (x) {} }
      copy.textContent = '已复制'; setTimeout(() => { copy.textContent = '复制'; }, 1200);
      return;
    }
    const delSk = t.closest('[data-delskill]');
    if (delSk) {
      e.stopPropagation();
      const a = getAgent(S.ui.editAgentId) || curAgent();
      a.skills.splice(+delSk.dataset.delskill, 1); save(); renderTab(a, 'skills'); return;
    }
    const oh = t.closest('.oh');
    if (oh && !t.closest('[data-act]')) { oh.parentElement.classList.toggle('open'); return; }

    const fill = t.closest('[data-fill]');
    if (fill) { S.ui.drafting = fill.dataset.fill; const ta = $('#input'); if (ta) { ta.value = S.ui.drafting; ta.focus(); autoGrow(ta); } return; }

    const docEl = t.closest('[data-doc]');
    if (docEl) { saveDocIfDirty(); S.ui.activeDocId = docEl.dataset.doc; renderDocs(); return; }

    const agEl = t.closest('[data-agent]');
    if (agEl) {
      S.ui.activeAgentId = agEl.dataset.agent;
      S.ui.activeTopicId = null; S.ui.drafting = ''; S.ui.view = 'chat';
      hideMention(); save(); renderShell(); return;
    }

    const tabBtn = t.closest('[data-tab]');
    if (tabBtn) {
      const a = getAgent(S.ui.editAgentId) || curAgent();
      persistAgentTab(a, S.ui.editTab || 'base'); save();
      S.ui.editTab = tabBtn.dataset.tab; renderAgentEdit(); return;
    }

    const tgl = t.closest('[data-tool]');
    if (tgl) {
      const k = tgl.dataset.tool;
      if (k === 'sandbox' && S.ui.view === 'settings') { S.settings.sandbox.enabled = !S.settings.sandbox.enabled; save(); tgl.classList.toggle('on'); toast(S.settings.sandbox.enabled ? '云沙盒已启用' : '云沙盒已关闭'); return; }
      const a = getAgent(S.ui.editAgentId) || curAgent();
      persistAgentTab(a, 'ability');
      a.tools[k] = !a.tools[k]; save(); renderTab(a, 'ability'); return;
    }

    const em = t.closest('[data-emoji]');
    if (em) {
      if (em.closest('.mask')) return;              // 弹窗内的选择由弹窗自己处理
      const a = getAgent(S.ui.editAgentId) || curAgent();
      a.avatar = em.dataset.emoji; save(); renderTab(a, 'base'); renderShell(); return;
    }


    const mi = t.closest('[data-mention]');
    if (mi) return;

    const tSe = t.closest('[data-tgl-search]');
    if (tSe) { S.settings.search.enabled = !S.settings.search.enabled; save(); renderSettings(); return; }
    const tGh = t.closest('[data-tgl-gh]');
    if (tGh) { S.settings.github.enabled = !S.settings.github.enabled; save(); renderSettings(); return; }
    const tMode = t.closest('[data-theme-mode]');
    if (tMode) { S.settings.theme.mode = tMode.dataset.themeMode; applyTheme(); save(); renderSettings(); return; }
    const tglTh = t.closest('[data-tgl-theme]');
    if (tglTh) {
      const k = tglTh.dataset.tglTheme;
      S.settings.theme[k] = !S.settings.theme[k];
      applyTheme(); save(); renderSettings(); return;
    }
    const sw = t.closest('[data-theme-preset]');
    if (sw) {
      const p = THEMES.find((x) => x.id === sw.dataset.themePreset);
      if (p) { Object.assign(S.settings.theme, { preset: p.id, h: p.h, s: p.s, l: p.l, custom: false }); applyTheme(); save(); renderSettings(); }
      return;
    }
    const openT = t.closest('[data-topic]');
    if (openT && !t.closest('[data-act]')) {
      S.ui.activeTopicId = openT.dataset.topic;
      const tt = S.topics.find((x) => x.id === openT.dataset.topic);
      if (tt) S.ui.activeAgentId = tt.agentId;
      S.ui.view = 'chat'; S.ui.drafting = '';
      closeSideMobile(); save(); renderShell(); return;
    }
    const setDef = t.closest('[data-setdefault]');
    if (setDef) { e.preventDefault(); S.settings.defaultModel = setDef.dataset.setdefault; save(); renderSettings(); toast('默认模型：' + setDef.dataset.setdefault, 'ok'); return; }

    const act = t.closest('[data-act]');
    if (!act) return;
    await handleAct(act.dataset.act, e);
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t) return;
    if (t.id === 'agentSearch') { S.ui._q = t.value; renderAgentLists(); renderTopicList(); return; }
    if (t.id === 'q') { S.ui.search = t.value; clearTimeout(window.__sq); window.__sq = setTimeout(() => renderSearchHits(), 160); return; }
    if (t.dataset && t.dataset.knob) {
      const k = t.dataset.knob, v = parseFloat(t.value);
      const th = S.settings.theme;
      if (k === 'h') { th.h = v; th.custom = true; applyTheme(); }
      else { th[k] = v; applyTheme(); }
      const lab = t.parentElement && t.parentElement.querySelector('.val');
      if (lab) lab.textContent = (k === 'h') ? v + '°' : (k === 'radius' || k === 'fontScale') ? '×' + v : v + 'px';
      clearTimeout(window.__st); window.__st = setTimeout(save, 250);
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'avFile' && t.files && t.files[0]) {
      const f = t.files[0];
      if (f.size > 1200000) { toast('图片太大（>1.2MB），建议先用 URL', 'err'); return; }
      const fr = new FileReader();
      fr.onload = () => { const a = getAgent(S.ui.editAgentId) || curAgent(); a.avatar = fr.result; save(); renderTab(a, 'base'); renderShell(); };
      fr.readAsDataURL(f);
    }
    if (t.id === 'impFile' && t.files && t.files[0]) {
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const o = JSON.parse(fr.result);
          localStorage.setItem(KEY, JSON.stringify(o));
          S = load(); save(); renderShell();
          toast('导入成功', 'ok');
        } catch (x) { toast('导入失败：文件不是合法 JSON', 'err'); }
      };
      fr.readAsText(t.files[0]);
    }
  });
}

function saveDocIfDirty() {
  if (S.ui.view !== 'docs') return;
  const d = findDoc(S.ui.activeDocId); if (!d) return;
  const t = $('#docTitle'), b = $('#docBody');
  if (t) d.title = t.value.trim() || d.title;
  if (b) d.content = b.value;
  d.updatedAt = now(); save();
}

async function handleAct(act, e) {
  const a0 = curAgent();
  switch (act) {
    case 'nav-menu': { toggleNavMenu(); return; }
    case 'conv-menu': { toggleConvMenu(); return; }
    case 'open-topic': {
      const el = e.target.closest('[data-topic]');
      if (!el) return;
      const t = S.topics.find((x) => x.id === el.dataset.topic);
      if (!t) return;
      closePops();
      S.ui.activeTopicId = t.id; S.ui.activeAgentId = t.agentId;
      S.ui.drafting = ''; S.ui.view = 'chat';
      save(); renderShell(); return;
    }
    case 'agent-menu': { toggleAgentMenu(); return; }
    case 'model-menu': { toggleModelMenu(); return; }
    case 'goto-providers': { closePops(); S.ui.view = 'providers'; S.ui._provOpen = S.ui._provOpen || null; save(); renderShell(); return; }
    case 'switch-agent': {
      const id = e.target.closest('[data-id]').dataset.id;
      closePops();
      closePops();
      S.ui.activeAgentId = id; S.ui.activeTopicId = null; S.ui.drafting = ''; S.ui.view = 'chat';
      save(); renderShell(); return;
    }
    case 'switch-main': {
      const m = mainAgent(); closePops();
      S.ui.activeAgentId = m.id; S.ui.activeTopicId = null; S.ui.drafting = ''; S.ui.view = 'chat';
      save(); renderShell(); return;
    }
    case 'pick-model': {
      const el = e.target.closest('[data-model]');
      const m = el ? el.dataset.model : '';
      const a = curAgent(); a.model = m || '';
      closePops(); save(); renderShell();
      toast(m ? '「' + a.name + '」使用模型：' + m : '「' + a.name + '」跟随全局默认', 'ok');
      return;
    }
    case 'pick-provider': {
      const el = e.target.closest('[data-id]');
      const a = curAgent(); a.providerId = el.dataset.id; a.model = '';
      closePops(); save(); renderShell();
      const p = getProvider(a.providerId);
      toast('「' + a.name + '」切换服务商：' + (p ? p.name : ''), 'ok');
      return;
    }
    case 'toggle-rail': {
      S.ui.collapsed = !S.ui.collapsed;
      const app = document.getElementById('app');
      if (app) app.classList.toggle('collapsed', S.ui.collapsed);
      closePops(); save(); return;
    }
    case 'goto-github': { S.ui.view = 'github'; S.ui.gh = S.ui.gh || {}; closeSideMobile(); save(); renderShell(); if (S.settings.github.token) ghLoadRepos(); return; }
    case 'attach': { const f = $('#fileInput'); if (f) f.click(); return; }
    case 'rmattach': { removePending(+e.target.closest('[data-i]').dataset.i); return; }
    case 'export-zip': { await exportTopicZip(e); return; }
    case 'search-test': { await testSearch(e); return; }
    case 'gh-connect': { await ghConnect(e); return; }
    case 'gh-newrepo': { openNewRepoDialog(); return; }
    case 'gh-open': { await ghOpenRepo(e.target.closest('[data-repo]').dataset.repo); return; }
    case 'gh-repos': { S.ui.gh.repo = null; renderGithub(); return; }
    case 'gh-file': { await ghOpenFile(e.target.closest('[data-path]').dataset.path); return; }
    case 'gh-save': { await ghSaveFile(e); return; }
    case 'gh-refresh-runs': { await ghLoadRuns(S.ui.gh.repo); return; }
    case 'gh-run-wf': { await ghTriggerWorkflow(e); return; }
    case 'gh-close-file': { S.ui.gh.path = null; S.ui.gh.file = null; renderGithub(); return; }
    case 'lightbox': { openLightbox(e.target.src); return; }
    case 'goto-search': { S.ui.view = 'search'; closeSideMobile(); save(); renderShell(); setTimeout(() => { const i = $('#q'); if (i) i.focus(); }, 30); return; }
    case 'viewdoc': { openDocDrawer(e && e.target && e.target.closest('[data-id]') ? e.target.closest('[data-id]').dataset.id : S.ui.activeDocId); return; }
    case 'closedoc': { closeDocDrawer(); return; }
    case 'opendoclib': { const id = S.ui.docView; closeDocDrawer(); S.ui.activeDocId = id; S.ui.view = 'docs'; save(); renderShell(); return; }
    case 'save-clip': {
      const clip = S.ui.searchHitText || '';
      if (!clip) return;
      S.docs.unshift({ id: uid('d'), title: '检索摘录 ' + fmtTime(now()), content: clip, ownerId: S.ui.activeAgentId, shared: true, updatedAt: now() });
      save(); toast('已存入文档库', 'ok'); return;
    }
    case 'theme-mode': {
      const m = e.target.closest('[data-theme-mode]');
      if (m) { S.settings.theme.mode = m.dataset.themeMode; applyTheme(); save(); renderSettings(); }
      return;
    }
    case 'resetTheme': {
      S.settings.theme = { mode: 'dark', preset: 'gold', h: 40, s: '50%', l: '58%', radius: 1, fontScale: 1, glassBlur: 20, aurora: true, custom: false };
      applyTheme(); save(); renderSettings(); toast('已恢复默认外观', 'ok'); return;
    }
    case 'sandbox-test': { await testSandbox(e); return; }
    case 'close-side': { closeSideMobile(); return; }
    case 'switch-topic': {
      const id = e.target.closest('[data-topic]') && e.target.closest('[data-topic]').dataset.topic;
      if (!id) return;
      const t = S.topics.find((x) => x.id === id); if (!t) return;
      S.ui.activeTopicId = id; S.ui.activeAgentId = t.agentId; S.ui.view = 'chat'; S.ui.drafting = '';
      closeSideMobile(); save(); renderShell(); return;
    }
    case 'del-topic': {
      const el = e.target.closest('[data-topic]');
      const id = el && el.dataset.topic; if (!id) return;
      modal('<h3>删除会话</h3><div class="dsc">该会话的全部消息与统计将一并删除，不可恢复。</div>' +
        '<div class="act"><button class="btn" data-x="c">取消</button><button class="btn danger" data-x="ok">删除</button></div>',
        (m, close) => {
          m.addEventListener('click', (ev) => {
            const x = ev.target.closest('[data-x]'); if (!x) return;
            if (x.dataset.x === 'ok') {
              S.topics = S.topics.filter((t) => t.id !== id);
              if (S.ui.activeTopicId === id) S.ui.activeTopicId = null;
              save(); renderShell(); toast('已删除', 'ok');
            }
            close();
          });
        });
      return;
    }
    case 'rename-topic': {
      const el = e.target.closest('[data-topic]');
      const t = el && S.topics.find((x) => x.id === el.dataset.topic); if (!t) return;
      modal('<h3>重命名会话</h3><div class="fld"><input id="tpName" value="' + esc(t.title) + '"></div>' +
        '<div class="act"><button class="btn" data-x="c">取消</button><button class="btn pri" data-x="ok">保存</button></div>',
        (m, close) => {
          setTimeout(() => { const i = $('#tpName'); if (i) { i.focus(); i.select(); } }, 30);
          m.addEventListener('click', (ev) => {
            const x = ev.target.closest('[data-x]'); if (!x) return;
            if (x.dataset.x === 'ok') { const i = $('#tpName'); t.title = (i && i.value.trim()) || t.title; save(); renderShell(); }
            close();
          });
        });
      return;
    }
    case 'toggle-side': {
      if (window.matchMedia('(max-width:639px)').matches) {
        S.ui.sideOpen = !S.ui.sideOpen;
        const app = document.getElementById('app');
        const sd = document.querySelector('.side');
        if (app) app.classList.toggle('side-open', S.ui.sideOpen);
        if (sd) sd.classList.toggle('open', S.ui.sideOpen);
      } else {
        S.ui.collapsed = !S.ui.collapsed;
        const app = document.getElementById('app');
        if (app) app.classList.toggle('collapsed', S.ui.collapsed);
      }
      save(); return;
    }
    case 'goto-chat': {
      if (S.ui.view === 'agent') { const a = getAgent(S.ui.editAgentId) || curAgent(); persistAgentTab(a, S.ui.editTab || 'base'); save(); }
      if (S.ui.view === 'docs') saveDocIfDirty();
      S.ui.view = 'chat'; save(); renderShell(); return;
    }
    case 'goto-docs': { saveDocIfDirty(); S.ui.view = 'docs'; save(); renderShell(); return; }
    case 'goto-settings': { if (S.ui.view === 'docs') saveDocIfDirty(); S.ui.view = 'settings'; save(); renderShell(); return; }
    case 'newtopic': { closePops(); newTopic(a0.id); S.ui.drafting = ''; S.ui.view = 'chat'; save(); renderShell(); return; }
    case 'editagent': { S.ui.editAgentId = a0.id; S.ui.editTab = 'base'; S.ui.view = 'agent'; save(); renderShell(); return; }
    case 'toggle-stats': { S.ui.statsOpen = !S.ui.statsOpen; save(); refreshBubble(); return; }
    case 'toggle-syntax': {
      const h = document.querySelector('.hint'); if (h) h.classList.toggle('show-syn');
      return;
    }
    case 'mention': { showMention(); return; }
    case 'evac': {
      const ta = $('#input');
      const roles = S.agents.filter((x) => x.id !== a0.id).map((x) => '@' + x.roleName).join(' ');
      if (ta) { ta.value = '请召集全员协作：' + (roles || '（暂无其他 Agent）') + ' 让他们各自从专业角度给出建议，最后汇总成一份文档。'; ta.focus(); autoGrow(ta); S.ui.drafting = ta.value; }
      return;
    }
    case 'send': { doSend(); return; }
    case 'addagent': { openNewAgentDialog(); return; }
    case 'newdoc': {
      const d = { id: uid('d'), title: '未命名文档', content: '', ownerId: S.ui.activeAgentId, shared: true, updatedAt: now() };
      S.docs.unshift(d); S.ui.activeDocId = d.id; save(); renderDocs();
      const t = $('#docTitle'); if (t) { t.focus(); t.select(); }
      return;
    }
    case 'saveDoc': { saveDoc(); return; }
    case 'delDoc': {
      const d = findDoc(S.ui.activeDocId); if (!d) return;
      modal('<h3>删除文档</h3><div class="dsc">确定删除「' + esc(d.title) + '」？不可恢复。</div>' +
        '<div class="act"><button class="btn" data-x="cancel">取消</button><button class="btn danger" data-x="ok">删除</button></div>',
        (m, close) => {
          m.addEventListener('click', (ev) => {
            const x = ev.target.closest('[data-x]'); if (!x) return;
            if (x.dataset.x === 'ok') { S.docs = S.docs.filter((y) => y.id !== d.id); S.ui.activeDocId = null; save(); renderDocs(); toast('已删除', 'ok'); }
            close();
          });
        });
      return;
    }
    case 'saveAgent': {
      const a = getAgent(S.ui.editAgentId) || curAgent();
      persistAgentTab(a, S.ui.editTab || 'base');
      if (!a.isMain) {
        const dup = S.agents.some((x) => x.id !== a.id && x.roleName === a.roleName);
        if (dup) { toast('角色名「' + a.roleName + '」已被占用，请换一个', 'err'); return; }
      }
      save(); renderShell(); toast('已保存「' + a.name + '」', 'ok'); return;
    }
    case 'delAgent': {
      const a = getAgent(S.ui.editAgentId); if (!a || a.isMain) return;
      modal('<h3>删除 Agent</h3><div class="dsc">确定删除「' + esc(a.name) + '」？其专属文档会保留为共享文档。</div>' +
        '<div class="act"><button class="btn" data-x="cancel">取消</button><button class="btn danger" data-x="ok">删除</button></div>',
        (m, close) => {
          m.addEventListener('click', (ev) => {
            const x = ev.target.closest('[data-x]'); if (!x) return;
            if (x.dataset.x === 'ok') {
              S.agents = S.agents.filter((y) => y.id !== a.id);
              S.topics = S.topics.filter((tp) => tp.agentId !== a.id);
              S.ui.activeAgentId = mainAgent().id; S.ui.activeTopicId = null; S.ui.view = 'chat';
              save(); renderShell(); toast('已删除', 'ok');
            }
            close();
          });
        });
      return;
    }
    case 'resetMainPrompt': {
      const a = getAgent(S.ui.editAgentId) || curAgent();
      a.systemPrompt = MAIN_PROMPT; save(); renderTab(a, 'base'); toast('已恢复默认', 'ok'); return;
    }
    case 'uploadAvatar': { const f = $('#avFile'); if (f) f.click(); return; }
    case 'clearAvatar': { const a = getAgent(S.ui.editAgentId) || curAgent(); a.avatar = '🤖'; save(); renderTab(a, 'base'); renderShell(); return; }
    case 'pullSkill': {
      const a = getAgent(S.ui.editAgentId) || curAgent();
      const input = $('#fSkillUrl');
      const raw = input ? input.value.trim() : '';
      if (!raw) { toast('请先填写地址', 'err'); return; }
      const url = normalizeSkillUrl(raw);
      const btn = e.target.closest('[data-act]');
      if (btn) { btn.disabled = true; btn.textContent = '拉取中…'; }
      try {
        const text = await fetchSkill(url);
        const s = parseSkill(text, url);
        a.skills = a.skills || [];
        const old = a.skills.findIndex((x) => x.name === s.name);
        if (old >= 0) a.skills[old] = s; else a.skills.push(s);
        save(); renderTab(a, 'skills'); toast('已装载 Skill：' + s.name, 'ok');
      } catch (err) {
        toast('拉取失败：' + (err.message || err), 'err');
        if (btn) { btn.disabled = false; btn.textContent = '拉取并装载'; }
      }
      return;
    }
    case 'addProvider': {
      const id = uid('pr');
      S.settings.providers.push({ id, name: '新配置', baseUrl: '', apiKey: '', models: [] });
      S.settings.activeProviderId = id; save(); renderSettings(); return;
    }
    case 'delProvider': {
      if (S.settings.providers.length <= 1) { toast('至少保留一个配置', 'err'); return; }
      const id = S.settings.activeProviderId;
      S.settings.providers = S.settings.providers.filter((p) => p.id !== id);
      S.settings.activeProviderId = S.settings.providers[0].id;
      save(); renderSettings(); return;
    }
    case 'pullModels': {
      persistCfg();
      const p = getProvider(S.settings.activeProviderId);
      const btn = e.target.closest('[data-act]');
      if (btn) { btn.disabled = true; btn.textContent = '拉取中…'; }
      try {
        const ids = await pullModels(p);
        ids.sort();
        p.models = ids;
        if (!S.settings.defaultModel || !ids.includes(S.settings.defaultModel)) S.settings.defaultModel = ids[0];
        save(); renderSettings(); toast('获取到 ' + ids.length + ' 个模型', 'ok');
      } catch (err) {
        toast('拉取失败：' + (err.message || err), 'err');
        if (btn) { btn.disabled = false; btn.textContent = '拉取可用模型'; }
      }
      return;
    }
    case 'testApi': {
      persistCfg();
      const p = getProvider(S.settings.activeProviderId);
      const btn = e.target.closest('[data-act]');
      if (btn) { btn.disabled = true; btn.textContent = '测试中…'; }
      try {
        const ids = await pullModels(p);
        toast('连通正常，可用模型 ' + ids.length + ' 个', 'ok');
      } catch (err) {
        toast('连通失败：' + (err.message || err), 'err');
      }
      if (btn) { btn.disabled = false; btn.textContent = '测试连通'; }
      return;
    }
    case 'exportData': {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'agenthub-backup-' + Date.now() + '.json';
      a.click(); URL.revokeObjectURL(url); toast('已导出', 'ok'); return;
    }
    case 'importData': { const f = $('#impFile'); if (f) f.click(); return; }
    case 'resetAll': {
      modal('<h3>清空全部数据</h3><div class="dsc">将删除所有 Agent、文档与会话，恢复到初始状态。确定继续？</div>' +
        '<div class="act"><button class="btn" data-x="cancel">取消</button><button class="btn danger" data-x="ok">确认清空</button></div>',
        (m, close) => {
          m.addEventListener('click', (ev) => {
            const x = ev.target.closest('[data-x]'); if (!x) return;
            if (x.dataset.x === 'ok') { localStorage.removeItem(KEY); S = defaultState(); save(); renderShell(); toast('已重置', 'ok'); }
            close();
          });
        });
      return;
    }
  }
}

/* ------------------------- 新建 Agent ------------------------- */
function openNewAgentDialog() {
  modal(
    '<h3>新建 Agent</h3><div class="dsc">创建后可随时修改名字、角色名、头像与 Skills。</div>' +
    '<div class="fld"><label>名字</label><input id="nName" placeholder="例如：调研员" value=""></div>' +
    '<div class="fld"><label>角色名（主模型派发时用 @角色名 识别）</label><input id="nRole" placeholder="例如：researcher" value=""></div>' +
    '<div class="fld"><label>一句话简介（可选）</label><input id="nDesc" placeholder="擅长什么"></div>' +
    '<div class="fld"><label>头像 Emoji</label><div class="emoji-grid" id="nEmoji">' +
      EMOJIS.slice(0, 20).map((x, i) => '<button data-emoji="' + x + '" class="' + (i === 1 ? 'on' : '') + '">' + x + '</button>').join('') + '</div></div>' +
    '<div class="act"><button class="btn" data-x="cancel">取消</button><button class="btn pri" data-x="ok">创建并进入设置</button></div>',
    (m, close) => {
      let avatar = EMOJIS[1];
      m.addEventListener('click', (ev) => {
        const em = ev.target.closest('[data-emoji]');
        if (em) {
          avatar = em.dataset.emoji;
          $$('[data-emoji]', m).forEach((b) => b.classList.remove('on')); em.classList.add('on'); return;
        }
        const x = ev.target.closest('[data-x]'); if (!x) return;
        if (x.dataset.x === 'ok') {
          const name = ($('#nName', m).value || '').trim();
          let role = ($('#nRole', m).value || '').trim().replace(/^@/, '').replace(/[^\w\u4e00-\u9fa5-]/g, '');
          if (!name) { toast('请填写名字', 'err'); return; }
          if (!role) role = 'agent' + (S.agents.length + 1);
          if (S.agents.some((y) => y.roleName === role)) { toast('角色名已被占用', 'err'); return; }
          const na = {
            id: uid('ag'), isMain: false, name, roleName: role, avatar,
            desc: ($('#nDesc', m).value || '').trim(),
            systemPrompt: '你是团队中的「' + name + '」。\n\n请专注你的职责，直接给出高质量、可用的结论；输出尽量结构化。\n\n如需沉淀成果，可以使用文档指令：<doc op="create" title="标题">内容</doc>。',
            providerId: '', model: '', skills: [],
            tools: { delegate: false, docs: true, sandbox: false, search: false },
          };
          S.agents.push(na);
          S.ui.editAgentId = na.id; S.ui.editTab = 'base'; S.ui.view = 'agent';
          save(); renderShell(); toast('已创建「' + name + '」', 'ok');
        }
        close();
      });
    }
  );
}

/* ------------------------- 启动 ------------------------- */
function boot() {
  S = load();
  applyTheme();
  if (!S.topics.length) ensureTopic(S.ui.activeAgentId);
  renderShell();
  wireGlobal();

  try {
    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => { if ((S.settings.theme || {}).mode === 'auto') applyTheme(); });
  } catch (e) {}

  window.addEventListener('resize', () => {
    const ta = $('#input'); if (ta) autoGrow(ta);
    if (!window.matchMedia('(max-width:639px)').matches && S.ui.sideOpen) {
      S.ui.sideOpen = false;
      const app = document.getElementById('app'); if (app) app.classList.remove('side-open');
      const sd = document.querySelector('.side'); if (sd) sd.classList.remove('open');
    }
  });

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') { hideMention(); closeDocDrawer(); closeSideMobile(); return; }
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault(); gotoView('search');
      setTimeout(() => { const i = $('#q'); if (i) i.focus(); }, 40); return;
    }
    if (mod && e.key.toLowerCase() === 'b') {
      e.preventDefault(); S.ui.collapsed = !S.ui.collapsed;
      const app = document.getElementById('app'); if (app) app.classList.toggle('collapsed', S.ui.collapsed);
      save(); return;
    }
    if (mod && e.key.toLowerCase() === 'n') {
      e.preventDefault(); newTopic(curAgent().id); S.ui.view = 'chat'; save(); renderShell(); return;
    }
  });

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
/* 启动由 Part 3 末尾负责（Part 3 需先完成顶层初始化） */


/* =======================================================================
 * LUCIFER · 多智能体中枢  ——  主题 / 会话 / 检索 / 文档 / 沙盒（Part 3 / 5）
 * 主题引擎 / 会话列表 / 全文检索 / 对话内文档浏览 / 云沙盒 / 移动端
 * ===================================================================== */

const VERSION = 'v2.0';
const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<defs><linearGradient id="starG" x1="3" y1="2" x2="21" y2="22">' +
  '<stop offset="0" stop-color="#8C6E33"/><stop offset=".5" stop-color="#E7D4A4"/><stop offset="1" stop-color="#A8823D"/>' +
  '</linearGradient></defs>' +
  '<path d="M12 2 L13.6 9.2 L21 12 L13.6 14.8 L12 22 L10.4 14.8 L3 12 L10.4 9.2 Z" fill="url(#starG)"/></svg>';

/* ------------------------- 主题引擎 ------------------------- */
const THEME_DEFAULT = { mode: 'dark', preset: 'gold', h: 40, s: '50%', l: '58%', radius: 1, fontScale: 1, glassBlur: 20, aurora: true, custom: false };
function themeObj() { return Object.assign({}, THEME_DEFAULT, S.settings.theme || {}); }

function applyTheme() {
  const th = themeObj();
  const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const mode = th.mode === 'auto' ? (sysDark ? 'dark' : 'light') : th.mode;
  const r = document.documentElement;
  r.setAttribute('data-theme', mode);
  r.setAttribute('data-glass', th.glassBlur > 0 ? '1' : '0');
  r.setAttribute('data-custom-accent', th.custom ? '1' : '0');
  r.style.setProperty('--accent-h', th.h);
  r.style.setProperty('--accent-s', th.s);
  r.style.setProperty('--accent-l', th.l);
  r.style.setProperty('--radius-scale', th.radius);
  r.style.setProperty('--font-scale', th.fontScale);
  r.style.setProperty('--glass-blur', th.glassBlur + 'px');
  document.body.classList.toggle('no-aurora', !th.aurora);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', mode === 'dark' ? '#0D0C0B' : '#FAF7F2');
}

/* ------------------------- 视图 / 侧栏 ------------------------- */
function gotoView(v) {
  if (S.ui.view === 'docs') saveDocIfDirty();
  if (S.ui.view === 'agent') { const a = getAgent(S.ui.editAgentId) || curAgent(); persistAgentTab(a, S.ui.editTab || 'base'); }
  S.ui.view = v; save(); renderShell();
}
function closeSideMobile() {
  S.ui.sideOpen = false;
  const app = document.getElementById('app'); if (app) app.classList.remove('side-open');
  const sd = document.querySelector('.side'); if (sd) sd.classList.remove('open');
}
function isNarrow() { return window.matchMedia('(max-width:639px)').matches; }

/* ------------------------- 会话列表 ------------------------- */
function renderTopicList() {
  const el = document.getElementById('topicList'); if (!el) return;
  const q = (S.ui._q || '').toLowerCase();
  const a = curAgent();
  const list = S.topics
    .filter((t) => t.agentId === a.id)
    .filter((t) => !q || String(t.title || '').toLowerCase().includes(q))
    .sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
  el.innerHTML = list.length
    ? list.map((t) => {
        const st = t.stats || {};
        return '<div class="topic-item' + (t.id === S.ui.activeTopicId ? ' on' : '') + '" data-topic="' + t.id + '">' +
          '<div class="meta"><div class="tt">' + esc(t.title || '新会话') + '</div>' +
          '<div class="rl">' + ((t.messages || []).length) + ' 条 · ' + fmtNum(st.totalTokens || 0) + ' tk</div></div>' +
          '<button class="x" data-act="rename-topic" title="重命名">✎</button>' +
          '<button class="x" data-act="del-topic" title="删除">✕</button>' +
        '</div>';
      }).join('')
    : '<div class="kv pad">还没有会话，点上方 ＋ 新建</div>';
}

/* ------------------------- 底部导航（移动端） ------------------------- */
function renderTabbar() {
  const el = document.getElementById('tabbar'); if (!el) return;
  const items = [['chat', '对话', '◆'], ['search', '检索', '⌕'], ['docs', '文档', '▤'], ['github', 'GitHub', '⑂'], ['settings', '设置', '⚙']];
  el.innerHTML = items.map(([k, n, i]) =>
    '<button class="tab' + (S.ui.view === k ? ' on' : '') + '" data-act="goto-' + k + '"><i>' + i + '</i>' + n + '</button>').join('');
}

/* ------------------------- 对话内文档浏览 ------------------------- */
function docChipsFor(m) {
  if (!m || !m.ops) return '';
  const seen = {};
  return m.ops
    .filter((o) => o.type === 'doc' && /^(create|update|append)$/.test(o.op))
    .map((o) => {
      const d = findDoc(o.title);
      if (!d || seen[d.id]) return '';
      seen[d.id] = 1;
      return '<button class="doc-chip" data-act="viewdoc" data-id="' + d.id + '">▤ ' + esc(d.title) + '</button>';
    }).join('');
}
function openDocDrawer(id) {
  const d = findDoc(id);
  if (!d) { toast('文档不存在或已删除', 'err'); return; }
  closeDocDrawer();
  S.ui.docView = d.id;
  const scrim = document.createElement('div'); scrim.className = 'drawer-scrim'; scrim.id = 'docScrim';
  const dr = document.createElement('aside'); dr.className = 'drawer'; dr.id = 'docDrawer';
  dr.innerHTML =
    '<div class="drawer-head">' +
      '<button class="icon-btn" data-act="closedoc" title="关闭">✕</button>' +
      '<div class="dt">' + esc(d.title) + '</div>' +
      '<span class="kv">' + (d.content || '').length + ' 字</span>' +
      '<button class="btn sm" data-act="opendoclib">在文档库打开</button>' +
    '</div>' +
    '<div class="drawer-body"><div class="prose">' + mdRender(d.content || '_（空文档）_') + '</div></div>';
  document.body.appendChild(scrim);
  document.body.appendChild(dr);
  requestAnimationFrame(() => { scrim.classList.add('in'); dr.classList.add('in'); });
  scrim.addEventListener('click', closeDocDrawer);
}
function closeDocDrawer() {
  const scrim = document.getElementById('docScrim');
  const dr = document.getElementById('docDrawer');
  if (scrim) { scrim.classList.remove('in'); setTimeout(() => scrim.remove(), 300); }
  if (dr) { dr.classList.remove('in'); setTimeout(() => dr.remove(), 300); }
  S.ui.docView = null;
}

/* ------------------------- 全文历史检索 ------------------------- */
function escapeRe(v) { return String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function hlSnippet(text, q) {
  const t = String(text || '');
  if (!q) return esc(t.slice(0, 220));
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  const start = i < 0 ? 0 : Math.max(0, i - 70);
  const end = Math.min(t.length, (i < 0 ? 0 : i) + q.length + 190);
  const snip = (start > 0 ? '…' : '') + t.slice(start, end) + (end < t.length ? '…' : '');
  const body = esc(snip);
  try { return body.replace(new RegExp(escapeRe(esc(q)), 'gi'), (mm) => '<mark>' + mm + '</mark>'); }
  catch (e) { return body; }
}
let SEARCH_HITS = [];

function renderSearch() {
  const q = S.ui.search || '';
  $('#body').innerHTML =
  '<div class="scroll"><div class="page">' +
    '<h2>历史检索</h2>' +
    '<div class="sub">在全部会话消息、文档正文与派发记录中做全文检索。⌘K / Ctrl+K 随时唤起</div>' +
    '<div class="search-bar">' +
      '<input id="q" placeholder="输入关键词…（会话标题 / 消息正文 / 文档）" value="' + esc(q) + '" autocomplete="off">' +
      '<button class="btn fix" data-act="goto-chat">返回对话</button>' +
    '</div>' +
    '<div class="search-tabs">' +
      [['all', '全部'], ['msg', '对话'], ['doc', '文档'], ['agent', 'Agent']].map(([k, n]) =>
        '<span class="chip' + (S.ui.searchScope === k ? ' on' : '') + '" data-scope="' + k + '">' + n + '</span>').join('') +
    '</div>' +
    '<div id="hits"></div>' +
  '</div></div>';

  const tabs = $('.search-tabs');
  if (tabs) tabs.addEventListener('click', (e) => {
    const c = e.target.closest('[data-scope]'); if (!c) return;
    S.ui.searchScope = c.dataset.scope; save(); renderSearch();
  });
  const hits = $('#hits');
  if (hits) hits.addEventListener('click', (e) => {
    const saveBtn = e.target.closest('[data-clip]');
    if (saveBtn) {
      const h = SEARCH_HITS[+saveBtn.dataset.clip]; if (!h) return;
      S.docs.unshift({ id: uid('d'), title: '检索摘录 · ' + (h.title || '').slice(0, 18), content: h.text, ownerId: S.ui.activeAgentId, shared: true, updatedAt: now() });
      save(); toast('已存入文档库', 'ok'); return;
    }
    const el = e.target.closest('[data-hit]'); if (!el) return;
    const h = SEARCH_HITS[+el.dataset.hit]; if (!h) return;
    if (h.type === 'doc') { openDocDrawer(h.docId); return; }
    if (h.topicId) {
      S.ui.activeTopicId = h.topicId;
      const t = S.topics.find((x) => x.id === h.topicId);
      if (t) S.ui.activeAgentId = t.agentId;
      S.ui.view = 'chat'; save(); renderShell();
      setTimeout(() => {
        const list = document.querySelectorAll('#msgs .msg');
        const target = list[h.msgIndex];
        if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.style.transition = 'box-shadow .4s'; target.style.boxShadow = '0 0 0 2px var(--accent)'; setTimeout(() => { target.style.boxShadow = 'none'; }, 1600); }
      }, 120);
    }
  });
  renderSearchHits();
}

function renderSearchHits() {
  const box = $('#hits'); if (!box) return;
  const q = (S.ui.search || '').trim();
  if (!q) { box.innerHTML = '<div class="empty">输入关键词开始检索</div>'; return; }
  const scope = S.ui.searchScope || 'all';
  const ql = q.toLowerCase();
  const hits = [];

  if (scope === 'all' || scope === 'msg') {
    S.topics.forEach((t) => {
      const ag = getAgent(t.agentId);
      (t.messages || []).forEach((m, idx) => {
        const c = m.content || '';
        if (c.toLowerCase().includes(ql)) {
          hits.push({
            type: 'msg', title: t.title || '未命名会话',
            meta: (ag ? ag.name : '未知 Agent') + ' · ' + (m._synthetic ? '系统回执' : m.role === 'user' ? '用户' : 'AI') +
                  ' · ' + (m.ts ? fmtTime(m.ts) : fmtTime(t.createdAt)),
            text: c, topicId: t.id, msgIndex: idx,
          });
        }
      });
    });
  }
  if (scope === 'all' || scope === 'doc') {
    S.docs.forEach((d) => {
      const c = (d.title || '') + '\n' + (d.content || '');
      if (c.toLowerCase().includes(ql)) {
        hits.push({ type: 'doc', title: d.title, meta: '文档 · ' + (d.content || '').length + ' 字 · 更新于 ' + relTime(d.updatedAt), text: d.content || '', docId: d.id });
      }
    });
  }
  if (scope === 'all' || scope === 'agent') {
    S.agents.forEach((a) => {
      const c = (a.name || '') + ' @' + (a.roleName || '') + ' ' + (a.desc || '') + ' ' + (a.systemPrompt || '') + ' ' + (a.skills || []).map((s) => s.name).join(' ');
      if (c.toLowerCase().includes(ql)) {
        hits.push({ type: 'agent', title: a.name + ' @' + a.roleName, meta: (a.isMain ? '主控' : 'Agent') + ' · ' + ((a.skills || []).length) + ' skills', text: a.desc || a.systemPrompt || '', agentId: a.id });
      }
    });
  }

  SEARCH_HITS = hits;
  if (!hits.length) { box.innerHTML = '<div class="empty">没有匹配「' + esc(q) + '」的内容</div>'; return; }
  box.innerHTML = '<div class="kv" style="margin-bottom:10px">共 ' + hits.length + ' 条命中</div>' +
    hits.slice(0, 120).map((h, i) =>
      '<div class="hit" data-hit="' + i + '">' +
        '<div class="h1">' + (h.type === 'doc' ? '▤ ' : h.type === 'agent' ? '◆ ' : '❝ ') + esc(h.title) + '</div>' +
        '<div class="hm">' + esc(h.meta) + '</div>' +
        '<div class="hb">' + hlSnippet(h.text, q) + '</div>' +
        (h.type === 'doc' ? '' : '<div class="kv" style="margin-top:8px"><button class="btn sm" data-clip="' + i + '">存入文档库</button></div>') +
      '</div>').join('');
}

/* ------------------------- 云沙盒（e2b 兼容 REST） ------------------------- */
function sandboxCfg() { return S.settings.sandbox || {}; }
async function sbFetch(path, opt) {
  const sb = sandboxCfg();
  if (!sb.endpoint) throw new Error('未配置沙盒 Endpoint');
  const base = String(sb.endpoint).trim().replace(/\/+$/, '');
  const headers = Object.assign({ 'Content-Type': 'application/json' }, (opt && opt.headers) || {});
  if (sb.apiKey) { headers['X-API-KEY'] = sb.apiKey; headers['Authorization'] = 'Bearer ' + sb.apiKey; }
  const r = await fetch(base + path, Object.assign({}, opt || {}, { headers }));
  const txt = await r.text();
  if (!r.ok) throw new Error('HTTP ' + r.status + ' · ' + txt.slice(0, 200));
  try { return JSON.parse(txt); } catch (e) { return { raw: txt }; }
}
async function sandboxCreate() {
  const r = await sbFetch('/sandboxes', { method: 'POST', body: JSON.stringify({ template: 'base' }) });
  const id = r.sandboxID || r.sandboxId || r.id;
  if (!id) throw new Error('创建沙盒失败：' + JSON.stringify(r).slice(0, 200));
  return id;
}
async function sandboxRun(code, id) {
  const sid = id || await sandboxCreate();
  const r = await sbFetch('/sandboxes/' + sid + '/code', { method: 'POST', body: JSON.stringify({ code: String(code) }) });
  const out = [].concat(r.stdout || r.logs?.stdout || []).join('\n');
  const err = [].concat(r.stderr || r.logs?.stderr || []).join('\n');
  if (!id) { try { await sbFetch('/sandboxes/' + sid, { method: 'DELETE' }); } catch (e) {} }
  return { id: sid, out, err, raw: r };
}
async function testSandbox(e) {
  const btn = e && e.target && e.target.closest('[data-act="sandbox-test"]');
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '测试中…'; }
  try {
    const sid = await sandboxCreate();
    const r = await sandboxRun('print("hello from LUCIFER")', sid);
    await sbFetch('/sandboxes/' + sid, { method: 'DELETE' }).catch(() => {});
    S.settings.sandbox.lastOk = now();
    S.settings.sandbox.enabled = true;
    save();
    toast('云沙盒连通 ✓ 沙盒 ' + String(sid).slice(0, 10) + ' 已创建并销毁，输出：' + (r.out || '(空)').slice(0, 60), 'ok');
    if (S.ui.view === 'settings') renderSettings();
  } catch (err) {
    toast('沙盒失败：' + (err.message || err), 'err');
  }
  if (btn) { btn.disabled = false; btn.textContent = label || '测试云沙盒'; }
}
window.CX = { sandboxRun, sandboxCreate, state: () => S };

/* 启动由 Part 4 末尾负责 */


/* =======================================================================
 * LUCIFER · 多智能体中枢  ——  工具与集成（Part 4 / 5）
 * 云沙盒工具 / 联网检索 / 会话 ZIP 导出 / 图片与文件 / GitHub 集成
 * ===================================================================== */

const TOOL_VERSION = 'v2.0';

/* ------------------------- 附件 ------------------------- */
const readAsDataURL = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
const readAsText = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(f); });
function fmtSize(n) { n = n || 0; return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB'; }

function pendingHTML() {
  const p = S.ui.pending || [];
  if (!p.length) return '';
  return '<div class="attach-row">' + p.map((a, i) =>
    '<div class="attach">' +
      (a.kind === 'image' ? '<img src="' + esc(a.data) + '" alt="">' : '<i style="color:var(--accent)">▤</i>') +
      '<span class="an">' + esc(a.name) + '</span>' +
      '<button class="ax" data-act="rmattach" data-i="' + i + '" title="移除">✕</button>' +
    '</div>').join('') + '</div>';
}
function removePending(i) { (S.ui.pending || []).splice(i, 1); save(); renderChat(); }

async function addFiles(files) {
  if (!files || !files.length) return;
  let n = 0;
  for (const f of files) {
    if (f.size > 5 * 1024 * 1024) { toast(f.name + ' 超过 5MB，已跳过', 'err'); continue; }
    const isImg = /^image\//.test(f.type);
    if (isImg) {
      S.ui.pending.push({ id: uid('at'), kind: 'image', name: f.name, mime: f.type, size: f.size, data: await readAsDataURL(f) });
    } else {
      const looksText = /^(text\/|application\/(json|javascript|xml|x-yaml))/.test(f.type) ||
        /\.(txt|md|json|js|mjs|ts|tsx|jsx|py|html|css|scss|csv|yml|yaml|log|sh|toml|ini|sql|java|go|rs|c|cpp|h)$/i.test(f.name);
      let text = '';
      if (looksText && f.size < 400 * 1024) text = (await readAsText(f)).slice(0, 80000);
      S.ui.pending.push({ id: uid('at'), kind: 'file', name: f.name, mime: f.type, size: f.size, text });
    }
    n++;
  }
  if (n) { save(); renderChat(); toast('已添加 ' + n + ' 个附件'); }
}

function mediaHTML(m) {
  const atts = (m && m.attachments) || [];
  if (!atts.length) return '';
  const imgs = atts.filter((a) => a.kind === 'image');
  const files = atts.filter((a) => a.kind === 'file');
  let h = '';
  if (imgs.length) h += '<div class="msg-imgs">' + imgs.map((a) =>
    '<img class="msg-img" src="' + esc(a.data) + '" data-act="lightbox" alt="' + esc(a.name) + '">').join('') + '</div>';
  if (files.length) h += '<div class="msg-files">' + files.map((a) =>
    '<span class="file-chip"><i>▤</i>' + esc(a.name) + '<span class="kv">' + fmtSize(a.size) + '</span></span>').join('') + '</div>';
  return h;
}

/* 把带附件的消息转成 API 的 content（多模态） */
function toApiContent(m) {
  const atts = (m && m.attachments) || [];
  if (!atts.length) return m.content || '';
  let text = m.content || '';
  const fileTexts = atts.filter((a) => a.kind === 'file' && a.text)
    .map((a) => '【附件 ' + a.name + '】\n' + a.text);
  if (fileTexts.length) text = (text ? text + '\n\n' : '') + fileTexts.join('\n\n');
  const imgs = atts.filter((a) => a.kind === 'image');
  const parts = [];
  if (text) parts.push({ type: 'text', text });
  imgs.forEach((a) => parts.push({ type: 'image_url', image_url: { url: a.data } }));
  if (!parts.length) return m.content || '';
  return parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts;
}

function openLightbox(src) {
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.innerHTML = '<img src="' + esc(src) + '" alt="">';
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  const close = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 220); };
  el.addEventListener('click', close);
  document.addEventListener('keydown', function esc2(ev) { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', esc2); } });
}

/* ------------------------- 云沙盒工具 ------------------------- */
async function toolSandbox(op) {
  const sb = S.settings.sandbox || {};
  if (!sb.enabled || !sb.endpoint) throw new Error('云沙盒未启用或未配置 Endpoint');
  const lang = (op.lang || 'python').toLowerCase();
  let code = op.code;
  if (lang === 'shell' || lang === 'bash' || lang === 'sh') code = 'import subprocess\nprint(subprocess.run(' + JSON.stringify(op.code) + ', shell=True, capture_output=True, text=True).stdout)';
  const r = await sandboxRun(code);
  let out = '【沙盒执行完成】\n';
  if (r.out) out += r.out;
  if (r.err) out += '\n[stderr]\n' + r.err;
  if (!r.out && !r.err) out += '（无输出）';
  return out;
}

/* ------------------------- 联网检索 ------------------------- */
function searchCfg() { return Object.assign({ provider: 'none', endpoint: '', enabled: false, count: 5, lastOk: 0 }, S.settings.search || {}); }

async function webSearch(query, count) {
  const se = searchCfg();
  if (!se.enabled || se.provider === 'none') throw new Error('未启用联网检索（设置 → ④ 联网检索）');
  const n = Math.max(1, Math.min(20, count || se.count || 5));
  const ep = (se.endpoint || '').trim();
  if (!ep) throw new Error('未填写检索地址 / API Key');
  const norm = (arr, tf) => (arr || []).slice(0, n).map(tf).filter((x) => x && x.url);

  if (se.provider === 'searxng') {
    const u = ep.replace(/\/+$/, '') + '/search?format=json&language=zh-CN&safesearch=0&q=' + encodeURIComponent(query);
    const r = await fetch(u);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return norm(j.results, (x) => ({ title: x.title, url: x.url, snippet: x.content || '' }));
  }
  if (se.provider === 'tavily') {
    const r = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: ep, query, max_results: n, search_depth: 'basic' }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.detail || j.message || ('HTTP ' + r.status));
    return norm(j.results, (x) => ({ title: x.title, url: x.url, snippet: x.content || '' }));
  }
  if (se.provider === 'brave') {
    const r = await fetch('https://api.search.brave.com/res/v1/web/search?count=' + n + '&q=' + encodeURIComponent(query),
      { headers: { 'Accept': 'application/json', 'X-Subscription-Token': ep } });
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.detail) || ('HTTP ' + r.status));
    return norm(j.web && j.web.results, (x) => ({ title: x.title, url: x.url, snippet: x.description || '' }));
  }
  if (se.provider === 'serper') {
    const r = await fetch('https://google.serper.dev/search', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': ep }, body: JSON.stringify({ q: query, num: n }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || ('HTTP ' + r.status));
    return norm(j.organic, (x) => ({ title: x.title, url: x.link, snippet: x.snippet || '' }));
  }
  throw new Error('未知的检索服务商：' + se.provider);
}

async function testSearch(e) {
  persistCfg();
  const btn = e && e.target && e.target.closest('[data-act="search-test"]');
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '检索中…'; }
  try {
    const rs = await webSearch('LobeHub 多智能体', 3);
    S.settings.search.lastOk = now(); save();
    toast('检索连通 ✓ 返回 ' + rs.length + ' 条：' + (rs[0] ? rs[0].title.slice(0, 24) : ''), 'ok');
    if (S.ui.view === 'settings') renderSettings();
  } catch (err) {
    toast('检索失败：' + (err.message || err), 'err');
  }
  if (btn) { btn.disabled = false; btn.textContent = label || '测试检索'; }
}

function toolSearch(op) {
  return webSearch(op.query, op.count).then((rs) => {
    if (!rs.length) return '【检索「' + op.query + '」】没有找到结果。';
    return '【检索「' + op.query + '」共 ' + rs.length + ' 条】\n' +
      rs.map((x, i) => (i + 1) + '. ' + x.title + '\n   ' + x.url + '\n   ' + (x.snippet || '').replace(/\s+/g, ' ').slice(0, 220)).join('\n');
  });
}

/* ------------------------- ZIP（纯 JS，store 模式） ------------------------- */
const CRC_T = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function zipStore(entries) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  const d = new Date();
  const dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  for (const e of entries) {
    const nameB = enc.encode(e.name);
    const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), nameB, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true);
    ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true); ch.setUint16(28, nameB.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  }
  let cdSize = 0; central.forEach((c) => { cdSize += c.length; });
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob(chunks.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function safeName(s) { return String(s || '').replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60) || 'untitled'; }

async function exportTopicZip(e) {
  const btn = e && e.target && e.target.closest('[data-act="export-zip"]');
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '打包中…'; }
  try {
    const a = curAgent();
    const t = ensureTopic(a.id);
    const stamp = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = stamp.getFullYear() + pad(stamp.getMonth() + 1) + pad(stamp.getDate()) + '-' + pad(stamp.getHours()) + pad(stamp.getMinutes());
    const st = t.stats || {};
    const usedDocs = [];
    (t.messages || []).forEach((m) => (m.ops || []).forEach((o) => {
      if (o.type === 'doc' && o.title) { const d = findDoc(o.title); if (d && !usedDocs.some((x) => x.id === d.id)) usedDocs.push(d); }
    }));

    /* 可读转录 */
    const md = ['# ' + (t.title || '会话') , '',
      '- Agent：' + a.name + ' (@' + a.roleName + ')',
      '- 创建时间：' + fmtTime(t.createdAt || now()),
      '- 消息数：' + (t.messages || []).length,
      '- Token：' + fmtNum(st.totalTokens || 0) + '（输入 ' + fmtNum(st.promptTokens || 0) + ' / 输出 ' + fmtNum(st.completionTokens || 0) + '）',
      '- 请求次数：' + (st.requests || 0),
      '', '---', ''];
    (t.messages || []).forEach((m, i) => {
      const who = m._synthetic ? '系统回执' : m.role === 'user' ? '👤 用户' : '🤖 ' + a.name;
      md.push('## ' + (i + 1) + '. ' + who + (m.ts ? '　' + fmtTime(m.ts) : ''));
      if ((m.attachments || []).length) {
        md.push('', '> 附件：' + m.attachments.map((x) => x.name + '（' + (x.kind === 'image' ? '图片' : '文件') + '）').join('、'));
      }
      md.push('', m.content || '（无正文）', '');
      (m.ops || []).forEach((o) => {
        md.push('### 工具调用 · ' + (o.type === 'call' ? '派发 ' + o.agent : o.type === 'doc' ? '文档 ' + o.op + (o.title ? '「' + o.title + '」' : '') : o.type));
        if (o.task) md.push('', '**任务**：' + o.task);
        if (o.result) md.push('', '**回执**：', '', '```', String(o.result).slice(0, 4000), '```');
        md.push('');
      });
      md.push('---', '');
    });

    const manifest = {
      app: 'LUCIFER', version: TOOL_VERSION, exportedAt: new Date().toISOString(),
      agent: { name: a.name, role: a.roleName, model: modelFor(a), provider: (providerFor(a) || {}).name },
      topic: { id: t.id, title: t.title, createdAt: t.createdAt, stats: st, messages: t.messages },
      docs: usedDocs.map((d) => ({ id: d.id, title: d.title, updatedAt: d.updatedAt, content: d.content })),
    };

    const entries = [
      { name: 'README.md', data: md.join('\n') },
      { name: 'conversation.json', data: JSON.stringify(t.messages || [], null, 2) },
      { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
    ];
    usedDocs.forEach((d) => entries.push({ name: 'docs/' + safeName(d.title) + '.md', data: d.content || '' }));
    (t.messages || []).forEach((m, i) => {
      (m.attachments || []).forEach((att, j) => {
        if (att.kind === 'image' && att.data && att.data.indexOf('base64,') > 0) {
          const b64 = att.data.split('base64,')[1];
          const bin = atob(b64); const u8 = new Uint8Array(bin.length);
          for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
          entries.push({ name: 'attachments/' + pad(i + 1) + '-' + (j + 1) + '-' + safeName(att.name), data: u8 });
        } else if (att.text) {
          entries.push({ name: 'attachments/' + pad(i + 1) + '-' + (j + 1) + '-' + safeName(att.name), data: att.text });
        }
      });
    });

    downloadBlob(zipStore(entries), safeName((t.title || 'conversation')) + '-' + dateStr + '.zip');
    toast('已导出 ZIP：' + entries.length + ' 个文件', 'ok');
  } catch (err) {
    toast('导出失败：' + (err.message || err), 'err');
  }
  if (btn) { btn.disabled = false; btn.textContent = label || '导出会话 ZIP'; }
}

/* ------------------------- GitHub 集成 ------------------------- */
function ghCfg() { return Object.assign({ token: '', user: '', enabled: false, lastOk: 0 }, S.settings.github || {}); }
function ghState() { if (!S.ui.gh) S.ui.gh = { repo: null, path: null, tab: 'repos', runs: [], repos: [] }; return S.ui.gh; }

async function ghFetch(path, opt) {
  const gh = ghCfg();
  if (!gh.token) throw new Error('未配置 GitHub Token');
  const r = await fetch('https://api.github.com' + path, Object.assign({}, opt || {}, {
    headers: Object.assign({
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + gh.token,
      'X-GitHub-Api-Version': '2022-11-28',
    }, (opt && opt.headers) || {}),
  }));
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (err) {}
  if (!r.ok) throw new Error((j && j.message) || ('HTTP ' + r.status + ' ' + txt.slice(0, 140)));
  return j;
}
function b64d(b64) { const bin = atob(String(b64 || '').replace(/\s/g, '')); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new TextDecoder().decode(u8); }
function b64e(str) { const u8 = new TextEncoder().encode(str); let bin = ''; for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]); return btoa(bin); }

async function ghConnect(e) {
  persistCfg();
  const btn = e && e.target && e.target.closest('[data-act="gh-connect"]');
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '连接中…'; }
  try {
    const me = await ghFetch('/user');
    S.settings.github.user = me.login;
    S.settings.github.enabled = true;
    S.settings.github.lastOk = now();
    save();
    toast('已连接 GitHub：@' + me.login, 'ok');
    if (S.ui.view === 'settings') renderSettings(); else renderShell();
  } catch (err) {
    toast('GitHub 连接失败：' + (err.message || err), 'err');
  }
  if (btn) { btn.disabled = false; btn.textContent = label || '连接并读取账号'; }
}

async function ghLoadRepos() {
  const g = ghState();
  try {
    const rs = await ghFetch('/user/repos?sort=updated&per_page=60&affiliation=owner,collaborator');
    g.repos = rs.map((r) => ({ full: r.full_name, name: r.name, private: r.private, desc: r.description, url: r.html_url, branch: r.default_branch, updated: r.updated_at }));
    if (S.ui.view === 'github') renderGithub();
  } catch (err) {
    toast('拉取仓库失败：' + (err.message || err), 'err');
  }
}

async function ghOpenRepo(full) {
  const g = ghState();
  g.repo = full; g.path = null; g.file = null; g.tab = 'files'; g.tree = null; g.runs = [];
  renderGithub();
  try {
    const info = await ghFetch('/repos/' + full);
    g.info = { branch: info.default_branch, private: info.private, desc: info.description, url: info.html_url };
    const tree = await ghFetch('/repos/' + full + '/contents/?ref=' + (info.default_branch || 'main'));
    g.tree = Array.isArray(tree) ? tree : [];
    renderGithub();
    ghLoadRuns(full);
  } catch (err) {
    toast('读取仓库失败：' + (err.message || err), 'err');
  }
}

async function ghOpenFile(path) {
  const g = ghState();
  try {
    const f = await ghFetch('/repos/' + g.repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/'));
    g.path = path; g.file = { sha: f.sha, content: b64d(f.content), size: f.size };
    renderGithub();
  } catch (err) {
    toast('读取文件失败：' + (err.message || err), 'err');
  }
}

async function ghSaveFile(e) {
  const g = ghState();
  const area = document.getElementById('ghEditor');
  if (!area || !g.repo || !g.path) return;
  const btn = e && e.target && e.target.closest('[data-act="gh-save"]');
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }
  try {
    const body = {
      message: (document.getElementById('ghMsg') || {}).value || ('update ' + g.path),
      content: b64e(area.value),
      branch: (g.info && g.info.branch) || 'main',
    };
    if (g.file && g.file.sha) body.sha = g.file.sha;
    const r = await ghFetch('/repos/' + g.repo + '/contents/' + g.path.split('/').map(encodeURIComponent).join('/'), {
      method: 'PUT', body: JSON.stringify(body),
    });
    g.file.sha = r.content && r.content.sha;
    g.file.content = area.value;
    toast('已提交 ✓ ' + (r.commit && r.commit.sha ? r.commit.sha.slice(0, 7) : ''), 'ok');
  } catch (err) {
    toast('提交失败：' + (err.message || err), 'err');
  }
  if (btn) { btn.disabled = false; btn.textContent = label || '提交到仓库'; }
}

async function ghLoadRuns(repo) {
  const g = ghState();
  try {
    const r = await ghFetch('/repos/' + (repo || g.repo) + '/actions/runs?per_page=10');
    g.runs = (r.workflow_runs || []).map((x) => ({ id: x.id, name: x.name, status: x.status, conclusion: x.conclusion, branch: x.head_branch, event: x.event, url: x.html_url, at: x.created_at }));
    if (S.ui.view === 'github') renderGithub();
  } catch (err) {
    g.runs = [];
    if (S.ui.view === 'github') renderGithub();
  }
}

async function ghTriggerWorkflow(e) {
  const g = ghState();
  const sel = document.getElementById('ghWf');
  const wf = sel ? sel.value : '';
  if (!wf) { toast('请先填写 workflow 文件名', 'err'); return; }
  const btn = e && e.target && e.target.closest('[data-act="gh-run-wf"]');
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '触发中…'; }
  try {
    await ghFetch('/repos/' + g.repo + '/actions/workflows/' + encodeURIComponent(wf) + '/dispatches', {
      method: 'POST', body: JSON.stringify({ ref: (g.info && g.info.branch) || 'main' }),
    });
    toast('已触发 CI：' + wf + '（约 10 秒后刷新可见）', 'ok');
    setTimeout(() => ghLoadRuns(g.repo), 6000);
  } catch (err) {
    toast('触发失败：' + (err.message || err), 'err');
  }
  if (btn) { btn.disabled = false; btn.textContent = label || '触发 CI'; }
}

/* Agent 可调用的 GitHub 指令 */
async function ghOp(o) {
  const g = ghState();
  const repo = o.repo || g.repo;
  switch (o.op) {
    case 'list': {
      const t = await ghFetch('/repos/' + repo + '/contents/');
      return '【' + repo + ' 根目录】\n' + (Array.isArray(t) ? t.map((x) => (x.type === 'dir' ? '📁 ' : '📄 ') + x.name).join('\n') : '（空）');
    }
    case 'read': {
      const f = await ghFetch('/repos/' + repo + '/contents/' + o.path);
      return '【' + repo + '/' + o.path + '】\n' + b64d(f.content).slice(0, 8000);
    }
    case 'write': {
      let sha;
      try { const cur = await ghFetch('/repos/' + repo + '/contents/' + o.path); sha = cur.sha; } catch (e) {}
      const body = { message: o.message || ('chore: update ' + o.path), content: b64e(o.content || ''), branch: o.branch || 'main' };
      if (sha) body.sha = sha;
      const r = await ghFetch('/repos/' + repo + '/contents/' + o.path, { method: 'PUT', body: JSON.stringify(body) });
      return '已提交 ' + repo + '/' + o.path + '（' + (r.commit ? r.commit.sha.slice(0, 7) : '') + '）';
    }
    case 'create': {
      const r = await ghFetch('/user/repos', { method: 'POST', body: JSON.stringify({ name: o.name, description: (o.content || '').slice(0, 300), private: String(o.priv) !== 'false', auto_init: true }) });
      S.settings.github.lastOk = now(); save();
      return '已创建仓库 ' + r.full_name + '（' + (r.private ? '私有' : '公开') + '） ' + r.html_url;
    }
    case 'runs': {
      const r = await ghFetch('/repos/' + repo + '/actions/runs?per_page=6');
      const list = (r.workflow_runs || []);
      return '【最近 CI 运行】\n' + (list.length ? list.map((x) => '- ' + x.name + ' · ' + x.status + (x.conclusion ? ' / ' + x.conclusion : '') + ' · ' + x.head_branch + ' · ' + x.created_at).join('\n') : '（没有运行记录）');
    }
    case 'run': {
      await ghFetch('/repos/' + repo + '/actions/workflows/' + encodeURIComponent(o.workflow) + '/dispatches', { method: 'POST', body: JSON.stringify({ ref: o.branch || 'main' }) });
      return '已触发 workflow ' + o.workflow + '（ref=' + (o.branch || 'main') + '）';
    }
    default: return '不支持的 GitHub 操作：' + o.op;
  }
}

/* ------------------------- 工具指令统一分发 ------------------------- */
async function execToolOp(o) {
  if (o.type === 'doc') return execDocOp(o);
  if (o.type === 'sandbox') return toolSandbox(o);
  if (o.type === 'search') return toolSearch(o);
  if (o.type === 'gh') return ghOp(o);
  return '未知指令类型：' + o.type;
}

/* ------------------------- GitHub 视图 ------------------------- */
function concludeTag(run) {
  if (run.status !== 'completed') return '<span class="tag warn">' + (run.status === 'in_progress' ? '运行中' : run.status) + '</span>';
  return run.conclusion === 'success' ? '<span class="tag ok">成功</span>' : '<span class="tag err">' + (run.conclusion || '失败') + '</span>';
}

function renderGithub() {
  const gh = ghCfg();
  const g = ghState();
  const body = document.getElementById('body');
  if (!body) return;
  if (!gh.token) {
    body.innerHTML = '<div class="scroll"><div class="page"><h2>GitHub</h2>' +
      '<div class="sub">让 Agent 帮你建仓库、提交代码、跑 CI。先在设置里填 Personal Access Token。</div>' +
      '<div class="empty">还没有配置 Token<br><br><button class="btn pri" data-act="goto-settings">去设置</button></div></div></div>';
    return;
  }
  const repos = (g.repos || []).map((r) =>
    '<div class="gh-repo" data-repo="' + esc(r.full) + '" data-act="gh-open">' +
      '<span style="font-size:16px">' + (r.private ? '🔒' : '📖') + '</span>' +
      '<div style="flex:1;min-width:0"><div class="rn">' + esc(r.full) + '</div>' +
      '<div class="rd">' + esc(r.desc || '（无描述）') + ' · ' + esc(r.branch || 'main') + '</div></div>' +
      '<span class="kv">' + (r.updated ? r.updated.slice(0, 10) : '') + '</span>' +
    '</div>').join('');

  let detail = '';
  if (g.repo) {
    const files = (g.tree || []).map((f) =>
      '<div class="gh-file" data-path="' + esc(f.path) + '" data-act="gh-file">' + (f.type === 'dir' ? '📁' : '📄') + ' ' + esc(f.name) + '</div>').join('');
    const runs = (g.runs || []).map((r) =>
      '<div class="gh-file" style="cursor:default">' + concludeTag(r) +
      '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.name || '') + '</span>' +
      '<span class="kv">' + esc(r.branch || '') + ' · ' + (r.at ? r.at.slice(5, 16).replace('T', ' ') : '') + '</span>' +
      (r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener" style="font-size:11px">详情</a>' : '') + '</div>').join('');

    let editor = '';
    if (g.path) {
      editor = '<div class="card"><h3>✎ ' + esc(g.path) + ' <span class="kv">' + fmtSize((g.file && g.file.size) || 0) + '</span>' +
        '<span class="spacer"></span><button class="btn sm" data-act="gh-close-file">关闭</button></h3>' +
        '<div class="fld"><label>提交信息</label><input id="ghMsg" value="update ' + esc(g.path) + '"></div>' +
        '<div class="fld"><textarea id="ghEditor" rows="16" spellcheck="false">' + esc((g.file && g.file.content) || '') + '</textarea></div>' +
        '<div class="row"><button class="btn pri fix" data-act="gh-save">提交到仓库</button></div></div>';
    }

    detail = '<div class="card"><h3>' + (g.info && g.info.private ? '🔒 ' : '📖 ') + esc(g.repo) +
        '<span class="spacer"></span><button class="btn sm" data-act="gh-repos">← 返回仓库列表</button></h3>' +
        '<div class="sub" style="margin:0 0 12px">' + esc((g.info && g.info.desc) || '') +
        (g.info && g.info.url ? ' · <a href="' + esc(g.info.url) + '" target="_blank" rel="noopener">在 GitHub 打开</a>' : '') + '</div>' +
        (files ? '<div class="fld"><label>仓库文件（根目录）</label>' + files + '</div>' : '<div class="kv">加载中…</div>') +
      '</div>' +
      editor +
      '<div class="card"><h3>Actions / CI</h3>' +
        '<div class="row"><input id="ghWf" class="fix" style="flex:1" placeholder="workflow 文件名，如 ci.yml">' +
        '<button class="btn pri fix" data-act="gh-run-wf">触发 CI</button>' +
        '<button class="btn fix" data-act="gh-refresh-runs">刷新</button></div>' +
        '<div class="mt">' + (runs || '<div class="kv">还没有运行记录</div>') + '</div>' +
      '</div>';
  }

  body.innerHTML = '<div class="scroll"><div class="page">' +
    '<h2>GitHub</h2>' +
    '<div class="sub">已连接 <b style="color:var(--accent)">@' + esc(gh.user || '未知') + '</b>' +
      (gh.lastOk ? ' · ' + relTime(gh.lastOk) : '') + '</div>' +
    (g.repo ? detail :
      '<div class="row" style="margin-bottom:14px"><button class="btn pri fix" data-act="gh-newrepo">＋ 新建仓库</button>' +
      '<button class="btn fix" data-act="gh-repos" style="display:none"></button>' +
      '<span class="kv">共 ' + (g.repos || []).length + ' 个仓库</span></div>' +
      (repos || '<div class="empty">还没有仓库，点上方「新建仓库」，或让 Agent 用 &lt;gh op="create"&gt; 创建</div>')) +
  '</div></div>';
}

function openNewRepoDialog() {
  modal('<h3>新建 GitHub 仓库</h3><div class="dsc">会在你的账号下创建，默认勾选自动初始化 README。</div>' +
    '<div class="fld"><label>仓库名</label><input id="nrName" placeholder="my-project"></div>' +
    '<div class="fld"><label>描述</label><input id="nrDesc" placeholder="可选"></div>' +
    '<div class="switch"><div><div class="lbl">私有仓库</div><div class="dsc">建议个人项目保持私有</div></div>' +
      '<div class="tgl on" data-nr-priv="1"></div></div>' +
    '<div class="act"><button class="btn" data-x="c">取消</button><button class="btn pri" data-x="ok">创建</button></div>',
    (m, close) => {
      let priv = true;
      m.addEventListener('click', async (ev) => {
        const tgl = ev.target.closest('[data-nr-priv]');
        if (tgl) { priv = !priv; tgl.classList.toggle('on', priv); return; }
        const x = ev.target.closest('[data-x]'); if (!x) return;
        if (x.dataset.x === 'ok') {
          const name = ($('#nrName', m).value || '').trim();
          if (!name) { toast('请填仓库名', 'err'); return; }
          try {
            const r = await ghFetch('/user/repos', { method: 'POST', body: JSON.stringify({ name, description: ($('#nrDesc', m).value || '').trim(), private: priv, auto_init: true }) });
            toast('已创建 ' + r.full_name, 'ok');
            close(); await ghLoadRepos(); ghOpenRepo(r.full_name);
          } catch (err) { toast('创建失败：' + (err.message || err), 'err'); }
          return;
        }
        close();
      });
    });
}

/* 工具类指令卡片的渲染 */
function toolOpHTML(i, icon, title, body, o) {
  const st = o.status === 'running' ? '<span class="tag warn">进行中</span>'
    : o.status === 'error' ? '<span class="tag err">失败</span>' : '<span class="tag ok">已执行</span>';
  return '<div class="op' + (o.status === 'error' ? ' open' : '') + '" data-op="' + i + '">' +
    '<div class="oh"><span class="oi">' + icon + '</span><span class="ttl">' + title + '</span>' + st +
    '<span class="chev">⌄</span></div>' +
    '<div class="ob"><div class="prose">' + (body ? mdRender(body) : '<span class="kv">（无输出）</span>') + '</div></div></div>';
}

/* 启动由 Part 5 末尾负责 */


/* =======================================================================
 * LUCIFER · 多智能体中枢  ——  浮层与接入点（Part 5 / 5）
 * 服务商管理（由「软件代码开发」Agent 产出后整合）
 * ☰ 二级菜单 / 模型选择器 / 右上角 Agent 菜单（由「网页APPui设计师」Agent 规范落地）
 * ===================================================================== */

/* ------------------------- 浮层管理器 ------------------------- */
let POP_OPEN = null;
function closePops() {
  document.querySelectorAll('.pop').forEach((p) => p.remove());
  const m = document.querySelector('.pop-mask'); if (m) m.remove();
  document.querySelectorAll('[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  POP_OPEN = null;
}
function showPop(key, anchor, html, opts) {
  opts = opts || {};
  if (POP_OPEN === key) { closePops(); return null; }
  closePops();
  const pop = document.createElement('div');
  pop.className = 'pop ' + (opts.cls || '');
  pop.innerHTML = html;
  document.body.appendChild(pop);
  const mask = document.createElement('div');
  mask.className = 'pop-mask';
  mask.addEventListener('mousedown', (e) => { e.preventDefault(); closePops(); });
  document.body.appendChild(mask);
  if (opts.after) opts.after(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth || 240, ph = pop.offsetHeight || 200;
  let left = opts.align === 'right' ? r.right - pw : r.left;
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
  let top = r.bottom + 8;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 8);
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
  requestAnimationFrame(() => pop.classList.add('in'));
  if (anchor.setAttribute) anchor.setAttribute('aria-expanded', 'true');
  POP_OPEN = key;
  return pop;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && POP_OPEN) { e.stopPropagation(); closePops(); } });

/* ------------------------- ☰ 二级菜单 ------------------------- */
function navMenuHTML() {
  const p = providerFor(curAgent());
  return '<div class="nav-group-title">服务商与模型</div>' +
      '<button class="nav-item" data-act="goto-providers"><span class="ico">◈</span>服务商与模型' +
      '<span class="meta">' + esc(p ? p.name : '未配置') + '</span></button>' +
    '<div class="nav-divider"></div>' +
    '<div class="nav-group-title">工作区</div>' +
      '<button class="nav-item" data-act="goto-docs"><span class="ico">▤</span>文档库</button>' +
      '<button class="nav-item" data-act="goto-search"><span class="ico">⌕</span>历史检索<span class="kbd">⌘K</span></button>' +
      '<button class="nav-item" data-act="goto-github"><span class="ico">⑂</span>GitHub</button>' +
      '<button class="nav-item" data-act="export-zip"><span class="ico">⤓</span>导出当前会话 ZIP</button>' +
    '<div class="nav-divider"></div>' +
      '<button class="nav-item" data-act="addagent"><span class="ico">＋</span>新建 Agent</button>' +
      '<button class="nav-item" data-act="goto-settings"><span class="ico">⚙</span>设置</button>' +
      '<button class="nav-item" data-act="toggle-rail"><span class="ico">⇤</span>' + (S.ui.collapsed ? '展开侧栏' : '收起侧栏') + '<span class="kbd">⌘B</span></button>';
}
function toggleNavMenu() {
  const anchor = document.querySelector('.burger');
  if (!anchor) return;
  showPop('nav', anchor, navMenuHTML(), { cls: 'nav-menu', align: 'left' });
}

/* ------------------------- 右上角 Agent 菜单 ------------------------- */
function agentMenuHTML() {
  const a = curAgent();
  const list = S.agents.map((x) =>
    '<button class="agent-item' + (x.id === a.id ? ' on' : '') + (x.isMain ? ' is-main' : '') +
    '" data-act="switch-agent" data-id="' + x.id + '">' +
      avatarHTML(x, 'sm') +
      '<span class="col"><span class="nm">' + esc(x.name) + (x.isMain ? ' ✦' : '') + '</span>' +
      '<span class="rl">@' + esc(x.roleName) + '</span></span>' +
      (x.id === a.id ? '<span class="ck">✓</span>' : '') +
    '</button>').join('');
  return '<button class="agent-item" data-act="newtopic">' +
      '<span class="ico" style="width:24px;text-align:center;color:var(--accent)">＋</span>' +
      '<span class="col"><span class="nm">新对话</span><span class="rl">在当前 Agent 下开新会话</span></span></button>' +
    '<button class="agent-item' + (a.isMain ? ' dis' : '') + '" data-act="switch-main">' +
      '<span class="ico" style="width:24px;text-align:center;color:var(--accent)">✦</span>' +
      '<span class="col"><span class="nm">切换到主控</span><span class="rl">回到总控 Agent</span></span></button>' +
    '<div class="nav-divider"></div>' +
    '<div class="nav-group-title">切换 Agent</div>' +
    '<div class="agent-list">' + list + '</div>' +
    '<div class="nav-divider"></div>' +
    '<button class="agent-item" data-act="editagent">' +
      '<span class="ico" style="width:24px;text-align:center">⚙</span>' +
      '<span class="col"><span class="nm">Agent 设置</span><span class="rl">' + esc(a.name) + '</span></span></button>';
}
function toggleAgentMenu() {
  const anchor = document.querySelector('.agent-menu-btn');
  if (!anchor) return;
  showPop('agent', anchor, agentMenuHTML(), { cls: 'agent-pop', align: 'right' });
}

/* ------------------------- 会话中心（右上角） ------------------------- */
function convMenuHTML() {
  const cur = curAgent();
  const groups = S.agents.map((a) => {
    const ts = S.topics.filter((t) => t.agentId === a.id)
      .sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
    const items = ts.length
      ? ts.map((t) =>
          '<button class="conv-item' + ((t.id === S.ui.activeTopicId && a.id === S.ui.activeAgentId) ? ' on' : '') +
          '" data-act="open-topic" data-topic="' + t.id + '">' +
            '<span class="ico">' + (a.avatar && /^(data:|https?:)/.test(a.avatar) ? '▣' : (a.avatar || '◆')) + '</span>' +
            '<span class="col"><span class="nm">' + esc(t.title || '新会话') + '</span>' +
            '<span class="rl">' + ((t.messages || []).length) + ' 条 · ' + fmtNum((t.stats || {}).totalTokens || 0) + ' tk · ' + relTime(t.createdAt) + '</span></span>' +
          '</button>').join('')
      : '<div class="kv" style="padding:6px 12px 10px">还没有会话</div>';
    return '<div class="nav-group-title">' + esc(a.name) + (a.isMain ? ' ✦' : '') +
      '<span class="kv">@' + esc(a.roleName) + '</span></div>' + items;
  }).join('');
  return '<button class="conv-item new" data-act="newtopic">' +
      '<span class="ico">＋</span><span class="col"><span class="nm">新对话</span>' +
      '<span class="rl">在「' + esc(cur.name) + '」下开新会话</span></span></button>' +
    '<div class="nav-divider"></div>' +
    groups +
    '<div class="nav-divider"></div>' +
    '<button class="conv-item" data-act="goto-search">' +
      '<span class="ico">⌕</span><span class="col"><span class="nm">全文检索全部会话</span>' +
      '<span class="rl">跨 Agent 搜索消息与文档</span></span></button>';
}
function toggleConvMenu() {
  const anchor = document.querySelector('.conv-btn');
  if (!anchor) return;
  showPop('conv', anchor, convMenuHTML(), { cls: 'conv-pop', align: 'right' });
}

/* ------------------------- 模型选择器 ------------------------- */
function modelPillHTML() {
  const a = curAgent();
  const p = providerFor(a);
  const m = modelFor(a);
  const isGlobal = !a.model;
  return '<button class="model-pill" data-act="model-menu" aria-expanded="false" ' +
    'title="' + esc((p ? p.name : '无服务商') + ' · ' + (m || '未选择模型') + (isGlobal ? '（跟随全局）' : '')) + '">' +
    '<span class="dot">◈</span><span class="name">' + esc(m || '未选择模型') + '</span><span class="chev">⌄</span></button>';
}
function modelListHTML(q) {
  const a = curAgent();
  const p = providerFor(a);
  const models = (p && p.models) || [];
  const list = models.filter((m) => !q || m.toLowerCase().indexOf(q) >= 0);
  if (!list.length) {
    return '<div class="empty" style="padding:22px 10px">' +
      (models.length ? '没有匹配「' + esc(q) + '」的模型' : '该服务商还没有模型<br>去「服务商与模型」点拉取') + '</div>';
  }
  return list.map((m) =>
    '<div class="model-opt' + (a.model === m ? ' on' : '') + '" data-act="pick-model" data-model="' + esc(m) + '">' +
    '<span class="nm">' + esc(m) + '</span><span class="ck">✓</span></div>').join('');
}
function modelPopHTML() {
  const a = curAgent();
  const ps = S.settings.providers || [];
  const cur = providerFor(a);
  return '<div class="prov-row">' +
      ps.map((x) => '<span class="chip' + (cur && x.id === cur.id ? ' on' : '') + '" data-act="pick-provider" data-id="' + x.id + '">' +
        esc(x.name) + '</span>').join('') +
      '<span class="chip" data-act="goto-providers">＋ 管理</span>' +
    '</div>' +
    '<input class="search" id="modelSearch" placeholder="搜索模型…" autocomplete="off">' +
    '<div class="list" id="modelList">' + modelListHTML('') + '</div>' +
    '<div class="nav-divider"></div>' +
    '<div class="model-opt' + (!a.model ? ' on' : '') + '" data-act="pick-model" data-model="">' +
    '<span class="nm">跟随全局默认 · ' + esc(S.settings.defaultModel || '未设置') + '</span><span class="ck">✓</span></div>';
}
function toggleModelMenu() {
  const anchor = document.querySelector('.model-pill');
  if (!anchor) return;
  showPop('model', anchor, modelPopHTML(), {
    cls: 'model-pop', align: 'right',
    after: (pop) => {
      const s = pop.querySelector('#modelSearch');
      const l = pop.querySelector('#modelList');
      if (s) {
        s.addEventListener('input', () => {
          const q = s.value.trim().toLowerCase();
          if (l) l.innerHTML = modelListHTML(q);
        });
        if (!isNarrow()) setTimeout(() => s.focus(), 40);
      }
    },
  });
}

/* ------------------------- 服务商管理面板 ------------------------- */
let PROV_ROOT = null;

function renderProviders() {
  const body = document.getElementById('body');
  if (!body) return;
  S.ui.view = 'providers';
  const ps = S.settings.providers || [];
  const active = S.settings.activeProviderId;
  const open = S.ui._provOpen || null;

  const cards = ps.map((p) => {
    const isActive = p.id === active;
    const models = p.models || [];
    const hasKey = !!p.apiKey;
    const on = p.enabled !== false;
    const head =
      '<div class="row" style="align-items:center">' +
        '<div class="fix" style="min-width:0;flex:1 1 auto">' +
          '<div style="font-weight:600;font-size:var(--fs-h6)">' + esc(p.name || '未命名服务商') + '</div>' +
          '<div class="kv" style="margin-top:4px;word-break:break-all">' + esc(p.baseUrl || '未填写 API 地址') + '</div>' +
        '</div>' +
        '<div class="fix" style="display:flex;gap:6px;flex-wrap:wrap">' +
          (isActive ? '<span class="tag main">当前启用</span>' : '') +
          (models.length ? '<span class="tag ok">模型 ' + models.length + '</span>' : '<span class="tag">模型 0</span>') +
          (hasKey ? '<span class="tag ok">Key 已填</span>' : '<span class="tag err">Key 未填</span>') +
        '</div>' +
      '</div>';
    const acts =
      '<div class="row mt" style="gap:8px">' +
        (isActive ? '' : '<button class="btn sm pri fix" data-act="prov-use" data-id="' + p.id + '">设为当前</button>') +
        '<button class="btn sm fix" data-act="prov-pull" data-id="' + p.id + '">拉取模型</button>' +
        '<button class="btn sm fix" data-act="prov-edit" data-id="' + p.id + '">编辑</button>' +
        '<button class="btn sm danger fix" data-act="prov-del" data-id="' + p.id + '">删除</button>' +
        '<span class="fix" style="flex:1 1 auto"></span>' +
        '<button class="btn sm fix" data-act="prov-open" data-id="' + p.id + '">' + (open === p.id ? '收起 ▲' : '展开 ▼') + '</button>' +
      '</div>';
    let editor = '';
    if (open === p.id) {
      const def = S.settings.defaultModel;
      const chips = models.length
        ? models.map((m) => '<span class="chip' + (m === def ? ' on' : '') + '">' + esc(m) +
            (m === def ? ' · 默认' : '') + '</span>').join('')
        : '<span class="kv">还没有模型 —— 点上方「拉取模型」自动获取</span>';
      editor =
        '<div class="mt" style="border-top:1px solid var(--line-subtle);padding-top:14px">' +
          '<div class="fld"><label>名称</label><input data-prov-f="name" data-id="' + p.id + '" value="' + esc(p.name || '') + '"></div>' +
          '<div class="fld"><label>Base URL（OpenAI 兼容）</label><input data-prov-f="baseUrl" data-id="' + p.id + '" value="' + esc(p.baseUrl || '') + '"></div>' +
          '<div class="fld"><label>API Key</label><input data-prov-f="apiKey" data-id="' + p.id + '" type="password" value="' + esc(p.apiKey || '') + '" placeholder="sk-…（仅存本机）"></div>' +
          '<div class="fld"><label>模型列表 <span class="kv">' + models.length + ' 个 · 逗号分隔</span></label>' +
            '<input data-prov-f="models" data-id="' + p.id + '" value="' + esc(models.join(', ')) + '">' +
            '<div class="chips">' + chips + '</div></div>' +
          '<div class="row"><button class="btn pri fix" data-act="prov-save" data-id="' + p.id + '">保存该服务商</button></div>' +
        '</div>';
    }
    return '<div class="card">' + head + acts + editor + '</div>';
  }).join('');

  body.innerHTML =
    '<div class="scroll"><div class="page">' +
      '<h2>服务商与模型</h2>' +
      '<div class="sub">从预设里挑一个，<b>API 地址会自动填好</b>，只需填 Key；拉取模型后即可在对话框右上角随时切换。数据仅存本机。</div>' +
      '<div class="row" style="margin-bottom:16px">' +
        '<div class="fix"><button class="btn pri fix" data-act="prov-add">＋ 添加服务商</button></div>' +
        '<div class="fix"><button class="btn fix" data-act="goto-chat">← 返回对话</button></div>' +
      '</div>' +
      (cards || '<div class="empty">还没有服务商<br><br><button class="btn pri" data-act="prov-add">＋ 添加第一个服务商</button></div>') +
    '</div></div>';

  if (PROV_ROOT !== body) {
    PROV_ROOT = body;
    body.addEventListener('click', provPanelClick);
    body.addEventListener('change', provFieldChange);
    body.addEventListener('keydown', provFieldKey);
  }
}
function provFieldChange(e) { const el = e.target; if (el && el.dataset && el.dataset.provF) provApplyField(el); }
function provFieldKey(e) { if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.provF) provApplyField(e.target); }
function provApplyField(el) {
  const p = (S.settings.providers || []).find((x) => x.id === el.dataset.id);
  if (!p) return;
  const k = el.dataset.provF, v = el.value;
  if (k === 'models') p.models = String(v).split(',').map((s) => s.trim()).filter(Boolean);
  else p[k] = String(v).trim();
  save();
}
function provPanelClick(e) {
  const t = e.target; if (!t || !t.closest) return;
  const btn = t.closest('[data-act]'); if (!btn) return;
  const body = document.getElementById('body');
  if (!body || !body.contains(btn)) return;
  const act = btn.dataset.act;
  if (act.indexOf('prov-') !== 0) return;
  e.preventDefault(); e.stopPropagation();
  provAct(act, btn);
}
async function provAct(act, btn) {
  const id = btn.dataset.id;
  const list = S.settings.providers || [];
  const p = list.find((x) => x.id === id) || null;
  switch (act) {
    case 'prov-add': openProviderDialog(); return;
    case 'prov-open': S.ui._provOpen = (S.ui._provOpen === id) ? null : id; renderProviders(); return;
    case 'prov-edit': S.ui._provOpen = id; renderProviders(); return;
    case 'prov-use': {
      if (!p) return;
      S.settings.activeProviderId = p.id;
      if ((p.models || [])[0] && !S.settings.defaultModel) S.settings.defaultModel = p.models[0];
      save(); renderProviders(); toast('当前服务商：' + p.name, 'ok'); return;
    }
    case 'prov-pull': {
      if (!p) return;
      if (!p.baseUrl) { toast('请先填写 Base URL', 'err'); return; }
      const old = btn.textContent; btn.disabled = true; btn.textContent = '拉取中…';
      try {
        const ids = await pullModels(p); ids.sort(); p.models = ids;
        if (!S.settings.defaultModel || ids.indexOf(S.settings.defaultModel) < 0) S.settings.defaultModel = ids[0];
        save(); renderProviders(); toast('「' + p.name + '」获取到 ' + ids.length + ' 个模型', 'ok');
      } catch (err) {
        toast('拉取失败：' + (err.message || err), 'err');
        btn.disabled = false; btn.textContent = old;
      }
      return;
    }
    case 'prov-save': {
      if (!p) return;
      const root = btn.closest('.card');
      if (root) Array.from(root.querySelectorAll('[data-prov-f]')).forEach(provApplyField);
      save(); renderProviders(); toast('已保存「' + p.name + '」', 'ok'); return;
    }
    case 'prov-del': {
      if (!p) return;
      if (list.length <= 1) { toast('至少保留一个服务商', 'err'); return; }
      modal('<h3>删除服务商</h3><div class="dsc">确定删除「' + esc(p.name) + '」？地址、Key 与模型列表将一并移除。</div>' +
        '<div class="act"><button class="btn" data-x="c">取消</button><button class="btn danger" data-x="ok">确认删除</button></div>',
        (m, close) => {
          m.addEventListener('click', (ev) => {
            const x = ev.target.closest('[data-x]'); if (!x) return;
            if (x.dataset.x === 'ok') {
              const arr = S.settings.providers;
              const i = arr.findIndex((y) => y.id === id);
              if (i >= 0) arr.splice(i, 1);
              if (S.settings.activeProviderId === id) S.settings.activeProviderId = arr.length ? arr[0].id : '';
              if (S.ui._provOpen === id) S.ui._provOpen = null;
              save(); renderProviders(); toast('已删除「' + p.name + '」', 'ok');
            }
            close();
          });
        });
      return;
    }
  }
}
function openProviderDialog(existing) {
  const isEdit = !!(existing && existing.id);
  const cur = existing || null;
  let presetId = 'custom';
  if (cur) {
    const hit = PRESETS.find((x) =>
      (x.baseUrl && cur.baseUrl && x.baseUrl.replace(/\/+$/, '') === String(cur.baseUrl).replace(/\/+$/, '')) ||
      (x.name && cur.name && x.name === cur.name));
    presetId = hit ? hit.id : 'custom';
  }
  const opts = PRESETS.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === presetId ? ' selected' : '') + '>' +
    esc(x.name) + (x.hint ? ' —— ' + esc(x.hint) : '') + '</option>').join('');
  const needUrl = presetId === 'custom' || !(PRESETS.find((x) => x.id === presetId) || {}).baseUrl;

  modal('<h3>' + (isEdit ? '编辑服务商' : '添加服务商') + '</h3>' +
    '<div class="dsc">从预设里选一个，<b>名称与 API 地址会自动填好</b>；只有「自定义地址」才需要手填。</div>' +
    '<div class="fld"><label>预设</label><select id="pvPreset">' + opts + '</select><div class="hint2" id="pvHint"></div></div>' +
    '<div class="fld"><label>名称</label><input id="pvName" value="' + esc(cur ? cur.name : '') + '"></div>' +
    '<div class="fld"' + (needUrl ? '' : ' hidden') + ' id="pvUrlFld"><label>API Base URL（OpenAI 兼容）</label>' +
      '<input id="pvUrl" value="' + esc(cur ? cur.baseUrl : '') + '" placeholder="https://api.example.com/v1"></div>' +
    '<div class="fld"><label>API Key</label><input id="pvKey" type="password" value="' + esc(cur ? cur.apiKey : '') + '" placeholder="sk-…（仅存本机）"></div>' +
    '<div class="fld"><label>模型列表（可选，逗号分隔；拉取后自动覆盖）</label>' +
      '<input id="pvModels" value="' + esc(cur ? (cur.models || []).join(', ') : '') + '"></div>' +
    '<div class="act"><button class="btn" data-x="c">取消</button>' +
      '<button class="btn pri" data-x="ok">' + (isEdit ? '保存' : '添加') + '</button></div>',
    (m, close) => {
      const sel = m.querySelector('#pvPreset'), nameEl = m.querySelector('#pvName');
      const urlFld = m.querySelector('#pvUrlFld'), urlEl = m.querySelector('#pvUrl'), hintEl = m.querySelector('#pvHint');
      const sync = (silent) => {
        const ps = PRESETS.find((x) => x.id === sel.value); if (!ps) return;
        if (ps.id === 'custom') {
          urlFld.hidden = false;
          hintEl.textContent = '自定义地址：请在下方填写 API Base URL。';
          return;
        }
        nameEl.value = ps.name;
        if (ps.baseUrl) { urlEl.value = ps.baseUrl; urlFld.hidden = true; }
        else { urlFld.hidden = false; urlEl.placeholder = '请填写 ' + ps.name + ' 的接入地址'; }
        hintEl.textContent = ps.hint || (ps.baseUrl ? '地址已自动填好，可直接使用。' : '');
        if (!silent && !ps.baseUrl) toast(ps.name + '：' + (ps.hint || '请填入接入地址'));
      };
      sel.addEventListener('change', () => sync(false));
      sync(true);
      m.addEventListener('click', (ev) => {
        const x = ev.target.closest('[data-x]'); if (!x) return;
        if (x.dataset.x === 'ok') {
          const ps = PRESETS.find((y) => y.id === sel.value);
          const name = (nameEl.value || '').trim() || (ps && ps.id !== 'custom' ? ps.name : '');
          const baseUrl = (urlEl.value || '').trim();
          const apiKey = (m.querySelector('#pvKey').value || '').trim();
          const models = (m.querySelector('#pvModels').value || '').split(',').map((s) => s.trim()).filter(Boolean);
          if (!name) { toast('请填写名称', 'err'); return; }
          if (!baseUrl) { toast('请填写 API Base URL', 'err'); return; }
          if (isEdit) {
            const t = S.settings.providers.find((y) => y.id === existing.id);
            if (!t) { toast('服务商不存在', 'err'); close(); return; }
            t.name = name; t.baseUrl = baseUrl; t.apiKey = apiKey; t.models = models;
            toast('已更新「' + name + '」', 'ok');
          } else {
            const np = { id: uid('pr'), name, baseUrl, apiKey, models: models };
            S.settings.providers.push(np);
            if (!S.settings.activeProviderId) S.settings.activeProviderId = np.id;
            toast('已添加「' + name + '」', 'ok');
          }
          save(); renderProviders();
        }
        close();
      });
    });
}

/* ------------------------- 启动（必须放在最后） ------------------------- */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
