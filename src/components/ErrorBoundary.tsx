import { Component, type ReactNode } from 'react';

/** Last-resort screen for unexpected render errors, instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('MealTrack crashed', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 text-center">
        <p className="text-lg font-semibold">Something went wrong</p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{this.state.error.message}</p>
        <p className="mt-1 text-xs text-slate-500">Your saved meals are safe in the cloud.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Reload MealTrack
        </button>
      </div>
    );
  }
}
