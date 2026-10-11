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
  const viewChanged = S.ui._lastView !== v;
  S.ui._lastView = v;
  const right = (v === 'chat' ? '' : '<button class="btn sm keep" data-act="goto-chat">← 返回对话</button>') +
    '<button class="btn sm keep conv-btn" data-act="conv-menu" aria-expanded="false" title="会话列表">会话<span class="cnt">' + S.topics.filter((t) => t.agentId === a.id).length + '</span></button>' +
    '<button class="tools-btn" data-act="tools-menu" aria-expanded="false" title="工具 · 检索 / 文档 / GitHub / 设置"><span>⋯</span></button>' +
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
  '<main class="main' + (viewChanged ? ' view-enter' : '') + '">' +
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
      // 上下文预算：接近上限先把旧轮次压成摘要，避免爆窗后整个会话作废
      await compactTopic(agent, topic);
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
            const subMsgs = [
              { role: 'system', content: buildSystem(target) + RECEIPT_RULE },
              { role: 'user', content: o.task },
            ];
            let acc = '', subUsage = null;
            const t1 = now();
            const r = await streamChat(target, subMsgs, (c) => { acc += c; }, ABORT.signal, (u) => { subUsage = u; });
            const dt1 = now() - t1;
            o.result = stripDirectives(r); o.status = 'done';
            bumpStats(topic, target, subUsage, subMsgs, r, dt1);
            refreshBubble();
            results.push(buildReceipt(target, o.result));
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
  const cx = Object.assign({ autoCompact: true, tokenBudget: 24000, keepMessages: 12 }, S.settings.ctx || {});
  $('#body').innerHTML =
  '<div class="scroll"><div class="page">' +
    '<h2>设置</h2>' +
    '<div class="sub">API 地址、可用模型、云沙盒 —— 数据仅保存在本机浏览器（localStorage），不会上传。</div>' +

    '<div class="card glass"><h3>① API 配置</h3>' +
      '<div class="row" style="margin-bottom:16px">' +
        '<button class="btn pri fix" data-act="goto-providers">打开「服务商与模型」』</button>' +
        '<span class="kv" style="flex:1">统一按 OpenAI 兼容协议接入 —— 官方 / 中转站 / 自建 / 本地推理，填 Base URL 即可，支持多套配置随时切换。</span>' +
      '</div>' +
      '<div class="fld"><label>选择要编辑的配置</label><div class="row">' +
        '<select id="cfgPick">' + ps.map((p) => '<option value="' + p.id + '"' + (p.id === ap.id ? ' selected' : '') + '>' + esc(p.name) + ' — ' + esc(p.baseUrl || '未填地址') + '</option>').join('') + '</select>' +
        '<button class="btn fix" data-act="addProvider">＋ 新增</button></div></div>' +
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

    '<div class="card glass"><h3>② 云沙盒</h3>' +
      '<div class="fld"><label>代码在哪里跑</label><select id="sbMode">' +
        [['builtin', '① 内置服务商（e2b 兼容）'], ['self', '② 我自己的服务器（云 / 本地）']]
          .map(([k, n]) => '<option value="' + k + '"' + (((sb.mode || 'builtin') === k) ? ' selected' : '') + '>' + n + '</option>').join('') +
        '</select></div>' +
      (((sb.mode || 'builtin') === 'self')
        ? '<div class="fld"><label>我的服务器地址</label><input id="sbEndpoint" value="' + esc(sb.endpoint) + '" placeholder="http://192.168.1.10:8000 或 https://sandbox.example.com"></div>' +
          '<div class="fld"><label>执行路径</label><input id="sbExecPath" value="' + esc(sb.execPath || '/exec') + '" placeholder="/exec"></div>' +
          '<div class="fld"><label>密钥（可选）</label><input id="sbKey" type="password" value="' + esc(sb.apiKey) + '" placeholder="没有就留空"></div>' +
          '<div class="hint2 mt">约定：<code>POST {地址}{执行路径}</code>，body <code>{"code":"…","lang":"python"}</code>，返回 <code>{"stdout":"…","stderr":"…"}</code> 或纯文本。你的服务器需要允许跨域（CORS）。</div>'
        : '<div class="fld"><label>服务商</label><select id="sbProvider">' +
            ['e2b', 'daytona', 'modal', '自建 / 其它'].map((x) => '<option' + (sb.provider === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div>' +
          '<div class="fld"><label>沙盒 API Endpoint</label><input id="sbEndpoint" value="' + esc(sb.endpoint) + '" placeholder="https://api.e2b.dev"></div>' +
          '<div class="fld"><label>沙盒 API Key</label><input id="sbKey" type="password" value="' + esc(sb.apiKey) + '" placeholder="填入你自己的沙盒密钥"></div>' +
          '<div class="hint2 mt">协议：<code>POST /sandboxes</code> 创建 · <code>POST /sandboxes/{id}/code</code> 执行 · <code>DELETE /sandboxes/{id}</code> 销毁（e2b 兼容）。</div>') +
      '<div class="switch"><div><div class="lbl">启用云沙盒</div><div class="dsc">仅在你填好地址 / Key 后打开</div></div>' +
        '<div class="tgl' + (sb.enabled ? ' on' : '') + '" data-tool="sandbox"></div></div>' +
      '<div class="row mt"><button class="btn pri fix" data-act="sandbox-test">测试云沙盒</button>' +
        '<span class="kv">' + (sb.lastOk ? '上次连通：' + relTime(sb.lastOk) : '尚未测试连通') + '</span></div>' +
    '</div>' +

    '<div class="card glass"><h3>③ 上下文与数据</h3>' +
      '<div class="fld"><label>上下文预算（tokens）—— 超出即自动把旧轮次压成摘要</label>' +
        '<input id="ctxBudget" type="number" min="4000" step="1000" value="' + (cx.tokenBudget || 24000) + '"></div>' +
      '<div class="fld"><label>压缩后保留的最近消息条数</label>' +
        '<input id="ctxKeep" type="number" min="4" max="60" value="' + (cx.keepMessages || 12) + '"></div>' +
      '<div class="fld"><label>子 Agent 回执字数上限（超出即截断）</label>' +
        '<input id="ctxReceipt" type="number" min="300" max="6000" step="100" value="' + (S.settings.receiptLimit || 1200) + '"></div>' +
      '<div class="kv" style="padding:6px 0"><span class="k">本地存储占用</span><span class="v">' +
        (Store.usage() / 1024).toFixed(1) + ' KB' + (Store.isAvailable() ? '' : '（不可用！）') + '</span></div>' +
      '<div class="hint2">自动压缩已开启：压缩只影响下发给模型的内容，界面里的完整历史不会丢。</div>' +
    '</div>' +

    '<div class="card glass"><h3>④ 主题外观</h3>' +
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

    '<div class="card glass"><h3>⑤ 联网检索</h3>' +
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

    '<div class="card glass"><h3>⑥ GitHub</h3>' +
      '<div class="fld"><label>Personal Access Token</label><input id="ghToken" type="password" value="' + esc(gh.token) + '" placeholder="ghp_… / github_pat_…"></div>' +
      '<div class="switch"><div><div class="lbl">启用 GitHub 工具</div><div class="dsc">Agent 可创建仓库、提交文件、读取代码、触发 CI</div></div>' +
        '<div class="tgl' + (gh.enabled ? ' on' : '') + '" data-tgl-gh="1"></div></div>' +
      '<div class="row mt"><button class="btn pri fix" data-act="gh-connect">连接并读取账号</button>' +
        '<button class="btn fix" data-act="goto-github">打开 GitHub 面板</button>' +
        '<span class="kv">' + (gh.user ? '已连接：@' + esc(gh.user) : '未连接') + '</span></div>' +
      '<div class="hint2 mt">Token 仅存本机 localStorage。需要权限：<code>repo</code>（读写仓库）、<code>workflow</code>（触发 / 查看 Actions）。</div>' +
    '</div>' +

    '<div class="card glass"><h3>⑦ 数据</h3>' +
      '<div class="sub" style="margin:0 0 12px">Agent ' + S.agents.length + ' 个 · 文档 ' + S.docs.length + ' 篇 · 会话 ' + S.topics.length + ' 个</div>' +
      '<div class="row">' +
        '<button class="btn fix" data-act="exportData">导出全部数据 (JSON)</button>' +
        '<button class="btn fix" data-act="importData">导入数据</button>' +
        '<button class="btn danger fix" data-act="resetAll">清空并恢复初始状态</button>' +
      '</div>' +
      '<input type="file" id="impFile" accept="application/json" hidden>' +
    '</div>' +
  '</div></div>';

  const sbm = $('#sbMode');
  if (sbm) sbm.addEventListener('change', () => { persistCfg(); save(); renderSettings(); });
  const pick = $('#cfgPick');
  if (pick) pick.addEventListener('change', () => { persistCfg(); S.settings.activeProviderId = pick.value; save(); renderSettings(); });
  ['#cfgName', '#cfgUrl', '#cfgKey', '#cfgDefault', '#cfgRounds', '#ctxBudget', '#ctxKeep', '#ctxReceipt', '#sbProvider', '#sbEndpoint', '#sbExecPath', '#sbKey', '#seProvider', '#seEndpoint', '#seCount', '#ghToken'].forEach((sel) => {
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
  const cxx = S.settings.ctx || (S.settings.ctx = {});
  if ($('#ctxBudget')) cxx.tokenBudget = Math.max(4000, parseInt($('#ctxBudget').value, 10) || 24000);
  if ($('#ctxKeep')) cxx.keepMessages = Math.max(4, Math.min(60, parseInt($('#ctxKeep').value, 10) || 12));
  if ($('#ctxReceipt')) S.settings.receiptLimit = Math.max(300, Math.min(6000, parseInt($('#ctxReceipt').value, 10) || 1200));
  const sb = S.settings.sandbox;
  if ($('#sbMode')) sb.mode = $('#sbMode').value;
  if ($('#sbProvider')) sb.provider = $('#sbProvider').value;
  if ($('#sbExecPath')) sb.execPath = $('#sbExecPath').value.trim() || '/exec';
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
          Store.set(KEY, JSON.stringify(o));
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
    case 'tools-menu': { toggleToolMenu(); return; }
    case 'grp-toggle': {
      const hd = e.target.closest('.grp-hd');
      const grp = hd && hd.closest('.grp');
      if (grp) {
        const open = grp.classList.toggle('open');
        hd.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      return;
    }
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
            if (x.dataset.x === 'ok') { Store.del(KEY); S = defaultState(); save(); renderShell(); toast('已重置', 'ok'); }
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
