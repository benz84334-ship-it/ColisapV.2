import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('UI crashed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="grid min-h-screen place-items-center px-6">
          <div className="max-w-xl rounded-2xl border border-rose-200 bg-white p-6 shadow-xl dark:border-rose-900 dark:bg-slate-950">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-rose-600 dark:text-rose-300">
              System Error
            </p>
            <h1 className="mt-3 text-2xl font-black text-slate-950 dark:text-white">
              The frontend crashed while loading.
            </h1>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              The app ran into a client-side error instead of rendering a blank page.
              Refresh the page, and if it keeps happening, open the browser console and send me the error.
            </p>
            {this.state.error ? (
              <pre className="mt-4 overflow-auto rounded-lg bg-slate-100 p-4 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {this.state.error.message || String(this.state.error)}
              </pre>
            ) : null}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
