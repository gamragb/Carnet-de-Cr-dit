import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, Contact as ContactIcon, UserPlus, X } from 'lucide-react';
import { CATEGORY_LABELS, UI_TEXT } from '../i18n/translations.ts';
import type { AppLanguage, Contact, ContactCategory } from '../types/ledger.ts';
import {
  formatMoroccanPhone,
  isValidPhoneInput,
  normalizeSearchPhone,
  parseMoneyInput,
} from '../utils/formatters.ts';

interface ContactModalProps {
  open: boolean;
  lang: AppLanguage;
  existingContacts: Contact[];
  editingContact?: Contact | null;
  editingBalance?: number;
  onClose: () => void;
  onSave: (data: {
    name: string;
    phone: string;
    category: ContactCategory;
    note?: string;
    creditLimit?: number;
    archived?: boolean;
  }) => void;
}

const CATEGORIES: ContactCategory[] = [
  'Client',
  'Fournisseur',
  'Famille/Ami',
  'Autre',
];

interface BrowserContactEntry {
  name?: string[];
  tel?: string[];
}

interface NavigatorWithContacts extends Navigator {
  contacts?: {
    select: (
      properties: string[],
      options?: { multiple?: boolean }
    ) => Promise<BrowserContactEntry[]>;
  };
}

export function ContactModal({
  open,
  lang,
  existingContacts,
  editingContact,
  editingBalance = 0,
  onClose,
  onSave,
}: ContactModalProps) {
  const t = UI_TEXT[lang].contactModal;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState<ContactCategory>('Client');
  const [creditLimitInput, setCreditLimitInput] = useState('');
  const [note, setNote] = useState('');
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState('');

  const supportsContactPicker =
    typeof navigator !== 'undefined' &&
    Boolean((navigator as NavigatorWithContacts).contacts?.select);

  useEffect(() => {
    if (!open) return;
    if (editingContact) {
      setName(editingContact.name);
      setPhone(editingContact.phone);
      setCategory(editingContact.category);
      setCreditLimitInput(
        editingContact.creditLimit ? String(editingContact.creditLimit) : ''
      );
      setNote(editingContact.note ?? '');
      setArchived(Boolean(editingContact.archived));
    } else {
      setName('');
      setPhone('');
      setCategory('Client');
      setCreditLimitInput('');
      setNote('');
      setArchived(false);
    }
    setError('');
  }, [open, editingContact]);

  const duplicateMatch = useMemo(() => {
    const cleanName = name.trim().toLowerCase();
    const normPhone = normalizeSearchPhone(phone);
    if (!cleanName && normPhone.length < 6) return null;

    return (
      existingContacts.find((c) => {
        if (editingContact && c.id === editingContact.id) return false;
        const nameDup = cleanName.length >= 2 && c.name.trim().toLowerCase() === cleanName;
        const phoneDup =
          normPhone.length >= 8 && normalizeSearchPhone(c.phone) === normPhone;
        return nameDup || phoneDup;
      }) ?? null
    );
  }, [name, phone, existingContacts, editingContact]);

  if (!open) return null;

  const handleImportFromPhone = async () => {
    const nav = navigator as NavigatorWithContacts;
    if (!nav.contacts?.select) {
      setError(t.importContactFail);
      return;
    }
    try {
      const selected = await nav.contacts.select(['name', 'tel'], { multiple: false });
      const first = selected[0];
      if (!first) return;
      if (first.name?.[0]) setName(first.name[0].trim());
      if (first.tel?.[0]) setPhone(formatMoroccanPhone(first.tel[0]));
      setError('');
    } catch {
      setError(t.importContactFail);
    }
  };

  const handlePhoneBlur = () => {
    if (phone.trim()) {
      setPhone(formatMoroccanPhone(phone));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError(t.nameError);
      return;
    }
    if (!isValidPhoneInput(phone)) {
      setError(t.phoneInvalidError);
      return;
    }

    let creditLimit: number | undefined;
    if (creditLimitInput.trim()) {
      const parsed = parseMoneyInput(creditLimitInput);
      if (parsed === null) {
        setError(UI_TEXT[lang].txModal.amountError);
        return;
      }
      creditLimit = parsed;
    }

    onSave({
      name: cleanName,
      phone: formatMoroccanPhone(phone),
      category,
      note: note.trim() || undefined,
      creditLimit,
      archived: editingContact ? archived : false,
    });
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-modal-title"
    >
      <div className="animate-sheet-up max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl dark:border dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="contact-modal-title"
                className="text-lg font-bold text-slate-900 dark:text-white"
              >
                {editingContact ? t.editTitle : t.newTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            aria-label={UI_TEXT[lang].statement.close}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {!editingContact && supportsContactPicker && (
            <button
              type="button"
              onClick={handleImportFromPhone}
              className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-2xl border border-teal-200 bg-teal-50/70 px-3 text-xs font-bold text-teal-800 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
            >
              <ContactIcon className="h-4 w-4" />
              <span>{t.importPhoneContactBtn}</span>
            </button>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300">
              {error}
            </div>
          )}

          {duplicateMatch && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t.duplicateWarning(duplicateMatch.name)}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="contact-name"
              className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400"
            >
              {t.nameLabel}
            </label>
            <input
              id="contact-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.namePlaceholder}
              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-600/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900"
            />
          </div>

          <div>
            <label
              htmlFor="contact-phone"
              className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400"
            >
              {t.phoneLabel}
            </label>
            <input
              id="contact-phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={handlePhoneBlur}
              placeholder={t.phonePlaceholder}
              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-start text-sm font-medium text-slate-900 outline-none transition focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-600/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900"
            />
            <p className="mt-1 text-[11px] text-slate-400">{t.phoneHint}</p>
          </div>

          <div>
            <span className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              {t.categoryLabel}
            </span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => {
                const selected = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`min-h-[44px] rounded-2xl border px-3 text-xs font-bold transition ${
                      selected
                        ? 'border-teal-600 bg-teal-50 text-teal-800 ring-1 ring-teal-600 dark:bg-teal-950/60 dark:text-teal-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {CATEGORY_LABELS[lang][cat]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="contact-credit-limit"
              className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400"
            >
              {t.creditLimitLabel}
            </label>
            <input
              id="contact-credit-limit"
              type="text"
              inputMode="decimal"
              dir="ltr"
              value={creditLimitInput}
              onChange={(e) => setCreditLimitInput(e.target.value)}
              placeholder={t.creditLimitPlaceholder}
              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-start text-sm font-semibold text-slate-900 outline-none transition focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900"
            />
            <p className="mt-1 text-[11px] text-slate-400">{t.creditLimitHint}</p>
          </div>

          <div>
            <label
              htmlFor="contact-note"
              className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400"
            >
              {t.noteLabel}
            </label>
            <input
              id="contact-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.notePlaceholder}
              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-600/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900"
            />
          </div>

          {editingContact && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-teal-700"
              />
              <div className="text-xs">
                <span className="inline-flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200">
                  <Archive className="h-3.5 w-3.5" />
                  {t.archiveToggleLabel}
                </span>
                {archived && editingBalance !== 0 && (
                  <p className="mt-0.5 font-semibold text-amber-700 dark:text-amber-400">
                    {t.archiveBalanceWarning}
                  </p>
                )}
              </div>
            </label>
          )}

          <div className="flex gap-2.5 pt-2 pb-safe">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] flex-1 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="min-h-[48px] flex-[1.5] rounded-2xl bg-teal-700 text-sm font-bold text-white shadow-md shadow-teal-700/20 transition hover:bg-teal-800 active:scale-[0.98]"
            >
              {editingContact ? t.saveEdit : t.saveNew}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
