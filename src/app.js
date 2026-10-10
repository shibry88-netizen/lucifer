/* =======================================================================
 * 晨星 · LUCIFER · 多智能体中枢  ——  核心逻辑（Part 1 / 3）
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

/* 主题预设（主色相 h / 饱和 s / 明度 l） */
const THEMES = [
  { id: 'gold',   name: '鎏金', h: 40, s: '50%', l: '58%' },
  { id: 'bronze', name: '青铜', h: 28, s: '38%', l: '52%' },
  { id: 'champ',  name: '香槟', h: 46, s: '42%', l: '66%' },
  { id: 'indigo', name: '靛青', h: 232, s: '62%', l: '64%' },
  { id: 'jade',   name: '青玉', h: 165, s: '46%', l: '52%' },
  { id: 'rose',   name: '玫瑰', h: 348, s: '52%', l: '62%' },
  { id: 'steel',  name: '冷灰', h: 210, s: '16%', l: '62%' },
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
      maxRounds: 6,
      theme: {
        mode: 'dark', preset: 'gold', h: 40, s: '50%', l: '58%',
        radius: 1, fontScale: 1, glassBlur: 20, aurora: true, custom: false,
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


/* =======================================================================
 * 晨星 · LUCIFER · 多智能体中枢  ——  渲染与交互（Part 2 / 3）
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
  const right = v === 'chat'
    ? '<button class="btn sm" data-act="newtopic">＋ 新会话</button>'
      + '<button class="btn sm" data-act="goto-search">检索</button>'
      + '<button class="btn sm" data-act="goto-docs">文档</button>'
      + '<button class="btn sm" data-act="goto-settings">设置</button>'
      + (isMain(a) ? '' : '<button class="btn sm pri" data-act="editagent">Agent 设置</button>')
    : '<button class="btn sm" data-act="goto-chat">← 返回对话</button>';

  document.getElementById('app').innerHTML =
  '<aside class="side' + (S.ui.sideOpen ? ' open' : '') + '">' +
    '<div class="side-head">' +
      '<div class="logo">' + STAR_SVG + '</div>' +
      '<div class="brand"><b class="gold-text">晨星</b><span>LUCIFER ' + VERSION + '</span></div>' +
    '</div>' +
    '<div class="side-search"><input id="agentSearch" placeholder="搜索会话 / Agent…" value="' + esc(S.ui._q || '') + '"></div>' +
    '<div class="side-scroll">' +
      '<div class="side-label">主控</div><div id="mainList"></div>' +
      '<div class="side-label">Agents <button data-act="addagent" title="新建 Agent">＋</button></div><div id="subList"></div>' +
      '<div class="side-label">会话 <button data-act="newtopic" title="新会话">＋</button></div><div id="topicList"></div>' +
    '</div>' +
    '<div class="side-foot">' +
      '<button data-act="goto-search"><span class="ico">⌕</span><span>历史检索</span></button>' +
      '<button data-act="goto-docs"><span class="ico">▤</span><span>文档库</span></button>' +
      '<button data-act="goto-settings"><span class="ico">⚙</span><span>设置</span></button>' +
    '</div>' +
  '</aside>' +
  '<div class="side-mask" data-act="close-side"></div>' +
  '<main class="main">' +
    '<header class="top">' +
      '<button class="icon-btn burger" data-act="toggle-side" title="菜单"><i></i><i></i><i></i></button>' +
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
  renderTopicList();
  renderTabbar();
  renderView();
}

function renderAgentLists() {
  const q = (S.ui._q || '').toLowerCase();
  const f = (a) => !q || a.name.toLowerCase().includes(q) || a.roleName.toLowerCase().includes(q);
  const item = (a) =>
    '<div class="agent-item' + (a.id === S.ui.activeAgentId ? ' on' : '') + '" data-agent="' + a.id + '">' +
      avatarHTML(a) +
      '<div class="meta"><div class="nm">' + esc(a.name) + '</div>' +
      '<div class="rl">@' + esc(a.roleName) + ((a.skills && a.skills.length) ? ' · ' + a.skills.length + ' skill' : '') + '</div></div>' +
    '</div>';
  const ml = $('#mainList'), sl = $('#subList');
  const mains = S.agents.filter((a) => a.isMain && f(a));
  const subs = S.agents.filter((a) => !a.isMain && f(a));
  if (ml) ml.innerHTML = mains.map(item).join('') || '<div class="kv pad">无</div>';
  if (sl) sl.innerHTML = subs.map(item).join('') || '<div class="kv pad">还没有其他 Agent，点上方 ＋ 新建</div>';
}

/* ------------------------- 视图分发 ------------------------- */
function renderView() {
  const v = S.ui.view;
  if (v === 'docs') renderDocs();
  else if (v === 'settings') renderSettings();
  else if (v === 'agent') renderAgentEdit();
  else if (v === 'search') renderSearch();
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
      '<div class="bd"><div class="prose">' + mdRender(m.content) + '</div></div></div>';
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
      statsBubbleHTML(topic) +
      '<div class="cbox glass">' +
        '<textarea id="input" rows="1" placeholder="给 ' + esc(a.name) + ' 发消息…"></textarea>' +
        '<div class="crow">' +
          '<button class="icon-btn" data-act="evac" title="召集全员协作">⚡</button>' +
          '<button class="icon-btn" data-act="mention" title="提及 Agent">@</button>' +
          '<button class="send" data-act="send" title="发送">➤</button>' +
        '</div>' +
      '</div>' +
      '<div class="hint">' +
        '<span>Enter 发送 · Shift+Enter 换行</span>' +
        '<button class="hint-toggle" data-act="toggle-syntax">指令语法 <i>⌃</i></button>' +
        '<span class="hint-syn">' +
          (a.tools.delegate ? '<span>派发 <code>&lt;call agent="@角色名"&gt;…&lt;/call&gt;</code></span>' : '') +
          (a.tools.docs ? '<span>文档 <code>&lt;doc op="create" title="…"&gt;…&lt;/doc&gt;</code></span>' : '') +
        '</span>' +
        '<span style="margin-left:auto">' + (S.settings.sandbox.enabled ? '云沙盒已连接' : '云沙盒未配置') + '</span>' +
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
  topic.messages.push({ role: 'user', content: userText, ts: now(), by: agent.id });
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
        if (o.type === 'doc') {
          const r = execDocOp(o);
          o.result = r; o.status = 'done';
          opsEl.innerHTML = msg.ops.map((x, j) => opHTML(x, j)).join('');
          results.push('【文档操作结果】' + o.op + ' 「' + o.title + '」→ ' + r);
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
          const pre = opsEl.querySelectorAll('.op')[i] ? opsEl.querySelectorAll('.op')[i].querySelectorAll('.prose')[1] : null;
          try {
            const subMsgs = [{ role: 'system', content: buildSystem(target) }, { role: 'user', content: o.task }];
            let acc = '', subUsage = null, last2 = 0;
            const t1 = now();
            const r = await streamChat(target, subMsgs, (c) => {
              acc += c;
              const t = now();
              if (t - last2 > 60) { last2 = t; if (pre) { pre.innerHTML = mdRender(stripDirectives(acc)) + '<span class="caret">▍</span>'; scrollDown(); } }
            }, ABORT.signal, (u) => { subUsage = u; });
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
  const th = Object.assign({ mode: 'dark', preset: 'gold', radius: 1, fontScale: 1, glassBlur: 20, aurora: true, custom: false }, S.settings.theme || {});
  $('#body').innerHTML =
  '<div class="scroll"><div class="page">' +
    '<h2>设置</h2>' +
    '<div class="sub">API 地址、可用模型、云沙盒 —— 数据仅保存在本机浏览器（localStorage），不会上传。</div>' +

    '<div class="card glass"><h3>① API 配置</h3>' +
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

    '<div class="card glass"><h3>④ 数据</h3>' +
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
  ['#cfgName', '#cfgUrl', '#cfgKey', '#cfgDefault', '#cfgRounds', '#sbProvider', '#sbEndpoint', '#sbKey'].forEach((sel) => {
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
    case 'newtopic': { newTopic(a0.id); S.ui.drafting = ''; save(); renderShell(); return; }
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
 * 晨星 · LUCIFER · 多智能体中枢  ——  新增能力（Part 3 / 3）
 * 主题引擎 / 会话列表 / 全文检索 / 对话内文档浏览 / 云沙盒 / 移动端
 * ===================================================================== */

const VERSION = 'v1.0';
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
  const items = [['chat', '对话', '◆'], ['search', '检索', '⌕'], ['docs', '文档', '▤'], ['settings', '设置', '⚙']];
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
    const r = await sandboxRun('print("hello from 晨星")', sid);
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

/* ------------------------- 启动 ------------------------- */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
