import { Component, type ReactNode } from 'react';
import { appUrl } from '../lib/base.js';
import { report } from '../lib/errorReporting.js';

/** If a screen crashes, show a way out instead of a blank page, and tell the team. */
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    report(error, 'screen crashed');
  }

  componentDidUpdate(previous: { resetKey?: string }) {
    // Moving to another screen clears the error.
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="notice error" role="alert">
        <strong>Something went wrong on this screen.</strong> The SignSphere team has been told automatically. Try again, or use
        another screen — Emergency always works.
        <div className="row" style={{ marginTop: '0.6rem' }}>
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <a className="btn" href={appUrl('')}>
            Go home
          </a>
        </div>
      </div>
    );
  }
}
