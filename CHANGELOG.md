# Changelog

版本按时间倒序。安装时始终**零构建**（`lib/` 与 `assets/viewer/` 随包提交），
因此每个 tag 对应的源码树都是可安装的完整树。

## 1.0.1（2026-11-07）— 修「装了 better-sidebar 后永远抢不到文件」

GUI 排查发现：装了 `dsh-better-sidebar` 后，点文件树里的任何文件永远打开它的 editor tab，
documd 的 viewer 排不上。根因是 tab 竞争排序（`sidebar-right` 的 `candidates()`：
band 降序 → 命中 pattern 长度降序 → 注册顺序）叠加了两个劣势：

- documd 按 `priority: builtin`（档位 2）注册，而 better-sidebar 的 editor tab 是
  `extension`（档位 3）—— **跨档比较先于 pattern 长度**，短模式再长也没用；
- 即使同档，documd 的 `*.md` 式短 glob（4–6 字符）也短于 editor 的
  `dsh-resource://file/**`（22 字符）。

修法（两处配合，缺一不可）：

- `patternsForCategory` 改发**全地址冒号 glob**：`dsh-resource://file/**/*.md`（27 字符），
  在 `extension` 档内以 pattern 长度平局裁决压过 editor 的 22 字符模式；
- patch 配置需同步加 `priority: extension`（host 热加载，无需重启）：
  `- id: dsh-plugin-documd / config: { mode: auto, priority: extension }`。

新增 `bandForCategory(plan, category)` 纯函数：`extension` 档下 **unsupported 提示卡自动
降级到 `builtin`** —— 本插件不渲染的格式（zip/mp3/无扩展名文件）绝不抢 extension 档
editor 的活，只压官方 text 兜底。GUI 已双向验证：`README.md` → documd viewer（editor
开启状态下）；`LICENSE` → 仍归 better-sidebar editor。75/75 单测通过（新增 pattern
长度下限与 picomatch 作用域匹配测试）。

其它：

- `package-lock.json` 重建：192 条 `resolved` 全部指向不可达的公司镜像
  `npmrepo.corp.qunar.com`（历史环境遗留），现改为官方 npm registry（npm 11+ 形态，
  默认源的包省略 `resolved`，跟随安装方配置）；devDependencies 补 `picomatch` /
  `@types/picomatch`。
- `ASSET_VERSION` 随版本升至 `1.0.1`（发行约定：版本号与 package.json 一致，使不可变的
  `/viewer/1.0.1/` 子树失效缓存；重启 dsh 后生效，期间旧 1.0.0 地址仍由内存中的旧 host
  半边正常服务）。

安装：

```sh
dsh plugin --profile desktop add github:bluesky8318/dsh-plugin-documd#v1.0.1
```

## 1.0.0（2026-11-03）— 首个正式版

首个经过完整 GUI 验收的正式版本：安装、启动、打开预览、长文滚动、切换预览方式全部手点通过。
本版**没有功能改动**，只做版本收敛与发布工程：

- `package.json` / `package-lock.json` / `src/shared/contract.ts` 的 `ASSET_VERSION` 统一到 `1.0.0`，
  资产路径随之变为 `/docu-preview/viewer/1.0.0/…`（旧版本路径返回 404，避免混用缓存）；
- 新增本文件，并把 README 的「当前状态」改为已验证结果、补「发版流程」与三条已知限制；
- 修正 `NOTICE` 里「vendor 是 git submodule」的过时描述（0.1.4 起已移除 submodule）。

安装：

```sh
dsh plugin --profile desktop add github:bluesky8318/dsh-plugin-documd#v1.0.0
```

## 0.1.6 — 修「打开慢」与「不能滚动」

GUI 实测 0.1.5 后报了两个问题：首屏明显比官方 Markdown 预览卡，且长文档没有滚动条。
两个都是先量化再修的（dev harness，`dev/sample/medium.md`，600 px 固定高容器）：

| 指标 | 修前 | 修后 |
| --- | --- | --- |
| 打开 → 首屏 | 2205.8 ms | 827 ms |
| viewer 渲染段 | 1604.9 ms | 135 ms |
| iframe 启动 | ~870 ms | ~650 ms |
| 重复打开的网络字节 | 3.9 MB | 0 |

**不能滚动**：引擎自己滚的是 `#markdown-wrapper`（`element.ts` 里 `target.closest('#markdown-wrapper')`），
而 0.1.5 的 iframe 文档只有 `#docu-preview-root`，引擎退到没有高度、没有 `overflow` 的
`#markdown-content`，再被 `body{overflow:hidden}` 裁掉。修法：

- viewer 文档补回 `#markdown-wrapper`（`height:100%; overflow-y:auto; margin:0 !important`），
  让滚动发生在 iframe 内；
- 宿主 `.dm-pane` 为 `overflow:hidden`、`.dm-frame` 为 `flex:1 1 auto; min-height:0; height:100%`，
  保证 frame 能被压缩，不会形成第二层滚动或裁切。

**打开慢**：两个放大点，都是实测定位的。

- `element.ts` 首次显示前会轮询等 `#mv-content-styles` 与 `#theme-dynamic-style`，上限 1500 ms；
  这两个标签只在 Chrome 扩展宿主里被注入，本插件永远等不满 → 每次首屏白等约 1.6 s。改为 boot
  阶段就 `loadAndApplyTheme()`（顺带写出 `#theme-dynamic-style`），并在 `index.html` 里放一个空的
  `<style id="mv-content-styles">` 占位。
- 静态资源每次重下：`resource.fetch` 原用 `cache:'no-cache'`、响应只有 `max-age=300`，每次开 tab
  都要重校验 3.7 MB 的 `viewer.js`。改为版本化路径 + 该子树 `immutable` 长缓存 + `ETag`/`304`，
  客户端在插件激活时 `preload` `viewer.js`/`styles.css`，并在拿到 token 后立刻建 iframe、正文并行读取。

另加：`POST /api/metrics` 记录每次打开的分段耗时（ring buffer 8 条），`debug:true` 时在
`/api/diagnostics` 里可见；客户端 `preloadViewer()` 预热；`tests/assets.spec.ts` 用断言锁住滚动容器链。

## 0.1.5 — 按地址作用域解析 workspace + 预览方式可切换

**`no such file in the workspace`**：dsh 对 workspace 内文件给出的是
`dsh-resource://file/session/<sid>/<相对路径>`（session 作用域 + 相对路径），而 0.1.4 在
`workspaceRoot` 留空时回退 `process.cwd()`——桌面版 dsh 的 cwd 不是会话工作区，`realpath` 全失败。

- 新的解析顺序与 dsh 官方 workspace 文件服务一致：session `header.cwd` →
  `sandboxPolicy.workspaceRoot` → 配置的 `workspaceRoot`（`;` / `,` 多根）→ `process.cwd()`；
- 等价路径规则改为「归一化 + realpath 双重包含性」而不是字符串前缀比较：正/反斜杠、
  `.`/`..`、junction/symlink 的根、盘符大小写都正确处理；`realpath` 失败时回退归一化路径，
  保证不存在的文件给 404 而不是误判越权；归一化后仍在根外 → 403 `outside_workspace`；
- `debug:true` 的 `/api/diagnostics` 回显原始 URI、roots、每个候选的
  `candidate/realPath/stat/contained/fallback`。

**预览方式切换**：新增 `mode`（`manual` 默认 / `auto` / `off`）、`priority`
（`extension` / `builtin` / `fallback`）、`rememberChoice`。默认不抢右侧栏 tab，只注册到官方
`documentPreviews`（「打开方式」下拉）；`auto` 才按优先级 claim。三个切换入口共享
`candidates()`：官方下拉、tab 顶部工具条、unsupported 提示卡（可把 `.docx` 等转交给未来的
Office 插件）。按扩展名把选择记到 `localStorage`。

## 0.1.4 — 移除 vendor submodule

pnpm 装 git 依赖时会执行 `git submodule update --init --recursive`，上游引擎的嵌套 submodule 用
SSH URL，在没有 SSH key 的机器上直接 `Permission denied (publickey)`。因此仓库不再有
`.gitmodules`：`vendor/markdown-viewer/` 不入库，改由 `scripts/vendor-install.mjs` 按固定 SHA
下载 tarball 物化（仅重建 viewer 时需要）。运行期只读 `assets/viewer/`，完全不碰 vendor。
`check:packaging` 会在出现 `.gitmodules` 时报错。

## 0.1.3 — 内联 schemastery

本地 clone / overlay（`--patch` 指向 `file://`）没有 `node_modules`，而 `@deepseek-ai/schemastery`
是宿主的内部依赖、插件解析链看不见，0.1.2 的 `ERR_MODULE_NOT_FOUND` 由此而来。改为
`deps.alwaysBundle` 内联进 `lib/index.js`（版本钉 `3.18.5`，与宿主 asar 内同一份代码；cordis 只按
`StandardSchemaV1` 鸭子类型调用，不存在双实例问题）。同时新增 `check:packaging` 守卫：扫描
`lib/*.js` 的裸模块引用，凡不是 `node:` 内置也不是 peer 的一律失败。

## 0.1.2 — 对齐 dsh 0.2.1-rc.5

`dsh-host-webserver` 的服务注入名从 `httpServer` 改为 `webServer`；兼容闸门（
`evaluatePluginCompatibility()` → `unmetRequirements()`）只认以 `@deepseek-ai/dsh` 开头的 peer，
因此 `peerDependencies["@deepseek-ai/dsh-tools"]` 改为**精确** `0.2.1-rc.5`（rc 之间可能有 API
变动，范围匹配不安全）。7 个 `@deepseek-ai/dsh-*` devDependency 同步到同一版本。

## 0.1.1 — 安装时零构建

pnpm 不允许 git 依赖跑 `prepare`（`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`）。移除所有安装期脚本
（`prepare`/`preinstall`/`install`/`postinstall`），把 `lib/` 与 `assets/viewer/` 提交进仓库，
安装即用，不触发任何构建。

## 0.1.0 — 最初实现：调研结论与迁移路径

**调研结论**

1. dsh 0.2.1-rc.5 的插件面够用：`ctx.webServer`（同源挂载 HTTP）、`ctx.sidebarRightTabs`、
   `ctx.slots` 的 `sidebar.right.pane.tab`、`ctx.documentPreviews`、`ctx.sidebarRight.openResource`；
   但它不提供「插件自带 iframe 沙箱」的现成能力，viewer 静态资产必须由插件自己按同源路由提供。
2. docu.md 的渲染核心是 Chrome 扩展代码（`markdown-viewer-extension` v6.0.0，**GPL-3.0-only**），
   直接依赖 `chrome.*` API。迁移路径是给引擎加一个 `'dsh'` 平台并实现它的 `PlatformAPI`：
   `viewer/src/webview/api-impl.ts` 把文件/资产读取换成插件自己的 HTTP + token；构建入口
   `viewer/build.js` 是上游 `vscode/build.js` 的 fork（`MV_PLATFORM="dsh"`、`MV_RUNTIME="webview"`）。
   上游只改两处（`src/types/platform.ts` 的 `PlatformType`、`src/utils/platform-info.ts` 的
   `PLATFORM_SET`），由 `scripts/patch-vendor.mjs` 幂等施加。
3. 隔离：viewer 跑在 sandbox iframe 里，拿不到 dsh 会话凭证，只能凭一次性 token 读**一个**文件
   及其目录下的资产；token `randomBytes(24)`，绑定路径与 sessionId，可设 TTL，tab 关闭即吊销。
4. 许可：引擎 GPL-3.0-only ⇒ 整个仓库 GPL-3.0-only，上游 attribution 写在 `NOTICE`。
5. 安装形态：从 GitHub 装、安装期不能构建 ⇒ 产物入库（见 0.1.1）。

**交付形态**：host 半边 `lib/index.js`（`/docu-preview` 路由 + token + workspace 路径约束）、
client 半边 `lib/client.js`（React tab，`window.__ModuleLoader__.load`）、viewer 资产
`assets/viewer/`（约 23 MB，含 34 套主题、mermaid、drawio stencils、KaTeX 字体、`_locales`）。

## 已知限制（1.0.0 时点）

- **首屏约 0.8 s**：其中约 650 ms 是解析 3.7 MB 的 `viewer.js`，受引擎单包体积限制；
  拆 bundle 或跨 tab 复用 iframe 都还没做（Chrome 里跨父级移动 iframe 会重载）。
- **`.docx/.xlsx/.pptx` 只给降级提示卡**，不渲染内容；需另装 Office 类插件，卡片会通过
  `candidates()` 自动发现并转交。
- **peer 依赖由 dsh profile 提供**：`@deepseek-ai/cordis`（`~4.0.5`）与
  `@deepseek-ai/dsh-tools`（`0.2.1-rc.5`）不内联，必须与宿主同一实例；本地 clone / overlay 下
  缺它们会 import 失败。
- 只读文本：`maxPreviewBytes`（默认 8 MiB）以上直接 413，超长文件不分页。
- 相对资源限定在 workspace 根内（realpath 校验），根外引用 403 而非渲染失败。
- `.csv/.tsv` 走高亮代码视图，不是表格视图；主题只映射 `vscode` / `vscode-dark`
  （其它 34 套可用 `themeId` 指定）。
- 滚动行号只记在客户端内存，插件重载 / dsh 重启后不保留。
