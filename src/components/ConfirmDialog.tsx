import { AlertTriangle, X } from 'lucide-react';
import { UI_TEXT } from '../i18n/translations.ts';
import type { AppLanguage } from '../types/ledger.ts';

interface ConfirmDialogProps {
  open: boolean;
  lang: AppLanguage;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  lang,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  const d = UI_TEXT[lang].dialogs;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="animate-sheet-up w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:border dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              danger
                ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                : 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label={UI_TEXT[lang].statement.close}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <h3
          id="confirm-dialog-title"
          className="mt-3 text-lg font-bold text-slate-900 dark:text-white"
        >
          {title}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {description}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[46px] rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {cancelLabel ?? d.cancelDefault}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-[46px] rounded-2xl px-4 text-sm font-bold text-white shadow-sm transition active:scale-[0.98] ${
              danger
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-teal-700 hover:bg-teal-800'
            }`}
          >
            {confirmLabel ?? d.confirmDefault}
          </button>
        </div>
      </div>
    </div>
  );
}
