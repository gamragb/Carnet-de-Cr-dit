import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDownUp,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Copy,
  Edit3,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { PrintableStatement } from '../components/PrintableStatement.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  TX_TYPE_LABELS,
  UI_TEXT,
} from '../i18n/translations.ts';
import type {
  AppLanguage,
  Contact,
  ContactSummary,
  LedgerEntryWithBalance,
  Transaction,
  TransactionType,
} from '../types/ledger.ts';
import {
  copyTextSafe,
  formatDateFR,
  formatDateTimeFR,
  formatMAD,
  toTelHref,
} from '../utils/formatters.ts';
import {
  buildSingleTxWhatsAppUrl,
  buildWhatsAppReminderMessage,
  buildWhatsAppUrl,
} from '../utils/whatsapp.ts';

interface ContactDetailViewProps {
  summary: ContactSummary;
  entries: LedgerEntryWithBalance[];
  hideAmounts: boolean;
  hideDecimals?: boolean;
  lang: AppLanguage;
  businessName?: string;
  whatsAppTemplate?: string;
  onBack: () => void;
  onEditContact: (contact: Contact) => void;
  onToggleArchiveContact: (contact: Contact) => void;
  onDeleteContact: (contact: Contact) => void;
  onAddTransaction: (
    contactId: string,
    presetType?: TransactionType,
    presetAmount?: number | null,
    presetNote?: string
  ) => void;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (tx: Transaction) => void;
  onToggleDueResolved: (txId: string) => void;
}

type HistoryFilterType = 'all' | 'credits' | 'payments';

export function ContactDetailView({
  summary,
  entries,
  hideAmounts,
  hideDecimals = false,
  lang,
  businessName,
  whatsAppTemplate,
  onBack,
  onEditContact,
  onToggleArchiveContact,
  onDeleteContact,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onToggleDueResolved,
}: ContactDetailViewProps) {
  const { showToast } = useToast();
  const t = UI_TEXT[lang].contactDetail;
  const [newestFirst, setNewestFirst] = useState(true);
  const [showStatement, setShowStatement] = useState(false);

  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<HistoryFilterType>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const { contact, balance } = summary;
  const telHref = toTelHref(contact.phone);
  const waHref = buildWhatsAppUrl(summary, businessName, lang, {
    hideDecimals,
    customTemplate: whatsAppTemplate,
  });

  const filteredEntries = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    const list = entries.filter(({ transaction }) => {
      if (
        txTypeFilter === 'credits' &&
        transaction.type !== 'credit_given' &&
        transaction.type !== 'credit_taken'
      ) {
        return false;
      }
      if (
        txTypeFilter === 'payments' &&
        transaction.type !== 'payment_received' &&
        transaction.type !== 'payment_made'
      ) {
        return false;
      }
      const day = transaction.occurredAt.slice(0, 10);
      const minDate =
        dateFrom && dateTo && dateFrom > dateTo ? dateTo : dateFrom;
      const maxDate =
        dateFrom && dateTo && dateFrom > dateTo ? dateFrom : dateTo;
      if (minDate && day < minDate) return false;
      if (maxDate && day > maxDate) return false;
      if (q) {
        const noteMatch = transaction.note.toLowerCase().includes(q);
        const refMatch = (transaction.reference ?? '').toLowerCase().includes(q);
        const methodMatch = PAYMENT_METHOD_LABELS[lang][transaction.paymentMethod]
          .toLowerCase()
          .includes(q);
        if (!noteMatch && !refMatch && !methodMatch) return false;
      }
      return true;
    });
    return newestFirst ? [...list].reverse() : list;
  }, [entries, newestFirst, txSearch, txTypeFilter, dateFrom, dateTo, lang]);

  const hasActiveFilters = Boolean(
    txSearch.trim() || txTypeFilter !== 'all' || dateFrom || dateTo
  );

  const balanceCardTheme =
    balance > 0
      ? 'from-emerald-700 to-teal-900'
      : balance < 0
        ? 'from-rose-700 to-rose-950'
        : 'from-slate-700 to-slate-900';

  const balanceExplanation =
    balance > 0
      ? t.owesYouText(contact.name)
      : balance < 0
        ? t.youOweText(contact.name)
        : t.settledText;

  const handleCopyWhatsApp = async () => {
    const text = buildWhatsAppReminderMessage(summary, businessName, lang, {
      hideDecimals,
      customTemplate: whatsAppTemplate,
    });
    const ok = await copyTextSafe(text);
    if (ok) {
      showToast(t.copiedToast, 'info');
    } else {
      showToast(t.copyFailToast, 'error');
    }
  };

  const creditLimitPct =
    contact.creditLimit && contact.creditLimit > 0 && balance > 0
      ? Math.min(100, Math.round((balance / contact.creditLimit) * 100))
      : 0;

  return (
    <div className="space-y-4">
      {/* Sticky Sub-Header */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {t.back}
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggleArchiveContact(contact)}
            title={contact.archived ? t.unarchiveBtn : t.archiveBtn}
            aria-label={contact.archived ? t.unarchiveBtn : t.archiveBtn}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            {contact.archived ? (
              <ArchiveRestore className="h-4 w-4 text-teal-600" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => onEditContact(contact)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            aria-label={t.editContactAria}
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDeleteContact(contact)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-400"
            aria-label={t.deleteContactAria}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Contact Profile & Running Balance */}
      <section
        className={`rounded-3xl bg-gradient-to-br ${balanceCardTheme} p-5 text-white shadow-lg`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold">
                {CATEGORY_LABELS[lang][contact.category]}
              </span>
              {contact.archived && (
                <span className="inline-flex rounded-full bg-amber-400/25 px-2.5 py-0.5 text-[11px] font-bold text-amber-200">
                  {t.archivedBadge}
                </span>
              )}
            </div>
            <h2 className="mt-1.5 truncate text-xl font-extrabold">{contact.name}</h2>
            {contact.phone && (
              <p dir="ltr" className="mt-0.5 inline-block text-xs font-medium text-white/80">
                {contact.phone}
              </p>
            )}
            {contact.note && (
              <p className="mt-1 text-xs text-white/75">{contact.note}</p>
            )}
          </div>
          <span className="shrink-0 rounded-xl bg-white/15 px-2.5 py-1 text-xs font-bold">
            {t.opsCount(summary.transactionCount)}
          </span>
        </div>

        <div className="mt-4 rounded-2xl bg-black/20 p-3.5 backdrop-blur-xs">
          <p className="text-xs font-medium text-white/80">{balanceExplanation}</p>
          <p
            dir="ltr"
            className="tabular-nums mt-1 inline-block text-3xl font-extrabold tracking-tight"
          >
            {formatMAD(balance, {
              showSign: balance !== 0,
              masked: hideAmounts,
              hideDecimals,
              lang,
            })}
          </p>
        </div>

        {contact.creditLimit && contact.creditLimit > 0 && (
          <div className="mt-3 rounded-xl bg-black/15 p-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-white/85">
                {t.creditLimitLabel(
                  formatMAD(contact.creditLimit, {
                    masked: hideAmounts,
                    hideDecimals,
                    lang,
                  }),
                  creditLimitPct
                )}
              </span>
              {summary.isOverCreditLimit && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-slate-900">
                  <AlertTriangle className="h-3 w-3" />
                  {t.creditLimitExceeded}
                </span>
              )}
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className={`h-full rounded-full transition-all ${
                  summary.isOverCreditLimit ? 'bg-amber-400' : 'bg-white'
                }`}
                style={{ width: `${creditLimitPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Sub-totals */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-xl bg-white/10 px-3 py-2">
            <span className="text-white/70">{t.givenPaidLabel}</span>
            <p dir="ltr" className="tabular-nums inline-block font-bold">
              {formatMAD(summary.totalCreditGiven + summary.totalPaymentMade, {
                masked: hideAmounts,
                hideDecimals,
                lang,
              })}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2">
            <span className="text-white/70">{t.receivedTakenLabel}</span>
            <p dir="ltr" className="tabular-nums inline-block font-bold">
              {formatMAD(summary.totalPaymentReceived + summary.totalCreditTaken, {
                masked: hideAmounts,
                hideDecimals,
                lang,
              })}
            </p>
          </div>
        </div>

        {summary.totalDiscounts > 0 && (
          <div className="mt-2 rounded-xl bg-amber-400/20 px-3 py-1.5 text-[11px] font-bold text-amber-100">
            {t.discountsSummary(
              formatMAD(summary.totalDiscounts, {
                masked: hideAmounts,
                hideDecimals,
                lang,
              })
            )}
          </div>
        )}
      </section>

      {/* Quick Actions Grid */}
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => onAddTransaction(contact.id)}
          className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl bg-teal-700 px-3 text-xs font-bold text-white shadow-sm hover:bg-teal-800 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          <span>{t.operationBtn}</span>
        </button>

        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100 active:scale-[0.98] dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
          >
            <MessageCircle className="h-4 w-4" />
            <span>{t.reminderWaBtn}</span>
          </a>
        ) : (
          <button
            type="button"
            onClick={handleCopyWhatsApp}
            className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <Copy className="h-4 w-4" />
            <span>{t.copyReminderBtn}</span>
          </button>
        )}

        {telHref ? (
          <a
            href={telHref}
            className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50 active:scale-[0.98] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <Phone className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            <span>{t.callBtn}</span>
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-100 px-3 text-xs font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500"
          >
            <Phone className="h-4 w-4" />
            <span>{t.noPhoneBtn}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowStatement(true)}
          className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50 active:scale-[0.98] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
          <FileText className="h-4 w-4 text-slate-600 dark:text-slate-300" />
          <span>{t.pdfBtn}</span>
        </button>
      </section>

      {/* Quick Partial or Full Settlement Shortcut */}
      {balance !== 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-teal-200 bg-teal-50/70 px-3.5 py-2.5 dark:border-teal-900 dark:bg-teal-950/40">
          <span className="text-xs font-semibold text-teal-900 dark:text-teal-200">
            {balance > 0 ? t.quickSettleCollectPrompt : t.quickSettlePayPrompt}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                onAddTransaction(
                  contact.id,
                  balance > 0 ? 'payment_received' : 'payment_made'
                )
              }
              className="shrink-0 rounded-xl border border-teal-300 bg-white px-2.5 py-1.5 text-xs font-bold text-teal-800 transition hover:bg-teal-100 dark:border-teal-800 dark:bg-slate-900 dark:text-teal-300"
            >
              {balance > 0 ? t.collectBtn : t.payBtn}
            </button>
            <button
              type="button"
              onClick={() =>
                onAddTransaction(
                  contact.id,
                  balance > 0 ? 'payment_received' : 'payment_made',
                  Math.abs(balance),
                  UI_TEXT[lang].txModal.fullSettleNote
                )
              }
              className="shrink-0 rounded-xl bg-teal-700 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-teal-800 active:scale-[0.98]"
            >
              {t.settleFullBtn}
            </button>
          </div>
        </div>
      )}

      {/* Ledger History Header + Filters */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
            {t.historyTitle(filteredEntries.length)}
          </h3>
          <div className="flex items-center gap-2">
            {waHref && (
              <button
                type="button"
                onClick={handleCopyWhatsApp}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              >
                <Copy className="h-3 w-3" />
                {t.copyMsgBtn}
              </button>
            )}
            <button
              type="button"
              onClick={() => setNewestFirst((v) => !v)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
              <ArrowDownUp className="h-3 w-3 text-teal-700 dark:text-teal-400" />
              {newestFirst ? t.newestFirst : t.oldestFirst}
            </button>
          </div>
        </div>

        {entries.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 start-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 ps-9 pe-8 text-xs font-medium text-slate-900 outline-none focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              {txSearch && (
                <button
                  type="button"
                  onClick={() => setTxSearch('')}
                  className="absolute top-1/2 end-2 -translate-y-1/2 rounded-full p-1 text-slate-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1.5">
                {(['all', 'credits', 'payments'] as HistoryFilterType[]).map((ft) => (
                  <button
                    key={ft}
                    type="button"
                    onClick={() => setTxTypeFilter(ft)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                      txTypeFilter === ft
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {ft === 'all'
                      ? t.filterAll
                      : ft === 'credits'
                        ? t.filterCredits
                        : t.filterPayments}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <label className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                  <span className="font-bold">{t.dateFrom}</span>
                  <input
                    type="date"
                    dir="ltr"
                    aria-label={t.dateFrom}
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </label>
                <label className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                  <span className="font-bold">{t.dateTo}</span>
                  <input
                    type="date"
                    dir="ltr"
                    aria-label={t.dateTo}
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </label>
              </div>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setTxSearch('');
                  setTxTypeFilter('all');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="text-[11px] font-bold text-teal-700 hover:underline dark:text-teal-400"
              >
                {t.clearFilters}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Transactions List */}
      {filteredEntries.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {hasActiveFilters ? t.noOpsFilteredTitle : t.noOpsTitle(contact.name)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.noOpsDesc}</p>
          <button
            type="button"
            onClick={() => onAddTransaction(contact.id)}
            className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl bg-teal-700 px-4 text-xs font-bold text-white"
          >
            <Plus className="h-4 w-4" />
            {t.addOpBtn}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredEntries.map(({ transaction, signedAmount, runningBalance, dueStatus }) => {
            const typeLabel = TX_TYPE_LABELS[lang][transaction.type].label;
            const { date, time } = formatDateTimeFR(transaction.occurredAt, lang);
            const isPositiveFlow = signedAmount > 0;
            const txWaHref = buildSingleTxWhatsAppUrl(
              summary,
              transaction,
              businessName,
              lang,
              hideDecimals
            );

            return (
              <div
                key={transaction.id}
                className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                          transaction.type === 'credit_given'
                            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : transaction.type === 'payment_received'
                              ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                              : transaction.type === 'credit_taken'
                                ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                : 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                        }`}
                      >
                        {typeLabel}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {PAYMENT_METHOD_LABELS[lang][transaction.paymentMethod]}
                      </span>
                      {transaction.isDiscount && (
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          {t.discountBadge}
                        </span>
                      )}
                      {transaction.reference && (
                        <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                          {t.refBadge(transaction.reference)}
                        </span>
                      )}
                    </div>

                    {transaction.note && (
                      <p className="mt-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {transaction.note}
                      </p>
                    )}

                    <p className="mt-1 text-xs text-slate-400">
                      {t.atTime(date, time)}
                    </p>

                    {transaction.attachmentDataUrl && (
                      <button
                        type="button"
                        onClick={() => setPreviewImageUrl(transaction.attachmentDataUrl ?? null)}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <ImageIcon className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                        <span>{t.attachmentBtn}</span>
                      </button>
                    )}
                  </div>

                  <div className="shrink-0 text-end">
                    <p
                      dir="ltr"
                      className={`tabular-nums inline-block text-base font-extrabold ${
                        isPositiveFlow
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {formatMAD(signedAmount, {
                        showSign: true,
                        masked: hideAmounts,
                        hideDecimals,
                        lang,
                      })}
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {t.balanceAfter}{' '}
                      <span dir="ltr" className="tabular-nums inline-block">
                        {formatMAD(runningBalance, {
                          showSign: runningBalance !== 0,
                          masked: hideAmounts,
                          hideDecimals,
                          lang,
                        })}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Due date + Actions footer */}
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                  <div>
                    {dueStatus ? (
                      <button
                        type="button"
                        onClick={() => onToggleDueResolved(transaction.id)}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                          dueStatus.isSettled
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : dueStatus.urgency === 'overdue'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                              : dueStatus.urgency === 'today' || dueStatus.urgency === 'soon'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {dueStatus.isSettled ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            {t.dueSettled(
                              formatDateFR(transaction.dueDate ?? '', lang)
                            )}
                          </>
                        ) : (
                          <>
                            <Calendar className="h-3 w-3" />
                            {t.dueDateLabel(
                              formatDateFR(transaction.dueDate ?? '', lang)
                            )}
                            {dueStatus.urgency === 'overdue' &&
                              t.overdueSuffix(Math.abs(dueStatus.daysDiff))}
                          </>
                        )}
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">
                        {t.noDueDate}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {txWaHref && (
                      <a
                        href={txWaHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t.singleWaTitle}
                        aria-label={t.singleWaTitle}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => onEditTransaction(transaction)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-slate-100 px-2.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Pencil className="h-3 w-3" />
                      {t.editBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTransaction(transaction)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-rose-50 px-2.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300"
                    >
                      <Trash2 className="h-3 w-3" />
                      {t.deleteBtn}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {previewImageUrl && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative max-h-[90dvh] max-w-lg" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              aria-label={t.closeImage}
              className="absolute -top-11 end-0 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={previewImageUrl}
              alt={t.attachmentBtn}
              className="max-h-[80dvh] w-auto rounded-2xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      <PrintableStatement
        open={showStatement}
        lang={lang}
        hideDecimals={hideDecimals}
        summary={summary}
        entries={entries}
        businessName={businessName}
        onClose={() => setShowStatement(false)}
      />
    </div>
  );
}
