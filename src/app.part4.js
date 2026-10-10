/* =======================================================================
 * LUCIFER · 多智能体中枢  ——  工具与集成（Part 4 / 4）
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

/* ------------------------- 启动（必须放在最后） ------------------------- */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
