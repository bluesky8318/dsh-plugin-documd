/**
 * dsh (DeepSeek Harness) platform implementation for the docu.md renderer.
 *
 * This code runs inside the viewer iframe that the dsh plugin's host half serves
 * from `/docu-preview/viewer/`. Unlike the Chrome/Firefox/VSCode adapters it
 * talks to no extension runtime: file reads and binary assets go through the
 * plugin's own same-origin HTTP endpoints, which enforce a workspace root and a
 * per-tab token (see `src/host/routes.ts` in the plugin repository).
 *
 * The renderer core (`src/`) only depends on the structural `PlatformAPI`
 * interface, so every service below is a small local implementation rather than
 * a ServiceChannel round trip.
 */

import {
  BaseDocumentService,
  BaseI18nService,
  DEFAULT_SETTING_LOCALE,
  RendererService,
  createSettingsService,
} from '../../../vendor/markdown-viewer/src/services';
import type { LocaleMessages, SettingsService } from '../../../vendor/markdown-viewer/src/services';
import { IframeRenderHost } from '../../../vendor/markdown-viewer/src/renderers/host/iframe-render-host';
import type { FileState } from '../../../vendor/markdown-viewer/src/types/core';
import type { RendererThemeConfig } from '../../../vendor/markdown-viewer/src/types/render';
import type { SimpleCacheStats } from '../../../vendor/markdown-viewer/src/types/cache';
import type {
  CacheService,
  DocumentService,
  FileService,
  FileStateService,
  I18nService,
  MessageService,
  PlatformAPI,
  ReadFileOptions,
  ResourceService,
  StorageService,
} from '../../../vendor/markdown-viewer/src/types/platform';

/** Route prefix registered by the plugin's host half (`src/host/routes.ts`). */
const API_PREFIX = '/docu-preview/api';

/** localStorage namespace for the viewer's own settings/cache keys. */
const STORAGE_PREFIX = 'dsh-documd:';

/** Reasonable default while no host token has been set (dev/bare-page usage). */
const NO_TOKEN = '';

function postToParent(message: unknown): void {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(message, window.location.origin);
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Storage may be disabled (private mode); the viewer still works without it.
  }
}

// ============================================================================
// Storage
// ============================================================================

class DshStorageService implements StorageService {
  async get(keys: string[]): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const value = readJson<unknown>(key, undefined as unknown);
      if (value !== undefined) out[key] = value;
    }
    return out;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      writeJson(key, value);
    }
  }

  async remove(keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        window.localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      } catch {
        // ignore
      }
    }
  }
}

// ============================================================================
// Cache (render result memo, in memory for one viewer lifetime)
// ============================================================================

class DshCacheService implements CacheService {
  private readonly items = new Map<string, unknown>();
  private readonly maxItems = 40;

  async init(): Promise<void> {}

  async calculateHash(text: string): Promise<string> {
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    const mask = 0xffffffffffffffffn;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= BigInt(text.charCodeAt(i));
      hash = (hash * prime) & mask;
    }
    return hash.toString(16).padStart(16, '0');
  }

  async generateKey(
    content: string,
    type: string,
    themeConfig: RendererThemeConfig | null = null,
  ): Promise<string> {
    let keyContent = content;
    if (themeConfig) {
      keyContent = `${content}_font:${themeConfig.fontFamily || ''}_size:${themeConfig.fontSize || ''}`
        + `_style:${themeConfig.diagramStyle || 'normal'}_schema:${themeConfig.colorSchema || ''}`;
    }
    return `${await this.calculateHash(keyContent)}_${type}`;
  }

  async get(key: string): Promise<unknown> {
    return this.items.get(key) ?? null;
  }

  async set(key: string, value: unknown): Promise<boolean> {
    if (this.items.size >= this.maxItems) {
      const oldest = this.items.keys().next();
      if (!oldest.done) this.items.delete(oldest.value);
    }
    this.items.set(key, value);
    return true;
  }

  async clear(): Promise<boolean> {
    this.items.clear();
    return true;
  }

  async getStats(): Promise<SimpleCacheStats | null> {
    return {
      itemCount: this.items.size,
      maxItems: this.maxItems,
      totalSize: 0,
      totalSizeMB: '0.0',
      items: [],
    };
  }
}

// ============================================================================
// File download
// ============================================================================

class DshFileService implements FileService {
  async download(data: Blob | string, filename: string, options: { mimeType?: string } = {}): Promise<void> {
    let blob: Blob;
    if (data instanceof Blob) {
      blob = data;
    } else {
      // The shared export flows pass base64 for binary formats.
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      blob = new Blob([bytes], { type: options.mimeType || 'application/octet-stream' });
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      anchor.remove();
      URL.revokeObjectURL(url);
    }, 100);
  }
}

// ============================================================================
// File state (scroll line), mirrored to the host tab so it can be restored
// ============================================================================

class DshFileStateService implements FileStateService {
  private readonly states = new Map<string, FileState>();

  async get(url: string): Promise<FileState> {
    return this.states.get(url) || {};
  }

  set(url: string, state: FileState): void {
    this.states.set(url, { ...(this.states.get(url) || {}), ...state });
    if (typeof state.scrollLine === 'number' && Number.isFinite(state.scrollLine)) {
      postToParent({ type: 'VIEWER_SCROLL_LINE_CHANGED', line: state.scrollLine });
    }
  }

  async clear(url: string): Promise<void> {
    this.states.delete(url);
  }
}

// ============================================================================
// Assets (themes, locales, stencils, render frame HTML)
// ============================================================================

class DshResourceService implements ResourceService {
  private readonly textCache = new Map<string, Promise<string>>();

  getURL(path: string): string {
    // Assets live next to index.html under `/docu-preview/viewer/`.
    return new URL(path, window.location.href).href;
  }

  fetch(path: string): Promise<string> {
    const cached = this.textCache.get(path);
    if (cached) return cached;

    const request = fetch(this.getURL(path), { cache: 'no-cache' }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
      return response.text();
    });
    this.textCache.set(path, request);
    request.catch(() => this.textCache.delete(path));
    return request;
  }
}

// ============================================================================
// i18n
// ============================================================================

class DshI18nService extends BaseI18nService implements I18nService {
  constructor(private readonly resource: DshResourceService) {
    super();
  }

  override async init(): Promise<void> {
    try {
      await this.ensureFallbackMessages();
      const preferred = readJson<{ preferredLocale?: string }>('markdownViewerSettings', {}).preferredLocale;
      const locale = preferred || DEFAULT_SETTING_LOCALE;
      if (locale !== DEFAULT_SETTING_LOCALE) {
        await this.loadLocale(locale);
        this.locale = locale;
      } else {
        const detected = this.detectLocale();
        if (detected && detected !== 'en') await this.loadLocale(detected);
        this.locale = DEFAULT_SETTING_LOCALE;
      }
    } catch (error) {
      console.warn('[dsh i18n] init failed:', error);
    } finally {
      this.ready = Boolean(this.messages || this.fallbackMessages);
    }
  }

  override async loadLocale(locale: string): Promise<void> {
    this.messages = await this.fetchLocaleData(locale);
    this.ready = Boolean(this.messages || this.fallbackMessages);
  }

  override async fetchLocaleData(locale: string): Promise<LocaleMessages | null> {
    try {
      return JSON.parse(await this.resource.fetch(`_locales/${locale}/messages.json`)) as LocaleMessages;
    } catch (error) {
      console.warn('[dsh i18n] failed to load locale', locale, error);
      return null;
    }
  }

  getUILanguage(): string {
    return document.documentElement.lang || navigator.language || 'en';
  }

  private detectLocale(): string | null {
    const languages = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
    for (const language of languages) {
      const normalized = language.toLowerCase();
      const base = normalized.split('-')[0];
      if (!base) continue;
      if (base === 'zh') return normalized.includes('tw') ? 'zh_TW' : 'zh_CN';
      if (['en', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'ru', 'it'].includes(base)) return base;
    }
    return null;
  }
}

// ============================================================================
// Message service (document settings broadcast → viewer)
// ============================================================================

class DshMessageService implements MessageService {
  private readonly listeners = new Set<(message: unknown) => void>();

  async send(message: Record<string, unknown>): Promise<unknown> {
    postToParent(message);
    return {};
  }

  addListener(handler: (message: unknown) => void): void {
    this.listeners.add(handler);
  }

  /** Deliver a host-level setting change to in-viewer listeners. */
  broadcast(message: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch (error) {
        console.warn('[dsh message] listener failed:', error);
      }
    }
  }
}

// ============================================================================
// Document service (file reads through the plugin HTTP API)
// ============================================================================

interface FileResponse {
  content: string;
  encoding?: 'utf8' | 'base64';
  filename?: string;
  path?: string;
  size?: number;
  mtimeMs?: number;
  truncated?: boolean;
}

class DshDocumentService extends BaseDocumentService implements DocumentService {
  protected override _needsUriRewrite = true;
  private token: string;

  constructor(token: string) {
    super();
    this.token = token;
  }

  setToken(token: string): void {
    this.token = token;
  }

  /**
   * `path` is workspace-relative and slash-separated. `baseUrl` is rebuilt so
   * the renderer's relative-image rewrite (`${baseUrl}/${src}`) lands on the
   * asset endpoint with the document directory already carrying the token.
   */
  override setDocumentPath(path: string, _baseUrl?: string): void {
    const normalized = normalizeWorkspacePath(path);
    super.setDocumentPath(normalized);
    // rehype-image-uri appends `/${src}` to this value, so the directory must
    // not keep its trailing slash or every image URL would carry a double one.
    const dir = this._documentDir.replace(/\/+$/, '');
    this._baseUrl = dir
      ? `${API_PREFIX}/asset/${this.token}/${encodeURIComponent(dir)}`
      : `${API_PREFIX}/asset/${this.token}`;
  }

  async readFile(absolutePath: string, options?: ReadFileOptions): Promise<string> {
    if (/^https?:/i.test(absolutePath)) {
      const response = await fetch(absolutePath);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${absolutePath}`);
      return options?.binary ? base64FromBytes(new Uint8Array(await response.arrayBuffer())) : response.text();
    }
    return this.readFromApi(normalizeWorkspacePath(absolutePath), options?.binary ?? false);
  }

  async readRelativeFile(relativePath: string, options?: ReadFileOptions): Promise<string> {
    if (/^https?:/i.test(relativePath)) {
      return this.readFile(relativePath, options);
    }
    return this.readFromApi(this.resolvePath(normalizeWorkspacePath(relativePath)), options?.binary ?? false);
  }

  override resolvePath(relativePath: string): string {
    return normalizeWorkspacePath(super.resolvePath(normalizeWorkspacePath(relativePath)));
  }

  override toResourceUrl(absolutePath: string): string {
    return assetUrl(this.token, absolutePath);
  }

  private async readFromApi(path: string, binary: boolean): Promise<string> {
    const url = `${API_PREFIX}/file?token=${encodeURIComponent(this.token)}`
      + `&path=${encodeURIComponent(path)}&binary=${binary ? '1' : '0'}`;
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const payload = (await response.json()) as { message?: string };
        if (payload.message) detail = payload.message;
      } catch {
        // keep the status text
      }
      throw new Error(detail);
    }
    const payload = (await response.json()) as FileResponse;
    return payload.content;
  }
}

/** Collapse backslashes and leading `./` so paths stay workspace-relative. */
function normalizeWorkspacePath(path: string): string {
  let normalized = (path || '').replace(/\\/g, '/');
  if (normalized.startsWith('file://')) normalized = normalized.slice('file://'.length);
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  return normalized;
}

function assetUrl(token: string, path: string): string {
  return `${API_PREFIX}/asset?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Read the document file and its metadata through the token. */
export async function readDocument(token: string): Promise<FileResponse> {
  const response = await fetch(`${API_PREFIX}/file?token=${encodeURIComponent(token)}&path=`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as FileResponse;
}

// ============================================================================
// Platform assembly
// ============================================================================

export class DshPlatformAPI implements PlatformAPI {
  readonly platform = 'dsh' as const;

  readonly storage: StorageService;
  readonly cache: CacheService;
  readonly file: FileService;
  readonly fileState: FileStateService;
  readonly resource: DshResourceService;
  readonly message: DshMessageService;
  readonly renderer: RendererService;
  readonly i18n: DshI18nService;
  readonly document: DshDocumentService;
  readonly settings: SettingsService;

  constructor(token: string) {
    this.storage = new DshStorageService();
    this.cache = new DshCacheService();
    this.file = new DshFileService();
    this.fileState = new DshFileStateService();
    this.resource = new DshResourceService();
    this.message = new DshMessageService();
    this.document = new DshDocumentService(token);
    this.settings = createSettingsService(this.storage);

    this.renderer = new RendererService({
      createHost: () => new IframeRenderHost({
        // Same-origin fetch of the framed HTML keeps diagram rendering
        // (mermaid/vega/drawio) working without a blob URL CSP escape hatch.
        fetchHtmlContent: () => this.resource.fetch('iframe-render.html'),
        source: 'dsh-viewer',
        serviceRequestHandler: async (type, payload) => {
          if (type === 'FETCH_RESOURCE') {
            const { path } = payload as { path: string };
            return this.resource.fetch(path);
          }
          throw new Error(`Unknown service request: ${type}`);
        },
      }),
      // No shared backend cache exists in dsh; the host half does not proxy
      // cache operations, so renders go straight to the render iframe.
    });

    this.i18n = new DshI18nService(this.resource);
  }

  async init(): Promise<void> {
    await this.cache.init();
    await this.i18n.init();
  }

  setToken(token: string): void {
    this.document.setToken(token);
  }

  /** Re-dispatch a settings change to in-viewer listeners (theme/firstLineIndent). */
  broadcastSettingChange(key: string, value: unknown): void {
    this.message.broadcast({ type: 'SETTING_CHANGED', payload: { key, value } });
  }
}

/** Token from the iframe URL: `/docu-preview/viewer/index.html?token=…`. */
export function tokenFromLocation(): string {
  try {
    return new URLSearchParams(window.location.search).get('token') || NO_TOKEN;
  } catch {
    return NO_TOKEN;
  }
}

// Create the singleton the rest of the renderer reads via `globalThis.platform`.
export const dshPlatform = new DshPlatformAPI(tokenFromLocation());

export { DEFAULT_SETTING_LOCALE };
