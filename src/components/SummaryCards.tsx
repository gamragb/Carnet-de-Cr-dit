import { ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react';
import { UI_TEXT } from '../i18n/translations.ts';
import type { AppLanguage, DashboardFilter, GlobalTotals } from '../types/ledger.ts';
import { formatMAD } from '../utils/formatters.ts';

interface SummaryCardsProps {
  totals: GlobalTotals;
  hideAmounts: boolean;
  hideDecimals?: boolean;
  lang: AppLanguage;
  onQuickFilter: (filter: DashboardFilter) => void;
}

export function SummaryCards({
  totals,
  hideAmounts,
  hideDecimals = false,
  lang,
  onQuickFilter,
}: SummaryCardsProps) {
  const t = UI_TEXT[lang].summary;
  const totalVolume = totals.totalReceivable + totals.totalPayable;
  const receivableRatio =
    totalVolume > 0 ? Math.round((totals.totalReceivable / totalVolume) * 100) : 50;

  const netStatusLabel =
    totals.netBalance > 0
      ? t.netPositive
      : totals.netBalance < 0
        ? t.netNegative
        : t.netZero;

  const netBadgeColor =
    totals.netBalance > 0
      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30'
      : totals.netBalance < 0
        ? 'bg-rose-500/20 text-rose-200 border-rose-400/30'
        : 'bg-white/10 text-slate-200 border-white/15';

  return (
    <section aria-label={t.netTitle} className="space-y-3">
      {/* Solde Net Hero Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 p-4 text-white shadow-lg shadow-slate-900/15">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
              <Scale className="h-3.5 w-3.5 text-teal-300" />
              <span>{t.netTitle}</span>
              {t.netSubHint && (
                <span className="text-teal-200/90">{t.netSubHint}</span>
              )}
            </div>
            <p
              dir="ltr"
              className="tabular-nums mt-1 inline-block text-2xl font-extrabold tracking-tight sm:text-3xl"
            >
              {formatMAD(totals.netBalance, {
                showSign: true,
                masked: hideAmounts,
                hideDecimals,
                lang,
              })}
            </p>
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${netBadgeColor}`}
          >
            {netStatusLabel}
          </span>
        </div>

        {/* Balance proportion bar */}
        <div className="mt-3.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-rose-500/40">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-500"
              style={{ width: `${totalVolume === 0 ? 50 : receivableRatio}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-300">
            <span>
              {t.receivableRatio} : {totalVolume === 0 ? '0%' : `${receivableRatio}%`}
            </span>
            <span>
              {t.payableRatio} : {totalVolume === 0 ? '0%' : `${100 - receivableRatio}%`}
            </span>
          </div>
        </div>
      </div>

      {/* Receivable & Payable Cards */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onQuickFilter('receivable')}
          className="group flex flex-col justify-between rounded-2xl border border-emerald-200/90 bg-emerald-50/90 p-3.5 text-start transition hover:border-emerald-300 hover:bg-emerald-50 active:scale-[0.98] dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60"
        >
          <div className="flex w-full items-center justify-between gap-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <ArrowDownLeft className="h-4 w-4" />
            </span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200">
              {totals.receivableCount} {t.persUnit}
            </span>
          </div>
          <div className="mt-2.5">
            <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
              {t.receivableTitle}
            </p>
            <p className="text-[11px] font-medium text-emerald-700/90 dark:text-emerald-300/80">
              {t.receivableSub}
            </p>
            <p
              dir="ltr"
              className="tabular-nums mt-1 inline-block text-lg font-extrabold text-emerald-700 dark:text-emerald-300"
            >
              {formatMAD(totals.totalReceivable, {
                masked: hideAmounts,
                hideDecimals,
                lang,
              })}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onQuickFilter('payable')}
          className="group flex flex-col justify-between rounded-2xl border border-rose-200/90 bg-rose-50/90 p-3.5 text-start transition hover:border-rose-300 hover:bg-rose-50 active:scale-[0.98] dark:border-rose-900/70 dark:bg-rose-950/40 dark:hover:bg-rose-950/60"
        >
          <div className="flex w-full items-center justify-between gap-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-600 text-white shadow-sm">
              <ArrowUpRight className="h-4 w-4" />
            </span>
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-900/70 dark:text-rose-200">
              {totals.payableCount} {t.persUnit}
            </span>
          </div>
          <div className="mt-2.5">
            <p className="text-xs font-bold text-rose-900 dark:text-rose-200">
              {t.payableTitle}
            </p>
            <p className="text-[11px] font-medium text-rose-700/90 dark:text-rose-300/80">
              {t.payableSub}
            </p>
            <p
              dir="ltr"
              className="tabular-nums mt-1 inline-block text-lg font-extrabold text-rose-700 dark:text-rose-300"
            >
              {formatMAD(totals.totalPayable, {
                masked: hideAmounts,
                hideDecimals,
                lang,
              })}
            </p>
          </div>
        </button>
      </div>
    </section>
  );
}
