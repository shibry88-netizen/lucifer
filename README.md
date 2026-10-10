# LUCIFER

**多智能体中枢** —— 一个「总控 Agent 统一发号施令」的 AI 工作台。
单文件 Web 应用 + Windows 桌面端 + 安卓端，数据全部留在本地。

- **命名**：取自个人站 *Lucifer*。Lucifer 的拉丁语义是「晨星 / 启明星 / 光之使者」（*lux* 光 + *ferre* 带来）。
- **界面**：靛紫极光 + 液态玻璃；深浅双主题，主色 / 磨砂 / 圆角 / 字号均可调。
- **App 图标**：鎏金尖角星芒 + 纯黑底（`icon.svg` / `icon-192.png` / `icon-512.png` / `icon-1024.png`）。

---

## ✨ 能力

### 多智能体
- **主控调度**：主控 Agent 用 `<call agent="@角色名">任务</call>` 派活，前端自动调用并回传结果，循环至收敛（轮次可调）
- **Agent 管理**：名字 / **角色名**（供主模型识别）/ 头像（Emoji · URL · 上传）/ 简介 / 系统提示词；独立模型与能力开关
- **Skills**：从 GitHub 直拉（仓库根 / tree / raw / lobehub skill 页），内容注入该 Agent 的系统提示词

### 内置工具（Agent 可直接调用）
| 工具 | 指令 | 说明 |
|---|---|---|
| **云沙盒** | `<sandbox>print(3**2)</sandbox>` | e2b 兼容 REST，创建 → 执行 → 销毁；支持 python / shell |
| **联网检索** | `<search>关键词</search>` | SearXNG（自建免费）/ Tavily / Brave / Serper |
| **GitHub** | `<gh op="write" repo="o/r" path="a.md">内容</gh>` | 建仓库 / 读文件 / 提交 / 看 CI / 触发 CI |
| **文档** | `<doc op="create" title="X">正文</doc>` | create / append / update / read / list / delete，Agent 之间靠它交接 |

### 对话
- **发图片 / 文件**：点 ⊕、拖拽、或直接粘贴；图片以多模态方式传给模型，文本文件自动注入正文
- **对话内浏览文档**：Agent 产出的文档变成对话里的文档卡片，点开右侧抽屉看全文
- **Agent 自由读文档**：短文档（≤1500 字）全文注入提示词，长文档给摘要 + 按需 `<doc op=read>`
- **会话列表**：每个 Agent 多会话，新建 / 重命名 / 删除
- **全文历史检索**：跨会话消息、文档正文、Agent 配置；`⌘K` / `Ctrl+K`
- **会话导出 ZIP**：一键打包成 zip（README.md + conversation.json + manifest.json + docs/ + attachments/）
- **统计气泡**：折叠＝本次对话 token；展开＝参与 Agent、各自调用次数与 token、总量/输入/输出、请求次数、耗时

### 模型
主力预设排在前面：**DeepSeek · 智谱 GLM · 小米 MiMo · 中转站**（兼容 OpenAI 即插即用），另含 OpenAI / Kimi / 通义 / SiliconFlow / OpenRouter / Ollama / LM Studio / 自定义。
「拉取可用模型」直接读 `/models`，不用手抄模型名。

---

## 🚀 快速开始

```bash
node serve.mjs        # → http://localhost:5180
```
或直接双击 `index.html`。

**配置模型**：设置 → ① API 配置 → 选预设 → 填 Base URL + Key → 拉取可用模型 → 选默认模型。

**配置工具**（可选，在设置页 ②④⑤）：

- **云沙盒**：填 Endpoint（如 `https://api.e2b.dev`）+ Key，打开开关，点「测试云沙盒」
- **联网检索**：选服务商 → SearXNG 填实例地址，Tavily/Brave/Serper 填各自的 Key → 点「测试检索」
- **GitHub**：填 Personal Access Token（需要 `repo` + `workflow` 权限）→ 「连接并读取账号」

> Token / Key 只存在本机 localStorage，不会上传任何服务器。

---

## 🖥 Windows 桌面端

推荐 **Tauri 2**（系统 WebView2，安装包几 MB）；**Electron** 作为备选（内置 CORS 补丁）。

```bash
npm install
npm run icon           # 首次：由 icon-1024.png 生成各尺寸图标
npm run tauri:dev      # 开发运行
npm run tauri:build    # 产出 .exe / .msi → src-tauri/target/release/bundle/

npm run electron:dev
npm run electron:build # → release/ （NSIS 安装包）
```

前置：Tauri 需要 [Rust](https://rustup.rs/) + WebView2（Win11 自带）。

**桌面端的额外好处**：浏览器直连第三方 API 常被 CORS 拦，桌面端不受影响。

---

## 📱 安卓端

**路线 A · PWA（零打包）**：部署 `dist/` 到任意 HTTPS 静态托管，手机 Chrome →「添加到主屏幕」，即变全屏 App，支持离线外壳。

**路线 B · 真 APK**：
```bash
npm install
npm run cap:add      # 生成 android/ 工程
npm run cap:sync
npm run cap:open     # Android Studio → Build APK
```

移动端已适配：侧栏抽屉、底部五格导航、统计气泡转底部弹层、44px 触控热区、输入框 16px 防缩放、安全区留白。

---

## 🛠 目录结构

```
├─ index.html              # 构建产物：单文件应用（直接双击）
├─ build.mjs               # 内联 src/ → index.html，并做语法自检
├─ dist.mjs / serve.mjs    # 产出 dist/ ／ 本地静态服务
├─ manifest.webmanifest    # PWA 清单
├─ sw.js                   # Service Worker（缓存外壳，不缓存 API）
├─ icon.svg / icon-*.png   # 鎏金星芒图标
├─ capacitor.config.json   # 安卓打包
├─ electron/main.js        # Electron 主进程
├─ src-tauri/              # Tauri 工程
└─ src/
   ├─ shell.html           # 骨架（占位符 /*__CSS__*/ 与 /*__JS__*/）
   ├─ style.css            # 液态玻璃设计系统（双主题 + 自定义变量）
   ├─ app.part1.js         # 工具 / Markdown / Provider / 状态 / API / 指令解析
   ├─ app.part2.js         # 渲染与交互
   ├─ app.part3.js         # 主题 / 会话 / 检索 / 文档抽屉 / 沙盒 RPC / 移动端
   └─ app.part4.js         # 工具指令调度 / 检索 / ZIP / 附件 / GitHub
```

改完 `src/` 后：`node build.mjs`（只需这一步）。

---

## 🎨 设计令牌

```css
--bg-0:#08090f; --bg-1:#0e1018; --bg-2:#151824; --bg-3:#1e2231;   /* 四层深色 */
--accent:#7C6CFF; --accent-2:#4D8DFF;                              /* 第一版靛紫 */
--text-1:#ECEEF8; --text-2:#A9B1C8; --text-3:#848EAA;
--accent-h:248; --accent-s:100%; --accent-l:71%;                   /* 设置页可调 */
--radius-scale:1; --font-scale:1; --glass-blur:22px;
```
App 图标另用鎏金配方：`#3E2D0F → #A8823D → #FAF2DA → #A8823D → #4E3A16`（对角金属渐变 + 内倒角高光 + 哑光噪点）。

---

## ⚠️ 已知限制

- **CORS**：网页版直连第三方 API / 沙盒可能被拦。DeepSeek、SearXNG（自建）等多数可直连；被拦时用桌面端或自建代理。
- **Token 数**：优先读服务端 `usage`（`stream_options.include_usage`，400/422 自动去掉重试）；拿不到则按「中日韩字符 ≈ 1 token，其余 ≈ 4 字符/token」估算并标注。
- **ZIP** 为 store 模式（不压缩），单文件上限约 4GB。
- **Electron** 为打通第三方接口关闭了 `webSecurity`，仅建议自用。
- 数据存 `localStorage`（key `lucifer.state.v1`，自动迁移旧版 `agenthub.state.*`），设置页可导出 / 导入 JSON。

## Roadmap

- [ ] QQ 机器人接入
- [ ] 抖音：自动生成视频并发布
- [ ] 会话 / 文档导出为单页 HTML
- [ ] Tauri 自动更新
