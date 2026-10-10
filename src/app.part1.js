/* =======================================================================
 * AgentHub · 多智能体中枢  ——  核心逻辑（Part 1 / 2）
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
const PRESETS = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { id: 'deepseek', name: 'DeepSeek 深度求索', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'moonshot', name: 'Moonshot / Kimi', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'dashscope', name: '通义千问 DashScope', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'siliconflow', name: 'SiliconFlow 硅基流动', baseUrl: 'https://api.siliconflow.cn/v1' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'ollama', name: 'Ollama（本地）', baseUrl: 'http://localhost:11434/v1' },
  { id: 'lmstudio', name: 'LM Studio（本地）', baseUrl: 'http://localhost:1234/v1' },
  { id: 'custom', name: '自定义地址', baseUrl: '' },
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
  const pid = 'openai';
  return {
    v: 2,
    settings: {
      providers: [{ id: pid, name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', models: [] }],
      activeProviderId: pid,
      defaultModel: '',
      sandbox: { endpoint: '', apiKey: '', enabled: false, provider: 'e2b' },
      maxRounds: 6,
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
    },
  };
}

/* ------------------------- 状态 ------------------------- */
const KEY = 'agenthub.state.v2';
let S = null, ABORT = null, RUNNING = false;

function load() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem('agenthub.state.v1');
    if (!raw) return defaultState();
    const o = JSON.parse(raw); const d = defaultState();
    o.settings = Object.assign(d.settings, o.settings || {});
    o.settings.sandbox = Object.assign(d.settings.sandbox, (o.settings || {}).sandbox || {});
    o.agents = Array.isArray(o.agents) && o.agents.length ? o.agents : d.agents;
    o.docs = Array.isArray(o.docs) ? o.docs : d.docs;
    o.topics = Array.isArray(o.topics) ? o.topics : [];
    o.ui = Object.assign(d.ui, o.ui || {});
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
  const close = () => { m.classList.remove('in'); setTimeout(() => m.remove(), 220); };
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
  ops.sort((a, b) => a.index - b.index);
  return ops;
}
function stripDirectives(text) {
  RE_CALL.lastIndex = 0; RE_DOC.lastIndex = 0;
  return String(text).replace(RE_CALL, '').replace(RE_DOC, '').replace(/\n{3,}/g, '\n\n').trim();
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
  if (ds.length) parts.push('\n\n【可用文档索引】\n' + ds.map((d) => '- ' + d.title + '（更新于 ' + relTime(d.updatedAt) + '）').join('\n') + '\n\n需要正文时使用 <doc op="read" title="标题"/>。');
  parts.push(S.settings.sandbox && S.settings.sandbox.enabled
    ? '\n\n【云沙盒】已配置：' + S.settings.sandbox.provider + ' @ ' + S.settings.sandbox.endpoint
    : '\n\n【云沙盒】未配置（由使用者自行添加，当前不可用）。');
  return parts.join('');
}
function apiMessages(agent, topic, maxHist) {
  const sys = { role: 'system', content: buildSystem(agent) };
  const hist = topic.messages.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-(maxHist || 24));
  return [sys].concat(hist.map((m) => ({ role: m.role, content: m.content || '' })));
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
