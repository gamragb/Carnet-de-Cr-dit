import {
  AlertCircle,
  Bell,
  BellRing,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Clock,
  MessageCircle,
  PlusCircle,
} from 'lucide-react';
import { useToast } from '../context/ToastContext.tsx';
import { TX_TYPE_LABELS, UI_TEXT } from '../i18n/translations.ts';
import type {
  AppLanguage,
  ContactSummary,
  DueItemStatus,
  TransactionType,
} from '../types/ledger.ts';
import { buildDueCalendarICS, triggerFileDownload } from '../utils/exportImport.ts';
import { formatDateFR, formatMAD, getTodayISODate } from '../utils/formatters.ts';
import { buildWhatsAppUrl } from '../utils/whatsapp.ts';

interface DeadlinesViewProps {
  dueItems: DueItemStatus[];
  summariesById: Map<string, ContactSummary>;
  hideAmounts: boolean;
  hideDecimals?: boolean;
  lang: AppLanguage;
  businessName?: string;
  whatsAppTemplate?: string;
  notificationsEnabled?: boolean;
  onEnableNotifications: () => Promise<boolean>;
  onOpenContact: (contactId: string) => void;
  onQuickSettle: (contactId: string, presetType: TransactionType) => void;
  onToggleDueResolved: (txId: string) => void;
}

export function DeadlinesView({
  dueItems,
  summariesById,
  hideAmounts,
  hideDecimals = false,
  lang,
  businessName,
  whatsAppTemplate,
  notificationsEnabled = false,
  onEnableNotifications,
  onOpenContact,
  onQuickSettle,
  onToggleDueResolved,
}: DeadlinesViewProps) {
  const { showToast } = useToast();
  const t = UI_TEXT[lang].deadlinesView;

  const overdue = dueItems
    .filter((d) => d.urgency === 'overdue')
    .sort((a, b) => a.daysDiff - b.daysDiff);
  const urgentSoon = dueItems
    .filter((d) => d.urgency === 'today' || d.urgency === 'soon')
    .sort((a, b) => a.daysDiff - b.daysDiff);
  const upcoming = dueItems
    .filter((d) => d.urgency === 'upcoming')
    .sort((a, b) => a.daysDiff - b.daysDiff);
  const settled = dueItems
    .filter((d) => d.urgency === 'settled')
    .sort((a, b) => (b.transaction.dueDate ?? '').localeCompare(a.transaction.dueDate ?? ''));

  const activeItems = dueItems.filter((d) => !d.isSettled);

  const handleEnableNotif = async () => {
    const granted = await onEnableNotifications();
    if (granted) {
      showToast(t.notifEnabledToast);
    } else {
      showToast(t.notifBlockedToast, 'error');
    }
  };

  const handleExportICS = (items: DueItemStatus[], suffix = 'echeances') => {
    const content = buildDueCalendarICS(items, lang);
    triggerFileDownload(
      content,
      `carnet-${suffix}-${getTodayISODate()}.ics`,
      'text/calendar;charset=utf-8'
    );
  };

  const renderCard = (item: DueItemStatus) => {
    const { transaction, contact, remainingAmount, daysDiff, urgency, isSettled } = item;
    const summary = summariesById.get(contact.id);
    const waHref = summary
      ? buildWhatsAppUrl(summary, businessName, lang, {
          hideDecimals,
          customTemplate: whatsAppTemplate,
        })
      : null;
    const typeShort = TX_TYPE_LABELS[lang][transaction.type].shortLabel;
    const settleType: TransactionType =
      transaction.type === 'credit_taken' || transaction.type === 'payment_received'
        ? 'payment_made'
        : 'payment_received';

    const badgeStyle =
      urgency === 'overdue'
        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
        : urgency === 'today' || urgency === 'soon'
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
          : urgency === 'settled'
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
            : 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300';

    const badgeText =
      urgency === 'overdue'
        ? t.overdueDays(Math.abs(daysDiff))
        : urgency === 'today'
          ? t.dueToday
          : urgency === 'settled'
            ? t.settled
            : t.inDays(daysDiff);

    return (
      <div
        key={transaction.id}
        className={`rounded-2xl border bg-white p-3.5 shadow-xs dark:bg-slate-900 ${
          urgency === 'overdue'
            ? 'border-rose-200 dark:border-rose-900'
            : urgency === 'today' || urgency === 'soon'
              ? 'border-amber-200 dark:border-amber-900'
              : 'border-slate-200/90 dark:border-slate-800'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onOpenContact(contact.id)}
            className="min-w-0 text-start"
          >
            <h4 className="truncate text-sm font-extrabold text-slate-900 hover:text-teal-700 dark:text-white dark:hover:text-teal-400">
              {contact.name}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {typeShort} • {t.dueLabel(formatDateFR(transaction.dueDate ?? '', lang))}
            </p>
            {transaction.note && (
              <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                {transaction.note}
              </p>
            )}
          </button>

          <div className="shrink-0 text-end">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${badgeStyle}`}
            >
              {urgency === 'overdue' ? (
                <AlertCircle className="h-3 w-3" />
              ) : urgency === 'settled' ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <Clock className="h-3 w-3" />
              )}
              {badgeText}
            </span>
            <p className="mt-1 text-sm font-extrabold text-slate-900 dark:text-white">
              {isSettled ? (
                <span dir="ltr" className="tabular-nums inline-block">
                  {formatMAD(transaction.amount, { masked: hideAmounts, hideDecimals, lang })}
                </span>
              ) : (
                t.remaining(
                  formatMAD(remainingAmount, { masked: hideAmounts, hideDecimals, lang })
                )
              )}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
          {!isSettled && (
            <button
              type="button"
              onClick={() => onQuickSettle(contact.id, settleType)}
              className="flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-50 px-2.5 text-xs font-bold text-teal-800 hover:bg-teal-100 dark:bg-teal-950/60 dark:text-teal-300"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>{t.settleBtn}</span>
            </button>
          )}

          {!isSettled && waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>{t.reminderWaBtn}</span>
            </a>
          )}

          {!isSettled && (
            <button
              type="button"
              onClick={() =>
                handleExportICS(
                  [item],
                  contact.name
                    .replace(/[\\/:*?"<>|]/g, '-')
                    .toLowerCase()
                    .replace(/\s+/g, '-') || 'echeance'
                )
              }
              title={t.addCalendarBtn}
              className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl bg-slate-100 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.addCalendarBtn}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onToggleDueResolved(transaction.id)}
            className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{isSettled ? t.reactivateBtn : t.markSettledBtn}</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
            {t.title}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleEnableNotif}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-bold transition ${
              notificationsEnabled
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'
            }`}
          >
            {notificationsEnabled ? (
              <BellRing className="h-3.5 w-3.5" />
            ) : (
              <Bell className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
            )}
            <span>
              {notificationsEnabled ? t.notifActiveBadge : t.enableNotifBtn}
            </span>
          </button>

          {activeItems.length > 0 && (
            <button
              type="button"
              onClick={() => handleExportICS(activeItems)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
              <CalendarPlus className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
              <span>{t.exportIcsBtn}</span>
            </button>
          )}
        </div>
      </div>

      {dueItems.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <CalendarClock className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">
            {t.emptyTitle}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.emptyDesc}</p>
        </div>
      ) : (
        <>
          {overdue.length > 0 && (
            <section className="space-y-2.5">
              <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                <span>{t.sectionOverdue}</span>
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] dark:bg-rose-950">
                  {overdue.length}
                </span>
              </h3>
              {overdue.map(renderCard)}
            </section>
          )}

          {urgentSoon.length > 0 && (
            <section className="space-y-2.5">
              <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                <span>{t.sectionWeek}</span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] dark:bg-amber-950">
                  {urgentSoon.length}
                </span>
              </h3>
              {urgentSoon.map(renderCard)}
            </section>
          )}

          {upcoming.length > 0 && (
            <section className="space-y-2.5">
              <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                <span>{t.sectionUpcoming}</span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] dark:bg-slate-800">
                  {upcoming.length}
                </span>
              </h3>
              {upcoming.map(renderCard)}
            </section>
          )}

          {settled.length > 0 && (
            <section className="space-y-2.5">
              <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                <span>{t.sectionSettled}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] dark:bg-emerald-950">
                  {settled.length}
                </span>
              </h3>
              {settled.map(renderCard)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
