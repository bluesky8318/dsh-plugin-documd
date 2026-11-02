/**
 * dsh embedded viewer entry.
 *
 * This file is the iframe side of the protocol defined by
 * `src/integration/iframe-viewer-host.ts`. The dsh client half creates the
 * iframe (`/docu-preview/viewer/index.html?token=…&theme=…`) and drives it with
 * the same messages the Chrome workspace embed uses, so the protocol, the
 * bridge and the renderer stay shared; only the host runtime differs.
 *
 * Message flow:
 *   viewer → host : VIEWER_READY, VIEWER_RENDERED, VIEWER_SCROLL_LINE_CHANGED,
 *                   WORKSPACE_NAVIGATE, OPEN_URL, VIEWER_ERROR, EXPORT_RESULT
 *   host → viewer : OPEN_DOCUMENT, UPDATE_CONTENT, SYNC_HOST_UI,
 *                   SYNC_HOST_NAVIGATION, EXPORT_REQUEST
 */

import { dshPlatform } from '../webview/index';
import { initializeViewerCore } from '../../../vendor/markdown-viewer/src/core/viewer/viewer-bootstrap';
import {
  attachMarkdownViewerElementRuntime,
  type MarkdownViewerElementRuntimeController,
} from '../../../vendor/markdown-viewer/src/integration/element';
import { buildCodeReadingRender } from '../../../vendor/markdown-viewer/src/utils/code-preview';
import { wrapFileContent } from '../../../vendor/markdown-viewer/src/utils/file-wrapper';
import themeManager from '../../../vendor/markdown-viewer/src/utils/theme-manager';

const ROOT_ID = 'docu-preview-root';

type IncomingMessage = {
  type?: string;
  content?: string;
  filename?: string;
  fileDir?: string;
  targetLine?: number;
  themeId?: string;
  anchor?: string;
  line?: number;
  format?: string;
  requestId?: string;
  title?: string;
};

function post(type: string, payload: Record<string, unknown> = {}): void {
  if (window.parent === window) return;
  window.parent.postMessage({ type, ...payload }, window.location.origin);
}

function queryParam(name: string): string {
  try {
    return new URLSearchParams(window.location.search).get(name) || '';
  } catch {
    return '';
  }
}

/** Theme tokens the dsh client maps from its own light/dark surface. */
const INITIAL_THEME = queryParam('theme');

let controller: MarkdownViewerElementRuntimeController | null = null;
let bootPromise: Promise<MarkdownViewerElementRuntimeController> | null = null;
let currentFilename = 'document.md';
let currentDocumentPath = '';

function prepareContent(content: string, filename: string): string {
  // Source files read as code (fenced with their language); registered
  // diagram formats are wrapped by wrapFileContent; markdown passes through.
  const code = buildCodeReadingRender(content, filename);
  if (code) return code.markdown;
  return wrapFileContent(content, filename);
}

async function ensureController(): Promise<MarkdownViewerElementRuntimeController> {
  if (controller) return controller;
  if (!bootPromise) {
    bootPromise = (async () => {
      // The platform must be initialized first: the shared localization and
      // theme managers read settings/storage through it synchronously during
      // their own init.
      await dshPlatform.init();
      if (INITIAL_THEME) {
        await themeManager.saveSelectedTheme(INITIAL_THEME);
      }
      const options = await initializeViewerCore(dshPlatform);
      const root = document.getElementById(ROOT_ID);
      if (!root) throw new Error(`dsh viewer: #${ROOT_ID} is missing from index.html`);
      controller = attachMarkdownViewerElementRuntime(root, options);
      root.addEventListener('scrolllinechange', (event) => {
        const line = (event as CustomEvent<{ line?: number }>).detail?.line;
        if (typeof line === 'number' && Number.isFinite(line)) {
          post('VIEWER_SCROLL_LINE_CHANGED', { line });
        }
      });
      document.documentElement.dataset.viewerReady = '1';
      return controller;
    })().catch((error: unknown) => {
      // A failed boot must be retryable: the next document gets a fresh attempt.
      bootPromise = null;
      document.documentElement.dataset.viewerError = String(error);
      post('VIEWER_ERROR', { message: String(error) });
      throw error;
    });
  }
  return bootPromise;
}

async function openDocument(message: IncomingMessage): Promise<void> {
  const filename = message.filename || 'document.md';
  const fileDir = message.fileDir || '';
  const documentPath = `${fileDir}${filename}`;

  currentFilename = filename;
  currentDocumentPath = documentPath;
  document.title = filename;
  document.documentElement.dataset.viewerFilename = filename;

  // Relative images are rewritten to the plugin's asset endpoint using this
  // document's directory; it has to be set before the render starts.
  dshPlatform.document.setDocumentPath(documentPath);

  const viewer = await ensureController();
  await viewer.render(prepareContent(message.content ?? '', filename));

  if (typeof message.targetLine === 'number' && Number.isFinite(message.targetLine)) {
    viewer.setScrollLine(message.targetLine);
  } else {
    viewer.setScrollLine(1);
  }

  post('VIEWER_RENDERED', { filename, documentKey: documentPath });
}

async function updateContent(message: IncomingMessage): Promise<void> {
  const viewer = await ensureController();
  await viewer.render(prepareContent(message.content ?? '', currentFilename));
  if (typeof message.targetLine === 'number' && Number.isFinite(message.targetLine)) {
    viewer.setScrollLine(message.targetLine);
  }
  post('VIEWER_RENDERED', { filename: currentFilename, documentKey: currentDocumentPath });
}

async function syncHostUi(message: IncomingMessage): Promise<void> {
  if (!message.themeId) return;
  if (!controller) {
    // No document yet: persist so the first render boots into this theme.
    await themeManager.saveSelectedTheme(message.themeId);
    return;
  }
  await controller.switchTheme(message.themeId);
}

async function syncHostNavigation(message: IncomingMessage): Promise<void> {
  const viewer = await ensureController();
  if (message.anchor) {
    viewer.scrollToAnchor(message.anchor);
  } else if (typeof message.line === 'number' && Number.isFinite(message.line)) {
    viewer.setScrollLine(message.line);
  }
}

async function runExport(message: IncomingMessage): Promise<void> {
  const requestId = message.requestId;
  try {
    const viewer = await ensureController();
    const format = (message.format || 'html') as Parameters<typeof viewer.export>[0];
    await viewer.export(format, {
      filename: message.filename || currentFilename,
      title: message.title,
    });
    post('EXPORT_RESULT', { requestId, ok: true });
  } catch (error) {
    post('EXPORT_RESULT', {
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function handleMessage(event: MessageEvent): void {
  if (event.source !== window.parent) return;
  const data = event.data as IncomingMessage | null;
  if (!data || typeof data.type !== 'string') return;

  switch (data.type) {
    case 'OPEN_DOCUMENT':
      void openDocument(data).catch((error) => {
        post('VIEWER_ERROR', { message: String(error) });
      });
      break;
    case 'UPDATE_CONTENT':
      void updateContent(data).catch((error) => {
        post('VIEWER_ERROR', { message: String(error) });
      });
      break;
    case 'SYNC_HOST_UI':
      void syncHostUi(data);
      break;
    case 'SYNC_HOST_NAVIGATION':
      void syncHostNavigation(data);
      break;
    case 'EXPORT_REQUEST':
      void runExport(data);
      break;
    default:
      break;
  }
}

/**
 * Links inside the rendered document: fragments scroll the preview, external
 * URLs are handed to the host (it decides whether to open a browser tab), and
 * everything else is a workspace path the host re-opens as a new preview tab.
 */
function handleDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!anchor) return;

  const href = anchor.getAttribute('href') || '';
  if (!href) return;

  event.preventDefault();
  event.stopPropagation();

  if (href.startsWith('#')) {
    controller?.scrollToAnchor(href);
    return;
  }
  if (/^(https?:|mailto:)/i.test(href)) {
    post('OPEN_URL', { url: href });
    return;
  }

  const [pathPart, fragment] = href.split('#');
  const resolved = dshPlatform.document.resolvePath(decodeURI(pathPart));
  post('WORKSPACE_NAVIGATE', {
    path: resolved,
    fragment: fragment ? `#${fragment}` : '',
  });
}

window.addEventListener('message', handleMessage);
document.addEventListener('click', handleDocumentClick);

// The host waits for this before handing over the first document, so it is
// posted as soon as the listener exists — and again on a later DOMContentLoaded
// in case the iframe script ran before the message listener was attached.
post('VIEWER_READY');
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => post('VIEWER_READY'), { once: true });
}
