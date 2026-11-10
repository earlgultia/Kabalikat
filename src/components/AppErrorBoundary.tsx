import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

type Props = { children: ReactNode }
type State = { hasError: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  private reload = () => window.location.reload()

  render() {
    if (this.state.hasError) {
      return <main className="app-failure-screen" role="alert">
        <section>
          <span className="app-failure-icon"><AlertTriangle size={22} /></span>
          <p className="eyebrow">KABALIKAT</p>
          <h1>This page ran into a problem</h1>
          <p>Reload the page to try again. Any work that was not saved may need to be entered again.</p>
          <button className="button primary" type="button" onClick={this.reload}><RotateCw size={16} />Reload page</button>
          <a className="app-failure-home" href="/">Go to KABALIKAT home</a>
        </section>
      </main>
    }

    return this.props.children
  }
}
