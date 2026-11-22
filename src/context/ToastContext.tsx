import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, RotateCcw, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

interface ToastContextValue {
  showToast: (
    message: string,
    variant?: ToastVariant,
    action?: ToastAction
  ) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (
      message: string,
      variant: ToastVariant = 'success',
      action?: ToastAction
    ) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-2), { id, message, variant, action }]);
      setTimeout(() => dismiss(id), action ? 4800 : 3200);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="no-print pointer-events-none fixed inset-x-0 top-3 z-50 mx-auto flex max-w-md flex-col gap-2 px-4"
      >
        {toasts.map((toast) => {
          const styles =
            toast.variant === 'error'
              ? 'bg-rose-600 text-white shadow-rose-900/20'
              : toast.variant === 'info'
                ? 'bg-slate-900 text-white shadow-slate-900/20'
                : 'bg-emerald-600 text-white shadow-emerald-900/20';

          const Icon =
            toast.variant === 'error'
              ? AlertCircle
              : toast.variant === 'info'
                ? Info
                : CheckCircle2;

          return (
            <div
              key={toast.id}
              className={`animate-toast-in pointer-events-auto flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg ${styles}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 leading-snug">{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick();
                    dismiss(toast.id);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-white/20 px-2.5 py-1 text-xs font-extrabold text-white transition hover:bg-white/30"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>{toast.action.label}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded-full p-1 opacity-80 transition hover:bg-white/20 hover:opacity-100"
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast doit être utilisé dans ToastProvider');
  }
  return ctx;
}
