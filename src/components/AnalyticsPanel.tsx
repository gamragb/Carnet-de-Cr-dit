import { BarChart3, FileText, TrendingUp } from 'lucide-react';
import { CATEGORY_LABELS, UI_TEXT } from '../i18n/translations.ts';
import type { AnalyticsSnapshot, AppLanguage } from '../types/ledger.ts';
import { formatMAD } from '../utils/formatters.ts';

interface AnalyticsPanelProps {
  analytics: AnalyticsSnapshot;
  hideAmounts: boolean;
  hideDecimals?: boolean;
  lang: AppLanguage;
  onOpenContact: (contactId: string) => void;
  onOpenGlobalReport: () => void;
}

function formatMonthShort(yyyyMm: string, lang: AppLanguage): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  if (!y || !m) return yyyyMm;
  const d = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-FR', {
    month: 'short',
  }).format(d);
}

export function AnalyticsPanel({
  analytics,
  hideAmounts,
  hideDecimals = false,
  lang,
  onOpenContact,
  onOpenGlobalReport,
}: AnalyticsPanelProps) {
  const t = UI_TEXT[lang].analytics;
  const maxBar = Math.max(
    1,
    ...analytics.monthlySeries.map((m) => Math.max(m.creditGiven, m.paymentReceived))
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-teal-700 dark:text-teal-400" />
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
            {t.title}
          </h2>
        </div>

        <button
          type="button"
          onClick={onOpenGlobalReport}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-teal-700 px-3 text-xs font-bold text-white shadow-xs hover:bg-teal-800"
        >
          <FileText className="h-3.5 w-3.5" />
          <span>{t.globalPdfBtn}</span>
        </button>
      </div>

      {/* Monthly KPI Grid */}
      <section className="rounded-3xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t.monthFlowTitle}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl bg-emerald-50/90 p-3 dark:bg-emerald-950/40">
            <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
              {t.monthCreditGiven}
            </p>
            <p dir="ltr" className="tabular-nums mt-1 inline-block text-sm font-extrabold text-emerald-700 dark:text-emerald-200">
              {formatMAD(analytics.monthCreditGiven, { masked: hideAmounts, hideDecimals, lang })}
            </p>
          </div>
          <div className="rounded-2xl bg-teal-50/90 p-3 dark:bg-teal-950/40">
            <p className="text-[11px] font-bold text-teal-800 dark:text-teal-300">
              {t.monthCollected}
            </p>
            <p dir="ltr" className="tabular-nums mt-1 inline-block text-sm font-extrabold text-teal-700 dark:text-teal-200">
              {formatMAD(analytics.monthPaymentReceived, { masked: hideAmounts, hideDecimals, lang })}
            </p>
          </div>
          <div className="rounded-2xl bg-rose-50/90 p-3 dark:bg-rose-950/40">
            <p className="text-[11px] font-bold text-rose-800 dark:text-rose-300">
              {t.monthCreditTaken}
            </p>
            <p dir="ltr" className="tabular-nums mt-1 inline-block text-sm font-extrabold text-rose-700 dark:text-rose-200">
              {formatMAD(analytics.monthCreditTaken, { masked: hideAmounts, hideDecimals, lang })}
            </p>
          </div>
          <div className="rounded-2xl bg-indigo-50/90 p-3 dark:bg-indigo-950/40">
            <p className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300">
              {t.monthPaid}
            </p>
            <p dir="ltr" className="tabular-nums mt-1 inline-block text-sm font-extrabold text-indigo-700 dark:text-indigo-200">
              {formatMAD(analytics.monthPaymentMade, { masked: hideAmounts, hideDecimals, lang })}
            </p>
          </div>
        </div>

        {/* Collection Rate Bar */}
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
              <TrendingUp className="h-3.5 w-3.5 text-teal-600" />
              {t.collectionRateTitle}
            </span>
            <span className="font-extrabold text-teal-700 dark:text-teal-400">
              {analytics.collectionRatePct}%
            </span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-teal-600 transition-all duration-500"
              style={{ width: `${analytics.collectionRatePct}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-400">{t.collectionRateHint}</p>
        </div>
      </section>

      {/* 6-Month Bar Chart */}
      <section className="rounded-3xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t.sixMonthsTitle}
        </p>
        <div className="mt-4 grid grid-cols-6 items-end gap-2">
          {analytics.monthlySeries.map((bucket) => {
            const creditPct = Math.round((bucket.creditGiven / maxBar) * 100);
            const paidPct = Math.round((bucket.paymentReceived / maxBar) * 100);
            return (
              <div key={bucket.month} className="flex flex-col items-center gap-1.5">
                <div className="flex h-24 w-full items-end justify-center gap-1 rounded-xl bg-slate-50 p-1.5 dark:bg-slate-800/70">
                  <div
                    className="w-2.5 rounded-t-md bg-emerald-500 transition-all"
                    style={{ height: `${Math.max(bucket.creditGiven > 0 ? 8 : 0, creditPct)}%` }}
                    title={formatMAD(bucket.creditGiven, {
                      masked: hideAmounts,
                      lang,
                      hideDecimals,
                    })}
                  />
                  <div
                    className="w-2.5 rounded-t-md bg-teal-700 dark:bg-teal-400 transition-all"
                    style={{ height: `${Math.max(bucket.paymentReceived > 0 ? 8 : 0, paidPct)}%` }}
                    title={formatMAD(bucket.paymentReceived, {
                      masked: hideAmounts,
                      lang,
                      hideDecimals,
                    })}
                  />
                </div>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  {formatMonthShort(bucket.month, lang)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" />
            {t.monthCreditGiven}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-teal-700 dark:bg-teal-400" />
            {t.monthCollected}
          </span>
        </div>
      </section>

      {/* By Category */}
      <section className="rounded-3xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t.byCategoryTitle}
        </p>
        <div className="mt-3 space-y-2">
          {analytics.byCategory.map((cat) => (
            <div
              key={cat.category}
              className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2.5 text-xs dark:bg-slate-800/70"
            >
              <div>
                <span className="font-bold text-slate-800 dark:text-white">
                  {CATEGORY_LABELS[lang][cat.category]}
                </span>
                <span className="ms-1.5 text-[11px] text-slate-400">({cat.count})</span>
              </div>
              <div className="flex items-center gap-3 font-bold">
                <span dir="ltr" className="tabular-nums text-emerald-700 dark:text-emerald-400">
                  +{formatMAD(cat.receivable, { masked: hideAmounts, hideDecimals, lang })}
                </span>
                <span dir="ltr" className="tabular-nums text-rose-700 dark:text-rose-400">
                  -{formatMAD(cat.payable, { masked: hideAmounts, hideDecimals, lang })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Top Debtors & Creditors */}
      <div className="grid grid-cols-1 gap-3">
        <section className="rounded-3xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            {t.topDebtorsTitle}
          </p>
          {analytics.topDebtors.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">{t.noData}</p>
          ) : (
            <div className="mt-2.5 space-y-2">
              {analytics.topDebtors.map((item) => (
                <button
                  key={item.contact.id}
                  type="button"
                  onClick={() => onOpenContact(item.contact.id)}
                  className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-start text-xs hover:bg-emerald-50 dark:bg-slate-800/70 dark:hover:bg-emerald-950/40"
                >
                  <span className="truncate font-bold text-slate-800 dark:text-white">
                    {item.contact.name}
                  </span>
                  <span dir="ltr" className="tabular-nums shrink-0 font-extrabold text-emerald-700 dark:text-emerald-400">
                    {formatMAD(item.balance, { masked: hideAmounts, hideDecimals, lang })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-extrabold uppercase tracking-wide text-rose-700 dark:text-rose-400">
            {t.topCreditorsTitle}
          </p>
          {analytics.topCreditors.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">{t.noData}</p>
          ) : (
            <div className="mt-2.5 space-y-2">
              {analytics.topCreditors.map((item) => (
                <button
                  key={item.contact.id}
                  type="button"
                  onClick={() => onOpenContact(item.contact.id)}
                  className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-start text-xs hover:bg-rose-50 dark:bg-slate-800/70 dark:hover:bg-rose-950/40"
                >
                  <span className="truncate font-bold text-slate-800 dark:text-white">
                    {item.contact.name}
                  </span>
                  <span dir="ltr" className="tabular-nums shrink-0 font-extrabold text-rose-700 dark:text-rose-400">
                    {formatMAD(Math.abs(item.balance), { masked: hideAmounts, hideDecimals, lang })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
