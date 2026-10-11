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
/* ☰ 收敛：检索 / 文档 / GitHub / 设置 已移入右上角「工具」二级菜单 */
function navMenuHTML() {
  return '<button class="nav-item" data-act="addagent"><span class="ico">＋</span>新建 Agent</button>' +
    '<div class="nav-divider"></div>' +
    '<button class="nav-item" data-act="export-zip"><span class="ico">⤓</span>导出当前会话 ZIP</button>' +
    '<button class="nav-item" data-act="toggle-rail"><span class="ico">⇤</span>' + (S.ui.collapsed ? '展开侧栏' : '收起侧栏') + '<span class="kbd">⌘B</span></button>';
}

/* 右上角「工具」：四组二级菜单 —— 一级只显示分组名，点开才展开二级项，容器可滚动 */
function toolMenuHTML() {
  const p = providerFor(curAgent());
  const gh = S.settings.github || {};
  const it = (act, label, kbd) =>
    '<button class="menu-item" data-act="' + act + '">' +
      '<span class="mt">' + label + '</span>' +
      (kbd ? '<span class="mk">' + kbd + '</span>' : '') +
    '</button>';
  const grp = (id, icon, title, meta, items) =>
    '<section class="grp" data-grp="' + id + '">' +
      '<button class="grp-hd" data-act="grp-toggle" aria-expanded="false">' +
        '<span class="gi">' + icon + '</span><span class="gt">' + title + '</span>' +
        (meta ? '<span class="gn">' + esc(meta) + '</span>' : '') +
        '<span class="chev">⌄</span>' +
      '</button>' +
      '<div class="grp-body"><div><div class="grp-items">' + items + '</div></div></div>' +
    '</section>';
  return grp('search', '⌕', '检索', '', it('goto-search', '历史检索', '⌘K') + it('conv-menu', '会话中心')) +
    grp('docs', '▤', '文档', '', it('goto-docs', '文档库')) +
    grp('github', '⑂', 'GitHub', gh.user ? '@' + gh.user : '', it('goto-github', '仓库与 CI')) +
    grp('settings', '⚙', '设置', p ? p.name : '未配置',
      it('goto-providers', '服务商与模型') + it('goto-settings', '全部设置'));
}
function toggleToolMenu() {
  const anchor = document.querySelector('.tools-btn');
  if (!anchor) return;
  showPop('tools', anchor, toolMenuHTML(), { cls: 'tool-pop', align: 'right' });
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
    '<div class="dsc">统一按 <b>OpenAI 兼容协议</b>接入，不再区分厂商预设。</div>' +
    '<div class="hint2" id="pvHint">任何兼容 OpenAI 协议的服务都能用：官方 / 中转站 / 自建 / 本地推理，填 Base URL + Key 即可。</div>' +
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
        const ps = (sel && PRESETS.find((x) => x.id === sel.value)) || PRESETS[0]; if (!ps) return;
        urlFld.hidden = false;                       // 地址始终可见可改
        if (!urlEl.value) urlEl.value = ps.baseUrl || '';
        if (!nameEl.value) nameEl.value = ps.name;
        hintEl.textContent = ps.hint || '';
      };
      if (sel) sel.addEventListener('change', () => sync(false));
      sync(true);
      m.addEventListener('click', (ev) => {
        const x = ev.target.closest('[data-x]'); if (!x) return;
        if (x.dataset.x === 'ok') {
          const ps = PRESETS.find((y) => y.id === (sel ? sel.value : ''));
          const name = (nameEl.value || '').trim() || (ps ? ps.name : '');
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
