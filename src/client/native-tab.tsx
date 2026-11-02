/**
 * The native tab body: PDF and images, embedded by the browser itself.
 *
 * The browser's PDF viewer and `<img>` both load the asset URL directly, so the
 * only work here is issuing the token and keeping its lifetime tied to the tab.
 *
 * @module dsh-plugin-documd/client/native-tab
 */

import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type {
  PropsLocale,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import { extensionOf, type SessionResponse } from '../shared/contract'
import { assetUrl, createSession, revokeSession } from './api'
import { LOCALE_NAMESPACE } from './locales'
import { ErrorPane, LoadingPane, MessageCard } from './panes'
import { detectDarkAppearance } from './theme'

/** Composed props of the native body. */
export type NativeTabProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsLocale<typeof LOCALE_NAMESPACE>

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly session: SessionResponse }
  | { readonly kind: 'error'; readonly message: string }

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Embed one PDF or image.
 * @param props - tab information and copy.
 * @returns the embedded file or an explicit failure card.
 */
export function NativeTab(props: NativeTabProps): ReactElement {
  const { useTabInfo, t } = props
  const info = useTabInfo()
  const address = info.tab.navigation.address
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!address) {
      setState({ kind: 'error', message: 'this tab has no file address' })
      return
    }

    const controller = new AbortController()
    let live = true
    let issuedToken: string | undefined
    setState({ kind: 'loading' })

    void createSession(address, detectDarkAppearance(), controller.signal)
      .then((session) => {
        if (!live) {
          revokeSession(session.token)
          return
        }
        issuedToken = session.token
        setState({ kind: 'ready', session })
      })
      .catch((error: unknown) => {
        if (!live) return
        setState({ kind: 'error', message: describeError(error) })
      })

    return () => {
      live = false
      controller.abort()
      if (issuedToken) revokeSession(issuedToken)
    }
  }, [address, attempt])

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

  if (state.session.category !== 'native') {
    return (
      <MessageCard
        title={t('unsupported.title')}
        detail={t('unsupported.detail', { ext: extensionOf(state.session.path) || state.session.filename })}
      />
    )
  }

  const url = assetUrl(state.session.token, state.session.path)
  if (extensionOf(state.session.path) === '.pdf') {
    return (
      <div className="dm-pane">
        <iframe className="dm-native-frame" title={t('native.pdf')} src={url} />
        <div className="dm-actions dm-native-actions">
          <a className="dm-button" href={url} target="_blank" rel="noreferrer">
            {t('native.openExternal')}
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="dm-pane">
      <div className="dm-native-image">
        <img src={url} alt={state.session.filename} />
      </div>
    </div>
  )
}
