import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  Camera,
  Plus,
  Receipt,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  TX_TYPE_LABELS,
  UI_TEXT,
} from '../i18n/translations.ts';
import type {
  AppLanguage,
  Contact,
  ContactCategory,
  ContactSummary,
  PaymentMethod,
  Transaction,
  TransactionType,
} from '../types/ledger.ts';
import {
  formatMAD,
  formatMoroccanPhone,
  getCurrentLocalDateTime,
  isValidPhoneInput,
  parseMoneyInput,
  roundMoney,
} from '../utils/formatters.ts';
import { compressReceiptImage } from '../utils/imageUtils.ts';

interface TransactionModalProps {
  open: boolean;
  lang: AppLanguage;
  hideDecimals?: boolean;
  contacts: Contact[];
  summariesById: Map<string, ContactSummary>;
  initialContactId?: string | null;
  initialType?: TransactionType;
  editingTransaction?: Transaction | null;
  onClose: () => void;
  onSave: (data: {
    contactId: string;
    type: TransactionType;
    amount: number;
    occurredAt: string;
    dueDate?: string;
    paymentMethod: PaymentMethod;
    note: string;
    reference?: string;
    isDiscount?: boolean;
    attachmentDataUrl?: string;
    attachmentName?: string;
  }) => void;
  onQuickCreateContact: (data: {
    name: string;
    phone: string;
    category: ContactCategory;
  }) => Contact;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  'Espèces',
  'Virement CIH/Banque',
  'Chèque',
  'Marchandise',
];

function addDaysToISO(days: number, baseISODate?: string): string {
  const cleanBase = baseISODate && /^\d{4}-\d{2}-\d{2}$/.test(baseISODate) ? baseISODate : '';
  const d = cleanBase
    ? (() => {
        const [y, m, day] = cleanBase.split('-').map(Number);
        return new Date(y, m - 1, day);
      })()
    : new Date();
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function TransactionModal({
  open,
  lang,
  hideDecimals = false,
  contacts,
  summariesById,
  initialContactId,
  initialType,
  editingTransaction,
  onClose,
  onSave,
  onQuickCreateContact,
}: TransactionModalProps) {
  const t = UI_TEXT[lang].txModal;
  const currencyLabel = UI_TEXT[lang].currencyTag;

  const [contactId, setContactId] = useState('');
  const [type, setType] = useState<TransactionType>('credit_given');
  const [amountInput, setAmountInput] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Espèces');
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [isDiscount, setIsDiscount] = useState(false);
  const [attachmentDataUrl, setAttachmentDataUrl] = useState<string | undefined>(
    undefined
  );
  const [attachmentName, setAttachmentName] = useState<string | undefined>(
    undefined
  );
  const [error, setError] = useState('');

  const [creatingContact, setCreatingContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactCategory, setNewContactCategory] =
    useState<ContactCategory>('Client');

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const wasOpenRef = useRef(false);
  const lastEditIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      lastEditIdRef.current = null;
      return;
    }

    const editId = editingTransaction?.id ?? null;
    if (wasOpenRef.current && lastEditIdRef.current === editId) {
      return;
    }
    wasOpenRef.current = true;
    lastEditIdRef.current = editId;

    setError('');
    setCreatingContact(contacts.length === 0);
    setNewContactName('');
    setNewContactPhone('');
    setNewContactCategory('Client');

    if (editingTransaction) {
      setContactId(editingTransaction.contactId);
      setType(editingTransaction.type);
      setAmountInput(String(editingTransaction.amount));
      setOccurredAt(editingTransaction.occurredAt.slice(0, 16));
      setDueDate(editingTransaction.dueDate ?? '');
      setPaymentMethod(editingTransaction.paymentMethod);
      setNote(editingTransaction.note);
      setReference(editingTransaction.reference ?? '');
      setIsDiscount(Boolean(editingTransaction.isDiscount));
      setAttachmentDataUrl(editingTransaction.attachmentDataUrl);
      setAttachmentName(editingTransaction.attachmentName);
    } else {
      const defaultContact =
        initialContactId && contacts.some((c) => c.id === initialContactId)
          ? initialContactId
          : contacts.find((c) => !c.archived)?.id ?? contacts[0]?.id ?? '';
      setContactId(defaultContact);
      setType(initialType ?? 'credit_given');
      setAmountInput('');
      setOccurredAt(getCurrentLocalDateTime());
      setDueDate('');
      setPaymentMethod('Espèces');
      setNote('');
      setReference('');
      setIsDiscount(false);
      setAttachmentDataUrl(undefined);
      setAttachmentName(undefined);
    }
  }, [open, editingTransaction, initialContactId, initialType, contacts]);

  const selectedSummary = useMemo(
    () => (contactId ? summariesById.get(contactId) ?? null : null),
    [contactId, summariesById]
  );

  const parsedPreviewAmount = useMemo(
    () => parseMoneyInput(amountInput),
    [amountInput]
  );

  const overLimitAlert = useMemo(() => {
    if (!selectedSummary?.contact.creditLimit || parsedPreviewAmount === null) {
      return null;
    }
    const delta =
      type === 'credit_given' || type === 'payment_made'
        ? parsedPreviewAmount
        : -parsedPreviewAmount;
    const oldDelta =
      editingTransaction && editingTransaction.contactId === contactId
        ? editingTransaction.type === 'credit_given' ||
          editingTransaction.type === 'payment_made'
          ? editingTransaction.amount
          : -editingTransaction.amount
        : 0;
    const projectedBalance = roundMoney(selectedSummary.balance - oldDelta + delta);
    if (projectedBalance > selectedSummary.contact.creditLimit) {
      return formatMAD(selectedSummary.contact.creditLimit, { lang, hideDecimals });
    }
    return null;
  }, [
    selectedSummary,
    parsedPreviewAmount,
    type,
    editingTransaction,
    contactId,
    lang,
    hideDecimals,
  ]);

  if (!open) return null;

  const tryCreateInlineContact = (): string | null => {
    const cleanName = newContactName.trim();
    if (!cleanName) {
      setError(t.quickNameError);
      return null;
    }
    if (!isValidPhoneInput(newContactPhone)) {
      setError(UI_TEXT[lang].contactModal.phoneInvalidError);
      return null;
    }
    const created = onQuickCreateContact({
      name: cleanName,
      phone: formatMoroccanPhone(newContactPhone),
      category: newContactCategory,
    });
    setContactId(created.id);
    setCreatingContact(false);
    setError('');
    return created.id;
  };

  const handleApplyPartialOrFull = (ratio: number) => {
    if (!selectedSummary || selectedSummary.balance === 0) return;
    const bal = selectedSummary.balance;
    const targetType: TransactionType =
      bal > 0 ? 'payment_received' : 'payment_made';
    const amt = roundMoney(Math.abs(bal) * ratio);
    setType(targetType);
    setAmountInput(String(amt));
    setDueDate('');
    if (!note.trim()) {
      setNote(ratio === 1 ? t.fullSettleNote : t.partialNote);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressReceiptImage(file);
      setAttachmentDataUrl(compressed);
      setAttachmentName(file.name);
      setError('');
    } catch {
      setError(t.photoError);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let targetContactId = contactId;

    if (creatingContact) {
      const createdId = tryCreateInlineContact();
      if (!createdId) return;
      targetContactId = createdId;
    }

    if (!targetContactId) {
      setError(t.selectPersonError);
      return;
    }

    const parsedAmount = parseMoneyInput(amountInput);
    if (parsedAmount === null) {
      setError(t.amountError);
      return;
    }

    const finalOccurredAt = occurredAt || getCurrentLocalDateTime();
    if (dueDate && dueDate < finalOccurredAt.slice(0, 10)) {
      setError(t.invalidDueOrderError);
      return;
    }

    onSave({
      contactId: targetContactId,
      type,
      amount: parsedAmount,
      occurredAt: finalOccurredAt,
      dueDate: dueDate || undefined,
      paymentMethod,
      note: note.trim(),
      reference: reference.trim() || undefined,
      isDiscount:
        (type === 'payment_received' || type === 'payment_made') && isDiscount
          ? true
          : undefined,
      attachmentDataUrl,
      attachmentName,
    });
  };

  const txLabels = TX_TYPE_LABELS[lang];
  const typeButtons: Array<{
    value: TransactionType;
    title: string;
    subtitle: string;
    sign: string;
    activeClass: string;
    icon: React.ReactNode;
  }> = [
    {
      value: 'credit_given',
      title: txLabels.credit_given.title,
      subtitle: txLabels.credit_given.subtitle,
      sign: '+',
      activeClass:
        'border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-200',
      icon: <ArrowUpRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
    },
    {
      value: 'payment_received',
      title: txLabels.payment_received.title,
      subtitle: txLabels.payment_received.subtitle,
      sign: '-',
      activeClass:
        'border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-600 dark:bg-teal-950/60 dark:text-teal-200',
      icon: <ArrowDownLeft className="h-4 w-4 text-teal-600 dark:text-teal-400" />,
    },
    {
      value: 'credit_taken',
      title: txLabels.credit_taken.title,
      subtitle: txLabels.credit_taken.subtitle,
      sign: '-',
      activeClass:
        'border-rose-600 bg-rose-50 text-rose-900 ring-1 ring-rose-600 dark:bg-rose-950/60 dark:text-rose-200',
      icon: <ArrowDownLeft className="h-4 w-4 text-rose-600 dark:text-rose-400" />,
    },
    {
      value: 'payment_made',
      title: txLabels.payment_made.title,
      subtitle: txLabels.payment_made.subtitle,
      sign: '+',
      activeClass:
        'border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-200',
      icon: <ArrowUpRight className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />,
    },
  ];

  const isPaymentType = type === 'payment_received' || type === 'payment_made';

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-modal-title"
    >
      <div className="animate-sheet-up max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl dark:border dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="tx-modal-title"
                className="text-lg font-bold text-slate-900 dark:text-white"
              >
                {editingTransaction ? t.editTitle : t.newTitle}
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
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* Contact selector or inline create */}
          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="tx-contact"
                className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400"
              >
                {t.contactLabel}
              </label>
              {!editingTransaction && contacts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCreatingContact((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-800 dark:text-teal-400"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {creatingContact ? t.chooseExisting : t.newPerson}
                </button>
              )}
            </div>

            {creatingContact ? (
              <div className="mt-2 space-y-2.5 rounded-2xl border border-teal-200 bg-teal-50/40 p-3 dark:border-teal-900 dark:bg-teal-950/30">
                <input
                  type="text"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder={t.quickNamePlaceholder}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="tel"
                    dir="ltr"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    placeholder={t.quickPhonePlaceholder}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-start text-sm font-medium outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <select
                    value={newContactCategory}
                    onChange={(e) =>
                      setNewContactCategory(e.target.value as ContactCategory)
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 text-sm font-medium outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {(
                      ['Client', 'Fournisseur', 'Famille/Ami', 'Autre'] as ContactCategory[]
                    ).map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_LABELS[lang][cat]}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={tryCreateInlineContact}
                  className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-teal-700 text-xs font-bold text-white hover:bg-teal-800"
                >
                  <Plus className="h-4 w-4" />
                  {t.quickCreateBtn}
                </button>
              </div>
            ) : (
              <select
                id="tx-contact"
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {contacts
                  .filter(
                    (c) =>
                      !c.archived ||
                      c.id === editingTransaction?.contactId ||
                      c.id === initialContactId ||
                      c.id === contactId
                  )
                  .map((c) => {
                    const bal = summariesById.get(c.id)?.balance ?? 0;
                    const archSuffix = c.archived ? ` [${t.archivedSuffix}]` : '';
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} ({CATEGORY_LABELS[lang][c.category]}){archSuffix} —{' '}
                        {formatMAD(bal, { showSign: bal !== 0, lang, hideDecimals })}
                      </option>
                    );
                  })}
              </select>
            )}
          </div>

          {/* Partial payment / settlement helper */}
          {!editingTransaction &&
            selectedSummary &&
            selectedSummary.balance !== 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
                <div className="text-xs">
                  <span className="text-slate-500 dark:text-slate-400">
                    {t.currentBalanceLabel}{' '}
                  </span>
                  <span
                    dir="ltr"
                    className={`tabular-nums inline-block font-bold ${
                      selectedSummary.balance > 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {formatMAD(selectedSummary.balance, {
                      showSign: true,
                      lang,
                      hideDecimals,
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleApplyPartialOrFull(0.5)}
                    className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-xs ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600"
                  >
                    {t.halfPayment}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPartialOrFull(1)}
                    className="rounded-lg bg-teal-700 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-teal-800"
                  >
                    {t.fullSettle}
                  </button>
                </div>
              </div>
            )}

          {/* 4 Operation Types */}
          <div>
            <span className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              {t.typeLabel}
            </span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {typeButtons.map((btn) => {
                const selected = type === btn.value;
                return (
                  <button
                    key={btn.value}
                    type="button"
                    onClick={() => setType(btn.value)}
                    className={`flex min-h-[64px] flex-col justify-between rounded-2xl border p-2.5 text-start transition ${
                      selected
                        ? btn.activeClass
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      {btn.icon}
                      <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-[11px] font-extrabold text-slate-700 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                        {btn.sign}
                      </span>
                    </div>
                    <div className="mt-1">
                      <p className="text-xs font-bold leading-tight">{btn.title}</p>
                      <p className="text-[10px] opacity-75">{btn.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {isPaymentType && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-amber-200/80 bg-amber-50/50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
              <input
                type="checkbox"
                checked={isDiscount}
                onChange={(e) => setIsDiscount(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-amber-600"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {t.isDiscountLabel}
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t.isDiscountHint}
                </p>
              </div>
            </label>
          )}

          {/* Amount */}
          <div>
            <label
              htmlFor="tx-amount"
              className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400"
            >
              {t.amountLabel}
            </label>
            <div className="relative mt-1.5">
              <input
                id="tx-amount"
                type="text"
                inputMode="decimal"
                dir="ltr"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="0,00"
                className="tabular-nums w-full rounded-2xl border border-slate-200 bg-slate-50/70 py-3.5 ps-4 pe-16 text-start text-xl font-extrabold text-slate-900 outline-none transition focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-600/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <span className="pointer-events-none absolute top-1/2 end-4 -translate-y-1/2 text-sm font-extrabold text-slate-400">
                {currencyLabel}
              </span>
            </div>
            {overLimitAlert && (
              <div className="mt-2 flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{t.overLimitWarning(overLimitAlert)}</span>
              </div>
            )}
          </div>

          {/* Payment Method */}
          <div>
            <span className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              {t.paymentMethodLabel}
            </span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((method) => {
                const selected = paymentMethod === method;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`min-h-[42px] rounded-xl border px-3 text-xs font-bold transition ${
                      selected
                        ? 'border-teal-600 bg-teal-50 text-teal-800 ring-1 ring-teal-600 dark:bg-teal-950/60 dark:text-teal-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {PAYMENT_METHOD_LABELS[lang][method]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date & Due Date */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="tx-occurred-at"
                className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400"
              >
                {t.occurredAtLabel}
              </label>
              <input
                id="tx-occurred-at"
                type="datetime-local"
                dir="ltr"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="tx-due-date"
                className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400"
              >
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                {t.dueDateLabel}
              </label>
              <input
                id="tx-due-date"
                type="date"
                dir="ltr"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          {/* Quick due-date chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-400">
              {t.dueShortcuts}
            </span>
            {[7, 15, 30].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setDueDate(addDaysToISO(days, occurredAt.slice(0, 10)))}
                className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
              >
                {t.daysPlus(days)}
              </button>
            ))}
            {dueDate && (
              <button
                type="button"
                onClick={() => setDueDate('')}
                className="rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300"
              >
                {t.clearDue}
              </button>
            )}
          </div>

          {/* Reference */}
          <div>
            <label
              htmlFor="tx-ref"
              className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400"
            >
              {t.referenceLabel}
            </label>
            <input
              id="tx-ref"
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t.referencePlaceholder}
              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Note / Motif */}
          <div>
            <label
              htmlFor="tx-note"
              className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400"
            >
              {t.noteLabel}
            </label>
            <input
              id="tx-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.notePlaceholder}
              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-600/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {t.quickNotes.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setNote(suggestion)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {/* Receipt Photo Attachment */}
          <div>
            <span className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              {t.attachmentLabel}
            </span>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="hidden"
            />
            {attachmentDataUrl ? (
              <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800">
                <img
                  src={attachmentDataUrl}
                  alt={attachmentName ?? 'Receipt'}
                  className="h-14 w-14 rounded-xl object-cover ring-1 ring-slate-200 dark:ring-slate-700"
                />
                <div className="flex flex-1 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600"
                  >
                    {t.changePhotoBtn}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentDataUrl(undefined);
                      setAttachmentName(undefined);
                    }}
                    className="inline-flex items-center gap-1 rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t.removePhotoBtn}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="mt-1.5 flex min-h-[42px] w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-3 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
              >
                <Camera className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                <span>{t.addPhotoBtn}</span>
              </button>
            )}
          </div>

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
              className="min-h-[48px] flex-[1.6] rounded-2xl bg-teal-700 text-sm font-bold text-white shadow-md shadow-teal-700/20 transition hover:bg-teal-800 active:scale-[0.98]"
            >
              {editingTransaction ? t.updateBtn : t.createBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
