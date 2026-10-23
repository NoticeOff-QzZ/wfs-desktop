import { Component, type ErrorInfo, type ReactNode } from 'react'
import { bridge } from '../lib/bridge'

interface Props {
  children: ReactNode
}

interface State {
  message: string | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null }

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void bridge
      .logEvent('error', 'ui_render_error', `${error.message}\n${info.componentStack ?? ''}`)
      .catch(() => undefined)
  }

  render() {
    if (this.state.message) {
      return (
        <div className="app">
          <div className="notice notice--error">
            界面出现异常：{this.state.message}
            <button className="button" onClick={() => window.location.reload()}>
              重新加载
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
