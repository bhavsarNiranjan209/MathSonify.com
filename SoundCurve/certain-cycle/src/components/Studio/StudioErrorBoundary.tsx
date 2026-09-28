/**
 * StudioErrorBoundary — keeps a failure inside the studio from blanking the page.
 *
 * The Create studio is a `client:only` island, which means Astro ships no
 * server-rendered markup for it. If any component inside throws during render
 * or hydration, React tears down the whole island and the visitor gets an
 * empty page with a working navigation bar above it — a genuinely broken
 * product rather than a degraded one.
 *
 * This boundary catches that, shows the real error, and keeps the rest of the
 * site usable. The same pattern is applied to the error pages' consumers in
 * `ErrorBoundary` below.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Shown in the fallback so the visitor knows which area failed. */
  area: string;
}

interface State {
  error: Error | null;
}

export default class StudioErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the real cause visible in the console; the fallback is for humans.
    console.error(`[${this.props.area}] crashed during render`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto">
        <div className="panel p-6 sm:p-8 border-t-2 border-sc-live/60">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sc-text-faint">
            {this.props.area} · could not start
          </p>
          <h1 className="mt-3 font-serif text-2xl font-semibold text-sc-text">
            The studio hit an error while loading.
          </h1>
          <p className="mt-3 text-sm text-sc-text-soft">
            This is a bug on our side, not something you did. Reloading usually clears it.
          </p>

          {/* Surface the actual message so the failure is diagnosable instead of
              hiding behind a friendly sentence. */}
          <pre className="code-mat mt-4 max-h-40 overflow-auto whitespace-pre-wrap break-words p-3 text-[11px] leading-relaxed text-sc-text-soft">
            {error.message || String(error)}
          </pre>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-primary inline-flex min-h-[44px] items-center justify-center px-5 py-2.5 text-sm"
            >
              Reload
            </button>
            <a
              href="/create"
              className="btn-ghost inline-flex min-h-[44px] items-center justify-center px-5 py-2.5 text-sm"
            >
              Try again
            </a>
            <a
              href="/"
              className="btn-ghost inline-flex min-h-[44px] items-center justify-center px-5 py-2.5 text-sm"
            >
              Back to MathSonify
            </a>
          </div>
        </div>
      </div>
    );
  }
}
