import { CalendarClock, Home, Plus, Settings, Users } from 'lucide-react';
import { UI_TEXT } from '../i18n/translations.ts';
import type { AppLanguage } from '../types/ledger.ts';

export type NavTab = 'dashboard' | 'contacts' | 'deadlines' | 'settings';

interface BottomNavProps {
  activeTab: NavTab;
  lang: AppLanguage;
  onSelectTab: (tab: NavTab) => void;
  onNewOperation: () => void;
  urgentDeadlinesCount: number;
}

export function BottomNav({
  activeTab,
  lang,
  onSelectTab,
  onNewOperation,
  urgentDeadlinesCount,
}: BottomNavProps) {
  const t = UI_TEXT[lang].nav;

  const navBtnClass = (tab: NavTab) =>
    `flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold transition-colors min-h-[52px] ${
      activeTab === tab
        ? 'text-teal-700 dark:text-teal-400'
        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
    }`;

  return (
    <nav
      aria-label={lang === 'ar' ? 'القائمة الرئيسية' : 'Navigation principale'}
      className="no-print fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg border-t border-slate-200/90 bg-white/95 backdrop-blur-md pb-safe dark:border-slate-800 dark:bg-slate-900/95"
    >
      <div className="flex items-end justify-between px-1.5 pt-1">
        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className={navBtnClass('dashboard')}
        >
          <Home
            className={`h-5 w-5 ${activeTab === 'dashboard' ? 'stroke-[2.4]' : 'stroke-[1.9]'}`}
          />
          <span>{t.home}</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('contacts')}
          className={navBtnClass('contacts')}
        >
          <Users
            className={`h-5 w-5 ${activeTab === 'contacts' ? 'stroke-[2.4]' : 'stroke-[1.9]'}`}
          />
          <span>{t.contacts}</span>
        </button>

        <div className="flex flex-1 flex-col items-center justify-end pb-1">
          <button
            type="button"
            onClick={onNewOperation}
            aria-label={t.newOperationAria}
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-lg shadow-teal-700/30 ring-4 ring-white transition active:scale-95 hover:bg-teal-800 dark:ring-slate-900"
          >
            <Plus className="h-7 w-7 stroke-[2.5]" />
          </button>
          <span className="mt-1 text-[10px] font-bold text-teal-800 dark:text-teal-400">
            {t.operation}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onSelectTab('deadlines')}
          className={`${navBtnClass('deadlines')} relative`}
        >
          <div className="relative">
            <CalendarClock
              className={`h-5 w-5 ${activeTab === 'deadlines' ? 'stroke-[2.4]' : 'stroke-[1.9]'}`}
            />
            {urgentDeadlinesCount > 0 && (
              <span className="absolute -top-1.5 -end-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-sm">
                {urgentDeadlinesCount > 99 ? '99+' : urgentDeadlinesCount}
              </span>
            )}
          </div>
          <span>{t.deadlines}</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('settings')}
          className={navBtnClass('settings')}
        >
          <Settings
            className={`h-5 w-5 ${activeTab === 'settings' ? 'stroke-[2.4]' : 'stroke-[1.9]'}`}
          />
          <span>{t.settings}</span>
        </button>
      </div>
    </nav>
  );
}
