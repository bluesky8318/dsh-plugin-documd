window.__ModuleLoader__.load({
	id: "dsh-plugin-documd",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		// src/shared/contract.ts
		/**
		* Shape shared by the host half and the browser half: route names, tab
		* identities, file-address parsing, and the extension classification that
		* decides which viewer a tab gets.
		*
		* This module must stay dependency-free (no `node:` imports) because the client
		* bundle includes it verbatim.
		*
		* @module dsh-plugin-documd/shared/contract
		*/
		/** Plugin id: package name, cordis row id, and locale namespace. */
		const PLUGIN_ID = "dsh-plugin-documd";
		/** Route prefix registered on `ctx.webServer` by the host half. */
		const ROUTE_PREFIX = "/docu-preview";
		/** Static viewer root: `GET /docu-preview/viewer/index.html`. */
		const VIEWER_PREFIX = `${ROUTE_PREFIX}/viewer`;
		/**
		* Cache-busting segment for the viewer bundle.
		*
		* Must equal `package.json`'s version (a unit test pins it): the client loads
		* `/docu-preview/viewer/<ASSET_VERSION>/index.html`, and that subtree is served
		* with `immutable` cache headers, so a version bump is what invalidates the
		* 3.7 MB `viewer.js` instead of a revalidation on every tab open.
		*/
		const ASSET_VERSION = "0.1.6";
		/** JSON/binary API root. */
		const API_PREFIX = `${ROUTE_PREFIX}/api`;
		/** Tab body id for the docu.md renderer (also the slot key). */
		const VIEWER_TAB_ID = `${PLUGIN_ID}:viewer`;
		/** Tab kind claimed for Markdown, code and diagram files. */
		const VIEWER_KIND = "documd";
		/** Tab body id for native PDF / image embedding. */
		const NATIVE_TAB_ID = `${PLUGIN_ID}:native`;
		/** Tab kind claimed for PDF and image files. */
		const NATIVE_KIND = "documd-native";
		/** Tab body id for the "no previewer yet" card. */
		const UNSUPPORTED_TAB_ID = `${PLUGIN_ID}:unsupported`;
		/** Tab kind claimed for office/archive files this plugin cannot render. */
		const UNSUPPORTED_KIND = "documd-unsupported";
		/**
		* Renderer id inside dsh's own document-preview registry
		* (`@deepseek-ai/dsh-client-ui-sidebar-documentpreview`). Registering here makes
		* the viewer appear in the preview tab's `打开方式` list without claiming the
		* address at tab level.
		*/
		const DOCUMENT_BODY_ID = `${PLUGIN_ID}/viewer`;
		/**
		* How the plugin participates in dsh's tab competition.
		*
		* - `manual` (default): never claims an address at tab level. The viewer is
		*   only reachable through dsh's own `打开方式` list, so the built-in preview
		*   stays in charge.
		* - `auto`: additionally registers tab kinds for the extensions it can render;
		*   `priority` decides who wins against dsh's own definitions.
		* - `off`: registers nothing at all.
		*/
		const PREVIEW_MODES = [
			"manual",
			"auto",
			"off"
		];
		const DEFAULT_PREVIEW_MODE = "manual";
		/** dsh tab bands, highest first: `extension` > `builtin` > `fallback`. */
		const PRIORITY_BANDS = [
			"extension",
			"builtin",
			"fallback"
		];
		const DEFAULT_PRIORITY = "builtin";
		/** Markdown files the docu.md engine renders as documents. */
		const MARKDOWN_EXTENSIONS = [".md", ".markdown"];
		/**
		* Source files rendered through the viewer's code surface. Mirrors
		* `EXT_LANG_MAP` in the vendored engine (`src/utils/extension-categories.ts`);
		* keep the two lists in sync when upgrading the vendor tree.
		*/
		const CODE_EXTENSIONS = [
			".js",
			".mjs",
			".cjs",
			".jsx",
			".ts",
			".mts",
			".cts",
			".tsx",
			".d.ts",
			".vue",
			".svelte",
			".py",
			".rb",
			".go",
			".rs",
			".java",
			".kt",
			".swift",
			".dart",
			".c",
			".cpp",
			".cc",
			".cxx",
			".h",
			".hpp",
			".hh",
			".hxx",
			".cs",
			".php",
			".lua",
			".r",
			".scala",
			".zig",
			".pl",
			".perl",
			".erl",
			".hrl",
			".escript",
			".html",
			".htm",
			".css",
			".scss",
			".sass",
			".less",
			".json",
			".jsonc",
			".json5",
			".yaml",
			".yml",
			".toml",
			".ini",
			".env",
			".properties",
			".xml",
			".xsl",
			".xslt",
			".sh",
			".bash",
			".zsh",
			".fish",
			".ps1",
			".bat",
			".cmd",
			".mdx",
			".txt",
			".log",
			".tex",
			".bib",
			".csv",
			".tsv",
			".sql"
		];
		/** Diagram files the viewer wraps into the matching render type. */
		const DIAGRAM_EXTENSIONS = [
			".mermaid",
			".mmd",
			".plantuml",
			".puml",
			".vega",
			".vl",
			".vega-lite",
			".gv",
			".dot",
			".infographic",
			".canvas",
			".drawio",
			".echarts"
		];
		/** PDF and raster/vector images shown with the browser's own renderer. */
		const NATIVE_EXTENSIONS = [
			".pdf",
			".png",
			".jpg",
			".jpeg",
			".gif",
			".webp",
			".avif",
			".bmp",
			".ico",
			".svg"
		];
		/**
		* Files that need a dedicated viewer. They are claimed so the tab shows an
		* explicit "install dsh-docx / dsh-pptx / dsh-opensheet-sidebar" card instead of
		* falling through to a text dump.
		*/
		const UNSUPPORTED_EXTENSIONS = [
			".docx",
			".doc",
			".odt",
			".rtf",
			".xlsx",
			".xls",
			".xlsm",
			".ods",
			".csv.gz",
			".pptx",
			".ppt",
			".odp",
			".epub",
			".zip",
			".gz",
			".tar",
			".7z",
			".exe",
			".dll",
			".so",
			".dylib",
			".bin",
			".class",
			".jar",
			".mp3",
			".wav",
			".mp4",
			".mov",
			".avi",
			".mkv",
			".ttf",
			".otf",
			".woff",
			".woff2"
		];
		const FILE_ADDRESS_PREFIX = "dsh-resource://file/";
		function isDriveSegment(segment) {
			return segment !== void 0 && /^[A-Za-z]:$/.test(segment);
		}
		/**
		* Read a file address back into its parts without resolving `.` or `..`.
		* Mirrors the official `parseFileAddress` so both plugins agree on identity.
		* @param address - a candidate address.
		* @returns the parts, or `undefined` when the string is not a file address.
		*/
		function parseFileAddress(address) {
			try {
				if (!address.startsWith(FILE_ADDRESS_PREFIX)) return void 0;
				const queryOrHash = address.slice(20).search(/[?#]/);
				const [scope, ...rest] = address.slice(20, queryOrHash === -1 ? void 0 : 20 + queryOrHash).split("/");
				if (scope === "session") {
					const [id, ...segments] = rest;
					if (!id || segments.length === 0) return void 0;
					return {
						scope,
						sessionId: decodeURIComponent(id),
						path: segments.map(decodeURIComponent).join("/")
					};
				}
				if (scope === "absolute") {
					const unc = rest[0] === "" && rest.length > 1;
					const segments = (unc ? rest.slice(1) : rest).map(decodeURIComponent);
					if (segments.length === 0 || segments[0] === "") return void 0;
					const joined = segments.join("/");
					if (unc) return {
						scope,
						path: `//${joined}`
					};
					return {
						scope,
						path: isDriveSegment(segments[0]) ? joined : `/${joined}`
					};
				}
				return;
			} catch {
				return;
			}
		}
		/**
		* The last path segment of a file address, decoded.
		* @param address - a file address.
		* @returns the basename, or the address itself when it has no path.
		*/
		function basenameOf(address) {
			const parsed = parseFileAddress(address);
			if (!parsed) return address;
			const segments = parsed.path.split("/").filter(Boolean);
			return segments[segments.length - 1] || address;
		}
		/**
		* Lower-cased extension of a path, including the leading dot.
		* @param path - file path or address path.
		* @returns `.md`, or `''` when the name has no extension.
		*/
		function extensionOf(path) {
			const name = path.split(/[\\/]/).pop() ?? "";
			const dot = name.lastIndexOf(".");
			if (dot <= 0) return "";
			return name.slice(dot).toLowerCase();
		}
		function matches(path, extensions) {
			const ordered = [...extensions].sort((a, b) => b.length - a.length);
			const lower = path.toLowerCase();
			return ordered.some((ext) => lower.endsWith(ext));
		}
		/**
		* Decide which tab kind a path belongs to.
		* @param path - workspace-relative or absolute path.
		* @returns the category, defaulting to `unsupported` so nothing fails silently.
		*/
		function classifyPath(path) {
			if (matches(path, MARKDOWN_EXTENSIONS) || matches(path, CODE_EXTENSIONS) || matches(path, DIAGRAM_EXTENSIONS)) return "viewer";
			if (matches(path, NATIVE_EXTENSIONS)) return "native";
			return "unsupported";
		}
		/** Glob patterns (path form) a given kind claims in the tab registry. */
		function patternsForCategory(category) {
			return (category === "viewer" ? [
				...MARKDOWN_EXTENSIONS,
				...CODE_EXTENSIONS,
				...DIAGRAM_EXTENSIONS
			] : category === "native" ? [...NATIVE_EXTENSIONS] : [...UNSUPPORTED_EXTENSIONS]).map((extension) => `*${extension}`);
		}
		/**
		* Rebuild a file address for another path in the same scope as `address`.
		*
		* The viewer resolves relative links to a workspace path (`src/../img/a.png`
		* normalized); the host turns that back into the address the tab registry and
		* the official text viewer understand.
		* @param address - the address of the tab doing the navigation.
		* @param path - a workspace-relative (session scope) or absolute path.
		* @returns an address, or `undefined` when `address` is not a file address.
		*/
		function formatFileAddress(address, path) {
			const parsed = parseFileAddress(address);
			if (!parsed) return void 0;
			const encoded = path.replace(/\\/g, "/").split("/").filter((segment) => segment !== "").map((segment) => /^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment)).join("/");
			if (parsed.scope === "session") return `${FILE_ADDRESS_PREFIX}session/${encodeURIComponent(parsed.sessionId)}/${encoded}`;
			return `${FILE_ADDRESS_PREFIX}absolute/${encoded}`;
		}
		/** @returns whether the string is a supported preview mode. */
		function isPreviewMode(value) {
			return typeof value === "string" && PREVIEW_MODES.includes(value);
		}
		/** @returns whether the string is a dsh priority band. */
		function isPriorityBand(value) {
			return typeof value === "string" && PRIORITY_BANDS.includes(value);
		}
		/** Tab kinds this plugin owns; used to filter itself out of the switch list. */
		const OWN_KINDS = [
			VIEWER_KIND,
			NATIVE_KIND,
			UNSUPPORTED_KIND
		];
		/**
		* Extensions the docu.md renderer can show, in the dot-less form dsh's
		* document-preview registry expects (`md`, not `.md`).
		*/
		function renderableExtensions() {
			return [
				...MARKDOWN_EXTENSIONS,
				...CODE_EXTENSIONS,
				...DIAGRAM_EXTENSIONS
			].map((extension) => extension.replace(/^\./, ""));
		}
		// src/client/locales.ts
		/**
		* Copy for the three tab bodies. Every string a user can see lives here; the
		* `locale` option on each slot registration turns these dictionaries into the
		* typed `t` seat.
		*
		* @module dsh-plugin-documd/client/locales
		*/
		/** Locale namespace of the browser half (also the `locale` option on registrations). */
		const LOCALE_NAMESPACE = "documd";
		/** English copy. */
		const en = {
			"viewer.loading": "Rendering with docu.md…",
			"viewer.error": "Preview failed: {message}",
			"viewer.retry": "Retry",
			"switch.label": "Preview with",
			"switch.current": "docu.md (this plugin)",
			"switch.reset": "Reset default",
			"native.openExternal": "Open in a new tab",
			"native.pdf": "PDF preview",
			"unsupported.title": "This file type is not previewed yet",
			"unsupported.detail": "{ext} files need a dedicated viewer.",
			"unsupported.binary": "This file is binary and has no registered previewer.",
			"unsupported.install": "Install dsh-docx, dsh-pptx or dsh-opensheet-sidebar to open it in the sidebar.",
			"unsupported.useViewer": "Open with {title}"
		};
		/** Simplified Chinese copy. */
		const zh = {
			"viewer.loading": "正在用 docu.md 渲染…",
			"viewer.error": "预览失败：{message}",
			"viewer.retry": "重试",
			"switch.label": "预览方式",
			"switch.current": "docu.md（本插件）",
			"switch.reset": "恢复默认",
			"native.openExternal": "在新标签页打开",
			"native.pdf": "PDF 预览",
			"unsupported.title": "暂不支持预览该文件类型",
			"unsupported.detail": "{ext} 文件需要专用预览器。",
			"unsupported.binary": "这是二进制文件，没有注册的预览器。",
			"unsupported.install": "安装 dsh-docx、dsh-pptx 或 dsh-opensheet-sidebar 后可在右侧栏打开。",
			"unsupported.useViewer": "用 {title} 打开"
		};
		// src/client/options.ts
		/**
		* Registration options, fetched from the host half once at mount.
		*
		* The host owns the config (`mode`, `priority`, `rememberChoice`) because the
		* browser half cannot read cordis config. Fetching instead of hard-coding keeps
		* a single source of truth; if the route is unreachable the defaults below make
		* the plugin behave like a fresh install.
		*
		* @module dsh-plugin-documd/client/options
		*/
		/** What a fresh install does: available in `打开方式`, never claims a tab. */
		const FALLBACK_OPTIONS = {
			mode: DEFAULT_PREVIEW_MODE,
			priority: DEFAULT_PRIORITY,
			rememberChoice: true,
			assetVersion: ASSET_VERSION
		};
		/**
		* Read `/docu-preview/api/options`.
		* @param fetcher - injectable `fetch` (defaults to the global one).
		* @param signal - aborts the request when the plugin unloads.
		* @returns validated options, or {@link FALLBACK_OPTIONS} on any failure.
		*/
		async function loadPreviewOptions(fetcher = globalThis.fetch, signal) {
			if (!fetcher) return FALLBACK_OPTIONS;
			try {
				const response = await fetcher(`${API_PREFIX}/options`, {
					...signal ? { signal } : {},
					headers: { accept: "application/json" }
				});
				if (!response.ok) return FALLBACK_OPTIONS;
				const body = await response.json();
				return {
					mode: isPreviewMode(body.mode) ? body.mode : FALLBACK_OPTIONS.mode,
					priority: isPriorityBand(body.priority) ? body.priority : FALLBACK_OPTIONS.priority,
					rememberChoice: typeof body.rememberChoice === "boolean" ? body.rememberChoice : FALLBACK_OPTIONS.rememberChoice,
					assetVersion: typeof body.assetVersion === "string" && /^\d+\.\d+\.\d+/.test(body.assetVersion) ? body.assetVersion : FALLBACK_OPTIONS.assetVersion
				};
			} catch {
				return FALLBACK_OPTIONS;
			}
		}
		// src/client/document-bridge.ts
		let current;
		/**
		* Publish the sidebar helpers for document-slot bodies.
		* @param actions - helpers bound to the client context.
		*/
		function setDocumentActions(actions) {
			current = actions;
		}
		/**
		* Read the helpers published by the registration.
		* @returns the helpers, or `undefined` before registration.
		*/
		function getDocumentActions() {
			return current;
		}
		// src/client/api.ts
		/**
		* Same-origin calls to the host half's `/docu-preview/api` surface.
		*
		* The browser half never sees the workspace path: it hands the tab address to
		* `POST /session`, gets a short-lived token plus the resolved path back, and
		* every later read names that token.
		*
		* @module dsh-plugin-documd/client/api
		*/
		/** An API response the host refused, carrying its machine-readable code. */
		var PreviewApiError = class extends Error {
			code;
			status;
			constructor(status, code, message) {
				super(message);
				this.name = "PreviewApiError";
				this.status = status;
				this.code = code;
			}
		};
		async function readError(response) {
			let code = `http_${response.status}`;
			let message = response.statusText || "request failed";
			try {
				const body = await response.json();
				if (typeof body.error === "string" && body.error) code = body.error;
				if (typeof body.message === "string" && body.message) message = body.message;
			} catch {}
			return new PreviewApiError(response.status, code, message);
		}
		/**
		* Ask the host to resolve one tab address and issue its preview token.
		* @param address - a `dsh-resource://file/…` address.
		* @param dark - whether the host currently draws its dark palette.
		* @param signal - aborts the request when the tab navigates or closes.
		* @returns the issued session.
		*/
		async function createSession(address, dark, signal) {
			const response = await fetch(`${API_PREFIX}/session`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					address,
					dark
				}),
				...signal ? { signal } : {}
			});
			if (!response.ok) throw await readError(response);
			return await response.json();
		}
		/**
		* Read the document text behind a preview token.
		* @param token - the session's token.
		* @param signal - aborts the request.
		* @returns the file payload.
		*/
		async function readDocument(token, signal) {
			const response = await fetch(`${API_PREFIX}/file?token=${encodeURIComponent(token)}`, { ...signal ? { signal } : {} });
			if (!response.ok) throw await readError(response);
			return await response.json();
		}
		/**
		* Release a token when its tab goes away (best effort; the host also expires it).
		* @param token - the session's token.
		*/
		function revokeSession(token) {
			fetch(`${API_PREFIX}/session?token=${encodeURIComponent(token)}`, { method: "DELETE" }).catch(() => {});
		}
		/**
		* Ask the host which theme id matches its current light/dark state.
		* @param dark - the appearance the tab observed.
		* @returns a theme id from the vendored registry (`vscode` / `vscode-dark` by default).
		*/
		async function resolveThemeId(dark) {
			const response = await fetch(`${API_PREFIX}/theme?dark=${dark ? "1" : "0"}`);
			if (!response.ok) throw await readError(response);
			const body = await response.json();
			return typeof body.themeId === "string" ? body.themeId : "";
		}
		/**
		* Same-origin URL of a binary asset (PDF, image) behind a token.
		* @param token - the session's token.
		* @param path - the resolved path reported by the session endpoint.
		* @returns the URL the browser can embed directly.
		*/
		function assetUrl(token, path) {
			return `${API_PREFIX}/asset?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`;
		}
		// src/client/panes.tsx
		/**
		* A centred status line.
		* @param props - the copy to show.
		* @returns the pane.
		*/
		function LoadingPane(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dm-pane",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dm-status",
					children: props.label
				})
			});
		}
		/**
		* A failure card with one retry action.
		* @param props - message, action label, and the retry callback.
		* @returns the pane.
		*/
		function ErrorPane(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dm-pane",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dm-status dm-status-error",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dm-card",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dm-card-title",
							children: props.message
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dm-actions",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dm-button",
								onClick: props.onRetry,
								children: props.retryLabel
							})
						})]
					})
				})
			});
		}
		/**
		* A neutral card for "nothing can render this" states.
		* @param props - title, optional detail, and optional actions.
		* @returns the pane.
		*/
		function MessageCard(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dm-pane",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dm-status",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dm-card",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dm-card-title",
								children: props.title
							}),
							props.detail ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dm-card-detail",
								children: props.detail
							}) : null,
							props.children
						]
					})
				})
			});
		}
		// src/client/theme.ts
		/**
		* Detect whether dsh is drawing its dark palette.
		*
		* There is no theme service in the published client modules, so three
		* defensive signals are consulted in order: an explicit `data-theme` /
		* `data-color-scheme` / `class` marker on `<html>` or `<body>`, the computed
		* page background, and finally the OS-level `prefers-color-scheme` query.
		* The first signal that is unambiguous wins; a transparent background is
		* ignored rather than mistaken for black.
		*
		* @module dsh-plugin-documd/client/theme
		*/
		const DARK_QUERY = "(prefers-color-scheme: dark)";
		function markerSignals() {
			const root = document.documentElement;
			const body = document.body;
			return [
				root.getAttribute("data-theme"),
				root.getAttribute("data-color-scheme"),
				root.getAttribute("data-appearance"),
				root.className,
				body?.getAttribute("data-theme"),
				body?.getAttribute("data-color-scheme"),
				body?.className
			].filter((value) => typeof value === "string").join(" ").toLowerCase();
		}
		function parseRgb(value) {
			const match = /^rgba?\(([^)]+)\)/.exec(value.trim());
			if (!match) return void 0;
			const [r, g, b, alpha] = (match[1] ?? "").split(",").map((part) => Number(part.trim()));
			if (r === void 0 || g === void 0 || b === void 0) return void 0;
			if (alpha !== void 0 && Number.isFinite(alpha) && alpha === 0) return void 0;
			if (![
				r,
				g,
				b
			].every((channel) => Number.isFinite(channel))) return void 0;
			return [
				r,
				g,
				b
			];
		}
		/**
		* Whether the host surface currently reads as dark.
		* @returns `true` for the dark palette, `false` for light.
		*/
		function detectDarkAppearance() {
			const signals = markerSignals();
			if (/(^|[\s_-])(dark|night)($|[\s_-])/.test(signals)) return true;
			if (/(^|[\s_-])(light|day)($|[\s_-])/.test(signals)) return false;
			try {
				const background = getComputedStyle(document.body ?? document.documentElement).backgroundColor;
				const rgb = parseRgb(background);
				if (rgb) {
					const [r, g, b] = rgb;
					return (.2126 * r + .7152 * g + .0722 * b) / 255 < .45;
				}
			} catch {}
			try {
				return window.matchMedia(DARK_QUERY).matches;
			} catch {
				return false;
			}
		}
		/**
		* Watch the host's appearance.
		* @param listener - called only when the dark/light verdict flips.
		* @returns a disposer that stops watching.
		*/
		function subscribeAppearance(listener) {
			let last = detectDarkAppearance();
			const fire = () => {
				const next = detectDarkAppearance();
				if (next === last) return;
				last = next;
				listener(next);
			};
			let media;
			try {
				media = window.matchMedia(DARK_QUERY);
				if (typeof media.addEventListener === "function") media.addEventListener("change", fire);
				else if (typeof media.addListener === "function") media.addListener(fire);
			} catch {
				media = void 0;
			}
			let observer;
			if (typeof MutationObserver === "function") {
				observer = new MutationObserver(fire);
				const attributes = [
					"class",
					"style",
					"data-theme",
					"data-color-scheme",
					"data-appearance"
				];
				observer.observe(document.documentElement, {
					attributes: true,
					attributeFilter: attributes
				});
				if (document.body) observer.observe(document.body, {
					attributes: true,
					attributeFilter: attributes
				});
			}
			return () => {
				if (media) {
					if (typeof media.removeEventListener === "function") media.removeEventListener("change", fire);
					else if (typeof media.removeListener === "function") media.removeListener(fire);
				}
				observer?.disconnect();
			};
		}
		// src/client/native-tab.tsx
		function describeError$1(error) {
			if (error instanceof Error) return error.message;
			return String(error);
		}
		/**
		* Embed one PDF or image.
		* @param props - tab information and copy.
		* @returns the embedded file or an explicit failure card.
		*/
		function NativeTab(props) {
			const { useTabInfo, t } = props;
			const address = useTabInfo().tab.navigation.address;
			const [state, setState] = (0, react.useState)({ kind: "loading" });
			const [attempt, setAttempt] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				if (!address) {
					setState({
						kind: "error",
						message: "this tab has no file address"
					});
					return;
				}
				const controller = new AbortController();
				let live = true;
				let issuedToken;
				setState({ kind: "loading" });
				createSession(address, detectDarkAppearance(), controller.signal).then((session) => {
					if (!live) {
						revokeSession(session.token);
						return;
					}
					issuedToken = session.token;
					setState({
						kind: "ready",
						session
					});
				}).catch((error) => {
					if (!live) return;
					setState({
						kind: "error",
						message: describeError$1(error)
					});
				});
				return () => {
					live = false;
					controller.abort();
					if (issuedToken) revokeSession(issuedToken);
				};
			}, [address, attempt]);
			if (state.kind === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingPane, { label: t("viewer.loading") });
			if (state.kind === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ErrorPane, {
				message: t("viewer.error", { message: state.message }),
				retryLabel: t("viewer.retry"),
				onRetry: () => {
					setAttempt((value) => value + 1);
				}
			});
			if (state.session.category !== "native") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MessageCard, {
				title: t("unsupported.title"),
				detail: t("unsupported.detail", { ext: extensionOf(state.session.path) || state.session.filename })
			});
			const url = assetUrl(state.session.token, state.session.path);
			if (extensionOf(state.session.path) === ".pdf") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dm-pane",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
					className: "dm-native-frame",
					title: t("native.pdf"),
					src: url
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dm-actions dm-native-actions",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
						className: "dm-button",
						href: url,
						target: "_blank",
						rel: "noreferrer",
						children: t("native.openExternal")
					})
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dm-pane",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dm-native-image",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
						src: url,
						alt: state.session.filename
					})
				})
			});
		}
		// src/client/iframe-bridge.ts
		/**
		* Send one message to the viewer iframe.
		* @param frame - the iframe element, or null while it is not mounted yet.
		* @param message - the protocol message.
		*/
		function postToViewer(frame, message) {
			const target = frame?.contentWindow;
			if (!target) return;
			target.postMessage(message, window.location.origin);
		}
		/**
		* Narrow an incoming `message` event to a viewer message from this iframe.
		* @param event - the window message event.
		* @param frame - the iframe that hosts the viewer.
		* @returns the protocol message, or `undefined` for anything else.
		*/
		function readViewerMessage(event, frame) {
			if (!frame || event.source !== frame.contentWindow) return void 0;
			if (event.origin !== window.location.origin) return void 0;
			const data = event.data;
			if (!data || typeof data.type !== "string") return void 0;
			return data;
		}
		// src/client/preferences.ts
		/**
		* Remembered "preview method" choice.
		*
		* dsh's tab registry cannot change a type's rank at runtime, so the plugin
		* implements the switch the way the product does: the tab body asks the
		* sidebar controller to reopen the same address with the chosen `kind`
		* (`replaceTab`). A small `localStorage` map keeps that choice per file
		* extension, so reopening a `.md` file does not snap back to the old viewer.
		*
		* @module dsh-plugin-documd/client/preferences
		*/
		/** One JSON map for all extensions; entries are tab kinds. */
		const CHOICE_STORAGE_KEY = "dsh-plugin-documd:preview-choice";
		/** @returns the browser store, or `undefined` outside a browser. */
		function defaultStorage() {
			try {
				return typeof localStorage === "undefined" ? void 0 : localStorage;
			} catch {
				return;
			}
		}
		/**
		* Key one path falls under.
		* @param path - file path or address.
		* @returns `.md`-style lowercase extension, or `*` for extensionless names.
		*/
		function preferenceKeyFor(path) {
			return extensionOf(path) || "*";
		}
		/**
		* Read the remembered kind for one file.
		* @param path - file path or address.
		* @param storage - injectable store.
		* @returns a kind, or `undefined` when nothing was remembered.
		*/
		function readChoice(path, storage = defaultStorage()) {
			if (!storage) return void 0;
			try {
				const raw = storage.getItem(CHOICE_STORAGE_KEY);
				if (!raw) return void 0;
				const value = JSON.parse(raw)[preferenceKeyFor(path)];
				return typeof value === "string" && value ? value : void 0;
			} catch {
				return;
			}
		}
		/**
		* Persist one choice.
		* @param path - file path or address.
		* @param kind - tab kind to open next time.
		* @param storage - injectable store.
		*/
		function writeChoice(path, kind, storage = defaultStorage()) {
			if (!storage) return;
			let parsed = {};
			try {
				const raw = storage.getItem(CHOICE_STORAGE_KEY);
				const candidate = raw ? JSON.parse(raw) : {};
				if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) parsed = candidate;
			} catch {
				parsed = {};
			}
			try {
				parsed[preferenceKeyFor(path)] = kind;
				storage.setItem(CHOICE_STORAGE_KEY, JSON.stringify(parsed));
			} catch {}
		}
		/**
		* Forget the choice for one extension.
		* @param path - file path or address.
		* @param storage - injectable store.
		*/
		function clearChoice(path, storage = defaultStorage()) {
			if (!storage) return;
			try {
				const raw = storage.getItem(CHOICE_STORAGE_KEY);
				if (!raw) return;
				const parsed = JSON.parse(raw);
				delete parsed[preferenceKeyFor(path)];
				storage.setItem(CHOICE_STORAGE_KEY, JSON.stringify(parsed));
			} catch {}
		}
		/**
		* Whether a remembered kind should be re-applied on open.
		* @param kind - remembered tab kind.
		* @returns `true` only for a kind this plugin does not own.
		*/
		function shouldReopenWith(kind) {
			return typeof kind === "string" && kind !== "" && !OWN_KINDS.includes(kind);
		}
		// src/client/preview-tab.tsx
		function nowMs() {
			return typeof performance !== "undefined" ? performance.now() : Date.now();
		}
		function roundMs(value) {
			return Math.round(value * 10) / 10;
		}
		/**
		* Report one open's phase timings to the host.
		*
		* The host keeps them in memory and echoes them from `/api/diagnostics` while
		* `debug: true`; this is a diagnostics channel, so failures are ignored.
		*/
		function reportTiming(address, timing) {
			if (!timing) return;
			try {
				fetch(`${API_PREFIX}/metrics`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					keepalive: true,
					body: JSON.stringify({
						kind: "open",
						address,
						timeline: {
							...timing.marks,
							total: roundMs(nowMs() - timing.started)
						},
						viewer: timing.viewer
					})
				}).catch(() => {});
			} catch {}
		}
		/** Line the reader had reached, kept across hide/show and tab reopen. */
		const scrollMemory = /* @__PURE__ */ new Map();
		function describeError(error) {
			if (error instanceof Error) return error.message;
			return String(error);
		}
		/**
		* Render one file through the docu.md iframe.
		* @param props - tab information, copy, and the injected navigation helper.
		* @returns the frame, a loading line, or an explicit failure card.
		*/
		function PreviewTab(props) {
			const { useTabInfo, t, openResource, alternatives, openWithKind, rememberChoice, assetVersion, suppliedContent, addressOverride, showSwitcher = true } = props;
			const info = useTabInfo();
			const address = addressOverride ?? info.tab.navigation.address;
			const frameRef = (0, react.useRef)(null);
			const stateRef = (0, react.useRef)({ kind: "loading" });
			const deliveredRef = (0, react.useRef)("");
			const preferenceApplied = (0, react.useRef)(false);
			const timingRef = (0, react.useRef)(null);
			const [state, setState] = (0, react.useState)({ kind: "loading" });
			const [attempt, setAttempt] = (0, react.useState)(0);
			const [, setResetTick] = (0, react.useState)(0);
			stateRef.current = state;
			/**
			* Apply a remembered "preview method" choice once per tab.
			*
			* dsh cannot change a type's rank at runtime; it can reopen the same address
			* as another type and replace this tab, which is exactly what the switch
			* does. A remembered kind that no longer exists throws, in which case the
			* stale entry is dropped and this viewer stays.
			*/
			(0, react.useEffect)(() => {
				if (preferenceApplied.current) return;
				preferenceApplied.current = true;
				if (!showSwitcher || !rememberChoice || !address) return;
				const remembered = readChoice(address);
				if (!shouldReopenWith(remembered)) return;
				try {
					openWithKind(address, remembered, info.tab.id);
				} catch {
					clearChoice(address);
				}
			}, [
				address,
				info.tab.id,
				openWithKind,
				rememberChoice,
				showSwitcher
			]);
			(0, react.useEffect)(() => {
				if (!address) {
					setState({
						kind: "error",
						message: "this tab has no file address"
					});
					return;
				}
				const controller = new AbortController();
				let live = true;
				let issuedToken;
				deliveredRef.current = "";
				setState({ kind: "loading" });
				const timing = {
					started: nowMs(),
					marks: {}
				};
				timingRef.current = timing;
				const lap = (name) => {
					timing.marks[name] = roundMs(nowMs() - timing.started);
				};
				(async () => {
					const session = await createSession(address, detectDarkAppearance(), controller.signal);
					lap("session");
					if (!live) {
						revokeSession(session.token);
						return;
					}
					issuedToken = session.token;
					if (session.category !== "viewer") throw new Error(`the host classified this file as ${session.category}`);
					setState({
						kind: "opening",
						session
					});
					const content = suppliedContent ?? (await readDocument(session.token, controller.signal)).content;
					lap("content");
					if (!live) return;
					setState({
						kind: "ready",
						session,
						content
					});
				})().catch((error) => {
					if (!live) return;
					setState({
						kind: "error",
						message: describeError(error)
					});
				});
				return () => {
					live = false;
					controller.abort();
					if (issuedToken) revokeSession(issuedToken);
				};
			}, [
				address,
				attempt,
				suppliedContent
			]);
			/** Hand the loaded document to the viewer exactly once per token. */
			const deliver = () => {
				const current = stateRef.current;
				const frame = frameRef.current;
				if (current.kind !== "ready" || !frame) return;
				if (deliveredRef.current === current.session.token) return;
				deliveredRef.current = current.session.token;
				if (timingRef.current) timingRef.current.marks.deliver = roundMs(nowMs() - timingRef.current.started);
				const path = current.session.path;
				const slash = path.lastIndexOf("/");
				const fileDir = slash >= 0 ? path.slice(0, slash + 1) : "";
				const line = scrollMemory.get(address);
				postToViewer(frame, {
					type: "OPEN_DOCUMENT",
					content: current.content,
					filename: current.session.filename,
					fileDir,
					...line && line > 1 ? { targetLine: line } : {}
				});
			};
			const deliverRef = (0, react.useRef)(deliver);
			deliverRef.current = deliver;
			(0, react.useEffect)(() => {
				const onMessage = (event) => {
					const message = readViewerMessage(event, frameRef.current);
					if (!message) return;
					switch (message.type) {
						case "VIEWER_READY":
							if (timingRef.current) {
								timingRef.current.marks.ready = roundMs(nowMs() - timingRef.current.started);
								if (message.timing) timingRef.current.viewer = message.timing;
							}
							deliverRef.current();
							break;
						case "VIEWER_RENDERED": {
							const timing = timingRef.current;
							if (timing) {
								timing.marks.rendered = roundMs(nowMs() - timing.started);
								if (message.timing) timing.viewer = message.timing;
							}
							reportTiming(address, timing);
							timingRef.current = null;
							break;
						}
						case "EXPORT_RESULT": break;
						case "VIEWER_SCROLL_LINE_CHANGED":
							if (Number.isFinite(message.line) && message.line > 0) scrollMemory.set(address, message.line);
							break;
						case "WORKSPACE_NAVIGATE": {
							const next = formatFileAddress(address, message.path);
							if (next) openResource(next);
							break;
						}
						case "OPEN_URL":
							window.open(message.url, "_blank", "noopener,noreferrer");
							break;
						case "VIEWER_ERROR": setState({
							kind: "error",
							message: message.message || "the viewer failed to render"
						});
					}
				};
				window.addEventListener("message", onMessage);
				return () => {
					window.removeEventListener("message", onMessage);
				};
			}, [address, openResource]);
			(0, react.useEffect)(() => subscribeAppearance((dark) => {
				resolveThemeId(dark).then((themeId) => {
					if (themeId) postToViewer(frameRef.current, {
						type: "SYNC_HOST_UI",
						themeId
					});
				}).catch(() => {});
			}), []);
			if (state.kind === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingPane, { label: t("viewer.loading") });
			if (state.kind === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ErrorPane, {
				message: t("viewer.error", { message: state.message }),
				retryLabel: t("viewer.retry"),
				onRetry: () => {
					setAttempt((value) => value + 1);
				}
			});
			const session = state.session;
			const waiting = state.kind === "opening";
			const choices = showSwitcher ? alternatives(address) : [];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dm-pane",
				children: [
					showSwitcher && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dm-switch",
						"data-documd-switch": true,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dm-switch-label",
								children: t("switch.label")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: "dm-switch-select",
								value: "documd",
								onChange: (event) => {
									const kind = event.currentTarget.value;
									if (!kind || kind === "documd") return;
									if (rememberChoice) writeChoice(address, kind);
									try {
										openWithKind(address, kind, info.tab.id);
									} catch {
										clearChoice(address);
									}
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "documd",
									children: t("switch.current")
								}), choices.map((choice) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: choice.kind,
									children: choice.title
								}, choice.kind))]
							}),
							rememberChoice && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dm-switch-reset",
								onClick: () => {
									clearChoice(address);
									setResetTick((value) => value + 1);
								},
								children: t("switch.reset")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
						ref: frameRef,
						className: "dm-frame",
						title: session.filename,
						src: `${VIEWER_PREFIX}/${assetVersion}/index.html?token=${encodeURIComponent(session.token)}&theme=${encodeURIComponent(session.themeId)}`,
						onLoad: () => {
							const timing = timingRef.current;
							if (timing) timing.marks.iframeLoad = roundMs(nowMs() - timing.started);
							deliverRef.current();
						}
					}, session.token),
					waiting && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dm-overlay",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingPane, { label: t("viewer.loading") })
					})
				]
			});
		}
		/**
		* The same viewer, registered as one option in dsh's own preview.
		*
		* dsh reads text pages itself and hands them over, so this body only creates a
		* token for assets and pushes the supplied text into the frame. dsh's toolbar
		* already owns the "打开方式" switch here; ours would be redundant.
		*
		* @param props - document-slot props.
		* @returns the frame, or `null` for content kinds this viewer cannot show.
		*/
		function DocumdDocumentBody(props) {
			const content = props.content;
			if (content.kind !== "text") return null;
			const actions = getDocumentActions() ?? {
				openResource: () => {},
				alternatives: () => [],
				openWithKind: () => {},
				rememberChoice: false
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreviewTab, {
				...props,
				...actions,
				suppliedContent: content.text,
				addressOverride: props.resourceAddress,
				showSwitcher: false
			});
		}
		// src/client/unsupported-tab.tsx
		/**
		* Explain what is missing instead of failing silently.
		* @param props - tab information, copy, and the registry bridge.
		* @returns the card.
		*/
		function UnsupportedTab(props) {
			const { useTabInfo, t, alternatives, openWithKind } = props;
			const address = useTabInfo().tab.navigation.address;
			const [available, setAvailable] = (0, react.useState)([]);
			(0, react.useEffect)(() => {
				setAvailable(address ? alternatives(address) : []);
			}, [address, alternatives]);
			const extension = extensionOf(address) || address;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(MessageCard, {
				title: t("unsupported.title"),
				detail: t("unsupported.detail", { ext: extension }),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dm-card-detail",
					children: t("unsupported.install")
				}), available.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dm-actions",
					children: available.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dm-button",
						onClick: () => {
							openWithKind(address, entry.kind);
						},
						children: t("unsupported.useViewer", { title: entry.title })
					}, entry.kind))
				}) : null]
			});
		}
		// src/client/registration.ts
		/**
		* Decide what to register.
		*
		* - `off` registers nothing.
		* - `manual` (default) only offers the viewer through dsh's `打开方式`; the
		*   unsupported card still claims formats that have no real previewer.
		* - `auto` claims markdown/code/diagram and PDF/images at `priority`.
		*
		* @param options - validated host options.
		* @returns the plan.
		*/
		function planRegistrations(options) {
			if (options.mode === "off") return {
				viewer: false,
				native: false,
				unsupported: false,
				documentPreviews: false,
				priority: options.priority
			};
			if (options.mode === "auto") return {
				viewer: true,
				native: true,
				unsupported: true,
				documentPreviews: true,
				priority: options.priority
			};
			return {
				viewer: false,
				native: false,
				unsupported: true,
				documentPreviews: true,
				priority: "builtin"
			};
		}
		function definitionFor(category, id, kind, priority) {
			return {
				id,
				kind,
				multiple: true,
				patterns: patternsForCategory(category),
				priority,
				title: (address) => basenameOf(address),
				canOpen: (address) => {
					const parsed = parseFileAddress(address);
					return parsed !== void 0 && classifyPath(parsed.path) === category;
				}
			};
		}
		/**
		* Register the planned types and bodies.
		*
		* @param ctx - client root context.
		* @param options - validated host options.
		*/
		function registerTabs(ctx, options) {
			const plan = planRegistrations(options);
			const alternatives = (address) => ctx.sidebarRightTabs.candidates(address).filter((candidate) => !OWN_KINDS.includes(candidate.kind)).map((candidate) => ({
				kind: candidate.kind,
				title: candidate.title(address)
			}));
			const openWithKind = (address, kind, tabId) => {
				ctx.sidebarRight.openResource(address, {
					kind,
					...tabId ? { replaceTab: tabId } : {}
				});
			};
			const injected = {
				openResource: (address) => {
					ctx.sidebarRight.openResource(address);
				},
				alternatives,
				openWithKind,
				rememberChoice: options.rememberChoice,
				assetVersion: options.assetVersion
			};
			setDocumentActions(injected);
			if (plan.viewer || plan.native || plan.unsupported) {
				const definitions = [];
				if (plan.viewer) definitions.push(definitionFor("viewer", VIEWER_TAB_ID, VIEWER_KIND, plan.priority));
				if (plan.native) definitions.push(definitionFor("native", NATIVE_TAB_ID, NATIVE_KIND, plan.priority));
				if (plan.unsupported) definitions.push(definitionFor("unsupported", UNSUPPORTED_TAB_ID, UNSUPPORTED_KIND, plan.priority));
				for (const definition of definitions) ctx.effect(() => ctx.sidebarRightTabs.register(definition), `${PLUGIN_ID}: ${definition.kind} tab type`);
			}
			if (plan.viewer) ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: VIEWER_TAB_ID,
				locale: LOCALE_NAMESPACE,
				inject: () => injected
			}, PreviewTab)), `${PLUGIN_ID}: viewer body`);
			if (plan.native) ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: NATIVE_TAB_ID,
				locale: LOCALE_NAMESPACE
			}, NativeTab)), `${PLUGIN_ID}: native body`);
			if (plan.unsupported) ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: UNSUPPORTED_TAB_ID,
				locale: LOCALE_NAMESPACE,
				inject: () => ({
					alternatives,
					openWithKind
				})
			}, UnsupportedTab)), `${PLUGIN_ID}: unsupported body`);
			if (plan.documentPreviews) {
				ctx.effect(() => ctx.documentPreviews.register({
					id: DOCUMENT_BODY_ID,
					extensions: renderableExtensions(),
					priority: "builtin",
					title: () => "docu.md",
					loading: "text-pages",
					wrap: false
				}), `${PLUGIN_ID}: document preview`);
				ctx.effect(() => ctx.slots.inject("sidebar.right.tab.document", () => ctx.slots.register({
					name: "sidebar.right.tab.document",
					key: DOCUMENT_BODY_ID,
					locale: LOCALE_NAMESPACE
				}, DocumdDocumentBody)), `${PLUGIN_ID}: document body`);
			}
		}
		// src/client/styles.ts
		/**
		* The one stylesheet the tab bodies inject.
		*
		* Slot components render inside host-owned markup, so scope comes from a
		* `dm-` prefix rather than a root element. Colours are host theme aliases;
		* geometry follows the host's 12/13/14px type scale.
		*
		* @module dsh-plugin-documd/client/styles
		*/
		const CSS = `
.dm-pane {
  display: flex;
  flex-direction: column;
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  /* The iframe scrolls internally; this pane must never become a second
     scroll container, and must not clip the frame's own scrollbar. */
  overflow: hidden;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2023);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
}
.dm-switch {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  padding: 6px 10px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
  background: var(--dsw-alias-bg-layer-1, #f6f7f9);
}
.dm-switch-label {
  color: var(--dsw-alias-label-secondary, #5f6368);
  white-space: nowrap;
}
.dm-switch-select {
  min-width: 0;
  max-width: 260px;
  padding: 2px 6px;
  border: 0.5px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.18));
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2023);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
}
.dm-switch-reset {
  padding: 2px 8px;
  border: 0;
  border-radius: var(--dsw-radius-md, 8px);
  background: transparent;
  color: var(--dsw-alias-label-secondary, #5f6368);
  font-family: inherit;
  font-size: 12px;
  line-height: 20px;
  cursor: pointer;
}
.dm-switch-reset:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06)); }
.dm-frame {
  display: block;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  border: 0;
  background: var(--dsw-alias-bg-base, #ffffff);
}
/* Shown while the frame boots but the document text is still being read. */
.dm-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-base, #ffffff);
}
.dm-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  box-sizing: border-box;
  height: 100%;
  min-height: 120px;
  padding: 24px;
  color: var(--dsw-alias-label-secondary, #5f6368);
  font-size: 13px;
  line-height: 20px;
  text-align: center;
}
.dm-status-error { color: var(--dsw-alias-state-error-primary, #d93025); }
.dm-card {
  box-sizing: border-box;
  max-width: 420px;
  padding: 16px;
  border: 0;
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-bg-layer-1, #f6f7f9);
  box-shadow: var(--dsw-elevation-panel, none);
  text-align: left;
}
.dm-card-title {
  margin: 0 0 6px;
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
}
.dm-card-detail {
  margin: 0 0 8px;
  color: var(--dsw-alias-label-secondary, #5f6368);
}
.dm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.dm-button {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border: 0.5px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.18));
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-bg-layer-1, #f6f7f9);
  color: var(--dsw-alias-label-primary, #1f2023);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}
.dm-button:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06)); }
.dm-native-frame {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
  background: var(--dsw-alias-bg-base, #ffffff);
}
.dm-native-image {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 16px;
  overflow: auto;
  background: var(--dsw-alias-bg-base, #ffffff);
}
.dm-native-image img {
  max-width: 100%;
  height: auto;
  object-fit: contain;
}
.dm-native-actions {
  flex: none;
  justify-content: flex-end;
  margin: 0;
  padding: 6px 10px;
  border-top: 0.5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
}
.dm-native-actions a { text-decoration: none; }
`;
		/**
		* Inject the tab stylesheet.
		* @returns the disposer that removes the style node when the plugin unloads.
		*/
		function injectStyles() {
			const tag = document.createElement("style");
			tag.dataset.plugin = PLUGIN_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
			return () => {
				tag.remove();
			};
		}
		// src/client/index.ts
		/** Services that must exist before this half mounts. */
		const inject = [
			"slots",
			"locale",
			"sidebarRightTabs",
			"sidebarRight",
			"documentPreviews"
		];
		/**
		* Warm the HTTP cache for the viewer bundle.
		*
		* The iframe loads `viewer.js` (~3.7 MB) on every fresh tab open; that subtree
		* is served `immutable`, so a preload here means later opens read it from the
		* browser cache instead of the plugin's HTTP route. Only assets are preloaded —
		* the iframe itself is not created until a document actually opens.
		*
		* @param assetVersion - version segment from `/api/options`.
		* @returns disposer that removes the preload hints.
		*/
		function preloadViewer(assetVersion) {
			const hints = [];
			const assets = [[`${VIEWER_PREFIX}/${assetVersion}/viewer.js`, "script"], [`${VIEWER_PREFIX}/${assetVersion}/styles.css`, "style"]];
			for (const [href, as] of assets) {
				const link = document.createElement("link");
				link.rel = "preload";
				link.as = as;
				link.href = href;
				link.dataset.plugin = PLUGIN_ID;
				document.head.appendChild(link);
				hints.push(link);
			}
			return () => {
				for (const link of hints) link.remove();
			};
		}
		/**
		* Mount the browser half.
		*
		* Registration depends on the host's `mode` / `priority`, which only the host
		* half can read, so the tabs are registered after `/api/options` answers.
		* Failure falls back to the default (no claims), never to a takeover.
		*
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, {
				zh,
				en
			}), `${PLUGIN_ID}: dictionaries`);
			ctx.effect(() => injectStyles());
			ctx.effect(() => {
				const controller = new AbortController();
				let cancelled = false;
				let disposePreload;
				loadPreviewOptions(globalThis.fetch, controller.signal).then((options) => {
					if (cancelled) return;
					registerTabs(ctx, options);
					disposePreload = preloadViewer(options.assetVersion);
				});
				return () => {
					cancelled = true;
					controller.abort();
					disposePreload?.();
				};
			}, `${PLUGIN_ID}: tab registration`);
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map