# AgentHub · 多智能体中枢

一个「主控 Agent 统一发号施令」的多智能体桌面级 Web 应用。单文件、零依赖、双击即用。
数据全部保存在浏览器本地（localStorage），不上传任何服务器。

> 设计语言：**Liquid Glass**（液态玻璃）—— 极光背景 + 多层 backdrop-blur + 镜面高光 + 掠射光带，
> 只对 `transform / opacity` 做动画，保证滚动与交互丝滑。

---

## 快速开始

1. 双击 `index.html`（或拖进 Chrome / Edge / Safari）。
2. 右上角 **设置 → ① API 配置**：选一个预设（或选「自定义地址」填自己的），填 **Base URL** 与 **API Key**。
3. 点 **拉取可用模型** → 下拉选 **全局默认模型**。
4. 回到对话，直接开聊。

> API 需兼容 OpenAI 协议：`POST {base}/chat/completions`、`GET {base}/models`。

### 内置预设

OpenAI · DeepSeek · Moonshot/Kimi · 智谱 GLM · 通义千问 DashScope · SiliconFlow · OpenRouter · Ollama · LM Studio · 自定义

---

## 核心概念

| 概念 | 说明 |
|---|---|
| **主控 Agent** | 进入应用默认就是它，负责任务拆解 → 派发 → 汇总 → 沉淀文档 |
| **角色名** | 每个 Agent 的 `@roleName`，供主模型在指令里识别、派发任务 |
| **统计气泡** | 悬浮在输入框上方。展开：参与的 Agent / 各自调用次数与 token / 总 token / 输入输出 / 请求次数 / 耗时；折叠：**只剩本次对话的 token 数** |
| **文档库** | Agent 之间交接与知识沉淀的载体，支持 create / append / update / read / list / delete |
| **Skills** | 可从 GitHub 直接拉取，内容注入该 Agent 的系统提示词 |
| **云沙盒** | 预留接口，**需使用者自行添加** Endpoint 与 Key 后启用 |

---

## 指令协议（主模型写在回复正文里）

```
派发任务：
<call agent="@researcher">调研 X 的竞品与定价，输出对比表</call>

文档操作：
<doc op="create" title="调研结论">正文…</doc>
<doc op="append" title="调研结论">追加…</doc>
<doc op="update" title="调研结论">替换全文…</doc>
<doc op="read"   title="调研结论"/>
<doc op="list"/>
<doc op="delete" title="调研结论"/>
```

执行流程：主模型输出指令 → 前端解析并**按顺序执行** → 把结果作为「系统回执」回传 →
主模型继续下一轮，直到不再产生指令或达到「协作最大轮次」（默认 6，可在设置里改）。

---

## 界面说明

- **左上角 ☰**：收起 / 展开侧栏；侧栏底部与「Agents ＋」用于新建 Agent。
- **Agent 设置页三个选项**
  1. **基础信息** — 名字、角色名、头像（Emoji / 图片 URL / 上传）、简介、系统提示词
  2. **Skills** — 从 GitHub 拉取、查看、移除
  3. **模型与能力** — 单独指定模型；开关：任务派发 / 文档读写 / 云沙盒 / 联网检索
- 输入框右侧 `⚡` = 一键召集全员协作，`@` = 提及 Agent。

### 支持的 Skill 地址写法

- `https://github.com/owner/repo`（自动找仓库根目录的 `SKILL.md`）
- `https://github.com/owner/repo/tree/branch/path`
- 任意 `https://raw.githubusercontent.com/...` 链接
- `https://lobehub.com/skills/{identifier}`

---

## 目录结构

```
agenthub/
├─ index.html          # 构建产物：单文件应用（直接运行这个）
├─ build.mjs           # 构建脚本：把 src/ 内联成一个 HTML，并做语法自检
└─ src/
   ├─ shell.html       # 页面骨架（占位符 /*__CSS__*/ 与 /*__JS__*/）
   ├─ style.css        # Liquid Glass 设计系统
   ├─ app.part1.js     # 状态 / API / 指令解析 / token 统计
   └─ app.part2.js     # 渲染与交互
```

改完 `src/` 后执行：

```bash
node build.mjs
```

---

## 已知限制

- 浏览器直连第三方 API 可能被 **CORS** 拦截。DeepSeek / OpenRouter / SiliconFlow / Moonshot 等多数可直连；
  若被拦截，可换服务商或自建一个本地反向代理。
- Token 数：优先取服务端返回的 `usage`；服务端不回传时按「中日韩字符 ≈ 1 token，其余 ≈ 4 字符/token」估算，
  气泡上会标注「含估算」。
- 云沙盒为预留接口，尚未对接具体 SDK。

## Roadmap

- [ ] 会话列表 / 历史检索
- [ ] 云沙盒（e2b / Daytona）实际对接
- [ ] 联网检索工具
- [ ] 打包为桌面应用（Tauri / Electron）
