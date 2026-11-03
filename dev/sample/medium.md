# dsh-plugin-documd 性能样例文档

这是一份用于 dev harness 计时的中等长度 Markdown：约 120 行正文、若干代码块与表格。
它不包含 Mermaid/PlantUML/draw.io 图表，因此打开它不应触发 `iframe-render.html`（12 MB）的加载。

## 快速开始

```bash
dsh plugin --profile desktop add github:bluesky8318/dsh-plugin-documd#v1.0.0
dsh
```

打开一个会话，点击 `.md` 文件，在右侧栏的「打开方式」里选择 `docu.md`。

## 目录结构

| 路径 | 作用 |
| --- | --- |
| `src/host` | HTTP 路由、token、workspace 路径解析 |
| `src/client` | sidebar tab 注册、iframe 桥、预览方式切换 |
| `viewer` | dsh 平台适配与 viewer 构建入口 |
| `vendor/markdown-viewer` | 上游渲染核心（只读） |
| `assets/viewer` | 构建产物，随插件提交 |

## 配置项

```yaml
- id: dsh-plugin-documd
  name: dsh-plugin-documd
  config:
    mode: manual
    priority: builtin
    rememberChoice: true
    debug: false
    workspaceRoot: ''
    maxPreviewBytes: 8388608
    tokenTtlMs: 600000
```

## 长文滚动验证

下面的段落用于把内容撑到足够长，确保 600px 高的宿主容器里必须出现滚动条。

### 第一节

在 dsh 的右侧栏里，tab body 的高度是由宿主布局决定的。插件根节点必须是 `flex:1; min-height:0`，
iframe 容器必须是 `flex:1; min-height:0; overflow:hidden`，iframe 自身 `width:100%; height:100%`。
任何一层缺少 `min-height:0`，flex 子项就会被内容撑高，滚动条随之消失。

### 第二节

viewer 文档内部不应再用 `height:100%; overflow:hidden` 截断内容；滚动应发生在 viewer 自己的滚动容器里，
这样 `SYNC_HOST_NAVIGATION` 与 `VIEWER_SCROLL_LINE_CHANGED` 才能正确对应到行号。

### 第三节

- 打开文档
- 等待 `VIEWER_READY`
- 发送 `OPEN_DOCUMENT`
- 等待 `VIEWER_RENDERED`
- 记录首屏完成时间

### 第四节

```ts
function post(type: string, payload: Record<string, unknown> = {}): void {
  if (window.parent === window) return
  window.parent.postMessage({ type, ...payload }, window.location.origin)
}
```

### 第五节

| 指标 | 说明 |
| --- | --- |
| session | token 签发完成 |
| file | 正文读取完成 |
| iframeLoad | iframe 的 load 事件 |
| ready | viewer 脚本与监听器就绪 |
| rendered | 首屏渲染完成 |

### 第六节

重复段落用于制造滚动高度。

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio.
Praesent libero. Sed cursus ante dapibus diam. Sed nisi. Nulla quis sem at
nibh elementum imperdiet. Duis sagittis ipsum. Praesent mauris. Fusce nec
tellus sed augue semper porta. Mauris massa. Vestibulum lacinia arcu eget
nulla. Class aptent taciti sociosqu ad litora torquent per conubia nostra,
per inceptos himenaeos. Curabitur sodales ligula in libero.

### 第七节

Sed dignissim lacinia nunc. Curabitur tortor. Pellentesque nibh. Aenean
quam. In scelerisque sem at dolor. Maecenas mattis. Sed convallis tristique
sem. Proin ut ligula vel nunc egestas porttitor. Morbi lectus risus, iaculis
vel, turpis. Fusce ac turpis quis ligula lacinia aliquet. Mauris ipsum.
Nulla metus metus, ullamcorper vel, tincidunt sed, euismod in, nibh.

### 第八节

Quisque volutpat condimentum velit. Class aptent taciti sociosqu ad litora
torquent per conubia nostra, per inceptos himenaeos. Nam nec ante. Sed
lacinia, urna non tincidunt mattis, tortor neque adipiscing diam, a cursus
ipsum ante quis turpis. Nulla facilisi. Ut fringilla. Suspendisse potenti.
Nunc feugiat mi a tellus consequat imperdiet. Vestibulum sapien. Proin quam.

### 第九节

Etiam ultrices. Suspendisse in justo eu magna luctus suscipit. Sed lectus.
Integer euismod lacus luctus magna. Quisque cursus, metus vitae pharetra
auctor, sem massa mattis sem, at interdum magna augue eget diam. Vestibulum
ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae;
Morbi lacinia molestie dui. Praesent blandit dolor. Sed non quam. In vel mi
sit amet augue congue elementum. Morbi in ipsum sit amet pede facilisis
laoreet. Donec lacus nunc, viverra nec, blandit vel, egestas et, augue.

### 第十节

Vestibulum tincidunt malesuada tellus. Ut ultrices ultrices enim. Curabitur
sit amet mauris. Morbi in dui quis est pulvinar ullamcorper. Nulla facilisi.
Integer lacinia sollicitudin massa. Cras metus. Sed aliquet risus a tortor.
Integer id quam. Morbi mi. Quisque nisl felis, venenatis tristique, dignissim
in, ultrices sit amet, augue. Proin sodales libero eget ante.

## 结尾

如果这段文字可见，说明滚动容器工作正常；如果只能看到上半截，说明滚动链在某个 flex 层被截断了。
