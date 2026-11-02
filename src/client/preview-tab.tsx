/**
 * The docu.md tab body: `sidebar.right.pane.tab` under the viewer kind.
 *
 * The document itself is read through the host half (token-scoped), then handed
 * to the iframe with `OPEN_DOCUMENT`. Rendering, diagram code blocks, theme
 * switching and syntax highlighting all happen inside the vendored engine; this
 * component only owns the session, the frame lifetime, and the bridge.
 *
 * @module dsh-plugin-documd/client/preview-tab
 */

import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import type {
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import {
  VIEWER_PREFIX,
  formatFileAddress,
  type SessionResponse,
} from '../shared/contract'
import { createSession, readDocument, resolveThemeId, revokeSession } from './api'
import { postToViewer, readViewerMessage } from './iframe-bridge'
import { LOCALE_NAMESPACE } from './locales'
import { ErrorPane, LoadingPane } from './panes'
import { detectDarkAppearance, subscribeAppearance } from './theme'

/** The host-navigation helper the registration injects. */
export interface PreviewTabInjected {
  /**
   * Open another `dsh-resource://file/…` address in the right column.
   * @param address - the address a rendered link resolved to.
   */
  readonly openResource: (address: string) => void
}

/** Composed props of the viewer body. */
export type PreviewTabProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & InjectFace<PreviewTabInjected>
  & PropsLocale<typeof LOCALE_NAMESPACE>

type LoadState =
  | { readonly kind: 'loading' }
  | {
    readonly kind: 'ready'
    readonly session: SessionResponse
    readonly content: string
  }
  | { readonly kind: 'error'; readonly message: string }

/** Line the reader had reached, kept across hide/show and tab reopen. */
const scrollMemory = new Map<string, number>()

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Render one file through the docu.md iframe.
 * @param props - tab information, copy, and the injected navigation helper.
 * @returns the frame, a loading line, or an explicit failure card.
 */
export function PreviewTab(props: PreviewTabProps): ReactElement {
  const { useTabInfo, t, openResource } = props
  const info = useTabInfo()
  const address = info.tab.navigation.address
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const stateRef = useRef<LoadState>({ kind: 'loading' })
  const deliveredRef = useRef('')
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  stateRef.current = state

  useEffect(() => {
    if (!address) {
      setState({ kind: 'error', message: 'this tab has no file address' })
      return
    }

    const controller = new AbortController()
    let live = true
    let issuedToken: string | undefined
    deliveredRef.current = ''
    setState({ kind: 'loading' })

    void (async () => {
      const session = await createSession(address, detectDarkAppearance(), controller.signal)
      if (!live) {
        revokeSession(session.token)
        return
      }
      issuedToken = session.token
      if (session.category !== 'viewer') {
        throw new Error(`the host classified this file as ${session.category}`)
      }
      const file = await readDocument(session.token, controller.signal)
      if (!live) return
      setState({ kind: 'ready', session, content: file.content })
    })().catch((error: unknown) => {
      if (!live) return
      setState({ kind: 'error', message: describeError(error) })
    })

    return () => {
      live = false
      controller.abort()
      if (issuedToken) revokeSession(issuedToken)
    }
  }, [address, attempt])

  /** Hand the loaded document to the viewer exactly once per token. */
  const deliver = (): void => {
    const current = stateRef.current
    const frame = frameRef.current
    if (current.kind !== 'ready' || !frame) return
    if (deliveredRef.current === current.session.token) return
    deliveredRef.current = current.session.token

    const path = current.session.path
    const slash = path.lastIndexOf('/')
    const fileDir = slash >= 0 ? path.slice(0, slash + 1) : ''
    const line = scrollMemory.get(address)
    postToViewer(frame, {
      type: 'OPEN_DOCUMENT',
      content: current.content,
      filename: current.session.filename,
      fileDir,
      ...(line && line > 1 ? { targetLine: line } : {}),
    })
  }
  const deliverRef = useRef(deliver)
  deliverRef.current = deliver

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const message = readViewerMessage(event, frameRef.current)
      if (!message) return

      switch (message.type) {
        case 'VIEWER_READY':
          deliverRef.current()
          break
        case 'VIEWER_RENDERED':
        case 'EXPORT_RESULT':
          break
        case 'VIEWER_SCROLL_LINE_CHANGED':
          if (Number.isFinite(message.line) && message.line > 0) {
            scrollMemory.set(address, message.line)
          }
          break
        case 'WORKSPACE_NAVIGATE': {
          const next = formatFileAddress(address, message.path)
          if (next) openResource(next)
          break
        }
        case 'OPEN_URL':
          window.open(message.url, '_blank', 'noopener,noreferrer')
          break
        case 'VIEWER_ERROR':
          setState({ kind: 'error', message: message.message || 'the viewer failed to render' })
          break
        default:
          break
      }
    }

    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
    }
  }, [address, openResource])

  // Theme follows the host surface; the viewer applies it without a reload.
  useEffect(
    () => subscribeAppearance((dark) => {
      void resolveThemeId(dark)
        .then((themeId) => {
          if (themeId) postToViewer(frameRef.current, { type: 'SYNC_HOST_UI', themeId })
        })
        .catch(() => {
          // A theme probe failing must never break the preview.
        })
    }),
    [],
  )

  if (state.kind === 'loading') {
    return <LoadingPane label={t('viewer.loading')} />
  }

  if (state.kind === 'error') {
    return (
      <ErrorPane
        message={t('viewer.error', { message: state.message })}
        retryLabel={t('viewer.retry')}
        onRetry={() => {
          setAttempt((value) => value + 1)
        }}
      />
    )
  }

  return (
    <div className="dm-pane">
      <iframe
        ref={frameRef}
        key={state.session.token}
        className="dm-frame"
        title={state.session.filename}
        src={`${VIEWER_PREFIX}/index.html?token=${encodeURIComponent(state.session.token)}&theme=${encodeURIComponent(state.session.themeId)}`}
        onLoad={() => {
          deliverRef.current()
        }}
      />
    </div>
  )
}
