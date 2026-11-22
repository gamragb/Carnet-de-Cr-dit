import { useMemo, useState } from 'react';
import { Image as ImageIcon, Printer, X } from 'lucide-react';
import { useToast } from '../context/ToastContext.tsx';
import {
  CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  TX_TYPE_LABELS,
  UI_TEXT,
} from '../i18n/translations.ts';
import type {
  AppLanguage,
  ContactSummary,
  LedgerEntryWithBalance,
} from '../types/ledger.ts';
import {
  formatDateFR,
  formatDateTimeFR,
  formatMAD,
  getTodayISODate,
} from '../utils/formatters.ts';
import {
  shareOrSaveNativeBinaryBlob,
  triggerNativePrint,
} from '../utils/nativePlatform.ts';
import { generateStatementPngBlob } from '../utils/statementImage.ts';

interface PrintableStatementProps {
  open: boolean;
  lang: AppLanguage;
  hideDecimals?: boolean;
  summary: ContactSummary;
  entries: LedgerEntryWithBalance[];
  businessName?: string;
  onClose: () => void;
}

type RangeMode = 'all' | 'month' | 'custom';

function StatementContent({
  lang,
  hideDecimals = false,
  summary,
  entries,
  previousBalance,
  showPreviousBalance,
  isFiltered,
  businessName,
}: {
  lang: AppLanguage;
  hideDecimals?: boolean;
  summary: ContactSummary;
  entries: LedgerEntryWithBalance[];
  previousBalance: number;
  showPreviousBalance: boolean;
  isFiltered: boolean;
  businessName?: string;
}) {
  const s = UI_TEXT[lang].statement;
  const cd = UI_TEXT[lang].contactDetail;
  const { contact, balance } = summary;
  const todayStr = formatDateFR(getTodayISODate(), lang);

  const boxTotals = useMemo(() => {
    if (!isFiltered) {
      return {
        creditGiven: summary.totalCreditGiven,
        paymentReceived: summary.totalPaymentReceived,
        creditTaken: summary.totalCreditTaken,
        paymentMade: summary.totalPaymentMade,
      };
    }
    let creditGiven = 0;
    let paymentReceived = 0;
    let creditTaken = 0;
    let paymentMade = 0;
    for (const { transaction } of entries) {
      const amt = Math.abs(transaction.amount);
      if (transaction.type === 'credit_given') creditGiven += amt;
      else if (transaction.type === 'payment_received') paymentReceived += amt;
      else if (transaction.type === 'credit_taken') creditTaken += amt;
      else if (transaction.type === 'payment_made') paymentMade += amt;
    }
    return { creditGiven, paymentReceived, creditTaken, paymentMade };
  }, [isFiltered, summary, entries]);

  const balanceLabel =
    balance > 0
      ? s.balanceFavorable
      : balance < 0
        ? s.balancePayable
        : s.balanceZero;

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="bg-white text-slate-900">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-teal-700">
            {businessName?.trim() || s.defaultHeader}
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-slate-900">
            {s.title(contact.name)}
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            {s.categoryPrefix} {CATEGORY_LABELS[lang][contact.category]}
            {contact.phone ? ` • ${s.phonePrefix} ${contact.phone}` : ''}
          </p>
          {contact.note && (
            <p className="mt-0.5 text-xs text-slate-500">
              {s.notePrefix} {contact.note}
            </p>
          )}
        </div>

        <div className="text-end">
          <p className="text-xs text-slate-500">{s.issuedOn(todayStr)}</p>
          <div
            className={`mt-1.5 rounded-xl border px-3 py-2 ${
              balance > 0
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : balance < 0
                  ? 'border-rose-300 bg-rose-50 text-rose-800'
                  : 'border-slate-300 bg-slate-50 text-slate-800'
            }`}
          >
            <p className="text-[10px] font-bold uppercase">{balanceLabel}</p>
            <p dir="ltr" className="tabular-nums inline-block text-lg font-extrabold">
              {formatMAD(balance, {
                showSign: balance !== 0,
                alwaysDecimals: !hideDecimals,
                hideDecimals,
                lang,
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Totals strip */}
      {isFiltered && (
        <p className="mt-4 text-[11px] font-semibold text-teal-700">
          {s.periodTotalsBanner}
        </p>
      )}
      <div className={`${isFiltered ? 'mt-1.5' : 'mt-4'} grid grid-cols-2 gap-3 text-xs sm:grid-cols-4`}>
        <div className="rounded-lg border border-slate-200 p-2.5">
          <p className="text-slate-500">{s.creditGivenBox}</p>
          <p dir="ltr" className="tabular-nums mt-0.5 inline-block font-bold text-slate-900">
            {formatMAD(boxTotals.creditGiven, { lang, hideDecimals })}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-2.5">
          <p className="text-slate-500">{s.paymentReceivedBox}</p>
          <p dir="ltr" className="tabular-nums mt-0.5 inline-block font-bold text-slate-900">
            {formatMAD(boxTotals.paymentReceived, { lang, hideDecimals })}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-2.5">
          <p className="text-slate-500">{s.creditTakenBox}</p>
          <p dir="ltr" className="tabular-nums mt-0.5 inline-block font-bold text-slate-900">
            {formatMAD(boxTotals.creditTaken, { lang, hideDecimals })}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-2.5">
          <p className="text-slate-500">{s.paymentMadeBox}</p>
          <p dir="ltr" className="tabular-nums mt-0.5 inline-block font-bold text-slate-900">
            {formatMAD(boxTotals.paymentMade, { lang, hideDecimals })}
          </p>
        </div>
      </div>

      {showPreviousBalance && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <span className="font-semibold text-slate-600">{s.prevBalanceLabel}</span>
          <span dir="ltr" className="tabular-nums font-bold text-slate-900">
            {formatMAD(previousBalance, {
              showSign: previousBalance !== 0,
              lang,
              hideDecimals,
            })}
          </span>
        </div>
      )}

      {/* Ledger table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-start text-xs">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-100 text-[11px] font-bold uppercase text-slate-700">
              <th className="px-2.5 py-2">{s.colDate}</th>
              <th className="px-2.5 py-2">{s.colOp}</th>
              <th className="px-2.5 py-2">{s.colMethod}</th>
              <th className="px-2.5 py-2 text-end">{s.colAmount}</th>
              <th className="px-2.5 py-2 text-end">{s.colBalance}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2.5 py-6 text-center text-slate-500">
                  {s.noOps}
                </td>
              </tr>
            ) : (
              entries.map(({ transaction, signedAmount, runningBalance }) => {
                const { date, time } = formatDateTimeFR(transaction.occurredAt, lang);
                const typeShort = TX_TYPE_LABELS[lang][transaction.type].shortLabel;
                return (
                  <tr key={transaction.id}>
                    <td className="px-2.5 py-2 whitespace-nowrap text-slate-700">
                      <div>{date}</div>
                      {time && (
                        <div dir="ltr" className="text-[10px] text-slate-400">
                          {time}
                        </div>
                      )}
                    </td>
                    <td className="px-2.5 py-2">
                      <div className="font-semibold text-slate-900">
                        {typeShort}
                        {transaction.reference && (
                          <span className="ms-1 text-[10px] font-bold text-teal-700">
                            [{transaction.reference}]
                          </span>
                        )}
                        {transaction.isDiscount && (
                          <span className="ms-1 text-[10px] font-bold text-amber-700">
                            ({cd.discountBadge})
                          </span>
                        )}
                      </div>
                      {transaction.note && (
                        <div className="text-[11px] text-slate-500">
                          {transaction.note}
                        </div>
                      )}
                      {transaction.dueDate && (
                        <div className="text-[10px] text-slate-500">
                          {s.dueOn(formatDateFR(transaction.dueDate, lang))}
                        </div>
                      )}
                    </td>
                    <td className="px-2.5 py-2 whitespace-nowrap text-slate-600">
                      {PAYMENT_METHOD_LABELS[lang][transaction.paymentMethod]}
                    </td>
                    <td
                      className={`px-2.5 py-2 text-end font-bold whitespace-nowrap ${
                        signedAmount > 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      <span dir="ltr" className="tabular-nums inline-block">
                        {formatMAD(signedAmount, {
                          showSign: true,
                          lang,
                          hideDecimals,
                        })}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 text-end font-bold whitespace-nowrap text-slate-900">
                      <span dir="ltr" className="tabular-nums inline-block">
                        {formatMAD(runningBalance, {
                          showSign: runningBalance !== 0,
                          lang,
                          hideDecimals,
                        })}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-5 border-t border-slate-200 pt-3 text-[11px] text-slate-400">
        {s.footer(entries.length)}
      </p>
    </div>
  );
}

export function PrintableStatement({
  open,
  lang,
  hideDecimals = false,
  summary,
  entries,
  businessName,
  onClose,
}: PrintableStatementProps) {
  const { showToast } = useToast();
  const [rangeMode, setRangeMode] = useState<RangeMode>('all');
  const [customFrom, setCustomFrom] = useState(() => `${getTodayISODate().slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(() => getTodayISODate());
  const [sharing, setSharing] = useState(false);

  const { filteredEntries, previousBalance, showPrev } = useMemo(() => {
    if (rangeMode === 'all') {
      return { filteredEntries: entries, previousBalance: 0, showPrev: false };
    }
    const today = getTodayISODate();
    const fromDate = rangeMode === 'month' ? `${today.slice(0, 7)}-01` : customFrom;
    const toDate = rangeMode === 'month' ? today : customTo;

    let prevBal = 0;
    const inRange: LedgerEntryWithBalance[] = [];
    for (const item of entries) {
      const txDay = item.transaction.occurredAt.slice(0, 10);
      if (fromDate && txDay < fromDate) {
        prevBal = item.runningBalance;
        continue;
      }
      if (toDate && txDay > toDate) {
        continue;
      }
      inRange.push(item);
    }
    return {
      filteredEntries: inRange,
      previousBalance: prevBal,
      showPrev: Boolean(fromDate),
    };
  }, [entries, rangeMode, customFrom, customTo]);

  if (!open) return null;
  const s = UI_TEXT[lang].statement;

  const handleShareImage = async () => {
    setSharing(true);
    try {
      const blob = await generateStatementPngBlob({
        summary,
        entries: filteredEntries,
        businessName,
        lang,
        hideDecimals,
      });
      const safeSlug =
        summary.contact.name
          .toLowerCase()
          .replace(/[\\/:*?"<>|]/g, '-')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '') || 'contact';
      const fileName = `releve-${safeSlug}-${getTodayISODate()}.png`;

      if (await shareOrSaveNativeBinaryBlob(blob, fileName)) {
        return;
      }

      const file = new File([blob], fileName, { type: 'image/png' });

      if (
        typeof navigator !== 'undefined' &&
        navigator.canShare &&
        navigator.canShare({ files: [file] }) &&
        navigator.share
      ) {
        await navigator.share({
          files: [file],
          title: summary.contact.name,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast(s.sharingSuccess);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      showToast(s.sharingError, 'error');
    } finally {
      setSharing(false);
    }
  };

  return (
    <>
      <div
        className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-[2px] sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-preview-title"
      >
        <div className="animate-sheet-up flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl dark:border dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <div>
              <h2
                id="pdf-preview-title"
                className="text-base font-bold text-slate-900 dark:text-white"
              >
                {s.previewTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {s.previewHint}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              aria-label={s.close}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Date Range Filter Strip */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-800/50">
            {(['all', 'month', 'custom'] as RangeMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setRangeMode(mode)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                  rangeMode === mode
                    ? 'bg-teal-700 text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
                }`}
              >
                {mode === 'all'
                  ? s.rangeAll
                  : mode === 'month'
                    ? s.rangeMonth
                    : s.rangeCustom}
              </button>
            ))}
            {rangeMode === 'custom' && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <input
                  type="date"
                  dir="ltr"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <span className="text-slate-400">→</span>
                <input
                  type="date"
                  dir="ltr"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                {customFrom && customTo && customFrom > customTo && (
                  <p className="w-full text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                    {s.invalidDateOrder}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto bg-white p-5">
            <StatementContent
              lang={lang}
              hideDecimals={hideDecimals}
              summary={summary}
              entries={filteredEntries}
              previousBalance={previousBalance}
              showPreviousBalance={showPrev}
              isFiltered={rangeMode !== 'all'}
              businessName={businessName}
            />
          </div>

          <div className="flex flex-wrap gap-2 border-t border-slate-200 px-5 py-3.5 pb-safe dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[46px] rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {s.close}
            </button>
            <button
              type="button"
              disabled={sharing}
              onClick={handleShareImage}
              className="flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
            >
              <ImageIcon className="h-4 w-4" />
              <span>{s.shareImgBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => triggerNativePrint()}
              className="flex min-h-[46px] flex-[1.3] items-center justify-center gap-2 rounded-2xl bg-teal-700 px-3 text-xs font-bold text-white shadow-md hover:bg-teal-800"
            >
              <Printer className="h-4 w-4" />
              <span>{s.printBtn}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="print-only">
        <StatementContent
          lang={lang}
          hideDecimals={hideDecimals}
          summary={summary}
          entries={filteredEntries}
          previousBalance={previousBalance}
          showPreviousBalance={showPrev}
          isFiltered={rangeMode !== 'all'}
          businessName={businessName}
        />
      </div>
    </>
  );
}
