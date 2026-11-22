import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cloud,
  CloudOff,
  CloudUpload,
  Database,
  Download,
  DownloadCloud,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Languages,
  Lock,
  LogOut,
  Moon,
  Phone,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldCheck,
  Smartphone,
  Store,
  Sun,
  Trash2,
  Upload,
  User,
  UserCog,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { PinSetupModal } from '../components/PinLockScreen.tsx';
import { DRIVE_AUTO_BACKUP_INTERVAL_HOURS } from '../config/driveConfig.ts';
import { useToast } from '../context/ToastContext.tsx';
import { UI_TEXT } from '../i18n/translations.ts';
import type {
  AccountUsageType,
  AppLanguage,
  AppTheme,
  Contact,
  LedgerDatabase,
  Transaction,
} from '../types/ledger.ts';
import {
  buildJSONBackup,
  buildTransactionsCSV,
  parseAndValidateBackupJSON,
  parseTransactionsCSV,
  triggerFileDownload,
  type ParsedBackupResult,
} from '../utils/exportImport.ts';
import {
  formatDateTimeFR,
  formatMoroccanPhone,
  getTodayISODate,
  isValidPhoneInput,
} from '../utils/formatters.ts';
import { computeNextDriveBackupIso } from '../utils/googleDriveBackup.ts';
import { isNativeApp } from '../utils/nativePlatform.ts';
import type { UpdateCheckResult } from '../utils/appUpdater.ts';
import {
  canUseStrongEncryption,
  decryptBackupJSON,
  encryptBackupJSON,
  isEncryptedBackupText,
} from '../utils/security.ts';

interface SettingsViewProps {
  db: LedgerDatabase;
  onChangeLanguage: (lang: AppLanguage) => void;
  onChangeTheme: (theme: AppTheme) => void;
  onToggleHideAmounts: () => void;
  onToggleHideDecimals: () => void;
  onUpdateAccountProfile: (data: {
    fullName: string;
    phone: string;
    businessName: string;
    usageType: AccountUsageType;
  }) => void;
  onUpdateAutoLockMinutes: (minutes: number) => void;
  onUpdateCsvDelimiter: (delimiter: ',' | ';') => void;
  onUpdateWhatsAppTemplate: (template: string) => void;
  runningVersion: string;
  updateInfo: UpdateCheckResult | null;
  updateChecking: boolean;
  updateInstalling: boolean;
  updateProgress: number;
  onUpdateManifestUrl: (url: string) => void;
  onCheckForUpdates: (overrideUrl?: string) => void;
  onInstallUpdate: () => void;
  driveBusy: 'idle' | 'connecting' | 'backing_up' | 'restoring';
  onConnectDrive: () => void;
  onDisconnectDrive: () => void;
  onToggleDriveAutoBackup: () => void;
  onBackupDriveNow: () => void;
  onRestoreFromDrive: () => Promise<ParsedBackupResult | null>;
  onUpdateDriveWebClientId: (clientId: string) => void;
  onSavePin: (
    newPin: string | null,
    recovery?: { question: string; answer: string } | null
  ) => void;
  onLockNow: () => void;
  onMarkBackedUp: () => void;
  onRestoreBackup: (payload: ParsedBackupResult, mode: 'replace' | 'merge') => void;
  onImportCsv: (result: {
    contacts: Contact[];
    transactions: Transaction[];
    addedContacts: number;
    addedTransactions: number;
    skippedRows: number;
  }) => void;
  onClearAllData: () => void;
  onResetAccount: () => void;
}

const AUTO_LOCK_OPTIONS = [0, 1, 5, 15];

export function SettingsView({
  db,
  onChangeLanguage,
  onChangeTheme,
  onToggleHideAmounts,
  onToggleHideDecimals,
  onUpdateAccountProfile,
  onUpdateAutoLockMinutes,
  onUpdateCsvDelimiter,
  onUpdateWhatsAppTemplate,
  runningVersion,
  updateInfo,
  updateChecking,
  updateInstalling,
  updateProgress,
  onUpdateManifestUrl,
  onCheckForUpdates,
  onInstallUpdate,
  driveBusy,
  onConnectDrive,
  onDisconnectDrive,
  onToggleDriveAutoBackup,
  onBackupDriveNow,
  onRestoreFromDrive,
  onUpdateDriveWebClientId,
  onSavePin,
  onLockNow,
  onMarkBackedUp,
  onRestoreBackup,
  onImportCsv,
  onClearAllData,
  onResetAccount,
}: SettingsViewProps) {
  const { showToast } = useToast();
  const lang = db.settings.language;
  const s = UI_TEXT[lang].settingsView;
  const d = UI_TEXT[lang].dialogs;

  const [fullNameInput, setFullNameInput] = useState(db.settings.account?.fullName ?? '');
  const [phoneInput, setPhoneInput] = useState(db.settings.account?.phone ?? '');
  const [usageTypeInput, setUsageTypeInput] = useState<AccountUsageType>(
    db.settings.account?.usageType ?? 'business'
  );
  const [businessNameInput, setBusinessNameInput] = useState(db.settings.businessName);
  const [accountError, setAccountError] = useState('');
  const [waTemplateInput, setWaTemplateInput] = useState(db.settings.whatsAppTemplate);
  const [updateUrlInput, setUpdateUrlInput] = useState(
    db.settings.updateManifestUrl ?? ''
  );
  const [driveClientIdInput, setDriveClientIdInput] = useState(
    db.settings.driveBackup?.webClientId ?? ''
  );

  useEffect(() => {
    setDriveClientIdInput(db.settings.driveBackup?.webClientId ?? '');
  }, [db.settings.driveBackup?.webClientId]);

  useEffect(() => {
    setFullNameInput(db.settings.account?.fullName ?? '');
    setPhoneInput(db.settings.account?.phone ?? '');
    setUsageTypeInput(db.settings.account?.usageType ?? 'business');
  }, [db.settings.account]);

  useEffect(() => {
    setBusinessNameInput(db.settings.businessName);
  }, [db.settings.businessName]);

  useEffect(() => {
    setWaTemplateInput(db.settings.whatsAppTemplate);
  }, [db.settings.whatsAppTemplate]);

  useEffect(() => {
    setUpdateUrlInput(db.settings.updateManifestUrl ?? '');
  }, [db.settings.updateManifestUrl]);

  const [pinModalMode, setPinModalMode] = useState<'enable' | 'change' | 'disable' | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmResetAccountOpen, setConfirmResetAccountOpen] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<ParsedBackupResult | null>(null);

  // Encrypted backup passphrase modal state
  const [passModalMode, setPassModalMode] = useState<'export' | 'import' | null>(null);
  const [pendingEncryptedRaw, setPendingEncryptedRaw] = useState<string | null>(null);
  const [passInput, setPassInput] = useState('');
  const [passConfirmInput, setPassConfirmInput] = useState('');
  const [passError, setPassError] = useState('');
  const [passBusy, setPassBusy] = useState(false);

  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  const handleSaveAccountProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setAccountError('');
    const cleanName = fullNameInput.trim();
    if (cleanName.length < 2) {
      setAccountError(s.accountFullNameError);
      return;
    }
    const cleanPhone = phoneInput.trim();
    if (cleanPhone && !isValidPhoneInput(cleanPhone)) {
      setAccountError(UI_TEXT[lang].onboarding.phoneInvalidError);
      return;
    }
    const formattedPhone = cleanPhone ? formatMoroccanPhone(cleanPhone) : '';
    setPhoneInput(formattedPhone);
    onUpdateAccountProfile({
      fullName: cleanName,
      phone: formattedPhone,
      businessName: businessNameInput.trim(),
      usageType: usageTypeInput,
    });
  };

  const handleSaveUpdateUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = updateUrlInput.trim();
    onUpdateManifestUrl(cleaned);
    showToast(s.updatesUrlSaved);
    if (cleaned) {
      onCheckForUpdates(cleaned);
    }
  };

  const handleSaveDriveClientId = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateDriveWebClientId(driveClientIdInput.trim());
    showToast(s.driveClientSavedToast);
  };

  const handleDriveRestoreClick = async () => {
    const parsed = await onRestoreFromDrive();
    if (parsed) {
      setPendingRestore(parsed);
    }
  };

  const drive = db.settings.driveBackup;
  const driveConnected = Boolean(drive?.connected);
  const driveEnabled = Boolean(drive?.enabled && drive?.connected);
  const driveIntervalHours = drive?.intervalHours || DRIVE_AUTO_BACKUP_INTERVAL_HOURS;
  const nextDriveIso =
    driveEnabled && drive?.lastBackupAt
      ? computeNextDriveBackupIso(drive.lastBackupAt, driveIntervalHours)
      : null;
  const nativePlatform = isNativeApp();

  const handleSaveWhatsAppTemplate = () => {
    onUpdateWhatsAppTemplate(waTemplateInput.trim());
    showToast(s.waTemplateSaved);
  };

  const handleResetWhatsAppTemplate = () => {
    setWaTemplateInput('');
    onUpdateWhatsAppTemplate('');
    showToast(s.waTemplateSaved);
  };

  const handleExportJSON = () => {
    const content = buildJSONBackup(db);
    triggerFileDownload(
      content,
      `carnet-credit-backup-${getTodayISODate()}.json`,
      'application/json;charset=utf-8'
    );
    onMarkBackedUp();
    showToast(s.jsonToast);
  };

  const handleOpenEncryptedExport = () => {
    if (!canUseStrongEncryption()) {
      showToast(
        lang === 'ar'
          ? 'التشفير القوي يتطلب فتح التطبيق عبر HTTPS أو localhost.'
          : 'Le chiffrement fort nécessite un contexte sécurisé (HTTPS ou localhost).',
        'error'
      );
      return;
    }
    setPassInput('');
    setPassConfirmInput('');
    setPassError('');
    setPassModalMode('export');
  };

  const handleExportCSV = () => {
    const csv = buildTransactionsCSV(
      db.contacts,
      db.transactions,
      getTodayISODate(),
      lang,
      db.settings.csvDelimiter
    );
    triggerFileDownload(
      csv,
      `carnet-credit-operations-${getTodayISODate()}.csv`,
      'text/csv;charset=utf-8'
    );
    showToast(s.csvToast);
  };

  const handleJsonFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      if (isEncryptedBackupText(text)) {
        if (!canUseStrongEncryption()) {
          showToast(
            lang === 'ar'
              ? 'فك التشفير يتطلب فتح التطبيق عبر HTTPS أو localhost.'
              : 'Le déchiffrement nécessite un contexte sécurisé (HTTPS ou localhost).',
            'error'
          );
          return;
        }
        setPendingEncryptedRaw(text);
        setPassInput('');
        setPassConfirmInput('');
        setPassError('');
        setPassModalMode('import');
        return;
      }

      const parsed = parseAndValidateBackupJSON(text, lang);
      setPendingRestore(parsed);
    } catch (err) {
      showToast(err instanceof Error ? err.message : s.restoreReadError, 'error');
    }
  };

  const handleCsvFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const imported = parseTransactionsCSV(text, db.contacts, lang, db.transactions);
      onImportCsv(imported);
      showToast(
        s.csvImportedToast(
          imported.addedContacts,
          imported.addedTransactions,
          imported.skippedRows
        )
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : s.restoreReadError, 'error');
    }
  };

  const handlePassphraseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passBusy) return;

    if (passInput.length < 4) {
      setPassError(s.passphraseError);
      return;
    }

    if (passModalMode === 'export' && passInput !== passConfirmInput) {
      setPassError(s.passphraseMismatch);
      return;
    }

    setPassError('');
    setPassBusy(true);
    try {
      if (passModalMode === 'export') {
        const plainJson = buildJSONBackup(db);
        const encryptedJson = await encryptBackupJSON(plainJson, passInput, lang);
        triggerFileDownload(
          encryptedJson,
          `carnet-credit-backup-AES-${getTodayISODate()}.json`,
          'application/json;charset=utf-8'
        );
        onMarkBackedUp();
        setPassModalMode(null);
        showToast(s.encryptedToast);
      } else if (passModalMode === 'import' && pendingEncryptedRaw) {
        const decryptedJson = await decryptBackupJSON(pendingEncryptedRaw, passInput, lang);
        const parsed = parseAndValidateBackupJSON(decryptedJson, lang);
        setPendingEncryptedRaw(null);
        setPassModalMode(null);
        setPendingRestore(parsed);
      }
    } catch (err) {
      setPassError(err instanceof Error ? err.message : s.restoreReadError);
    } finally {
      setPassBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{s.title}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">{s.subtitle}</p>
      </div>

      {/* Registered Account Profile */}
      <section className="space-y-3.5 rounded-3xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-700 text-sm font-extrabold text-white shadow-xs">
              {(db.settings.account?.fullName || db.settings.businessName || 'C')
                .trim()
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
                <UserCog className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                <span>{s.accountSectionTitle}</span>
              </h3>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {db.settings.account?.createdAt
                  ? s.accountSinceLabel(
                      formatDateTimeFR(db.settings.account.createdAt, lang).date
                    )
                  : s.accountSectionDesc}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveAccountProfile} className="space-y-3">
          {accountError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300">
              {accountError}
            </div>
          )}

          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
              <User className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
              {s.accountFullNameLabel}
            </label>
            <input
              type="text"
              value={fullNameInput}
              onChange={(e) => {
                setFullNameInput(e.target.value);
                if (accountError) setAccountError('');
              }}
              placeholder={s.accountFullNamePlaceholder}
              className="mt-1 min-h-[42px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-medium text-slate-900 outline-none focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900"
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-bold text-slate-700 dark:text-slate-300">
              {s.accountUsageLabel}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setUsageTypeInput('business')}
                className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-2xl border px-3 text-xs font-bold transition ${
                  usageTypeInput === 'business'
                    ? 'border-teal-600 bg-teal-700 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                <Store className="h-3.5 w-3.5" />
                <span>{s.accountUsageBusiness}</span>
              </button>
              <button
                type="button"
                onClick={() => setUsageTypeInput('personal')}
                className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-2xl border px-3 text-xs font-bold transition ${
                  usageTypeInput === 'personal'
                    ? 'border-teal-600 bg-teal-700 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                <User className="h-3.5 w-3.5" />
                <span>{s.accountUsagePersonal}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
              <Store className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
              {s.businessLabel}
            </label>
            <input
              type="text"
              value={businessNameInput}
              onChange={(e) => setBusinessNameInput(e.target.value)}
              placeholder={s.businessPlaceholder}
              className="mt-1 min-h-[42px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-medium text-slate-900 outline-none focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900"
            />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {s.businessHint}
            </p>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
              <Phone className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
              {s.accountPhoneLabel}
            </label>
            <input
              type="tel"
              dir="ltr"
              value={phoneInput}
              onChange={(e) => {
                setPhoneInput(e.target.value);
                if (accountError) setAccountError('');
              }}
              placeholder={s.accountPhonePlaceholder}
              className="mt-1 min-h-[42px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-medium text-slate-900 outline-none focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900"
            />
          </div>

          <button
            type="submit"
            className="min-h-[44px] w-full rounded-2xl bg-slate-900 px-4 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-teal-700 dark:hover:bg-teal-600"
          >
            {s.accountSaveBtn}
          </button>
        </form>
      </section>

      {/* Language Selector */}
      <section className="rounded-3xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
            <Languages className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              {s.languageTitle}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{s.languageDesc}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => onChangeLanguage('fr')}
            className={`flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-bold transition ${
              lang === 'fr'
                ? 'border-teal-600 bg-teal-700 text-white shadow-sm'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span className="text-xs font-extrabold opacity-80">FR</span>
            <span>{s.langFrench}</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeLanguage('ar')}
            className={`flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-bold transition ${
              lang === 'ar'
                ? 'border-teal-600 bg-teal-700 text-white shadow-sm'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span className="text-xs font-extrabold opacity-80">AR</span>
            <span>{s.langArabic}</span>
          </button>
        </div>
      </section>

      {/* Appearance / Dark Mode */}
      <section className="rounded-3xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
            {db.settings.theme === 'dark' ? (
              <Moon className="h-5 w-5" />
            ) : (
              <Sun className="h-5 w-5" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              {s.themeTitle}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{s.themeDesc}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => onChangeTheme('light')}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-bold transition ${
              db.settings.theme === 'light'
                ? 'border-teal-600 bg-teal-700 text-white shadow-sm'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            <Sun className="h-4 w-4" />
            {s.themeLight}
          </button>

          <button
            type="button"
            onClick={() => onChangeTheme('dark')}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-bold transition ${
              db.settings.theme === 'dark'
                ? 'border-teal-600 bg-teal-700 text-white shadow-sm'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            <Moon className="h-4 w-4" />
            {s.themeDark}
          </button>
        </div>
      </section>

      {/* Display Preferences */}
      <section className="space-y-4 rounded-3xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Discreet mode */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {db.settings.hideAmounts ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {s.discreetTitle}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{s.discreetDesc}</p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={db.settings.hideAmounts}
            onClick={onToggleHideAmounts}
            dir="ltr"
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
              db.settings.hideAmounts
                ? 'bg-teal-600'
                : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                db.settings.hideAmounts ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Hide decimals */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {s.hideDecimalsTitle}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {s.hideDecimalsDesc}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={db.settings.hideDecimals}
            onClick={onToggleHideDecimals}
            dir="ltr"
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
              db.settings.hideDecimals
                ? 'bg-teal-600'
                : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                db.settings.hideDecimals ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </section>

      {/* PIN Security & Auto-Lock */}
      <section className="space-y-3 rounded-3xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                db.settings.pinEnabled
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {db.settings.pinEnabled ? (
                <ShieldCheck className="h-5 w-5" />
              ) : (
                <Shield className="h-5 w-5" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {s.pinTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {db.settings.pinEnabled ? s.pinActiveDesc : s.pinInactiveDesc}
              </p>
            </div>
          </div>

          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
              db.settings.pinEnabled
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {db.settings.pinEnabled ? s.pinActiveBadge : s.pinInactiveBadge}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {!db.settings.pinEnabled ? (
            <button
              type="button"
              onClick={() => setPinModalMode('enable')}
              className="flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-2xl bg-teal-700 px-4 text-xs font-bold text-white transition hover:bg-teal-800"
            >
              <Lock className="h-4 w-4" />
              {s.pinEnableBtn}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onLockNow}
                className="flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-2xl bg-slate-900 px-3 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <Lock className="h-4 w-4" />
                {s.pinLockNowBtn}
              </button>
              <button
                type="button"
                onClick={() => setPinModalMode('change')}
                className="flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {s.pinChangeBtn}
              </button>
              <button
                type="button"
                onClick={() => setPinModalMode('disable')}
                className="flex min-h-[42px] items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-300"
              >
                {s.pinDisableBtn}
              </button>
            </>
          )}
        </div>

        {db.settings.pinEnabled && (
          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <p className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-300">
              {s.autoLockLabel}
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {AUTO_LOCK_OPTIONS.map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => onUpdateAutoLockMinutes(mins)}
                  className={`min-h-[36px] rounded-xl px-2 text-xs font-bold transition ${
                    db.settings.autoLockMinutes === mins
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {mins === 0 ? s.autoLockNever : s.autoLockMin(mins)}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* WhatsApp Template & CSV Format */}
      <section className="space-y-4 rounded-3xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <p className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-300">
            {s.csvSepLabel}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onUpdateCsvDelimiter(';')}
              className={`min-h-[40px] rounded-2xl border px-3 text-xs font-bold transition ${
                db.settings.csvDelimiter === ';'
                  ? 'border-teal-600 bg-teal-700 text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {s.csvSemiLabel}
            </button>
            <button
              type="button"
              onClick={() => onUpdateCsvDelimiter(',')}
              className={`min-h-[40px] rounded-2xl border px-3 text-xs font-bold transition ${
                db.settings.csvDelimiter === ','
                  ? 'border-teal-600 bg-teal-700 text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {s.csvCommaLabel}
            </button>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
          <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
            {s.waTemplateLabel}
          </label>
          <textarea
            rows={3}
            value={waTemplateInput}
            onChange={(e) => setWaTemplateInput(e.target.value)}
            placeholder={s.waTemplatePlaceholder}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900"
          />
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {s.waTemplateHint}
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={handleSaveWhatsAppTemplate}
              className="min-h-[38px] flex-1 rounded-xl bg-teal-700 px-3 text-xs font-bold text-white transition hover:bg-teal-800"
            >
              {s.waTemplateSave}
            </button>
            {waTemplateInput && (
              <button
                type="button"
                onClick={handleResetWhatsAppTemplate}
                className="flex min-h-[38px] items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {s.waTemplateReset}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Google Drive Auto-Backup (Every 10 Hours) */}
      <section className="space-y-3.5 rounded-3xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                driveConnected
                  ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {driveConnected ? (
                <Cloud className="h-5 w-5" />
              ) : (
                <CloudOff className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {s.driveTitle}
              </h3>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {driveConnected && drive?.email
                  ? drive.email
                  : s.driveSubtitle(driveIntervalHours)}
              </p>
            </div>
          </div>

          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
              driveConnected
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {driveConnected ? s.driveConnectedBadge : s.driveDisconnectedBadge}
          </span>
        </div>

        {drive?.needsReauth && driveConnected && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{s.driveReauthWarning}</span>
          </div>
        )}

        {driveConnected ? (
          <>
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50/90 p-3 dark:bg-slate-800/60">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900 dark:text-white">
                  <Clock className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                  <span>{s.driveAutoToggleTitle(driveIntervalHours)}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {s.driveAutoToggleDesc}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={driveEnabled}
                onClick={onToggleDriveAutoBackup}
                dir="ltr"
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                  driveEnabled ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    driveEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="space-y-1 rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
              <p className="font-semibold">
                {drive?.lastBackupAt
                  ? s.driveLastBackupLabel(
                      (() => {
                        const { date, time } = formatDateTimeFR(drive.lastBackupAt, lang);
                        return time ? `${date} • ${time}` : date;
                      })()
                    )
                  : s.driveNeverBackedUp}
              </p>
              {nextDriveIso && (
                <p className="text-teal-700 dark:text-teal-400">
                  {s.driveNextBackupLabel(
                    (() => {
                      const { date, time } = formatDateTimeFR(nextDriveIso, lang);
                      return time ? `${date} • ${time}` : date;
                    })()
                  )}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={driveBusy !== 'idle'}
                onClick={onBackupDriveNow}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl bg-sky-600 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
              >
                <CloudUpload className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {driveBusy === 'backing_up' ? s.driveBackingUpBtn : s.driveBackupNowBtn}
                </span>
              </button>

              <button
                type="button"
                disabled={driveBusy !== 'idle'}
                onClick={handleDriveRestoreClick}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl border border-sky-200 bg-sky-50 px-3 text-xs font-bold text-sky-800 transition hover:bg-sky-100 disabled:opacity-60 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300"
              >
                <Download className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {driveBusy === 'restoring' ? s.driveRestoringBtn : s.driveRestoreBtn}
                </span>
              </button>
            </div>

            <button
              type="button"
              disabled={driveBusy !== 'idle'}
              onClick={onDisconnectDrive}
              className="min-h-[38px] w-full rounded-xl border border-rose-200 bg-rose-50/70 px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
            >
              {s.driveDisconnectBtn}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {s.driveAutoToggleDesc}
            </p>
            <button
              type="button"
              disabled={driveBusy !== 'idle'}
              onClick={onConnectDrive}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 text-xs font-extrabold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
            >
              <Cloud className="h-4 w-4" />
              <span>
                {driveBusy === 'connecting' ? s.driveConnectingBtn : s.driveConnectBtn}
              </span>
            </button>
          </div>
        )}

        {!nativePlatform && (
          <form
            onSubmit={handleSaveDriveClientId}
            className="space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800"
          >
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              {s.driveWebClientLabel}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                dir="ltr"
                value={driveClientIdInput}
                onChange={(e) => setDriveClientIdInput(e.target.value)}
                placeholder={s.driveWebClientPlaceholder}
                className="min-h-[40px] flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-900 outline-none focus:border-sky-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <button
                type="submit"
                className="min-h-[40px] shrink-0 rounded-2xl bg-slate-900 px-3.5 text-xs font-bold text-white hover:bg-slate-800 dark:bg-teal-700 dark:hover:bg-teal-600"
              >
                {s.okBtn}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {s.driveWebClientHint}
            </p>
          </form>
        )}
      </section>

      {/* Export / Import Backup & CSV */}
      <section className="space-y-3 rounded-3xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              {s.backupTitle}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {s.backupStats(db.contacts.length, db.transactions.length)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleExportJSON}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-teal-700 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-teal-800 active:scale-[0.98]"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span className="truncate">{s.exportJsonBtn}</span>
          </button>

          <button
            type="button"
            onClick={handleOpenEncryptedExport}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-3 text-xs font-bold text-indigo-800 transition hover:bg-indigo-100 active:scale-[0.98] dark:border-indigo-900/50 dark:bg-indigo-950/50 dark:text-indigo-300"
          >
            <KeyRound className="h-4 w-4 shrink-0" />
            <span className="truncate">{s.exportEncryptedBtn}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800 transition hover:bg-slate-100 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="truncate">{s.exportCsvBtn}</span>
          </button>

          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800 transition hover:bg-slate-100 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Upload className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
            <span className="truncate">{s.importCsvBtn}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => jsonInputRef.current?.click()}
          className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 text-xs font-bold text-slate-700 transition hover:border-teal-500 hover:bg-teal-50/50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:border-teal-500"
        >
          <Upload className="h-4 w-4" />
          {s.restoreJsonBtn}
        </button>

        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleJsonFileChosen}
        />
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleCsvFileChosen}
        />
      </section>

      {/* Automatic App Updates (OTA + Store) */}
      <section className="space-y-3 rounded-3xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <DownloadCloud className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {s.updatesTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {s.updatesSubtitle(runningVersion)}
              </p>
            </div>
          </div>

          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-extrabold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            v{runningVersion}
          </span>
        </div>

        {updateInfo?.hasUpdate ? (
          <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs dark:border-emerald-900/60 dark:bg-emerald-950/40">
            <p className="font-extrabold text-emerald-900 dark:text-emerald-200">
              {s.updatesAvailableTitle(updateInfo.latestVersion)}
            </p>
            {(lang === 'ar'
              ? updateInfo.manifest.notesAr || updateInfo.manifest.notesFr
              : updateInfo.manifest.notesFr || updateInfo.manifest.notesAr) && (
              <p className="text-emerald-800/90 dark:text-emerald-300/90">
                {lang === 'ar'
                  ? updateInfo.manifest.notesAr || updateInfo.manifest.notesFr
                  : updateInfo.manifest.notesFr || updateInfo.manifest.notesAr}
              </p>
            )}
            {updateInstalling ? (
              <div className="space-y-1 pt-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-200 dark:bg-emerald-900">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all duration-200"
                    style={{ width: `${Math.max(8, updateProgress)}%` }}
                  />
                </div>
                <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                  {s.updatesInstalling(updateProgress)}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={onInstallUpdate}
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-800"
              >
                <DownloadCloud className="h-4 w-4" />
                <span>
                  {updateInfo.installMode === 'external'
                    ? s.updatesDownloadExternalBtn
                    : s.updatesInstallOtaBtn}
                </span>
              </button>
            )}
          </div>
        ) : updateInfo && !updateInfo.hasUpdate ? (
          <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:bg-slate-800/70 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{s.updatesUpToDate}</span>
          </div>
        ) : null}

        <button
          type="button"
          disabled={updateChecking || updateInstalling}
          onClick={() => onCheckForUpdates(updateUrlInput.trim() || undefined)}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${updateChecking ? 'animate-spin' : ''}`} />
          <span>{updateChecking ? s.updatesChecking : s.updatesCheckBtn}</span>
        </button>

        {db.settings.lastUpdateCheckAt && (
          <p className="text-[11px] text-slate-400">
            {s.updatesLastChecked(
              (() => {
                const { date, time } = formatDateTimeFR(
                  db.settings.lastUpdateCheckAt,
                  lang
                );
                return time ? `${date} • ${time}` : date;
              })()
            )}
          </p>
        )}

        <form
          onSubmit={handleSaveUpdateUrl}
          className="space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800"
        >
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            {s.updatesUrlLabel}
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              dir="ltr"
              value={updateUrlInput}
              onChange={(e) => setUpdateUrlInput(e.target.value)}
              placeholder={s.updatesUrlPlaceholder}
              className="min-h-[42px] flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-900 outline-none focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <button
              type="submit"
              className="min-h-[42px] shrink-0 rounded-2xl bg-slate-900 px-3.5 text-xs font-bold text-white hover:bg-slate-800 dark:bg-teal-700 dark:hover:bg-teal-600"
            >
              {s.okBtn}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {s.updatesUrlHint}
          </p>
        </form>
      </section>

      {/* Local Data & Account Reset */}
      <section className="space-y-3 rounded-3xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
          {s.localDataTitle}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setConfirmClearOpen(true)}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-800 transition hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-300"
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{s.clearTestBtn}</span>
          </button>

          <button
            type="button"
            onClick={() => setConfirmResetAccountOpen(true)}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-300"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="truncate">{s.resetAccountBtn}</span>
          </button>
        </div>
      </section>

      {/* Offline PWA Notice */}
      <section className="rounded-3xl border border-teal-100 bg-teal-50/70 p-4 dark:border-teal-900/40 dark:bg-teal-950/30">
        <div className="flex items-start gap-2.5">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-teal-700 dark:text-teal-400" />
          <div>
            <h3 className="text-xs font-extrabold text-teal-900 dark:text-teal-200">
              {s.pwaTitle}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-teal-800/90 dark:text-teal-300/90">
              {s.pwaDesc}
            </p>
          </div>
        </div>
      </section>

      {/* PIN Setup / Change / Disable Modal */}
      <PinSetupModal
        open={pinModalMode !== null}
        lang={lang}
        mode={pinModalMode ?? 'enable'}
        currentPinHash={db.settings.pinHash}
        currentRecoveryQuestion={db.settings.pinRecoveryQuestion}
        onClose={() => setPinModalMode(null)}
        onComplete={(newPin, recovery) => {
          onSavePin(newPin, recovery);
          setPinModalMode(null);
        }}
      />

      {/* Encrypted Backup Passphrase Modal */}
      {passModalMode && (
        <div
          className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-900/55 p-4 backdrop-blur-[2px] sm:items-center"
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
                  {passModalMode === 'export'
                    ? s.passphraseExportTitle
                    : s.passphraseImportTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPassModalMode(null);
                  setPendingEncryptedRaw(null);
                }}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label={UI_TEXT[lang].statement.close}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {passModalMode === 'export'
                ? s.passphraseDescExport
                : s.passphraseDescImport}
            </p>

            <form onSubmit={handlePassphraseSubmit} className="mt-4 space-y-2.5">
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
              {passModalMode === 'export' && (
                <input
                  type="password"
                  value={passConfirmInput}
                  onChange={(e) => {
                    setPassConfirmInput(e.target.value);
                    setPassError('');
                  }}
                  placeholder={s.passphraseConfirmPlaceholder}
                  className="min-h-[46px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-medium text-slate-900 outline-none focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              )}

              {passError && (
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {passError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPassModalMode(null);
                    setPendingEncryptedRaw(null);
                  }}
                  className="min-h-[44px] rounded-2xl border border-slate-200 text-sm font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  {d.cancelDefault}
                </button>
                <button
                  type="submit"
                  disabled={passBusy}
                  className="min-h-[44px] rounded-2xl bg-indigo-600 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {passModalMode === 'export'
                    ? s.passphraseSubmitExport
                    : s.passphraseSubmitImport}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Replace vs Merge Restore Dialog */}
      {pendingRestore && (
        <div
          className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-900/55 p-4 backdrop-blur-[2px] sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="animate-sheet-up w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:border dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                <Upload className="h-5 w-5" />
              </div>
              <button
                type="button"
                onClick={() => setPendingRestore(null)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label={UI_TEXT[lang].statement.close}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">
              {s.confirmRestoreTitle}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {s.confirmRestoreDesc(
                pendingRestore.contacts.length,
                pendingRestore.transactions.length
              )}
            </p>

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  onRestoreBackup(pendingRestore, 'merge');
                  setPendingRestore(null);
                }}
                className="min-h-[46px] w-full rounded-2xl bg-teal-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800"
              >
                {s.restoreMergeBtn}
              </button>
              <button
                type="button"
                onClick={() => {
                  onRestoreBackup(pendingRestore, 'replace');
                  setPendingRestore(null);
                }}
                className="min-h-[46px] w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-300"
              >
                {s.restoreReplaceBtn}
              </button>
              <button
                type="button"
                onClick={() => setPendingRestore(null)}
                className="min-h-[42px] w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {d.cancelDefault}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Data Confirmation */}
      <ConfirmDialog
        open={confirmClearOpen}
        lang={lang}
        title={s.confirmClearTitle}
        description={s.confirmClearDesc}
        confirmLabel={s.confirmClearBtn}
        danger
        onConfirm={() => {
          onClearAllData();
          setConfirmClearOpen(false);
        }}
        onCancel={() => setConfirmClearOpen(false)}
      />

      {/* Reset Entire Account Confirmation */}
      <ConfirmDialog
        open={confirmResetAccountOpen}
        lang={lang}
        title={s.confirmResetAccountTitle}
        description={s.confirmResetAccountDesc}
        confirmLabel={s.confirmResetAccountBtn}
        danger
        onConfirm={() => {
          onResetAccount();
          setConfirmResetAccountOpen(false);
        }}
        onCancel={() => setConfirmResetAccountOpen(false)}
      />
    </div>
  );
}
