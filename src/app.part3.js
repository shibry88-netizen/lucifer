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
