import { Component, type ReactNode, type ErrorInfo } from 'react'
import * as Sentry from "@sentry/react";
import { captureException } from '../analytics/posthog'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    captureException(error, { boundary: 'root' }) // D-19 (PostHog — preserved verbatim)
    Sentry.captureException(error, { tags: { boundary: 'root' } }) // Phase 126 (AUTH-126-04) — additive Sentry sibling
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <div className="bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4 text-center">
            <h1 className="text-2xl font-medium text-white mb-4">Something went wrong</h1>
            <button
              className="py-2 px-4 bg-teal-600 hover:bg-teal-800 text-white rounded font-medium"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
