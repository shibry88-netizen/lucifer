# 晨星 · LUCIFER

**多智能体中枢** —— 一个「总控 Agent 统一发号施令」的 AI 工作台。
单文件 Web 应用 + Windows 桌面端 + 安卓端，数据全部留在本地。

> 命名取自个人站 **Lucifer**：Lucifer 的拉丁语义就是「晨星 / 启明星 / 光之使者」（*lux* 光 + *ferre* 带来）。
> 视觉母题是**四角星芒**，配色走**鎏金 + 黑**的高级克制路线。

---

## ✨ 能力

| 能力 | 说明 |
|---|---|
| **主控调度** | 主控 Agent 在回复里写 `<call agent="@角色名">任务</call>`，前端自动调用对应 Agent 并把回执回传，循环至收敛（轮次可调） |
| **多 Agent 管理** | 名字 / **角色名**（供主模型识别）/ 头像（Emoji · URL · 上传）/ 简介 / 系统提示词，一人一套模型与能力开关 |
| **Skills（GitHub 直拉）** | 支持 `github.com/o/r`、`tree/branch/path`、`raw.githubusercontent.com`、`lobehub.com/skills/{id}` |
| **对话内浏览文档** | Agent 产出的文档会变成对话里的**文档卡片**，点开即在对话内抽屉看全文 |
| **Agent 自由读文档** | 短文档（≤1500 字）**全文**注入系统提示词；长文档注入摘要 + 提供 `<doc op="read">` 按需取全文 |
| **文档库** | `create / append / update / read / list / delete` 六种指令 + Markdown 编辑器，Agent 之间靠它交接 |
| **会话列表** | 每个 Agent 可挂多个会话，支持新建 / 重命名 / 删除，侧栏显示条数与 token |
| **全文历史检索** | 跨全部会话消息、文档正文、Agent 配置做检索，命中高亮；`⌘K` / `Ctrl+K` 唤起 |
| **统计气泡** | 悬浮在输入框上方：折叠＝本次对话 token；展开＝参与 Agent、各自调用次数与 token、总量/输入/输出、请求次数、耗时 |
| **云沙盒** | e2b 兼容 REST（创建 → 执行 → 销毁），Endpoint 与 Key 由你自己填 |
| **双色主题 + 自定义** | 暗金 / 亮白 / 跟随系统；主色、磨砂强度、圆角、字号四挡可调 |
| **多端** | 网页单文件 · Windows（Tauri / Electron）· 安卓（PWA 可安装 / Capacitor 出 APK） |

**预设服务商（按使用频率排序）**：DeepSeek · 智谱 GLM · 小米 MiMo · 中转站（兼容 OpenAI 即插即用）· OpenAI · Moonshot/Kimi · 通义 DashScope · SiliconFlow · OpenRouter · Ollama · LM Studio · 自定义

---

## 🚀 快速开始

### 1. 直接跑（最简单）

双击 `index.html`。或者本地起个服务（PWA 的 Service Worker 需要 http 环境）：

```bash
node serve.mjs        # → http://localhost:5180
```

### 2. 配置模型

右上角 **设置 → ① API 配置**：

1. 「预设」选一个（DeepSeek / 智谱 GLM / 小米 MiMo / 中转站 / …）
2. 填 **API Base URL** 与 **API Key**
3. 点 **拉取可用模型** → 下拉选 **全局默认模型**

> 接口需兼容 OpenAI 协议：`POST {base}/chat/completions`、`GET {base}/models`。
> 「小米 MiMo」和「中转站」预设不带默认地址，填你自己的接入地址即可。

### 3. 用起来

- **左上角 ☰** 展开 / 收起侧栏（手机端是抽屉）
- 输入框右侧 **⚡** 召集全员协作，**@** 提及 Agent
- 新建子 Agent：侧栏 **Agents ＋** → 设置页三个页签（基础信息 / Skills / 模型与能力）

---

## 🖥 Windows 桌面端

推荐 **Tauri 2**（用系统 WebView2，安装包只有几 MB，启动快）。**Electron** 作为备选。

```bash
npm install

# —— Tauri（推荐）——
npm run tauri:dev      # 开发运行
npm run icon           # 用 icon-512.png 生成各尺寸图标（首次必跑）
npm run tauri:build    # 产出 .exe / .msi，在 src-tauri/target/release/bundle/

# —— Electron（备选）——
npm run electron:dev
npm run electron:build # 产出 NSIS 安装包，在 release/
```

**桌面端的额外好处**：浏览器直连第三方 API 常被 CORS 拦截，桌面端不受影响（Electron 内置了 CORS 头补丁，Tauri 走系统 WebView 同样宽松）。所以**被 CORS 卡住时，优先用桌面端**。

前置依赖：Tauri 需要 [Rust](https://rustup.rs/) + [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)（Win11 自带）。

---

## 📱 安卓端

两条路，按需选：

### 路线 A：PWA（零打包，立刻能用）

用 `node serve.mjs` 起服务，或把 `dist/` 部署到任意 HTTPS 静态托管（Vercel / Netlify / 自己的服务器），手机 Chrome 打开后 **⋮ → 添加到主屏幕**，就变成一个全屏 App，支持离线外壳。

### 路线 B：真 APK（要上架 / 要原生壳）

用 Capacitor 把 `dist/` 包成原生工程：

```bash
npm install
npm run cap:add      # 生成 android/ 工程（只需一次）
npm run cap:sync     # 每次改完代码同步进原生工程
npm run cap:open     # 用 Android Studio 打开 → Build APK
```

前置依赖：Android Studio + JDK 17 + Android SDK。
若要直连 HTTP（非 HTTPS）的本地 API，`capacitor.config.json` 里已开 `cleartext: true`。

**移动端适配**：< 640px 时侧栏变抽屉、底部出现「对话 / 检索 / 文档 / 设置」四格导航、统计气泡展开后变**底部弹层**、触控热区放大到 44px、输入框 16px 防自动缩放。

---

## 🧩 指令协议

主模型把指令写在回复正文里，前端按顺序执行，再把结果作为「系统回执」回传。

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

---

## 🛠 目录结构

```
├─ index.html                 # 构建产物：单文件应用（直接双击这个）
├─ build.mjs                  # 把 src/ 内联成 index.html，并做 JS 语法自检
├─ dist.mjs                   # 生成 dist/（供 Tauri / Electron / Capacitor 打包）
├─ serve.mjs                  # 本地静态服务
├─ manifest.webmanifest       # PWA 清单
├─ sw.js                      # Service Worker（离线外壳缓存，API 请求不缓存）
├─ icon.svg / icon-192.png    # 星芒图标
├─ capacitor.config.json      # 安卓打包配置
├─ electron/main.js           # Electron 主进程
├─ src-tauri/                 # Tauri 工程（Cargo.toml / tauri.conf.json / main.rs）
└─ src/
   ├─ shell.html              # 页面骨架（占位符 /*__CSS__*/ 与 /*__JS__*/）
   ├─ style.css               # 鎏金黑设计系统（双主题 + 自定义变量）
   ├─ app.part1.js            # 状态 / Provider / API / 指令解析 / token 统计
   ├─ app.part2.js            # 渲染与交互
   └─ app.part3.js            # 主题引擎 / 会话 / 检索 / 文档浏览 / 云沙盒 / 移动端
```

改完 `src/` 后：

```bash
node build.mjs      # 只需这一步就能更新 index.html
```

---

## 🎨 设计系统

黑是底、金是点、灰是骨，金色占比 < 5%。核心 token（可直接改 `src/style.css`）：

```css
--bg-0:#0E0D0B;  --bg-1:#181613;  --bg-2:#221F1B;  --bg-3:#2C2823;   /* 暗金四层 */
--gold-400:#C9A45C;                                                  /* 主金（饱和度 50%，不发塑料光） */
--text-1:#F6F2E9; --text-2:#C0B8AA; --text-3:#8D8475;
--accent-h:40; --accent-s:50%; --accent-l:58%;                       /* 设置页可调 */
--radius-scale:1; --font-scale:1; --glass-blur:20px;                 /* 设置页可调 */
```

哑光金的要点：饱和度 ≤52% + 三段暗-亮-暗渐变 + 内顶高光/内底暗压 + 噪点层（`opacity .10`）+ 发光透明度 ≤.20。

---

## ⚠️ 已知限制

- **CORS**：网页版直连第三方 API 可能被拦。DeepSeek / OpenRouter / SiliconFlow / Moonshot 等多数可直连；被拦时用桌面端或自建代理。
- **Token 数**：优先读服务端 `usage`（`stream_options.include_usage`，400/422 时自动去掉该字段重试）；拿不到则按「中日韩字符 ≈ 1 token，其余 ≈ 4 字符/token」估算并标注「含估算」。
- **Electron** 为了打通第三方 API 关闭了 `webSecurity`，仅建议在自用场景。
- 数据存在 `localStorage`（key `lucifer.state.v1`），会自动迁移旧版 `agenthub.state.*`。设置页可导出 / 导入 JSON。
