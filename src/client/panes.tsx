/**
 * Small presentational pieces shared by the three tab bodies: a loading line, a
 * failure card with a retry button, and the neutral card the unsupported / PDF
 * fallbacks build on.
 *
 * @module dsh-plugin-documd/client/panes
 */

import type { ReactElement, ReactNode } from 'react'

/**
 * A centred status line.
 * @param props - the copy to show.
 * @returns the pane.
 */
export function LoadingPane(props: { readonly label: string }): ReactElement {
  return (
    <div className="dm-pane">
      <div className="dm-status">{props.label}</div>
    </div>
  )
}

/**
 * A failure card with one retry action.
 * @param props - message, action label, and the retry callback.
 * @returns the pane.
 */
export function ErrorPane(props: {
  readonly message: string
  readonly retryLabel: string
  readonly onRetry: () => void
}): ReactElement {
  return (
    <div className="dm-pane">
      <div className="dm-status dm-status-error">
        <div className="dm-card">
          <p className="dm-card-title">{props.message}</p>
          <div className="dm-actions">
            <button type="button" className="dm-button" onClick={props.onRetry}>
              {props.retryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * A neutral card for "nothing can render this" states.
 * @param props - title, optional detail, and optional actions.
 * @returns the pane.
 */
export function MessageCard(props: {
  readonly title: string
  readonly detail?: string
  readonly children?: ReactNode
}): ReactElement {
  return (
    <div className="dm-pane">
      <div className="dm-status">
        <div className="dm-card">
          <p className="dm-card-title">{props.title}</p>
          {props.detail ? <p className="dm-card-detail">{props.detail}</p> : null}
          {props.children}
        </div>
      </div>
    </div>
  )
}
