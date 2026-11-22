import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message || 'Unexpected error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Carnet de Crédit crash:', error, info);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    const isAr = typeof document !== 'undefined' && document.documentElement.lang === 'ar';
    return (
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="flex min-h-dvh items-center justify-center bg-slate-50 p-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
      >
        <div className="w-full max-w-sm rounded-3xl border border-rose-200 bg-white p-6 text-center shadow-lg dark:border-rose-900/60 dark:bg-slate-900">
          <h1 className="text-base font-extrabold text-rose-700 dark:text-rose-400">
            {isAr ? 'حدث خطأ غير متوقع' : 'Une erreur inattendue est survenue'}
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {isAr
              ? 'بياناتك محفوظة بأمان. اضغط لإعادة تشغيل التطبيق.'
              : 'Vos données sont en sécurité. Appuyez pour relancer l’application.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 min-h-[44px] w-full rounded-2xl bg-teal-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-teal-800"
          >
            {isAr ? 'إعادة التشغيل' : 'Recharger l’application'}
          </button>
        </div>
      </div>
    );
  }
}

if ('serviceWorker' in navigator && import.meta.env.PROD && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        if (reg.waiting) {
          window.dispatchEvent(new CustomEvent('carnet:sw-update', { detail: reg }));
        }
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('carnet:sw-update', { detail: reg }));
            }
          });
        });
      })
      .catch(() => {
        // Service worker registration failed silently
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
