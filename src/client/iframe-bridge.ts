/**
 * Typed wrapper around the iframe protocol implemented by
 * `viewer/src/workspace/viewer-embed.ts`.
 *
 * Keeping the protocol in one module means the tab body and the viewer agree on
 * message names, and that a future viewer change fails to compile instead of
 * failing silently at runtime.
 *
 * @module dsh-plugin-documd/client/iframe-bridge
 */

/** Per-phase timings the viewer reports (milliseconds). */
export type ViewerTiming = Readonly<Record<string, number>>

/** Messages the viewer sends to its embedding tab. */
export type ViewerToHostMessage =
  | { readonly type: 'VIEWER_READY'; readonly timing?: ViewerTiming }
  | {
    readonly type: 'VIEWER_RENDERED'
    readonly filename?: string
    readonly documentKey?: string
    readonly timing?: ViewerTiming
  }
  | { readonly type: 'VIEWER_SCROLL_LINE_CHANGED'; readonly line: number }
  | { readonly type: 'WORKSPACE_NAVIGATE'; readonly path: string; readonly fragment?: string }
  | { readonly type: 'OPEN_URL'; readonly url: string }
  | { readonly type: 'VIEWER_ERROR'; readonly message?: string }
  | {
    readonly type: 'EXPORT_RESULT'
    readonly requestId?: string
    readonly ok: boolean
    readonly error?: string
  }

/** Messages the tab sends into the viewer. */
export type HostToViewerMessage =
  | {
    readonly type: 'OPEN_DOCUMENT'
    readonly content: string
    readonly filename: string
    readonly fileDir: string
    readonly targetLine?: number
  }
  | {
    readonly type: 'UPDATE_CONTENT'
    readonly content: string
    readonly targetLine?: number
  }
  | { readonly type: 'SYNC_HOST_UI'; readonly themeId: string }
  | {
    readonly type: 'SYNC_HOST_NAVIGATION'
    readonly anchor?: string
    readonly line?: number
  }
  | {
    readonly type: 'EXPORT_REQUEST'
    readonly requestId: string
    readonly format: string
    readonly filename?: string
    readonly title?: string
  }

/**
 * Send one message to the viewer iframe.
 * @param frame - the iframe element, or null while it is not mounted yet.
 * @param message - the protocol message.
 */
export function postToViewer(frame: HTMLIFrameElement | null, message: HostToViewerMessage): void {
  const target = frame?.contentWindow
  if (!target) return
  target.postMessage(message, window.location.origin)
}

/**
 * Narrow an incoming `message` event to a viewer message from this iframe.
 * @param event - the window message event.
 * @param frame - the iframe that hosts the viewer.
 * @returns the protocol message, or `undefined` for anything else.
 */
export function readViewerMessage(
  event: MessageEvent,
  frame: HTMLIFrameElement | null,
): ViewerToHostMessage | undefined {
  if (!frame || event.source !== frame.contentWindow) return undefined
  if (event.origin !== window.location.origin) return undefined
  const data = event.data as { type?: unknown } | null
  if (!data || typeof data.type !== 'string') return undefined
  return data as ViewerToHostMessage
}

/**
 * The directory part of a document path, with its trailing slash removed.
 *
 * `OPEN_DOCUMENT.fileDir` is concatenated with `filename` by the viewer, so it
 * carries the slash; the asset route wants the bare directory.
 * @param documentPath - the path reported by the session endpoint.
 * @returns the directory without a trailing slash, or `''`.
 */
export function documentDirOf(documentPath: string): string {
  const slash = documentPath.lastIndexOf('/')
  return slash >= 0 ? documentPath.slice(0, slash) : ''
}
