import { Component } from 'react';

function isChunkLoadError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('failed to fetch dynamically imported module')
    || message.includes('loading chunk')
    || message.includes('chunkloaderror')
    || message.includes('importing a module script failed');
}

function reloadWithCacheBust() {
  const url = new URL(window.location.href);
  url.searchParams.set('__reload', Date.now().toString(36));
  window.location.replace(url.toString());
}

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
    if (isChunkLoadError(error) && typeof window !== 'undefined') {
      const refreshFlag = '__colisap_chunk_retry__';
      if (!window.sessionStorage.getItem(refreshFlag)) {
        window.sessionStorage.setItem(refreshFlag, '1');
        reloadWithCacheBust();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      const chunkLoadError = isChunkLoadError(this.state.error);
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
            {chunkLoadError ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                This looks like a stale deployment chunk. The app will try a fresh cache-busted reload once automatically.
              </p>
            ) : null}
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
