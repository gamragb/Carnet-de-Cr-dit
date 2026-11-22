import { useMemo, useState } from 'react';
import { Archive, ArrowDownUp, FileText, Search, UserPlus, X } from 'lucide-react';
import { ContactCard } from '../components/ContactCard.tsx';
import { CATEGORY_LABELS, UI_TEXT } from '../i18n/translations.ts';
import type {
  AppLanguage,
  ContactCategory,
  ContactSummary,
} from '../types/ledger.ts';
import { filterContactSummaries } from '../utils/ledgerMath.ts';

interface ContactsViewProps {
  summaries: ContactSummary[];
  hideAmounts: boolean;
  hideDecimals?: boolean;
  lang: AppLanguage;
  businessName?: string;
  whatsAppTemplate?: string;
  onAddContact: () => void;
  onOpenContact: (contactId: string) => void;
  onQuickOperation: (contactId: string) => void;
  onOpenGlobalReport: () => void;
}

type SortMode = 'recent' | 'name' | 'amount';

const CATEGORY_TABS: Array<ContactCategory | 'ALL'> = [
  'ALL',
  'Client',
  'Fournisseur',
  'Famille/Ami',
  'Autre',
];

export function ContactsView({
  summaries,
  hideAmounts,
  hideDecimals = false,
  lang,
  businessName,
  whatsAppTemplate,
  onAddContact,
  onOpenContact,
  onQuickOperation,
  onOpenGlobalReport,
}: ContactsViewProps) {
  const t = UI_TEXT[lang].contactsView;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ContactCategory | 'ALL'>('ALL');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [showArchived, setShowArchived] = useState(false);

  const activeCount = useMemo(
    () => summaries.filter((s) => !s.contact.archived).length,
    [summaries]
  );
  const archivedCount = summaries.length - activeCount;

  const visible = useMemo(() => {
    const base = filterContactSummaries(summaries, {
      search,
      category,
      filter: 'all',
      lang,
      onlyArchived: showArchived,
      includeArchived: showArchived,
    });

    if (sortMode === 'name') {
      return [...base].sort((a, b) =>
        a.contact.name.localeCompare(b.contact.name, lang === 'ar' ? 'ar' : 'fr')
      );
    }
    if (sortMode === 'amount') {
      return [...base].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    }
    return base;
  }, [summaries, search, category, sortMode, lang, showArchived]);

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
            {t.title(activeCount)}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t.subtitle}</p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenGlobalReport}
            className="inline-flex min-h-[42px] items-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <FileText className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
            <span>{t.globalPdfBtn}</span>
          </button>
          <button
            type="button"
            onClick={onAddContact}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-2xl bg-teal-700 px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-teal-800 active:scale-[0.98]"
          >
            <UserPlus className="h-4 w-4" />
            <span>{t.add}</span>
          </button>
        </div>
      </div>

      {/* Active vs Archived Toggle */}
      {archivedCount > 0 && (
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setShowArchived(false)}
            className={`min-h-[36px] rounded-xl text-xs font-bold transition ${
              !showArchived
                ? 'bg-slate-900 text-white dark:bg-teal-700'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {t.activeTab(activeCount)}
          </button>
          <button
            type="button"
            onClick={() => setShowArchived(true)}
            className={`inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition ${
              showArchived
                ? 'bg-slate-900 text-white dark:bg-teal-700'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Archive className="h-3.5 w-3.5" />
            <span>{t.archivedTab(archivedCount)}</span>
          </button>
        </div>
      )}

      {/* Search + Sort */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 start-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 ps-10 pe-9 text-sm font-medium text-slate-900 outline-none focus:border-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute top-1/2 end-2.5 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label={UI_TEXT[lang].dashboard.clearSearch}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() =>
            setSortMode((prev) =>
              prev === 'recent' ? 'amount' : prev === 'amount' ? 'name' : 'recent'
            )
          }
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
          <ArrowDownUp className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
          <span>
            {sortMode === 'recent'
              ? t.sortRecent
              : sortMode === 'amount'
                ? t.sortAmount
                : t.sortName}
          </span>
        </button>
      </div>

      {/* Category Filter Pills */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {CATEGORY_TABS.map((cat) => {
          const active = category === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                active
                  ? 'border-teal-700 bg-teal-700 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {cat === 'ALL' ? t.allCategories : CATEGORY_LABELS[lang][cat]}
            </button>
          );
        })}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {showArchived ? t.archivedEmptyTitle : t.notFoundTitle}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {showArchived ? t.archivedEmptyDesc : t.notFoundDesc}
          </p>
          {!showArchived && (
            <button
              type="button"
              onClick={onAddContact}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-teal-700 px-4 text-xs font-bold text-white"
            >
              <UserPlus className="h-4 w-4" />
              {t.newContact}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((summary) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
