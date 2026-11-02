# dsh-plugin-documd

在 DeepSeek Harness（dsh）**右侧栏**预览 Markdown、代码与图表：用 [docu.md](https://docu.md/) 的渲染引擎
（`markdown-viewer` v6.0.0）渲染，文件内容由本插件宿主半边同源提供，viewer 运行在沙箱 iframe 里。

English summary: a right-sidebar file preview plugin for DeepSeek Harness, rendering Markdown /
code / diagrams with the docu.md engine inside a sandboxed iframe, served same-origin by the plugin's
own host half. GPL-3.0-only, because the engine is GPL-3.0-only.

## 当前状态

| 项目 | 结论 |
| --- | --- |
| 宿主半边（HTTP + token + 路径约束） | ✅ 已跑通（38 条单测 + 真 HTTP 请求） |
| viewer 静态产物 | ✅ 已构建并**提交**在 `assets/viewer/`（34 套主题、mermaid、KaTeX 字体、_locales） |
| viewer 渲染 Markdown/代码/Mermaid/KaTeX/相对图片 | ✅ 裸浏览器实测通（截图见 [docs/dev-harness-render.png](docs/dev-harness-render.png)） |
| 客户端 tab 注册（`sidebarRightTabs` + `sidebar.right.pane.tab`） | ⚠️ 类型检查 + 构建通过；**未在真 dsh GUI 里加载验证**（本机无 dsh 运行环境） |
| 降级链（PDF/图片内嵌、Office 卡片 + 其它 viewer 挂载点） | ✅ 代码就绪；同样只做过类型/构建验证 |
| 安装时零构建（`pnpm add github:…#sha` 不跑脚本） | ✅ 实测：无任何安装期脚本，`lib/` 与 `assets/viewer/` 随包分发 |

> 诚实边界：tab 能不能在真 dsh 里命中，只有装上 `dsh web` 才能证明。本仓库做到的是
> 「宿主半边真跑通 + viewer 真渲染」，客户端半边到「类型/构建/协议按 npm 包 `.d.ts` 对齐」为止。

## 安装（安装时零构建）

`lib/`（宿主 `lib/index.js` + 客户端 `lib/client.js`）和 `assets/viewer/`（约 23 MB 离线 viewer）都**已提交**，
`package.json` 里**没有任何安装期脚本**（无 `prepare` / `preinstall` / `install` / `postinstall`）。
因此 pnpm / npm 从 GitHub 装这个包时**不需要执行构建**，也不会触发
`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`。

```sh
# desktop profile（报错里出现的 profile 就走这个）
dsh plugin --profile desktop add github:bluesky8318/dsh-plugin-documd#v0.1.1

# web profile 同理
dsh plugin --profile web add github:bluesky8318/dsh-plugin-documd#v0.1.1

dsh                    # 起 GUI，点会话里的文件链接即可在右侧栏预览
```

`#v0.1.1` 是 tag，也可以钉提交：`github:bluesky8318/dsh-plugin-documd#<sha>`。

> **`vendor/markdown-viewer` 这个 submodule 只有「重建 viewer 资产的开发者」才需要。**
> codeload 的 `tar.gz`（pnpm 装 GitHub 包时用的就是它）**不包含 submodule 内容**，而安装/运行路径
> 完全不读它：宿主只从 `assets/viewer/` 取静态文件。只有你改 `viewer/` 或升级引擎、要重跑
> `npm run build:viewer` 时才需要 `git submodule update --init && npm run vendor:install`；
> 缺 vendor 时构建脚本会直接报错并给出这条命令，不会静默产出半成品。

本地开发（要重新生成 `lib/` 与 `assets/viewer/`）：

```sh
npm install
git submodule update --init     # 仅重建 viewer 需要
npm run vendor:install          # 仅重建 viewer 需要：装引擎依赖 + 打 dsh patch
npm run build:release           # tsdown → lib/，并校验 assets/viewer/ 完整性
```

**兜底**：如果你的 profile 因为别的依赖（不是本包）仍然报 allowBuilds，按提示在 profile 的
`pnpm-workspace.yaml` 里加：

```yaml
allowBuilds:
  dsh-plugin-documd: true
```

但 0.1.1 起本包没有任何安装期脚本，正常情况下**不需要**这一项。

装好后在会话里点文件链接（`dsh-resource://file/session/<sid>/<path>`），右侧栏会开出预览 tab。

## 支持的文件类型

| 类型 | kind | 行为 |
| --- | --- | --- |
| `.md` `.markdown` | `documd` | docu.md 渲染（GFM、代码高亮、Mermaid/drawio/vega、KaTeX） |
| 代码：`.ts .tsx .js .py .go .rs .java .vue .html .css .json .yaml .toml .sh …` | `documd` | 代码阅读视图（按扩展名套语言） |
| 图表源文件：`.mmd .mermaid .puml .plantuml .vega .vl .dot .gv .drawio .canvas .echarts …` | `documd` | 包成对应渲染类型 |
| `.pdf` | `documd-native` | 内嵌 iframe + 「在新标签打开」 |
| 图片：`.png .jpg .jpeg .gif .webp .avif .bmp .ico .svg` | `documd-native` | `<img>` 直接显示 |
| `.docx .xlsx .pptx .epub .zip .exe .mp3 .mp4 .ttf …` | `documd-unsupported` | 明确提示卡（不静默失败），并列出其它插件可用的 viewer |
| 其它未列出的扩展名 | —（不声明） | 回落到 dsh 官方文本预览（`priority: fallback`） |

扩展名清单在 [src/shared/contract.ts](src/shared/contract.ts)；代码扩展名与上游
`src/utils/extension-categories.ts` 的 `EXT_LANG_MAP` 镜像，升级 vendor 时需对照。

## 架构

```
浏览器（dsh client 半边）
  ctx.sidebarRightTabs.register({id, kind, patterns, priority:'extension', title, canOpen})
  ctx.slots.register('sidebar.right.pane.tab', {key: <id>, locale, inject}) → React 组件
        │  POST /docu-preview/api/session   （地址 → 一次性 token + 分类 + 主题）
        │  GET  /docu-preview/api/file      （按 token 读文本）
        ▼
  <iframe src="/docu-preview/viewer/index.html?token=…&theme=…">
        │  VIEWER_READY / VIEWER_RENDERED / VIEWER_SCROLL_LINE_CHANGED
        │  WORKSPACE_NAVIGATE / OPEN_URL / VIEWER_ERROR / EXPORT_RESULT
        ▼
宿主（Cordis 插件，ctx.webServer 同源挂载 /docu-preview）
  GET  /viewer/*               静态 viewer（assets/viewer）
  POST /api/session            签发 token（校验 Origin、workspace realpath、大小上限）
  GET  /api/file               读文本
  GET  /api/asset[?path=]      二进制 / 相对图片（Range 206）
  GET  /api/theme?dark=0|1     vscode / vscode-dark
```

关键约束：

- **workspace 约束**在 realpath 上做（`fs.realpath` + `path.relative` 包含性检查），`..` 直接拒绝；
  多根用 `;` 或 `,` 分隔，空值回落 `process.cwd()`。
- **一次性 token**：`randomBytes(24)`，绑定一个文档路径，`tokenTtlMs` 过期，tab 关闭即 `DELETE`。
   viewer 拿不到会话凭证，只能读这一个文件及其目录下的资产。
- **同源**：浏览器半边与 iframe 都在 dsh web 源上，不写 CORS 头；跨站 POST 被 Origin 检查拒绝。
- **主题**：客户端从 `data-theme`/class/背景亮度/`matchMedia` 探测明暗，经 `/api/theme` 映射成
  `vscode` / `vscode-dark`，用 `SYNC_HOST_UI` 推给 viewer；变化（属性变动或系统主题切换）实时同步。
- **滚动**：viewer 冒泡 `scrolllinechange` → `VIEWER_SCROLL_LINE_CHANGED` → 客户端按地址记住行号，
  重开同一文件时用 `OPEN_DOCUMENT.targetLine` 恢复。
- **降级链**：三类 tab 全部 `priority:'extension'`（高于官方 `text` 的 `fallback`）；
  unsupported 卡通过 `ctx.sidebarRightTabs.candidates(address)` 发现其它插件声明的 kind，并
  `ctx.sidebarRight.openResource(address, {kind})` 转交——这就是预留的
  `dsh-docx` / `dsh-pptx` / `dsh-opensheet-sidebar` 接口。

## 开发

```sh
npm install
git submodule update --init  # 上游引擎（.gitmodules 里钉死 SHA）
npm run vendor:install       # 装上游依赖 + 打两处 dsh patch（已检出时不再下载）
npm run typecheck           # tsc --noEmit（src + tests）
npm run test:unit           # vitest：契约解析 / workspace 约束 / token / 真 HTTP 路由
npm run build:release       # tsdown → lib/（提交），并校验安装可用性与 assets/viewer/ 完整性
npm run check:packaging     # 只校验「安装时零构建」契约（无安装期脚本 + lib/assets 齐全）
npm run build:viewer        # 重建 assets/viewer（约 23 MB，需要 vendor 与 esbuild）
npm run build:viewer:check  # 只校验产物完整性，不重建
```

**裸浏览器验证 viewer**（不需要 dsh）：

```sh
npm run build && npm run build:viewer
npm run dev:viewer          # http://127.0.0.1:4318
```

`dev/serve-viewer.mjs` 用桩 Cordis 上下文加载**构建后的** `lib/index.js`，把真实的
`/docu-preview` handler 挂到本地 http 上；`dev/harness.html` 扮演客户端：签发 token → 读文件 →
建 iframe → `VIEWER_READY` 后下发 `OPEN_DOCUMENT`。样例是 `dev/sample/demo.md`
（标题/表格/代码/Mermaid/KaTeX/相对图片）。截图：`docs/dev-harness-render.png`。

**在 dsh 里调宿主半边**（overlay 只加载 host 半边）：

```sh
# 把 dev/cordis.yml 里的 name 改成你机器上的绝对路径，且必须是 file:// URL
pnpm dsh web --patch /absolute/path/to/dsh-plugin-documd/dev/cordis.yml
```

要测浏览器半边（tab 注册），必须把包装进 profile（client-modules 按包名发现 `dsh.client`）。

## 目录结构

```
src/
  index.ts              宿主插件入口：Config(Schemastery, volatile) + ctx.webServer 挂 /docu-preview
  shared/contract.ts    路由/地址解析/扩展名分类/主题（host 与 client 共用，无 node: 依赖）
  host/paths.ts         workspace realpath 约束、MIME、Range
  host/tokens.ts        一次性 token 表
  host/routes.ts        /viewer/*、/api/{session,file,asset,theme}
  client/index.ts       inject slots/locale/sidebarRightTabs/sidebarRight；注册字典 + 样式 + tab
  client/registration.ts  三个定义 + 三个 sidebar.right.pane.tab 体
  client/preview-tab.tsx  iframe + postMessage 桥（OPEN_DOCUMENT / SCROLL / 主题 / 导航）
  client/native-tab.tsx   PDF / 图片内嵌
  client/unsupported-tab.tsx  提示卡 + 其它 viewer 挂载点
viewer/
  build.js              从上游 vscode/build.js fork：MV_PLATFORM="dsh"、MV_RUNTIME="webview"
  src/webview/api-impl.ts        PlatformAPI 的 dsh 实现（走自有 HTTP，不碰 chrome.*）
  src/workspace/viewer-embed.ts  iframe 侧桥 + 渲染器装配
vendor/markdown-viewer/ 上游引擎（git submodule，钉死 SHA；见 NOTICE）
assets/viewer/          构建产物（已提交）
scripts/                vendor-install / patch-vendor / build-viewer
dev/                    serve-viewer.mjs + harness.html + sample
tests/                  contract.spec.ts / host.spec.ts
```

## 升级 docu.md 引擎

引擎是 submodule，升级 = 移动 gitlink：

1. `git -C vendor/markdown-viewer fetch origin && git -C vendor/markdown-viewer checkout <目标提交>`
2. 把 `scripts/vendor-install.mjs` 与 `scripts/patch-vendor.mjs` 里的 `VENDOR_SHA` 改成同一个 SHA；
3. `npm run vendor:install`（重装依赖并重打两处 dsh patch；若 `patch-vendor.mjs` 报
   “upstream text not found”，说明上游改了那两行，改脚本锚点而**不要**手改 vendor 树）；
4. `npm run build:viewer` 重建产物，核对 `npm run build:viewer:check` 通过；
5. 对照 `EXT_LANG_MAP` 更新 `src/shared/contract.ts` 的 `CODE_EXTENSIONS`，跑 `npm run test:unit`；
6. `git add vendor/markdown-viewer .gitmodules` 提交新的 gitlink。

选择 submodule 而不是「把上游文件直接提交进仓库」：上游是 GPL-3.0-only 的独立项目，submodule
能精确钉住提交、保留上游历史与 license 边界，仓库也不会因为一次上游改动产生上千文件的 diff。
唯一代价是 clone 后要多跑一次 `git submodule update --init`（已在上面安装步骤里）。

## 版本兼容（务必看）

`@deepseek-ai/dsh-host-webserver` 的服务名在版本间变过：

| dsh-host-webserver | 注入名 |
| --- | --- |
| `0.0.1-rc.1` | `httpServer` |
| `0.1.7-rc.2`（本插件对齐的版本，与模板一致） | `webServer` |

若你的 dsh 还是 `0.0.x`，把 [src/index.ts](src/index.ts) 的 `inject` 与 `ctx.webServer` 改成
`httpServer`，并同步改 `package.json` 的 devDependencies。

## 已知限制

- 客户端 tab 未在真 dsh GUI 里验证（本机无 dsh）；tab 命中依赖 `patterns`/`canOpen` 与官方
  `documentpreview` 的地址格式一致，已按 npm 包 `.d.ts` 对齐，但仍需一次真机确认。
- viewer 只读文本：`maxPreviewBytes`（默认 8 MiB）以上的文件直接拒绝（413），超长文件不做分页。
- 相对图片/资产读取限定在 workspace 根内（含符号链接 realpath 检查）；文档引用根目录之外的文件
  会得到 403，而不是渲染失败。
- `.csv/.tsv` 走高亮代码视图，不是表格视图；`.docx/.xlsx/.pptx` 只给提示卡，需另装对应插件。
- 主题只映射 `vscode` / `vscode-dark`；想用其它 34 套主题，把 `themeId` 配成 registry 里的 id。
- `assets/viewer/` 体积约 23 MB（含 mermaid 与 drawio stencils），npm 包会偏大。

## 许可

GPL-3.0-only。上游引擎（`markdown-viewer/markdown-viewer-extension`，SHA
`eca66a1d…`）同为 GPL-3.0-only；详见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)
（含上游 attribution 与本仓库相对上游的修改说明）。
