import { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  ChevronRight,
  HardDriveDownload,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { AnalyticsPanel } from '../components/AnalyticsPanel.tsx';
import { ContactCard } from '../components/ContactCard.tsx';
import { SummaryCards } from '../components/SummaryCards.tsx';
import { UI_TEXT } from '../i18n/translations.ts';
import type {
  AnalyticsSnapshot,
  AppLanguage,
  ContactSummary,
  DashboardFilter,
  GlobalTotals,
} from '../types/ledger.ts';

interface DashboardViewProps {
  totals: GlobalTotals;
  analytics: AnalyticsSnapshot;
  filteredSummaries: ContactSummary[];
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
  onOpenDeadlines: () => void;
  onAddContact: () => void;
  onOpenGlobalReport: () => void;
}

export function DashboardView({
  totals,
  analytics,
  filteredSummaries,
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
  onOpenDeadlines,
  onAddContact,
  onOpenGlobalReport,
}: DashboardViewProps) {
  const t = UI_TEXT[lang].dashboard;
  const rootUi = UI_TEXT[lang];
  const [mode, setMode] = useState<'ledger' | 'analytics'>('ledger');

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
      {/* Mode Switcher: Carnet vs Statistiques */}
      <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-slate-200/80 bg-white p-1 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setMode('ledger')}
          className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition ${
            mode === 'ledger'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <BookOpenCheck className="h-3.5 w-3.5" />
          <span>{t.overviewTab}</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('analytics')}
          className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition ${
            mode === 'analytics'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          <span>{t.analyticsTab}</span>
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
      ) : (
        <>
          <SummaryCards
            totals={totals}
            hideAmounts={hideAmounts}
            hideDecimals={hideDecimals}
            lang={lang}
            onQuickFilter={(nextFilter) => onFilterChange(nextFilter)}
          />

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
