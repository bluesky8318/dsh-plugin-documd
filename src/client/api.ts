/**
 * Same-origin calls to the host half's `/docu-preview/api` surface.
 *
 * The browser half never sees the workspace path: it hands the tab address to
 * `POST /session`, gets a short-lived token plus the resolved path back, and
 * every later read names that token.
 *
 * @module dsh-plugin-documd/client/api
 */

import { API_PREFIX, type ApiErrorBody, type FileResponse, type SessionResponse } from '../shared/contract'

/** An API response the host refused, carrying its machine-readable code. */
export class PreviewApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'PreviewApiError'
    this.status = status
    this.code = code
  }
}

async function readError(response: Response): Promise<PreviewApiError> {
  let code = `http_${response.status}`
  let message = response.statusText || 'request failed'
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>
    if (typeof body.error === 'string' && body.error) code = body.error
    if (typeof body.message === 'string' && body.message) message = body.message
  } catch {
    // A non-JSON error (a proxy page, for instance) keeps the status text.
  }
  return new PreviewApiError(response.status, code, message)
}

/**
 * Ask the host to resolve one tab address and issue its preview token.
 * @param address - a `dsh-resource://file/…` address.
 * @param dark - whether the host currently draws its dark palette.
 * @param signal - aborts the request when the tab navigates or closes.
 * @returns the issued session.
 */
export async function createSession(
  address: string,
  dark: boolean,
  signal?: AbortSignal,
): Promise<SessionResponse> {
  const response = await fetch(`${API_PREFIX}/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address, dark }),
    ...(signal ? { signal } : {}),
  })
  if (!response.ok) throw await readError(response)
  return (await response.json()) as SessionResponse
}

/**
 * Read the document text behind a preview token.
 * @param token - the session's token.
 * @param signal - aborts the request.
 * @returns the file payload.
 */
export async function readDocument(token: string, signal?: AbortSignal): Promise<FileResponse> {
  const response = await fetch(`${API_PREFIX}/file?token=${encodeURIComponent(token)}`, {
    ...(signal ? { signal } : {}),
  })
  if (!response.ok) throw await readError(response)
  return (await response.json()) as FileResponse
}

/**
 * Release a token when its tab goes away (best effort; the host also expires it).
 * @param token - the session's token.
 */
export function revokeSession(token: string): void {
  void fetch(`${API_PREFIX}/session?token=${encodeURIComponent(token)}`, { method: 'DELETE' }).catch(() => {
    // The TTL reclaims it even if this request never lands.
  })
}

/**
 * Ask the host which theme id matches its current light/dark state.
 * @param dark - the appearance the tab observed.
 * @returns a theme id from the vendored registry (`vscode` / `vscode-dark` by default).
 */
export async function resolveThemeId(dark: boolean): Promise<string> {
  const response = await fetch(`${API_PREFIX}/theme?dark=${dark ? '1' : '0'}`)
  if (!response.ok) throw await readError(response)
  const body = (await response.json()) as { themeId?: unknown }
  return typeof body.themeId === 'string' ? body.themeId : ''
}

/**
 * Same-origin URL of a binary asset (PDF, image) behind a token.
 * @param token - the session's token.
 * @param path - the resolved path reported by the session endpoint.
 * @returns the URL the browser can embed directly.
 */
export function assetUrl(token: string, path: string): string {
  return `${API_PREFIX}/asset?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`
}
