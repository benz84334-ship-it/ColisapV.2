import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { FiCheckCircle, FiInfo, FiX, FiXCircle } from 'react-icons/fi';

const ToastContext = createContext(null);

const icons = {
  success: FiCheckCircle,
  error: FiXCircle,
  info: FiInfo,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'success') => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3800);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="no-print fixed right-4 top-4 z-50 flex w-[min(92vw,24rem)] flex-col gap-3">
        {toasts.map((toast) => {
          const Icon = icons[toast.type] || FiInfo;
          const color =
            toast.type === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100'
              : toast.type === 'info'
                ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100';

          return (
            <div
              key={toast.id}
              className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${color}`}
              role="status"
            >
              <Icon className="mt-0.5 shrink-0" />
              <p className="flex-1 text-sm font-medium">{toast.message}</p>
              <button
                aria-label="Dismiss notification"
                className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
                type="button"
                onClick={() => removeToast(toast.id)}
              >
                <FiX />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
