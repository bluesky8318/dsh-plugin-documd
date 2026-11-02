import { fileURLToPath } from "node:url";
import Schema from "@deepseek-ai/schemastery";
import { createReadStream, promises } from "node:fs";
import * as path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
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
/** Theme ids from the vendored `src/themes/registry.json` used for dsh light/dark. */
const THEME_LIGHT = "vscode";
const THEME_DARK = "vscode-dark";
/**
* Resolve the viewer theme id from the plugin setting and the host's appearance.
* @param preference - `auto`, or an explicit theme id.
* @param dark - whether dsh is currently rendering its dark palette.
* @returns a theme id understood by the vendored theme registry.
*/
function resolveThemeId(preference, dark) {
	if (preference && preference !== "auto") return preference;
	return dark ? THEME_DARK : THEME_LIGHT;
}
// src/host/paths.ts
/**
* Workspace containment for every file the viewer reads.
*
* Two rules, both enforced on the real path rather than the requested string:
*   - the resolved file must exist and be a regular file;
*   - its realpath must sit inside one of the configured roots.
*
* Session-address paths are workspace-relative; absolute-address paths are used
* verbatim. Both funnel through {@link WorkspacePaths.resolve}.
*
* @module dsh-plugin-documd/host/paths
*/
/** Raised when a request names something outside the allowed roots. */
var OutsideWorkspaceError = class extends Error {
	code = "outside_workspace";
};
/** Raised when the path does not exist, is a directory, or cannot be stat'ed. */
var MissingFileError = class extends Error {
	code = "missing_file";
};
/**
* Resolve file requests against the configured roots.
*
* `workspaceRoot` accepts several roots separated by `;` (Windows-friendly)
* or `,`; an empty value falls back to `process.cwd()`, which is what `dsh`
* uses when it is launched from a project directory.
*/
var WorkspacePaths = class {
	/** Raw configured value, re-read on each resolve so settings edits apply live. */
	readRootConfig;
	constructor(readRootConfig) {
		this.readRootConfig = readRootConfig;
	}
	/** The roots in force, absolute and normalized. */
	roots() {
		const raw = this.readRootConfig().trim();
		return (raw ? raw.split(/[;,]/).map((entry) => entry.trim()).filter(Boolean) : [process.cwd()]).map((entry) => path.resolve(entry));
	}
	/**
	* Resolve one requested path.
	* @param requested - workspace-relative (session scope) or absolute (absolute scope).
	* @returns the contained file.
	* @throws OutsideWorkspaceError when the realpath escapes every root.
	* @throws MissingFileError when the target is absent or not a regular file.
	*/
	async resolve(requested) {
		const cleaned = requested.replace(/\\/g, "/");
		if (!cleaned || cleaned.includes("\0")) throw new MissingFileError("empty path");
		if (cleaned.split("/").includes("..")) throw new OutsideWorkspaceError("parent traversal is not allowed");
		const candidates = path.isAbsolute(cleaned) ? [cleaned] : this.roots().map((root) => path.join(root, cleaned));
		let realRoots = [];
		for (const root of this.roots()) try {
			realRoots.push(await promises.realpath(root));
		} catch {}
		for (const candidate of candidates) {
			let realPath;
			let stat;
			try {
				realPath = await promises.realpath(candidate);
				stat = await promises.stat(realPath);
			} catch {
				continue;
			}
			if (!stat.isFile()) continue;
			if (!realRoots.some((root) => {
				const relative = path.relative(root, realPath);
				return relative === "" || !relative.startsWith("..") && !path.isAbsolute(relative);
			})) throw new OutsideWorkspaceError("path escapes the workspace root");
			return {
				realPath,
				displayPath: cleaned,
				size: stat.size,
				mtimeMs: stat.mtimeMs
			};
		}
		throw new MissingFileError("no such file in the workspace");
	}
};
const MIME_BY_EXTENSION = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".avif": "image/avif",
	".bmp": "image/bmp",
	".ico": "image/x-icon",
	".pdf": "application/pdf",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".otf": "font/otf",
	".eot": "application/vnd.ms-fontobject",
	".wasm": "application/wasm",
	".txt": "text/plain; charset=utf-8",
	".map": "application/json; charset=utf-8"
};
/**
* Content type for a static asset path.
* @param filePath - any path with an extension.
* @returns a MIME type, defaulting to `application/octet-stream`.
*/
function mimeFor(filePath) {
	return MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}
/**
* Split a `Range: bytes=…` header into a concrete window.
* @param header - the raw header value.
* @param size - full body length.
* @returns inclusive start/end offsets, or `undefined` when the header is absent or unusable.
*/
function parseRange(header, size) {
	if (!header) return void 0;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return void 0;
	const [, rawStart, rawEnd] = match;
	if (rawStart === "" && rawEnd === "") return void 0;
	let start;
	let end;
	if (rawStart === "") {
		const suffix = Number(rawEnd);
		if (!Number.isFinite(suffix) || suffix <= 0) return void 0;
		start = Math.max(0, size - suffix);
		end = size - 1;
	} else {
		start = Number(rawStart);
		end = rawEnd === "" ? size - 1 : Number(rawEnd);
	}
	if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return void 0;
	return {
		start,
		end: Math.min(end, size - 1)
	};
}
// src/host/tokens.ts
/**
* Per-tab capability tokens.
*
* A tab asks the host for a token once; the viewer iframe then carries it in its
* URL and uses it for every file/asset request. Tokens are random, bound to one
* document path, expire after `tokenTtlMs`, and are revoked when the tab closes
* or the plugin unloads — the viewer never holds a session credential.
*
* @module dsh-plugin-documd/host/tokens
*/
/**
* Validate a token string without leaking comparison timing.
* @param left - candidate token.
* @param right - issued token.
* @returns whether both are the same string.
*/
function sameToken(left, right) {
	const a = Buffer.from(left);
	const b = Buffer.from(right);
	return a.length === b.length && timingSafeEqual(a, b);
}
/** In-memory token table owned by one plugin instance. */
var TokenStore = class {
	records = /* @__PURE__ */ new Map();
	/**
	* Issue a token for one document.
	* @param path - path the viewer may read.
	* @param filename - basename shown in the UI.
	* @param ttlMs - lifetime in milliseconds.
	* @returns the record, including the token string.
	*/
	issue(path, filename, ttlMs) {
		const token = randomBytes(24).toString("hex");
		const record = {
			token,
			path,
			filename,
			expiresAt: Date.now() + Math.max(1e3, ttlMs)
		};
		this.records.set(token, record);
		this.prune();
		return record;
	}
	/**
	* Look a token up.
	* @param token - candidate token.
	* @returns the record, or `undefined` when absent or expired.
	*/
	get(token) {
		if (!token) return void 0;
		const record = this.records.get(token);
		if (!record) return void 0;
		if (record.expiresAt <= Date.now()) {
			this.records.delete(token);
			return;
		}
		return record;
	}
	/**
	* Revoke one token.
	* @param token - candidate token.
	* @returns whether a live record was removed.
	*/
	revoke(token) {
		if (!token) return false;
		const record = this.records.get(token);
		if (!record || !sameToken(record.token, token)) return false;
		this.records.delete(token);
		return true;
	}
	/** Drop expired records; called on every issue so the table cannot grow unbounded. */
	prune() {
		const now = Date.now();
		for (const [token, record] of this.records) if (record.expiresAt <= now) this.records.delete(token);
	}
	/** Revoke everything (plugin unload). */
	clear() {
		this.records.clear();
	}
};
// src/host/routes.ts
/**
* The plugin's HTTP surface, mounted on `ctx.webServer` at `/docu-preview`.
*
* | route | purpose |
* | --- | --- |
* | `GET /docu-preview/viewer/*` | the static docu.md viewer bundle |
* | `POST /docu-preview/api/session` | issue a per-tab token for one file address |
* | `DELETE /docu-preview/api/session` | revoke a token when the tab closes |
* | `GET /docu-preview/api/theme` | resolve the viewer theme id for light/dark |
* | `GET /docu-preview/api/file` | document text (JSON) |
* | `GET /docu-preview/api/asset` | binary asset by absolute/relative path |
* | `GET /docu-preview/api/asset/<token>/<dir>/<name>` | relative image/asset rewrite target |
*
* Everything is same-origin: the browser half and the viewer iframe both live on
* the dsh web origin, so no CORS headers are emitted and cross-site POSTs are
* rejected by the Origin check below.
*
* @module dsh-plugin-documd/host/routes
*/
function sendJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(payload),
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(payload);
}
function sendError(res, status, error, message) {
	sendJson(res, status, {
		error,
		message
	});
}
/**
* Reject cross-site state changes.
*
* A browser always sends `Origin` on POST/DELETE from another origin; same-origin
* requests may omit it. Requests without `Origin` are therefore only the local
* CLI/curl path, which cannot be reached cross-origin by a web page.
*/
function sameOrigin(req) {
	const origin = req.headers.origin;
	if (!origin) return true;
	const host = req.headers.host;
	if (!host) return false;
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
}
/** Read a small JSON body; refuses anything larger than 64 KiB. */
async function readJsonBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		total += buffer.length;
		if (total > 65536) throw new Error("request body too large");
		chunks.push(buffer);
	}
	if (total === 0) return {};
	const raw = Buffer.concat(chunks).toString("utf8");
	const parsed = JSON.parse(raw);
	return parsed && typeof parsed === "object" ? parsed : {};
}
function joinUrlPath(...segments) {
	return segments.flatMap((segment) => segment.split("/")).filter(Boolean).join("/");
}
/**
* Build the request handler and the token table it uses.
* @param options - live settings and the viewer root.
* @returns the handler plus the store so the plugin can clear it on unload.
*/
function createRoutes(options) {
	const tokens = new TokenStore();
	const paths = new WorkspacePaths(options.workspaceRoot);
	async function serveViewerAsset(relative, res) {
		const requested = relative || "index.html";
		if (requested.includes("\0")) return sendError(res, 400, "bad_path", "invalid asset path");
		const normalized = path.posix.normalize(requested.replace(/\\/g, "/"));
		if (normalized.startsWith("..") || path.posix.isAbsolute(normalized)) return sendError(res, 403, "outside_viewer", "asset path escapes the viewer root");
		const root = path.resolve(options.viewerRoot);
		const target = path.resolve(root, normalized);
		const relativeToRoot = path.relative(root, target);
		if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) return sendError(res, 403, "outside_viewer", "asset path escapes the viewer root");
		let stat;
		try {
			stat = await promises.stat(target);
		} catch {
			return sendError(res, 404, "not_found", "asset not found");
		}
		if (!stat.isFile()) return sendError(res, 404, "not_found", "asset not found");
		res.writeHead(200, {
			"content-type": mimeFor(target),
			"content-length": stat.size,
			"cache-control": normalized === "index.html" ? "no-cache" : "public, max-age=300",
			"x-content-type-options": "nosniff"
		});
		createReadStream(target).pipe(res);
	}
	async function handleSession(req, res) {
		if (req.method === "DELETE") {
			const token = new URL(req.url ?? "/", "http://localhost").searchParams.get("token") ?? "";
			tokens.revoke(token);
			return sendJson(res, 200, { revoked: true });
		}
		if (req.method !== "POST") return sendError(res, 405, "method_not_allowed", "use POST or DELETE");
		if (!sameOrigin(req)) return sendError(res, 403, "cross_origin", "cross-origin token requests are refused");
		const body = await readJsonBody(req);
		const address = typeof body.address === "string" ? body.address : "";
		const dark = body.dark === true;
		if (!address) return sendError(res, 400, "bad_address", "address is required");
		const parsed = parseFileAddress(address);
		if (!parsed) return sendError(res, 400, "bad_address", "not a dsh-resource://file/ address");
		let resolved;
		try {
			resolved = await paths.resolve(parsed.path);
		} catch (error) {
			return sendPathError(res, error);
		}
		const limit = Math.max(1, options.maxPreviewBytes());
		if (resolved.size > limit) return sendError(res, 413, "preview_limit", `file is ${resolved.size} bytes, above the ${limit}-byte preview limit`);
		const filename = path.posix.basename(parsed.path.replace(/\\/g, "/"));
		const record = tokens.issue(resolved.displayPath, filename, options.tokenTtlMs());
		sendJson(res, 200, {
			token: record.token,
			path: resolved.displayPath,
			filename,
			size: resolved.size,
			category: classifyPath(parsed.path),
			themeId: resolveThemeId(options.themeId(), dark),
			expiresAt: record.expiresAt
		});
	}
	async function handleFile(url, res) {
		const record = tokens.get(url.searchParams.get("token") ?? "");
		if (!record) return sendError(res, 401, "bad_token", "missing or expired preview token");
		const requested = url.searchParams.get("path") || record.path;
		const binary = url.searchParams.get("binary") === "1";
		let resolved;
		try {
			resolved = await paths.resolve(requested);
		} catch (error) {
			return sendPathError(res, error);
		}
		const limit = Math.max(1, options.maxPreviewBytes());
		if (resolved.size > limit) return sendError(res, 413, "preview_limit", `file is ${resolved.size} bytes, above the ${limit}-byte preview limit`);
		const raw = await promises.readFile(resolved.realPath);
		sendJson(res, 200, {
			content: binary ? raw.toString("base64") : raw.toString("utf8"),
			encoding: binary ? "base64" : "utf8",
			path: resolved.displayPath,
			filename: path.posix.basename(resolved.displayPath.replace(/\\/g, "/")),
			size: resolved.size,
			mtimeMs: resolved.mtimeMs,
			truncated: false
		});
	}
	async function handleAsset(req, url, res) {
		const queryToken = url.searchParams.get("token") ?? "";
		const pathTail = url.pathname.slice(`${API_PREFIX}/asset`.length);
		let segments;
		try {
			segments = pathTail.split("/").filter(Boolean).map(decodeURIComponent);
		} catch {
			return sendError(res, 400, "bad_path", "asset path is not validly encoded");
		}
		let token = queryToken;
		let requested = url.searchParams.get("path") ?? "";
		if (segments.length >= 2) {
			token = segments[0] ?? "";
			const dir = segments[1] ?? "";
			const rest = segments.slice(2).join("/");
			if (dir.startsWith("/") || /^[A-Za-z]:/.test(dir)) requested = rest ? `${dir.replace(/\/+$/, "")}/${rest}` : dir;
			else requested = joinUrlPath(dir, rest);
		}
		if (!tokens.get(token)) return sendError(res, 401, "bad_token", "missing or expired preview token");
		if (!requested) return sendError(res, 400, "bad_path", "asset path is required");
		let resolved;
		try {
			resolved = await paths.resolve(requested);
		} catch (error) {
			return sendPathError(res, error);
		}
		const range = parseRange(req.headers.range, resolved.size);
		const headers = {
			"content-type": mimeFor(resolved.realPath),
			"accept-ranges": "bytes",
			"cache-control": "private, max-age=60",
			"x-content-type-options": "nosniff"
		};
		if (range) {
			res.writeHead(206, {
				...headers,
				"content-range": `bytes ${range.start}-${range.end}/${resolved.size}`,
				"content-length": range.end - range.start + 1
			});
			createReadStream(resolved.realPath, {
				start: range.start,
				end: range.end
			}).pipe(res);
			return;
		}
		res.writeHead(200, {
			...headers,
			"content-length": resolved.size
		});
		createReadStream(resolved.realPath).pipe(res);
	}
	function sendPathError(res, error) {
		if (error instanceof OutsideWorkspaceError) {
			sendError(res, 403, "outside_workspace", error.message);
			return;
		}
		if (error instanceof MissingFileError) {
			sendError(res, 404, "not_found", error.message);
			return;
		}
		options.log(`[dsh-plugin-documd] unexpected path error: ${String(error)}`);
		sendError(res, 500, "internal", "could not resolve the requested path");
	}
	async function handle(req, res) {
		const rawUrl = req.url ?? "/";
		const parsed = new URL(rawUrl, `http://${req.headers.host ?? "127.0.0.1"}`);
		const pathname = parsed.pathname;
		if (pathname.startsWith(`/docu-preview/viewer/`)) return serveViewerAsset(pathname.slice(`${VIEWER_PREFIX}/`.length), res);
		if (pathname === "/docu-preview/viewer") return serveViewerAsset("index.html", res);
		if (pathname === `/docu-preview/api/session`) return handleSession(req, res);
		if (pathname === `/docu-preview/api/theme`) {
			if (req.method !== "GET") return sendError(res, 405, "method_not_allowed", "use GET");
			const dark = parsed.searchParams.get("dark") === "1";
			return sendJson(res, 200, { themeId: resolveThemeId(options.themeId(), dark) });
		}
		if (pathname === `/docu-preview/api/file`) {
			if (req.method !== "GET") return sendError(res, 405, "method_not_allowed", "use GET");
			return handleFile(parsed, res);
		}
		if (pathname === `/docu-preview/api/asset` || pathname.startsWith(`/docu-preview/api/asset/`)) {
			if (req.method !== "GET") return sendError(res, 405, "method_not_allowed", "use GET");
			return handleAsset(req, parsed, res);
		}
		sendError(res, 404, "not_found", "unknown docu-preview route");
	}
	return {
		handle,
		tokens,
		paths
	};
}
// src/index.ts
/**
* 宿主半边：把 `/docu-preview` 挂到 dsh 的 HTTP 服务上（静态 viewer + 文件/资产 API）。
*
* 服务名提醒：`@deepseek-ai/dsh-host-webserver` 在 0.0.1-rc.1 里注册为
* `httpServer`，从 0.1.x 起注册为 `webServer`。本插件按 0.2.1-rc.5（当前锁定的
* dsh 运行时）的 `webServer` 注入；若 profile 里装的是 0.0.x 的 dsh，请把 inject 改成
* `httpServer`（README 的「兼容性」一节有说明）。
*
* 浏览器半边在 src/client/，注册三种右侧栏 tab 类型（viewer / native / unsupported）。
*
* @module dsh-plugin-documd
*/
/** 宿主插件名，须与 package.json 的 name 及 cordis.patch.yml 的 id 一致。 */
const name = PLUGIN_ID;
/** 依赖的服务：webServer 就绪后本插件才会加载。 */
const inject = ["webServer"];
/**
* Schemastery schema：默认值写在这里，cordis.yml 与 GUI 改写都会经过它校验。
* 不写 `Schema<Config>` 注解——`.volatile()` 的输出类型是解包后的值。
*/
const Config = Schema.object({
	workspaceRoot: Schema.string().default("").volatile(),
	themeId: Schema.string().default("auto").volatile(),
	maxPreviewBytes: Schema.number().default(8388608).volatile(),
	tokenTtlMs: Schema.number().default(6e5).volatile()
});
/** `assets/viewer` 与 lib/index.js 同属包根，装进 profile 后路径不变。 */
const VIEWER_ROOT = fileURLToPath(new URL("../assets/viewer", import.meta.url));
/**
* 插件主体：注册路由，插件停用时撤销路由并吊销所有令牌。
* @param ctx - 宿主插件上下文。
* @param config - 经过校验的配置，各字段是 Volatile 引用。
*/
function apply(ctx, config) {
	ctx.effect(() => {
		const routes = createRoutes({
			viewerRoot: VIEWER_ROOT,
			workspaceRoot: () => config.workspaceRoot.get(),
			maxPreviewBytes: () => config.maxPreviewBytes.get(),
			tokenTtlMs: () => config.tokenTtlMs.get(),
			themeId: () => config.themeId.get(),
			log: (message) => console.debug(message)
		});
		const dispose = ctx.webServer.register({
			kind: "prefix",
			path: ROUTE_PREFIX,
			handler: routes.handle
		});
		return () => {
			dispose();
			routes.tokens.clear();
		};
	}, "dsh-plugin-documd: routes");
}
export { Config, apply, inject, name };
