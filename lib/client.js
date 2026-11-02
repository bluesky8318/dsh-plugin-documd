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
			"native.openExternal": "在新标签页打开",
			"native.pdf": "PDF 预览",
			"unsupported.title": "暂不支持预览该文件类型",
			"unsupported.detail": "{ext} 文件需要专用预览器。",
			"unsupported.binary": "这是二进制文件，没有注册的预览器。",
			"unsupported.install": "安装 dsh-docx、dsh-pptx 或 dsh-opensheet-sidebar 后可在右侧栏打开。",
			"unsupported.useViewer": "用 {title} 打开"
		};
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
		// src/client/preview-tab.tsx
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
			const { useTabInfo, t, openResource } = props;
			const address = useTabInfo().tab.navigation.address;
			const frameRef = (0, react.useRef)(null);
			const stateRef = (0, react.useRef)({ kind: "loading" });
			const deliveredRef = (0, react.useRef)("");
			const [state, setState] = (0, react.useState)({ kind: "loading" });
			const [attempt, setAttempt] = (0, react.useState)(0);
			stateRef.current = state;
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
				(async () => {
					const session = await createSession(address, detectDarkAppearance(), controller.signal);
					if (!live) {
						revokeSession(session.token);
						return;
					}
					issuedToken = session.token;
					if (session.category !== "viewer") throw new Error(`the host classified this file as ${session.category}`);
					const file = await readDocument(session.token, controller.signal);
					if (!live) return;
					setState({
						kind: "ready",
						session,
						content: file.content
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
			}, [address, attempt]);
			/** Hand the loaded document to the viewer exactly once per token. */
			const deliver = () => {
				const current = stateRef.current;
				const frame = frameRef.current;
				if (current.kind !== "ready" || !frame) return;
				if (deliveredRef.current === current.session.token) return;
				deliveredRef.current = current.session.token;
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
							deliverRef.current();
							break;
						case "VIEWER_RENDERED":
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dm-pane",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
					ref: frameRef,
					className: "dm-frame",
					title: state.session.filename,
					src: `${VIEWER_PREFIX}/index.html?token=${encodeURIComponent(state.session.token)}&theme=${encodeURIComponent(state.session.themeId)}`,
					onLoad: () => {
						deliverRef.current();
					}
				}, state.session.token)
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
		function definitionFor(category, id, kind) {
			return {
				id,
				kind,
				multiple: true,
				patterns: patternsForCategory(category),
				priority: "extension",
				title: (address) => basenameOf(address),
				canOpen: (address) => {
					const parsed = parseFileAddress(address);
					return parsed !== void 0 && classifyPath(parsed.path) === category;
				}
			};
		}
		/** Kinds this plugin owns, so the unsupported card offers only *other* viewers. */
		const OWN_KINDS = /* @__PURE__ */ new Set([
			VIEWER_KIND,
			NATIVE_KIND,
			UNSUPPORTED_KIND
		]);
		/**
		* Register the three types, their bodies, and their small registry bridges.
		* @param ctx - client root context.
		*/
		function registerTabs(ctx) {
			const definitions = [
				definitionFor("viewer", VIEWER_TAB_ID, VIEWER_KIND),
				definitionFor("native", NATIVE_TAB_ID, NATIVE_KIND),
				definitionFor("unsupported", UNSUPPORTED_TAB_ID, UNSUPPORTED_KIND)
			];
			for (const definition of definitions) ctx.effect(() => ctx.sidebarRightTabs.register(definition), `${PLUGIN_ID}: ${definition.kind} tab type`);
			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: VIEWER_TAB_ID,
				locale: LOCALE_NAMESPACE,
				inject: () => ({ openResource: (address) => {
					ctx.sidebarRight.openResource(address);
				} })
			}, PreviewTab)), `${PLUGIN_ID}: viewer body`);
			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: NATIVE_TAB_ID,
				locale: LOCALE_NAMESPACE
			}, NativeTab)), `${PLUGIN_ID}: native body`);
			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: UNSUPPORTED_TAB_ID,
				locale: LOCALE_NAMESPACE,
				inject: () => ({
					alternatives: (address) => ctx.sidebarRightTabs.candidates(address).filter((candidate) => !OWN_KINDS.has(candidate.kind)).map((candidate) => ({
						kind: candidate.kind,
						title: candidate.title(address)
					})),
					openWithKind: (address, kind) => {
						ctx.sidebarRight.openResource(address, { kind });
					}
				})
			}, UnsupportedTab)), `${PLUGIN_ID}: unsupported body`);
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
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2023);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
}
.dm-frame {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
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
			"sidebarRight"
		];
		/**
		* Mount the browser half.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, {
				zh,
				en
			}), `${PLUGIN_ID}: dictionaries`);
			ctx.effect(() => injectStyles());
			registerTabs(ctx);
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map