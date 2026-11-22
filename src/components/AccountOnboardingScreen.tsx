import React, { useRef, useState } from 'react';
import {
  BookOpenCheck,
  KeyRound,
  Lock,
  Phone,
  ShieldCheck,
  Store,
  Upload,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { UI_TEXT } from '../i18n/translations.ts';
import type { AccountUsageType, AppLanguage } from '../types/ledger.ts';
import {
  parseAndValidateBackupJSON,
  type ParsedBackupResult,
} from '../utils/exportImport.ts';
import { formatMoroccanPhone, isValidPhoneInput } from '../utils/formatters.ts';
import {
  canUseStrongEncryption,
  decryptBackupJSON,
  isEncryptedBackupText,
} from '../utils/security.ts';

export interface AccountRegistrationPayload {
  fullName: string;
  businessName: string;
  phone: string;
  usageType: AccountUsageType;
  language: AppLanguage;
  pin: string | null;
  recovery: { question: string; answer: string } | null;
}

interface AccountOnboardingScreenProps {
  lang: AppLanguage;
  onChangeLanguage: (lang: AppLanguage) => void;
  onRegister: (payload: AccountRegistrationPayload) => Promise<void>;
  onRestoreBackup: (payload: ParsedBackupResult) => void;
}

export function AccountOnboardingScreen({
  lang,
  onChangeLanguage,
  onRegister,
  onRestoreBackup,
}: AccountOnboardingScreenProps) {
  const t = UI_TEXT[lang];
  const ob = t.onboarding;
  const s = t.settingsView;
  const pinText = t.pin;

  const [fullName, setFullName] = useState('');
  const [usageType, setUsageType] = useState<AccountUsageType>('business');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [enablePin, setEnablePin] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [recoveryQuestion, setRecoveryQuestion] = useState('');
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Encrypted backup restore state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingEncryptedRaw, setPendingEncryptedRaw] = useState<string | null>(null);
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState('');
  const [passBusy, setPassBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    const cleanName = fullName.trim();
    if (cleanName.length < 2) {
      setError(ob.fullNameError);
      return;
    }

    const cleanPhoneRaw = phone.trim();
    if (cleanPhoneRaw && !isValidPhoneInput(cleanPhoneRaw)) {
      setError(ob.phoneInvalidError);
      return;
    }
    const formattedPhone = cleanPhoneRaw ? formatMoroccanPhone(cleanPhoneRaw) : '';

    let cleanPin: string | null = null;
    let recovery: { question: string; answer: string } | null = null;

    if (enablePin) {
      if (!/^\d{4}$/.test(pin)) {
        setError(pinText.fourDigitsError);
        return;
      }
      if (pin !== confirmPin) {
        setError(pinText.mismatchError);
        return;
      }
      const q = recoveryQuestion.trim();
      const a = recoveryAnswer.trim();
      if ((q && a.length < 2) || (!q && a.length > 0)) {
        setError(pinText.recoverySetupError);
        return;
      }
      cleanPin = pin;
      recovery = q && a.length >= 2 ? { question: q, answer: a } : null;
    }

    setSubmitting(true);
    try {
      await onRegister({
        fullName: cleanName,
        businessName: businessName.trim(),
        phone: formattedPhone,
        usageType,
        language: lang,
        pin: cleanPin,
        recovery,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : s.restoreReadError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackupFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');

    try {
      const text = await file.text();
      if (isEncryptedBackupText(text)) {
        if (!canUseStrongEncryption()) {
          setError(
            lang === 'ar'
              ? 'فك التشفير يتطلب فتح التطبيق عبر HTTPS أو localhost.'
              : 'Le déchiffrement nécessite un contexte sécurisé (HTTPS ou localhost).'
          );
          return;
        }
        setPendingEncryptedRaw(text);
        setPassInput('');
        setPassError('');
        return;
      }

      const parsed = parseAndValidateBackupJSON(text, lang);
      onRestoreBackup(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : s.restoreReadError);
    }
  };

  const handleDecryptRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEncryptedRaw || passBusy) return;
    if (passInput.length < 4) {
      setPassError(s.passphraseError);
      return;
    }
    setPassBusy(true);
    setPassError('');
    try {
      const decrypted = await decryptBackupJSON(pendingEncryptedRaw, passInput, lang);
      const parsed = parseAndValidateBackupJSON(decrypted, lang);
      setPendingEncryptedRaw(null);
      setPassInput('');
      onRestoreBackup(parsed);
    } catch (err) {
      setPassError(err instanceof Error ? err.message : s.restoreReadError);
    } finally {
      setPassBusy(false);
    }
  };

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="min-h-dvh bg-gradient-to-b from-teal-50/70 via-slate-50 to-slate-100 px-4 py-6 text-slate-900 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-100"
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 pb-8">
        {/* Top Brand + Language Switcher */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-md shadow-teal-700/20">
              <BookOpenCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-white">
                {t.appName}
              </p>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {t.appSubtitleDefault}
              </p>
            </div>
          </div>

          <div className="flex rounded-2xl border border-slate-200/90 bg-white p-1 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => onChangeLanguage('fr')}
              className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition ${
                lang === 'fr'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              Français
            </button>
            <button
              type="button"
              onClick={() => onChangeLanguage('ar')}
              className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition ${
                lang === 'ar'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              العربية
            </button>
          </div>
        </div>

        {/* Main Registration Card */}
        <section className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-200/80 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-teal-800/60">
              <UserPlus className="h-6 w-6" />
            </div>
            <div>
              <span className="inline-block rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-extrabold text-teal-800 dark:bg-teal-950/70 dark:text-teal-300">
                {ob.badge}
              </span>
              <h1 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {ob.title}
              </h1>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {ob.subtitle}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300">
                {error}
              </div>
            )}

            {/* Full Name */}
            <div>
              <label
                htmlFor="reg-fullname"
                className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                <User className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                {ob.fullNameLabel}
              </label>
              <input
                id="reg-fullname"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (error) setError('');
                }}
                placeholder={ob.fullNamePlaceholder}
                className="mt-1.5 min-h-[46px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-medium text-slate-900 outline-none transition focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900"
              />
            </div>

            {/* Usage Type */}
            <div>
              <p className="mb-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                {ob.usageLabel}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setUsageType('business')}
                  className={`flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-bold transition ${
                    usageType === 'business'
                      ? 'border-teal-600 bg-teal-700 text-white shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  <Store className="h-4 w-4 shrink-0" />
                  <span className="truncate">{ob.usageBusiness}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUsageType('personal')}
                  className={`flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-bold transition ${
                    usageType === 'personal'
                      ? 'border-teal-600 bg-teal-700 text-white shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  <User className="h-4 w-4 shrink-0" />
                  <span className="truncate">{ob.usagePersonal}</span>
                </button>
              </div>
            </div>

            {/* Business / Shop Name */}
            {usageType === 'business' && (
              <div>
                <label
                  htmlFor="reg-business"
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  <Store className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                  {ob.businessLabel}
                </label>
                <input
                  id="reg-business"
                  type="text"
                  autoComplete="organization"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder={ob.businessPlaceholder}
                  className="mt-1.5 min-h-[46px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-medium text-slate-900 outline-none transition focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900"
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {ob.businessHint}
                </p>
              </div>
            )}

            {/* Phone */}
            <div>
              <label
                htmlFor="reg-phone"
                className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                <Phone className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                {ob.phoneLabel}
              </label>
              <input
                id="reg-phone"
                type="tel"
                dir="ltr"
                autoComplete="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (error) setError('');
                }}
                placeholder={ob.phonePlaceholder}
                className="mt-1.5 min-h-[46px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-medium text-slate-900 outline-none transition focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900"
              />
            </div>

            {/* Optional PIN Lock Toggle */}
            <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                    <Lock className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {ob.pinToggleTitle}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {ob.pinToggleDesc}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={enablePin}
                  onClick={() => {
                    setEnablePin((prev) => !prev);
                    setError('');
                  }}
                  dir="ltr"
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                    enablePin ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      enablePin ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {enablePin && (
                <div className="mt-3.5 space-y-3 border-t border-slate-200/80 pt-3.5 dark:border-slate-700/80">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        {ob.pinLabel}
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        dir="ltr"
                        maxLength={4}
                        value={pin}
                        onChange={(e) =>
                          setPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                        }
                        placeholder="••••"
                        className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-center text-lg font-bold tracking-[0.45em] outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        {ob.pinConfirmLabel}
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        dir="ltr"
                        maxLength={4}
                        value={confirmPin}
                        onChange={(e) =>
                          setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                        }
                        placeholder="••••"
                        className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-center text-lg font-bold tracking-[0.45em] outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        {ob.recoveryQuestionLabel}
                      </label>
                      <input
                        type="text"
                        value={recoveryQuestion}
                        onChange={(e) => setRecoveryQuestion(e.target.value)}
                        placeholder={ob.recoveryQuestionPlaceholder}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        {ob.recoveryAnswerLabel}
                      </label>
                      <input
                        type="text"
                        value={recoveryAnswer}
                        onChange={(e) => setRecoveryAnswer(e.target.value)}
                        placeholder={ob.recoveryAnswerPlaceholder}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-4 text-sm font-extrabold text-white shadow-md shadow-teal-700/20 transition hover:bg-teal-800 active:scale-[0.99] disabled:opacity-60"
            >
              <UserPlus className="h-4 w-4" />
              <span>{submitting ? ob.submittingBtn : ob.submitBtn}</span>
            </button>
          </form>

          {/* Divider + Restore Existing Backup */}
          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            <span className="text-[11px] font-bold uppercase text-slate-400">
              {ob.orDivider}
            </span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-3 text-xs font-bold text-slate-700 transition hover:border-teal-500 hover:bg-teal-50/50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
          >
            <Upload className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            <span>{ob.restoreBtn}</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleBackupFileSelected}
          />
        </section>

        {/* Privacy Reassurance Footer */}
        <div className="flex items-center justify-center gap-2 px-2 text-center text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <ShieldCheck className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
          <span>{ob.privacyNote}</span>
        </div>
      </div>

      {/* Encrypted Backup Passphrase Modal */}
      {pendingEncryptedRaw && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/55 p-4 backdrop-blur-[2px] sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="animate-sheet-up w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:border dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  <KeyRound className="h-5 w-5" />
                </div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {s.passphraseImportTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPendingEncryptedRaw(null)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label={t.statement.close}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {s.passphraseDescImport}
            </p>

            <form onSubmit={handleDecryptRestore} className="mt-4 space-y-2.5">
              <input
                type="password"
                value={passInput}
                onChange={(e) => {
                  setPassInput(e.target.value);
                  setPassError('');
                }}
                placeholder={s.passphrasePlaceholder}
                autoFocus
                className="min-h-[46px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-medium text-slate-900 outline-none focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              {passError && (
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {passError}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingEncryptedRaw(null)}
                  className="min-h-[44px] rounded-2xl border border-slate-200 text-sm font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  {t.dialogs.cancelDefault}
                </button>
                <button
                  type="submit"
                  disabled={passBusy}
                  className="min-h-[44px] rounded-2xl bg-indigo-600 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {s.passphraseSubmitImport}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
