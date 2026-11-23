import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  ChevronRight,
  Clock,
  HardDriveDownload,
  Pencil,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { AnalyticsPanel } from '../components/AnalyticsPanel.tsx';
import { ContactCard } from '../components/ContactCard.tsx';
import { SummaryCards } from '../components/SummaryCards.tsx';
import {
  CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  TX_TYPE_LABELS,
  UI_TEXT,
} from '../i18n/translations.ts';
import type {
  AnalyticsSnapshot,
  AppLanguage,
  ContactSummary,
  DashboardFilter,
  GlobalTotals,
  Transaction,
} from '../types/ledger.ts';
import {
  daysBetweenISODates,
  formatDateTimeFR,
  formatMAD,
  roundMoney,
} from '../utils/formatters.ts';

interface DashboardViewProps {
  totals: GlobalTotals;
  analytics: AnalyticsSnapshot;
  filteredSummaries: ContactSummary[];
  summariesById: Map<string, ContactSummary>;
  transactions: Transaction[];
  todayISO: string;
  allContactsCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  filter: DashboardFilter;
  onFilterChange: (filter: DashboardFilter) => void;
  hideAmounts: boolean;
  hideDecimals?: boolean;
  lang: AppLanguage;
  businessName?: string;
  whatsAppTemplate?: string;
  backupReminderDays: number | null;
  onBackupNow: () => void;
  onDismissBackupReminder: () => void;
  onOpenContact: (contactId: string) => void;
  onQuickOperation: (contactId: string) => void;
  onEditTransaction: (tx: Transaction) => void;
  onOpenDeadlines: () => void;
  onAddContact: () => void;
  onOpenGlobalReport: () => void;
}

type JournalRange = 'today' | 'yesterday' | '7days' | 'all' | 'custom';

function offsetISODate(baseISO: string, offsetDays: number): string {
  const [y, m, d] = baseISO.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return baseISO.slice(0, 10);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + offsetDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function DashboardView({
  totals,
  analytics,
  filteredSummaries,
  summariesById,
  transactions,
  todayISO,
  allContactsCount,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  hideAmounts,
  hideDecimals = false,
  lang,
  businessName,
  whatsAppTemplate,
  backupReminderDays,
  onBackupNow,
  onDismissBackupReminder,
  onOpenContact,
  onQuickOperation,
  onEditTransaction,
  onOpenDeadlines,
  onAddContact,
  onOpenGlobalReport,
}: DashboardViewProps) {
  const t = UI_TEXT[lang].dashboard;
  const rootUi = UI_TEXT[lang];
  const [mode, setMode] = useState<'ledger' | 'journal' | 'analytics'>('ledger');
  const [journalRange, setJournalRange] = useState<JournalRange>('today');
  const [customDate, setCustomDate] = useState<string>(todayISO);

  const yesterdayISO = useMemo(() => offsetISODate(todayISO, -1), [todayISO]);

  // Active (non-archived) transactions for today's summary strip & journal
  const activeTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const s = summariesById.get(tx.contactId);
      return Boolean(s && !s.contact.archived);
    });
  }, [transactions, summariesById]);

  const todayStats = useMemo(() => {
    let count = 0;
    let collected = 0;
    let credited = 0;
    for (const tx of activeTransactions) {
      if (tx.occurredAt.slice(0, 10) !== todayISO) continue;
      count += 1;
      if (tx.type === 'payment_received') {
        collected = roundMoney(collected + tx.amount);
      } else if (tx.type === 'credit_given') {
        credited = roundMoney(credited + tx.amount);
      }
    }
    return { count, collected, credited };
  }, [activeTransactions, todayISO]);

  const journalEntries = useMemo(() => {
    const filtered = activeTransactions.filter((tx) => {
      const day = tx.occurredAt.slice(0, 10);
      if (journalRange === 'today') return day === todayISO;
      if (journalRange === 'yesterday') return day === yesterdayISO;
      if (journalRange === '7days') {
        const diff = daysBetweenISODates(day, todayISO);
        return diff >= 0 && diff <= 6;
      }
      if (journalRange === 'custom') return day === customDate;
      return true;
    });
    return [...filtered].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [activeTransactions, journalRange, todayISO, yesterdayISO, customDate]);

  const journalTotals = useMemo(() => {
    let collected = 0;
    let credited = 0;
    for (const tx of journalEntries) {
      if (tx.type === 'payment_received' || tx.type === 'payment_made') {
        collected = roundMoney(collected + tx.amount);
      } else {
        credited = roundMoney(credited + tx.amount);
      }
    }
    return { collected, credited };
  }, [journalEntries]);

  const filterTabs: Array<{
    id: DashboardFilter;
    label: string;
    count: number;
  }> = [
    {
      id: 'all',
      label: t.tabAll,
      count: allContactsCount,
    },
    {
      id: 'receivable',
      label: t.tabReceivable,
      count: totals.receivableCount,
    },
    {
      id: 'payable',
      label: t.tabPayable,
      count: totals.payableCount,
    },
    {
      id: 'overdue',
      label: t.tabOverdue,
      count: totals.overdueContactsCount,
    },
  ];

  const urgentCount = totals.overdueItemsCount + totals.soonItemsCount;

  return (
    <div className="space-y-4">
      {/* 3-Tab Mode Switcher: Carnet | Journal | Statistiques */}
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-200/80 bg-white p-1 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setMode('ledger')}
          className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold transition ${
            mode === 'ledger'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <BookOpenCheck className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t.overviewTab}</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('journal')}
          className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold transition ${
            mode === 'journal'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t.journalTab}</span>
          {todayStats.count > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                mode === 'journal'
                  ? 'bg-white/20 text-white'
                  : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
              }`}
            >
              {todayStats.count}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setMode('analytics')}
          className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold transition ${
            mode === 'analytics'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t.analyticsTab}</span>
        </button>
      </div>

      {/* Weekly Backup Reminder */}
      {backupReminderDays !== null && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-teal-200 bg-teal-50/80 p-3 text-xs dark:border-teal-900 dark:bg-teal-950/40">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-teal-950 dark:text-teal-200">
            <HardDriveDownload className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
            <span className="font-semibold">
              {rootUi.backupReminderBanner(backupReminderDays)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onBackupNow}
              className="rounded-xl bg-teal-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-teal-800"
            >
              {rootUi.backupNowBtn}
            </button>
            <button
              type="button"
              onClick={onDismissBackupReminder}
              className="rounded-xl px-2 py-1.5 text-[11px] font-bold text-teal-800 hover:bg-teal-100 dark:text-teal-300 dark:hover:bg-teal-900/60"
            >
              {rootUi.dismissBtn}
            </button>
          </div>
        </div>
      )}

      {mode === 'analytics' ? (
        <AnalyticsPanel
          analytics={analytics}
          hideAmounts={hideAmounts}
          hideDecimals={hideDecimals}
          lang={lang}
          onOpenContact={onOpenContact}
          onOpenGlobalReport={onOpenGlobalReport}
        />
      ) : mode === 'journal' ? (
        <div className="space-y-3.5">
          {/* Date Period Filter Pills + Date Input */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'today', label: t.journalFilterToday },
                  { id: 'yesterday', label: t.journalFilterYesterday },
                  { id: '7days', label: t.journalFilter7Days },
                  { id: 'all', label: t.journalFilterAll },
                ] as Array<{ id: JournalRange; label: string }>
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setJournalRange(item.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    journalRange === item.id
                      ? 'bg-teal-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <CalendarDays className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
              <input
                type="date"
                dir="ltr"
                value={customDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setCustomDate(e.target.value);
                    setJournalRange('custom');
                  }
                }}
                className="bg-transparent text-[11px] font-bold text-slate-800 outline-none dark:text-slate-200"
              />
            </label>
          </div>

          {/* Period Summary Cards */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3.5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                <ArrowDownLeft className="h-4 w-4 shrink-0" />
                <span className="truncate">{t.journalCollectedCard}</span>
              </div>
              <p
                dir="ltr"
                className="tabular-nums mt-1.5 inline-block text-lg font-extrabold text-emerald-900 dark:text-emerald-200"
              >
                {formatMAD(journalTotals.collected, {
                  masked: hideAmounts,
                  hideDecimals,
                  lang,
                })}
              </p>
            </div>

            <div className="rounded-2xl border border-rose-200/80 bg-rose-50/70 p-3.5 dark:border-rose-900/50 dark:bg-rose-950/30">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800 dark:text-rose-300">
                <ArrowUpRight className="h-4 w-4 shrink-0" />
                <span className="truncate">{t.journalCreditedCard}</span>
              </div>
              <p
                dir="ltr"
                className="tabular-nums mt-1.5 inline-block text-lg font-extrabold text-rose-900 dark:text-rose-200"
              >
                {formatMAD(journalTotals.credited, {
                  masked: hideAmounts,
                  hideDecimals,
                  lang,
                })}
              </p>
            </div>
          </div>

          {/* Journal Entries List */}
          {journalEntries.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {t.journalEmptyTitle}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t.journalEmptyDesc}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {journalEntries.map((tx) => {
                const contactSummary = summariesById.get(tx.contactId);
                if (!contactSummary) return null;
                const { contact } = contactSummary;
                const typeLabel = TX_TYPE_LABELS[lang][tx.type].label;
                const { date, time } = formatDateTimeFR(tx.occurredAt, lang);
                const isPayment =
                  tx.type === 'payment_received' || tx.type === 'payment_made';

                return (
                  <div
                    key={tx.id}
                    className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs transition hover:border-teal-300 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <button
                        type="button"
                        onClick={() => onOpenContact(contact.id)}
                        className="min-w-0 flex-1 text-start"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-extrabold text-slate-900 hover:text-teal-700 dark:text-white dark:hover:text-teal-400">
                            {contact.name}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {CATEGORY_LABELS[lang][contact.category]}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                              tx.type === 'credit_given'
                                ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                : tx.type === 'payment_received'
                                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : tx.type === 'credit_taken'
                                    ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                    : 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                            }`}
                          >
                            {typeLabel}
                          </span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {PAYMENT_METHOD_LABELS[lang][tx.paymentMethod]}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {time ? `${date} • ${time}` : date}
                          </span>
                        </div>

                        {tx.note && (
                          <p className="mt-1 truncate text-xs font-medium text-slate-600 dark:text-slate-300">
                            {tx.note}
                          </p>
                        )}
                      </button>

                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <p
                          dir="ltr"
                          className={`tabular-nums text-sm font-extrabold ${
                            isPayment
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {formatMAD(tx.amount, {
                            masked: hideAmounts,
                            hideDecimals,
                            lang,
                          })}
                        </p>
                        <button
                          type="button"
                          onClick={() => onEditTransaction(tx)}
                          className="inline-flex h-7 items-center gap-1 rounded-lg bg-slate-100 px-2 text-[10px] font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>{UI_TEXT[lang].contactDetail.editBtn}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          <SummaryCards
            totals={totals}
            hideAmounts={hideAmounts}
            hideDecimals={hideDecimals}
            lang={lang}
            onQuickFilter={(nextFilter) => onFilterChange(nextFilter)}
          />

          {/* Compact Today's Activity Strip (when operations occurred today) */}
          {todayStats.count > 0 && (
            <button
              type="button"
              onClick={() => {
                setJournalRange('today');
                setMode('journal');
              }}
              className="flex w-full items-center justify-between gap-2 rounded-2xl border border-teal-200/80 bg-white px-3.5 py-2.5 text-start shadow-xs transition hover:border-teal-400 hover:bg-teal-50/40 active:scale-[0.99] dark:border-teal-900/60 dark:bg-slate-900"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-extrabold text-teal-800 dark:text-teal-300">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>{t.todayActivityTitle(todayStats.count)}</span>
                </span>
                {todayStats.collected > 0 && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {t.todayCollectedPill(
                      formatMAD(todayStats.collected, {
                        masked: hideAmounts,
                        hideDecimals,
                        lang,
                      })
                    )}
                  </span>
                )}
                {todayStats.credited > 0 && (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                    {t.todayCreditedPill(
                      formatMAD(todayStats.credited, {
                        masked: hideAmounts,
                        hideDecimals,
                        lang,
                      })
                    )}
                  </span>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 rtl:rotate-180" />
            </button>
          )}

          {/* Urgent Deadlines Banner */}
          {urgentCount > 0 && (
            <button
              type="button"
              onClick={onOpenDeadlines}
              className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3.5 text-start transition active:scale-[0.99] ${
                totals.overdueItemsCount > 0
                  ? 'border-rose-200 bg-rose-50/90 text-rose-900 hover:bg-rose-50 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200'
                  : 'border-amber-200 bg-amber-50/90 text-amber-900 hover:bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    totals.overdueItemsCount > 0
                      ? 'bg-rose-600 text-white'
                      : 'bg-amber-500 text-white'
                  }`}
                >
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold uppercase tracking-wide">
                    {t.urgentDeadlines(urgentCount)}
                  </p>
                  <p className="truncate text-xs opacity-85">
                    {totals.overdueItemsCount > 0
                      ? t.overdueCount(totals.overdueItemsCount)
                      : ''}
                    {totals.overdueItemsCount > 0 && totals.soonItemsCount > 0
                      ? ' • '
                      : ''}
                    {totals.soonItemsCount > 0
                      ? t.soonCount(totals.soonItemsCount)
                      : ''}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 opacity-70 rtl:rotate-180" />
            </button>
          )}

          {/* Search & Filter Tabs */}
          <section aria-label={t.searchPlaceholder} className="space-y-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 start-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 ps-10 pe-10 text-sm font-medium text-slate-900 shadow-xs outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  aria-label={t.clearSearch}
                  className="absolute top-1/2 end-2.5 -translate-y-1/2 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {filterTabs.map((tab) => {
                const active = filter === tab.id;
                const isOverdueTab = tab.id === 'overdue' && tab.count > 0;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onFilterChange(tab.id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition ${
                      active
                        ? tab.id === 'overdue'
                          ? 'border-rose-600 bg-rose-600 text-white shadow-xs'
                          : tab.id === 'receivable'
                            ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                            : tab.id === 'payable'
                              ? 'border-rose-600 bg-rose-600 text-white shadow-xs'
                              : 'border-slate-900 bg-slate-900 text-white shadow-xs dark:border-teal-600 dark:bg-teal-700'
                        : isOverdueTab
                          ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Contact List */}
          <section className="space-y-3">
            {filteredSummaries.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  {allContactsCount === 0 ? t.emptyTitle : t.emptyFilteredTitle}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {allContactsCount === 0 ? t.emptyDesc : t.emptyFilteredDesc}
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  {allContactsCount === 0 ? (
                    <button
                      type="button"
                      onClick={onAddContact}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-teal-700 px-4 text-xs font-bold text-white shadow-sm hover:bg-teal-800"
                    >
                      <UserPlus className="h-4 w-4" />
                      {t.addPerson}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onSearchChange('');
                        onFilterChange('all');
                      }}
                      className="inline-flex min-h-[42px] items-center rounded-2xl bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-800 dark:bg-slate-700"
                    >
                      {t.resetFilters}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              filteredSummaries.map((summary) => (
                <ContactCard
                  key={summary.contact.id}
                  summary={summary}
                  hideAmounts={hideAmounts}
                  hideDecimals={hideDecimals}
                  lang={lang}
                  businessName={businessName}
                  whatsAppTemplate={whatsAppTemplate}
                  onOpenDetail={onOpenContact}
                  onQuickOperation={onQuickOperation}
                />
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
