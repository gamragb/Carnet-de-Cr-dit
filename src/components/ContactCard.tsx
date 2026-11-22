import {
  AlertCircle,
  AlertTriangle,
  Clock,
  MessageCircle,
  Phone,
  PlusCircle,
} from 'lucide-react';
import { CATEGORY_LABELS, UI_TEXT } from '../i18n/translations.ts';
import type {
  AppLanguage,
  ContactCategory,
  ContactSummary,
} from '../types/ledger.ts';
import {
  formatDateFR,
  formatMAD,
  getInitials,
  toTelHref,
} from '../utils/formatters.ts';
import { buildWhatsAppUrl } from '../utils/whatsapp.ts';

interface ContactCardProps {
  summary: ContactSummary;
  hideAmounts: boolean;
  hideDecimals?: boolean;
  lang: AppLanguage;
  businessName?: string;
  whatsAppTemplate?: string;
  onOpenDetail: (contactId: string) => void;
  onQuickOperation: (contactId: string) => void;
}

const CATEGORY_STYLE: Record<ContactCategory, string> = {
  Client:
    'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
  Fournisseur:
    'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  'Famille/Ami':
    'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800',
  Autre:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

export function ContactCard({
  summary,
  hideAmounts,
  hideDecimals = false,
  lang,
  businessName,
  whatsAppTemplate,
  onOpenDetail,
  onQuickOperation,
}: ContactCardProps) {
  const { contact, balance, lastTransaction, nextDue, isOverCreditLimit } = summary;
  const t = UI_TEXT[lang].contactCard;
  const telHref = toTelHref(contact.phone);
  const waHref = buildWhatsAppUrl(summary, businessName, lang, {
    hideDecimals,
    customTemplate: whatsAppTemplate,
  });

  const avatarStyle =
    balance > 0
      ? 'bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:ring-emerald-800'
      : balance < 0
        ? 'bg-rose-100 text-rose-800 ring-rose-200 dark:bg-rose-950/70 dark:text-rose-300 dark:ring-rose-800'
        : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';

  const balanceTextColor =
    balance > 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : balance < 0
        ? 'text-rose-700 dark:text-rose-400'
        : 'text-slate-500 dark:text-slate-400';

  const statusText =
    balance > 0 ? t.owesMe : balance < 0 ? t.iOwe : t.settled;

  return (
    <article
      onClick={() => onOpenDetail(contact.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDetail(contact.id);
        }
      }}
      className="cursor-pointer rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs transition hover:border-teal-300 hover:shadow-md active:scale-[0.995] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-700"
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ring-1 ${avatarStyle}`}
        >
          {getInitials(contact.name)}
        </div>

        {/* Name + Meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-bold text-slate-900 dark:text-white">
                {contact.name}
              </h3>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${CATEGORY_STYLE[contact.category]}`}
                >
                  {CATEGORY_LABELS[lang][contact.category]}
                </span>
                {isOverCreditLimit && (
                  <span className="inline-flex items-center gap-0.5 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {t.overLimitBadge}
                  </span>
                )}
                {contact.phone && (
                  <span dir="ltr" className="text-xs text-slate-500 dark:text-slate-400">
                    {contact.phone}
                  </span>
                )}
              </div>
            </div>

            {/* Balance */}
            <div className="shrink-0 text-end">
              <p
                dir="ltr"
                className={`tabular-nums inline-block text-[15px] font-extrabold ${balanceTextColor}`}
              >
                {formatMAD(balance, {
                  showSign: balance !== 0,
                  masked: hideAmounts,
                  hideDecimals,
                  lang,
                })}
              </p>
              <p className={`text-[11px] font-semibold ${balanceTextColor}`}>
                {statusText}
              </p>
            </div>
          </div>

          {/* Last Activity & Due Warning */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="truncate">
              {lastTransaction
                ? `${t.lastOp} : ${formatDateFR(lastTransaction.occurredAt, lang)}${
                    lastTransaction.note ? ` • ${lastTransaction.note}` : ''
                  }`
                : t.noOp}
            </span>

            {nextDue && !nextDue.isSettled && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  nextDue.urgency === 'overdue'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300'
                    : nextDue.urgency === 'today' || nextDue.urgency === 'soon'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {nextDue.urgency === 'overdue' ? (
                  <>
                    <AlertCircle className="h-3 w-3" />
                    {t.overdueDays(Math.abs(nextDue.daysDiff))}
                  </>
                ) : nextDue.urgency === 'today' ? (
                  <>
                    <Clock className="h-3 w-3" />
                    {t.dueToday}
                  </>
                ) : (
                  <>
                    <Clock className="h-3 w-3" />
                    {t.dueOn(formatDateFR(nextDue.transaction.dueDate ?? '', lang))}
                  </>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div
        className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onQuickOperation(contact.id)}
          className="flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-50 px-2.5 text-xs font-bold text-teal-800 transition hover:bg-teal-100 active:scale-[0.98] dark:bg-teal-950/60 dark:text-teal-300 dark:hover:bg-teal-900/60"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          <span>{t.operation}</span>
        </button>

        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-2.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 active:scale-[0.98] dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span>{t.whatsapp}</span>
          </a>
        ) : (
          <span className="flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-50 px-2.5 text-xs font-medium text-slate-400 dark:bg-slate-800/60 dark:text-slate-500">
            <MessageCircle className="h-3.5 w-3.5" />
            <span>{t.whatsapp}</span>
          </span>
        )}

        {telHref ? (
          <a
            href={telHref}
            className="flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-200 active:scale-[0.98] dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            aria-label={`${t.call} ${contact.name}`}
          >
            <Phone className="h-3.5 w-3.5" />
            <span>{t.call}</span>
          </a>
        ) : (
          <span className="flex min-h-[38px] items-center justify-center rounded-xl bg-slate-50 px-3 text-xs font-medium text-slate-400 dark:bg-slate-800/60 dark:text-slate-500">
            <Phone className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </article>
  );
}
