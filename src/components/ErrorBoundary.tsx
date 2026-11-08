import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  failed: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Beadloom application error', error, info)
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="fatal-error" role="alert">
          <div className="brand-mark" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((item) => <i key={item} />)}
          </div>
          <h1>应用遇到了一点问题</h1>
          <p>你的自动保存项目仍保留在本机。刷新页面即可重新载入。</p>
          <button type="button" className="button dark" onClick={() => window.location.reload()}>
            刷新应用
          </button>
        </main>
      )
    }
    return this.props.children
  }
}
