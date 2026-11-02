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
| 客户端 tab 注册（`sidebarRightTabs` + `sidebar.right.pane.tab`） | ⚠️ 类型检查 + 构建通过；**未在真 dsh GUI 里加载验证**（本机有 dsh CLI，但未启动 GUI 点开文件） |
| 降级链（PDF/图片内嵌、Office 卡片 + 其它 viewer 挂载点） | ✅ 代码就绪；同样只做过类型/构建验证 |
| 安装时零构建（`pnpm add github:…#sha` 不跑脚本） | ✅ 实测：无任何安装期脚本，`lib/` 与 `assets/viewer/` 随包分发 |
| host 半边在「无 node_modules 的本地 clone」下可 import | ✅ 实测：0.1.3 起所有运行时依赖已内联，`lib/index.js` 只剩 `node:*` import |
| `github:` 安装（pnpm 会递归初始化 submodule） | ✅ 0.1.4 起仓库无 `.gitmodules`，安装不再触发上游引擎的 SSH submodule 拉取 |
| dsh 0.2.1-rc.5 兼容闸门（`requirements`） | ✅ 实测：用 dsh 自带 `evaluatePluginCompatibility` + 真 CLI 判定通过 |

> 诚实边界：tab 能不能在真 dsh 里命中，只有装上 `dsh web` 才能证明。本仓库做到的是
> 「宿主半边真跑通 + viewer 真渲染」，客户端半边到「类型/构建/协议按 npm 包 `.d.ts` 对齐」为止。

## 安装（安装时零构建）

`lib/`（宿主 `lib/index.js` + 客户端 `lib/client.js`）和 `assets/viewer/`（约 23 MB 离线 viewer）都**已提交**，
`package.json` 里**没有任何安装期脚本**（无 `prepare` / `preinstall` / `install` / `postinstall`）。
因此 pnpm / npm 从 GitHub 装这个包时**不需要执行构建**，也不会触发
`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`。

```sh
# desktop profile（报错里出现的 profile 就走这个）
dsh plugin --profile desktop add github:bluesky8318/dsh-plugin-documd#v0.1.4

# web profile 同理
dsh plugin --profile web add github:bluesky8318/dsh-plugin-documd#v0.1.4

dsh                    # 起 GUI，点会话里的文件链接即可在右侧栏预览
```

`#v0.1.4` 是 tag，也可以钉提交：`github:bluesky8318/dsh-plugin-documd#<sha>`（
v0.1.4 对应提交见仓库 Releases / `git rev-list -n1 v0.1.4`）。

> **仓库里没有 git submodule（0.1.4 起）。** pnpm 装 git 依赖时会执行
> `git submodule update --init --recursive`，而上游引擎自己的嵌套 submodule 用的是 SSH URL，
> 在没有 SSH key 的机器上必然失败（表现为 `Permission denied (publickey)`）。所以
> `vendor/markdown-viewer/` 改为**不入库、不作为 submodule**，只给「重建 viewer 资产」的开发者用：
> 运行路径完全不读它（宿主只从 `assets/viewer/` 取静态文件）。
>
> 需要重建 viewer 时：`npm run vendor:install`（按 `scripts/vendor-install.mjs` 里钉死的 SHA 下载 tarball、
> 解包、装依赖并打 dsh patch）；缺 vendor 时构建脚本会直接报错并给出这条命令，不会静默产出半成品。

本地开发（要重新生成 `lib/` 与 `assets/viewer/`）：

```sh
npm install
npm run vendor:install          # 仅重建 viewer 需要：下载引擎 + 装依赖 + 打 dsh patch
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
vendor/markdown-viewer/ 上游引擎（不入库，由 `npm run vendor:install` 按 SHA 物化；见 NOTICE）
assets/viewer/          构建产物（已提交）
scripts/                vendor-install / patch-vendor / build-viewer
dev/                    serve-viewer.mjs + harness.html + sample
tests/                  contract.spec.ts / host.spec.ts
```

## 升级 docu.md 引擎

引擎不入库（也**不是** submodule），升级 = 改一处 SHA 再重新物化：

1. 把 `scripts/vendor-install.mjs` 与 `scripts/patch-vendor.mjs` 里的 `VENDOR_SHA` 改成同一个目标提交；
2. `npm run vendor:install -- --force`（重新下载 tarball、装依赖并重打两处 dsh patch；若
   `patch-vendor.mjs` 报“upstream text not found”，说明上游改了那两行，改脚本锚点而**不要**手改 vendor 树）；
3. `npm run build:viewer` 重建产物，核对 `npm run build:viewer:check` 通过；
4. 对照 `EXT_LANG_MAP` 更新 `src/shared/contract.ts` 的 `CODE_EXTENSIONS`，跑 `npm run test:unit`；
5. `git add src/shared/contract.ts assets/viewer` 提交新的构建产物与扩展名清单（**不提交 vendor/**）。

选择「不入库 + 按 SHA 下载」而不是 submodule：上游是 GPL-3.0-only 的独立项目，用 SHA 钉住同样能保证
可重现，且仓库不会因为一次上游改动产生上千文件的 diff；更关键的是 **pnpm 装 git 依赖时会递归
初始化 submodule**，而上游的嵌套 submodule 用 SSH URL，会让所有用户的安装直接失败。
vendor 目录已在 `.gitignore` 里，`check:packaging` 也会在没有 `.gitmodules` 时通过、出现就报错。
唯一代价是 clone 后要多跑一次 `npm run vendor:install`（仅在你需要重建 viewer 时）。

## 版本兼容（务必看）

本插件锁定的 dsh 运行时：**`0.2.1-rc.5`**（desktop 0.2.1-rc.5 自带
`@deepseek-ai/dsh-tools@0.2.1-rc.5`）。

dsh 安装插件时会读插件 `package.json` 的 **`peerDependencies`** 作为报错里的
`requirements`：判定函数在 `@deepseek-ai/dsh-app-boot`（`evaluatePluginCompatibility()` →
`unmetRequirements()`），只挑以 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-` 开头的 peer，
用 `semver.satisfies(runtimeVersion, range, { includePrerelease: true })` 与运行时版本比较；
若 manifest 里存在 `engines.dsh`，则**只看它**并忽略 peer（本插件不用 `engines.dsh`）。

```json
"peerDependencies": {
  "@deepseek-ai/cordis": "~4.0.5",         // 不参与闸门判定
  "@deepseek-ai/dsh-tools": "0.2.1-rc.5"   // ← 参与判定，必须是 dsh 自带的那一版
}
```

为什么用精确版本而不是范围：`0.2.1-rc.5` 属于预发布版，`~0.2.1-rc.5` 只覆盖 `0.2.1` 的
预发布增量，rc 之间仍可能有 API 变动；精确匹配等于「只对已验证的这一版放行」。代价是 dsh 升到
`0.2.1-rc.6` 时闸门会再次拒绝——这是**预期行为**，请按下节重新验证，不要用
`dsh plugin allow-version` 豁免绕过（豁免绕过的正是需要验证的东西）。

`@deepseek-ai/dsh-host-webserver` 的服务名在版本间也变过：

| dsh-host-webserver | 注入名 |
| --- | --- |
| `0.0.1-rc.1` | `httpServer` |
| `0.1.x` – `0.2.1-rc.5`（本插件对齐） | `webServer` |

### 升级 dsh 时要一起改哪里

1. `package.json`：`peerDependencies["@deepseek-ai/dsh-tools"]` 改成新版 dsh 自带的版本；
   `devDependencies` 里 7 个 `@deepseek-ai/dsh-*` 全部改到同一版本（`dsh-tools`、
   `dsh-client-locale`、`dsh-client-ui-plugin-manager`、`dsh-client-ui-renderer`、
   `dsh-client-ui-sidebar-right`、`dsh-client-ui-slots`、`dsh-host-webserver`）；
   `@deepseek-ai/cordis` 跟随 dsh 自己的 peer 声明（当前 `~4.0.5`）。
2. 删掉 `node_modules` 与 `package-lock.json` 后 `npm install`（改了 peer 再增量装，npm 会因旧
   lock 报 `ERESOLVE`），然后 `npm run typecheck` 对着**新版 `.d.ts`** 过一遍。
3. `npm run build:release` 重建 `lib/`（「安装时零构建」要求产物随包提交）。
4. 核对这几处契约是否仍成立：`ctx.webServer.register`、`ctx.sidebarRightTabs.register` 与
   `ctx.sidebarRight.openResource`、`ctx.slots` 的 `sidebar.right.pane.tab` 座位、
   客户端 bundle 的 `window.__ModuleLoader__.load({ id, factory })`。
5. 最后 bump 插件版本、打**新 tag**（不要复用旧 tag），再按下面命令重装。

## 依赖与打包策略（为什么有的内联、有的不内联）

插件有**两条**加载路径，二者都必须能 import 成功：

| 加载方式 | 有没有 `node_modules` | 说明 |
| --- | --- | --- |
| `dsh plugin add` 装进 profile | 有（pnpm 会把 dependencies 装进 profile） | 正常安装路径 |
| 本地 clone / overlay（`--patch` 指向 `file://` 的 `cordis.patch.yml`） | **通常没有**（只 `git clone`，没跑 `npm install`） | 开发路径，0.1.2 在这里炸过 `ERR_MODULE_NOT_FOUND` |

所以判断标准不是「profile 里能不能解析到」，而是「**没有 node_modules 时能不能解析到**」：

| 包 | 怎么处理 | 理由 |
| --- | --- | --- |
| `@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools` | **peerDependencies（外部）** | 宿主注入，必须与宿主同一实例；也是兼容闸门读取的字段 |
| `@deepseek-ai/dsh-client-*`、`@deepseek-ai/dsh-host-webserver` | 仅 `import type`（不产生运行时引用） | 类型来源，不进产物 |
| `@deepseek-ai/schemastery` | **内联进 `lib/index.js`**（`deps.alwaysBundle`），版本固定在 devDependencies | 见下 |
| `react` / `react/jsx-runtime`（仅客户端 bundle） | 外部，由浏览器模块表提供 | `__ModuleLoader__` 的 `require` 表里只有这两个 |

**schemastery 为什么内联**：

1. 它是**普通依赖**（官方插件也这么声明，但它们住在宿主自己的 `node_modules` 树里，靠邻接解析）；
   第三方插件装进 profile 时有依赖可装，**本地 clone 没有**——0.1.2 的报错就是这条路径。
2. 内联是安全的：宿主 asar 内是 `3.18.5`，本包 devDependency 也钉 `3.18.5`，内联进去的是**同一份代码**；
   它是纯校验器，cordis 只按 `StandardSchemaV1`（`~standard.validate`）鸭子类型调用，不做 `instanceof`，
   因此不存在「两个实例导致行为不一致」的问题。
3. 相比「声明 peer 让宿主注入」：schemastery 是宿主的**内部依赖**，不是对外暴露的服务，插件的 Node
   解析链看不到 `app.asar` 内部，声明成 peer 只会把同一个错误换成「peer 缺失」。

**守卫**：`npm run check:packaging` 会扫描 `lib/index.js` 与 `lib/client.js` 的所有裸模块引用，
凡是「不是 `node:` 内置、也不是 peerDependencies 里的名字」就直接失败，并提示去
`tsdown.config.ts` 里加 `deps.alwaysBundle`。这条守卫是在 0.1.2 → 0.1.3 修复时加的，能直接复现当年那个 bug。

升级 schemastery 时：只改 `devDependencies` 里的版本（必须与宿主 asar 内的版本一致），
再 `npm run build:release`，确认 `lib/index.js` 里的 `import` 只剩 `node:*`。

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
