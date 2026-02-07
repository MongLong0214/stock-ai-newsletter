'use client'

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex items-center justify-center h-[300px] rounded-lg border border-red-500/20 bg-red-500/5">
          <div className="text-center">
            <p className="text-red-400 text-sm font-mono">차트를 불러올 수 없습니다</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="mt-2 text-xs font-mono text-slate-400 hover:text-emerald-400 transition-colors"
            >
              다시 시도
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
