import { Printer, X } from 'lucide-react';
import { CATEGORY_LABELS, UI_TEXT } from '../i18n/translations.ts';
import type {
  AppLanguage,
  ContactSummary,
  GlobalTotals,
} from '../types/ledger.ts';
import { formatDateFR, formatMAD, getTodayISODate } from '../utils/formatters.ts';
import { triggerNativePrint } from '../utils/nativePlatform.ts';

interface GlobalReportModalProps {
  open: boolean;
  lang: AppLanguage;
  hideDecimals?: boolean;
  summaries: ContactSummary[];
  totals: GlobalTotals;
  businessName?: string;
  onClose: () => void;
}

function GlobalReportContent({
  lang,
  hideDecimals = false,
  summaries,
  totals,
  businessName,
}: {
  lang: AppLanguage;
  hideDecimals?: boolean;
  summaries: ContactSummary[];
  totals: GlobalTotals;
  businessName?: string;
}) {
  const s = UI_TEXT[lang].statement;
  const sumText = UI_TEXT[lang].summary;
  const activeRows = summaries
    .filter((item) => !item.contact.archived)
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  const todayStr = formatDateFR(getTodayISODate(), lang);

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="bg-white text-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-teal-700">
            {businessName?.trim() || s.defaultHeader}
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-slate-900">
            {s.globalTitle}
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">{s.globalSubtitle}</p>
        </div>
        <div className="text-end">
          <p className="text-xs text-slate-500">{s.issuedOn(todayStr)}</p>
          <p className="mt-1 text-xs font-bold text-slate-700">
            {s.globalTotalContacts(activeRows.length)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="font-bold text-emerald-800">{sumText.receivableTitle}</p>
          <p dir="ltr" className="tabular-nums mt-1 inline-block text-base font-extrabold text-emerald-700">
            {formatMAD(totals.totalReceivable, { lang, hideDecimals })}
          </p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="font-bold text-rose-800">{sumText.payableTitle}</p>
          <p dir="ltr" className="tabular-nums mt-1 inline-block text-base font-extrabold text-rose-700">
            {formatMAD(totals.totalPayable, { lang, hideDecimals })}
          </p>
        </div>
        <div className="rounded-xl border border-slate-300 bg-slate-100 p-3">
          <p className="font-bold text-slate-700">{sumText.netTitle}</p>
          <p dir="ltr" className="tabular-nums mt-1 inline-block text-base font-extrabold text-slate-900">
            {formatMAD(totals.netBalance, { showSign: true, lang, hideDecimals })}
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-start text-xs">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-100 text-[11px] font-bold uppercase text-slate-700">
              <th className="px-2.5 py-2">#</th>
              <th className="px-2.5 py-2">{UI_TEXT[lang].contactModal.nameLabel.replace(' *', '')}</th>
              <th className="px-2.5 py-2">{UI_TEXT[lang].contactModal.categoryLabel}</th>
              <th className="px-2.5 py-2 text-end">{s.colBalance}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {activeRows.map((item, idx) => (
              <tr key={item.contact.id}>
                <td className="px-2.5 py-2 text-slate-500">{idx + 1}</td>
                <td className="px-2.5 py-2">
                  <div className="font-bold text-slate-900">{item.contact.name}</div>
                  {item.contact.phone && (
                    <div dir="ltr" className="inline-block text-[10px] text-slate-500">
                      {item.contact.phone}
                    </div>
                  )}
                </td>
                <td className="px-2.5 py-2 text-slate-600">
                  {CATEGORY_LABELS[lang][item.contact.category]}
                </td>
                <td
                  className={`px-2.5 py-2 text-end font-extrabold whitespace-nowrap ${
                    item.balance > 0
                      ? 'text-emerald-700'
                      : item.balance < 0
                        ? 'text-rose-700'
                        : 'text-slate-500'
                  }`}
                >
                  <span dir="ltr" className="tabular-nums inline-block">
                    {formatMAD(item.balance, {
                      showSign: item.balance !== 0,
                      lang,
                      hideDecimals,
                    })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-5 border-t border-slate-200 pt-3 text-[11px] text-slate-400">
        {s.footer(activeRows.reduce((acc, sItem) => acc + sItem.transactionCount, 0))}
      </p>
    </div>
  );
}

export function GlobalReportModal({
  open,
  lang,
  hideDecimals = false,
  summaries,
  totals,
  businessName,
  onClose,
}: GlobalReportModalProps) {
  if (!open) return null;
  const s = UI_TEXT[lang].statement;

  return (
    <>
      <div
        className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-[2px] sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="animate-sheet-up flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl dark:border dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {s.globalTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{s.previewHint}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label={s.close}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-white p-5">
            <GlobalReportContent
              lang={lang}
              hideDecimals={hideDecimals}
              summaries={summaries}
              totals={totals}
              businessName={businessName}
            />
          </div>

          <div className="flex gap-2.5 border-t border-slate-200 px-5 py-3.5 pb-safe dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[46px] flex-1 rounded-2xl border border-slate-200 text-sm font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              {s.close}
            </button>
            <button
              type="button"
              onClick={() => triggerNativePrint()}
              className="flex min-h-[46px] flex-[1.5] items-center justify-center gap-2 rounded-2xl bg-teal-700 text-sm font-bold text-white shadow-md hover:bg-teal-800"
            >
              <Printer className="h-4 w-4" />
              {s.printBtn}
            </button>
          </div>
        </div>
      </div>

      <div className="print-only">
        <GlobalReportContent
          lang={lang}
          hideDecimals={hideDecimals}
          summaries={summaries}
          totals={totals}
          businessName={businessName}
        />
      </div>
    </>
  );
}
