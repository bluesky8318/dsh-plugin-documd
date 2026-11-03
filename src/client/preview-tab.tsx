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
import type {
  DocumentContent,
  DocumentPreviewProps,
} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import {
  API_PREFIX,
  VIEWER_KIND,
  VIEWER_PREFIX,
  formatFileAddress,
  type SessionResponse,
} from '../shared/contract'
import { createSession, readDocument, resolveThemeId, revokeSession } from './api'
import { getDocumentActions } from './document-bridge'
import { postToViewer, readViewerMessage } from './iframe-bridge'
import { LOCALE_NAMESPACE } from './locales'
import { ErrorPane, LoadingPane } from './panes'
import { clearChoice, readChoice, shouldReopenWith, writeChoice } from './preferences'
import { detectDarkAppearance, subscribeAppearance } from './theme'

/** One other type that can render the same address. */
export interface AlternativeViewer {
  readonly kind: string
  readonly title: string
}

/** The host-navigation and switching helpers the registration injects. */
export interface PreviewTabInjected {
  /**
   * Open another `dsh-resource://file/…` address in the right column.
   * @param address - the address a rendered link resolved to.
   */
  readonly openResource: (address: string) => void
  /** Other registered types that `canOpen` the address, excluding this plugin. */
  readonly alternatives: (address: string) => readonly AlternativeViewer[]
  /**
   * Reopen the address as another type, optionally replacing one tab.
   * @param address - the file address.
   * @param kind - the chosen type.
   * @param tabId - the tab to replace.
   */
  readonly openWithKind: (address: string, kind: string, tabId?: string) => void
  /** Whether the choice is remembered per extension. */
  readonly rememberChoice: boolean
  /** Version segment the viewer bundle is served under (`immutable` cache). */
  readonly assetVersion: string
}

/** Extra props used when the same body runs inside dsh's document tab. */
export interface PreviewTabExtras {
  /** Text the owner already read, so the body does not read it twice. */
  readonly suppliedContent?: string
  /** Address override for slots whose `navigation` is not the file address. */
  readonly addressOverride?: string
  /** Hide the in-tab switch (dsh's own toolbar already offers one there). */
  readonly showSwitcher?: boolean
}

/** Composed props of the viewer body. */
export type PreviewTabProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & InjectFace<PreviewTabInjected>
  & PropsLocale<typeof LOCALE_NAMESPACE>
  & PreviewTabExtras

type LoadState =
  | { readonly kind: 'loading' }
  /** Token issued: the viewer iframe is already booting while the text loads. */
  | { readonly kind: 'opening'; readonly session: SessionResponse }
  | {
    readonly kind: 'ready'
    readonly session: SessionResponse
    readonly content: string
  }
  | { readonly kind: 'error'; readonly message: string }

/** Timings for one open, reported to `POST /api/metrics` (debug diagnostics). */
interface OpenTiming {
  readonly started: number
  readonly marks: Record<string, number>
  viewer?: Readonly<Record<string, number>>
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Report one open's phase timings to the host.
 *
 * The host keeps them in memory and echoes them from `/api/diagnostics` while
 * `debug: true`; this is a diagnostics channel, so failures are ignored.
 */
function reportTiming(address: string, timing: OpenTiming | null): void {
  if (!timing) return
  try {
    void fetch(`${API_PREFIX}/metrics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        kind: 'open',
        address,
        timeline: { ...timing.marks, total: roundMs(nowMs() - timing.started) },
        viewer: timing.viewer,
      }),
    }).catch(() => {})
  } catch {
    // Telemetry must never affect the preview.
  }
}

/** Props dsh's document tab hands to a `text-pages` implementation. */
export type DocumdDocumentBodyProps =
  & DocumentPreviewProps
  & InjectFace<PreviewTabInjected>
  & PropsLocale<typeof LOCALE_NAMESPACE>

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
  const {
    useTabInfo,
    t,
    openResource,
    alternatives,
    openWithKind,
    rememberChoice,
    assetVersion,
    suppliedContent,
    addressOverride,
    showSwitcher = true,
  } = props
  const info = useTabInfo()
  const address = addressOverride ?? info.tab.navigation.address
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const stateRef = useRef<LoadState>({ kind: 'loading' })
  const deliveredRef = useRef('')
  const preferenceApplied = useRef(false)
  const timingRef = useRef<OpenTiming | null>(null)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [, setResetTick] = useState(0)

  stateRef.current = state

  /**
   * Apply a remembered "preview method" choice once per tab.
   *
   * dsh cannot change a type's rank at runtime; it can reopen the same address
   * as another type and replace this tab, which is exactly what the switch
   * does. A remembered kind that no longer exists throws, in which case the
   * stale entry is dropped and this viewer stays.
   */
  useEffect(() => {
    if (preferenceApplied.current) return
    preferenceApplied.current = true
    if (!showSwitcher || !rememberChoice || !address) return
    const remembered = readChoice(address)
    if (!shouldReopenWith(remembered)) return
    try {
      openWithKind(address, remembered, info.tab.id)
    } catch {
      clearChoice(address)
    }
  }, [address, info.tab.id, openWithKind, rememberChoice, showSwitcher])

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

    const timing: OpenTiming = { started: nowMs(), marks: {} }
    timingRef.current = timing
    const lap = (name: string): void => {
      timing.marks[name] = roundMs(nowMs() - timing.started)
    }

    void (async () => {
      const session = await createSession(address, detectDarkAppearance(), controller.signal)
      lap('session')
      if (!live) {
        revokeSession(session.token)
        return
      }
      issuedToken = session.token
      if (session.category !== 'viewer') {
        throw new Error(`the host classified this file as ${session.category}`)
      }

      // Mount the iframe as soon as the token exists: its ~0.6–0.9s boot then
      // overlaps the document read instead of following it. The frame is handed
      // the text through `deliver()` once VIEWER_READY and the content are both
      // in, whichever arrives last.
      setState({ kind: 'opening', session })

      const content = suppliedContent ?? (await readDocument(session.token, controller.signal)).content
      lap('content')
      if (!live) return
      setState({ kind: 'ready', session, content })
    })().catch((error: unknown) => {
      if (!live) return
      setState({ kind: 'error', message: describeError(error) })
    })

    return () => {
      live = false
      controller.abort()
      if (issuedToken) revokeSession(issuedToken)
    }
  }, [address, attempt, suppliedContent])

  /** Hand the loaded document to the viewer exactly once per token. */
  const deliver = (): void => {
    const current = stateRef.current
    const frame = frameRef.current
    if (current.kind !== 'ready' || !frame) return
    if (deliveredRef.current === current.session.token) return
    deliveredRef.current = current.session.token
    if (timingRef.current) {
      timingRef.current.marks.deliver = roundMs(nowMs() - timingRef.current.started)
    }

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
          if (timingRef.current) {
            timingRef.current.marks.ready = roundMs(nowMs() - timingRef.current.started)
            if (message.timing) timingRef.current.viewer = message.timing
          }
          deliverRef.current()
          break
        case 'VIEWER_RENDERED': {
          const timing = timingRef.current
          if (timing) {
            timing.marks.rendered = roundMs(nowMs() - timing.started)
            if (message.timing) timing.viewer = message.timing
          }
          reportTiming(address, timing)
          timingRef.current = null
          break
        }
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

  // `opening` and `ready` both have a session: the frame mounts as soon as the
  // token exists, and the document is pushed in when it arrives.
  const session = state.session
  const waiting = state.kind === 'opening'
  const choices = showSwitcher ? alternatives(address) : []

  return (
    <div className="dm-pane">
      {showSwitcher && (
        <div className="dm-switch" data-documd-switch>
          <span className="dm-switch-label">{t('switch.label')}</span>
          <select
            className="dm-switch-select"
            value={VIEWER_KIND}
            onChange={(event) => {
              const kind = event.currentTarget.value
              if (!kind || kind === VIEWER_KIND) return
              if (rememberChoice) writeChoice(address, kind)
              try {
                openWithKind(address, kind, info.tab.id)
              } catch {
                // An unregistered kind is a stale option; stay on this viewer.
                clearChoice(address)
              }
            }}
          >
            <option value={VIEWER_KIND}>{t('switch.current')}</option>
            {choices.map((choice) => (
              <option key={choice.kind} value={choice.kind}>{choice.title}</option>
            ))}
          </select>
          {
            rememberChoice && (
              <button
                type="button"
                className="dm-switch-reset"
                onClick={() => {
                  clearChoice(address)
                  setResetTick((value) => value + 1)
                }}
              >
                {t('switch.reset')}
              </button>
            )
          }
        </div>
      )}
      <iframe
        ref={frameRef}
        key={session.token}
        className="dm-frame"
        title={session.filename}
        src={`${VIEWER_PREFIX}/${assetVersion}/index.html?token=${encodeURIComponent(session.token)}&theme=${encodeURIComponent(session.themeId)}`}
        onLoad={() => {
          const timing = timingRef.current
          if (timing) timing.marks.iframeLoad = roundMs(nowMs() - timing.started)
          deliverRef.current()
        }}
      />
      {waiting && (
        <div className="dm-overlay">
          <LoadingPane label={t('viewer.loading')} />
        </div>
      )}
    </div>
  )
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
export function DocumdDocumentBody(props: DocumdDocumentBodyProps): ReactElement | null {
  const content: DocumentContent = props.content
  if (content.kind !== 'text') return null
  const actions = getDocumentActions() ?? {
    openResource: () => {},
    alternatives: () => [],
    openWithKind: () => {},
    rememberChoice: false,
  }
  return (
    <PreviewTab
      {...(props as unknown as PreviewTabProps)}
      {...actions}
      suppliedContent={content.text}
      addressOverride={props.resourceAddress}
      showSwitcher={false}
    />
  )
}
