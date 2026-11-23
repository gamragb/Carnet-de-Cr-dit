import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpenCheck,
  DownloadCloud,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Moon,
  RefreshCw,
  Sun,
  X,
} from 'lucide-react';
import {
  AccountOnboardingScreen,
  type AccountRegistrationPayload,
} from './components/AccountOnboardingScreen.tsx';
import { BottomNav, type NavTab } from './components/BottomNav.tsx';
import { ConfirmDialog } from './components/ConfirmDialog.tsx';
import { ContactModal } from './components/ContactModal.tsx';
import { GlobalReportModal } from './components/GlobalReportModal.tsx';
import { PinLockScreen } from './components/PinLockScreen.tsx';
import { TransactionModal } from './components/TransactionModal.tsx';
import { ToastProvider, useToast } from './context/ToastContext.tsx';
import { UI_TEXT } from './i18n/translations.ts';
import type {
  AccountUsageType,
  AppLanguage,
  AppTheme,
  Contact,
  ContactCategory,
  DashboardFilter,
  LedgerDatabase,
  PaymentMethod,
  Transaction,
  TransactionType,
} from './types/ledger.ts';
import {
  DEFAULT_GOOGLE_WEB_CLIENT_ID,
  DRIVE_AUTO_BACKUP_INTERVAL_HOURS,
} from './config/driveConfig.ts';
import { APP_VERSION, DEFAULT_UPDATE_MANIFEST_URL } from './config/updateConfig.ts';
import {
  checkForAppUpdate,
  getRunningAppVersion,
  installNativeOtaUpdate,
  isValidUpdateUrl,
  notifyNativeAppReady,
  type UpdateCheckResult,
} from './utils/appUpdater.ts';
import {
  buildJSONBackup,
  mergeBackupDatabases,
  parseAndValidateBackupJSON,
  triggerFileDownload,
  type ParsedBackupResult,
} from './utils/exportImport.ts';
import {
  EMAIL_AUTO_BACKUP_INTERVAL_HOURS,
  buildEmailAttachmentJSONBackup,
  buildEmailBackupPayload,
  clearAllNativeBackups,
  formatEmailBackupError,
  getNativeEmailBackupStatus,
  isEmailBackupDue,
  isValidEmailAddress,
  sendBackupToEmail,
  syncNativeEmailBackupConfig,
} from './utils/emailBackup.ts';
import {
  backupToGoogleDrive,
  configureNativeDriveSchedule,
  connectGoogleDrive,
  disconnectGoogleDrive,
  formatDriveError,
  getNativeDriveStatus,
  isDriveBackupDue,
  restoreFromGoogleDrive,
  syncNativeDriveSnapshot,
} from './utils/googleDriveBackup.ts';
import { getTodayISODate } from './utils/formatters.ts';
import {
  computeAllLedgers,
  computeAnalytics,
  computeContactLedger,
  filterContactSummaries,
} from './utils/ledgerMath.ts';
import { isNativeApp } from './utils/nativePlatform.ts';
import { hashPin, hashRecoveryAnswer } from './utils/security.ts';
import {
  createEmptyDatabase,
  createInitialDatabase,
  generateId,
  loadDatabaseSync,
  loadFromIndexedDB,
  saveDatabaseSync,
} from './utils/storage.ts';
import { ContactDetailView } from './views/ContactDetailView.tsx';
import { ContactsView } from './views/ContactsView.tsx';
import { DashboardView } from './views/DashboardView.tsx';
import { DeadlinesView } from './views/DeadlinesView.tsx';
import { SettingsView } from './views/SettingsView.tsx';

function LedgerApp() {
  const { showToast } = useToast();

  const initialLoad = useMemo(() => loadDatabaseSync(), []);
  const [db, setDb] = useState<LedgerDatabase>(initialLoad.db);
  const [idbHydrated, setIdbHydrated] = useState(
    initialLoad.fromLocalStorage && !initialLoad.idbAhead
  );
  const hasMutatedRef = useRef(false);
  const swReloadingRef = useRef(false);

  const [isUnlocked, setIsUnlocked] = useState<boolean>(
    () => !(initialLoad.db.settings.pinEnabled && initialLoad.db.settings.pinHash)
  );

  const [todayISO, setTodayISO] = useState<string>(() => getTodayISODate());

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [dashboardFilter, setDashboardFilter] = useState<DashboardFilter>('all');

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txInitialContactId, setTxInitialContactId] = useState<string | null>(null);
  const [txInitialType, setTxInitialType] = useState<TransactionType>('credit_given');
  const [txInitialAmount, setTxInitialAmount] = useState<number | null>(null);
  const [txInitialNote, setTxInitialNote] = useState<string>('');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const [globalReportOpen, setGlobalReportOpen] = useState(false);
  const [backupReminderDismissed, setBackupReminderDismissed] = useState(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(
    null
  );

  const [runningVersion, setRunningVersion] = useState<string>(APP_VERSION);
  const [versionResolved, setVersionResolved] = useState<boolean>(() => !isNativeApp());
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false);
  const autoCheckedRef = useRef(false);

  const [driveBusy, setDriveBusy] = useState<
    'idle' | 'connecting' | 'backing_up' | 'restoring'
  >('idle');
  const driveAutoRunningRef = useRef(false);

  const [emailBackupBusy, setEmailBackupBusy] = useState(false);
  const emailAutoRunningRef = useRef(false);

  const [deleteContactTarget, setDeleteContactTarget] = useState<Contact | null>(null);
  const [deleteTxTarget, setDeleteTxTarget] = useState<Transaction | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [forcePinRecoveryScreen, setForcePinRecoveryScreen] = useState(false);

  const lastActivityRef = useRef<number>(Date.now());
  const hiddenAtRef = useRef<number | null>(null);

  const lang = db.settings.language;
  const theme = db.settings.theme;
  const t = UI_TEXT[lang];

  const updateDb = useCallback(
    (updater: LedgerDatabase | ((prev: LedgerDatabase) => LedgerDatabase)) => {
      hasMutatedRef.current = true;
      setDb(updater);
    },
    []
  );

  // Sync HTML lang, dir, document title, dark mode class & mobile browser theme-color
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = `${t.appName} — ${t.appSubtitleDefault}`;
  }, [lang, t.appName, t.appSubtitleDefault]);

  useEffect(() => {
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isDark ? '#0f172a' : '#0f766e');
    }
  }, [theme]);

  // Hydrate from IndexedDB if LocalStorage was missing, stale, or exceeded quota
  useEffect(() => {
    let cancelled = false;
    loadFromIndexedDB().then((idbDb) => {
      if (cancelled) return;
      const shouldUseIdb =
        idbDb &&
        !hasMutatedRef.current &&
        (!initialLoad.fromLocalStorage ||
          initialLoad.idbAhead ||
          (idbDb.updatedAt &&
            (!initialLoad.db.updatedAt || idbDb.updatedAt > initialLoad.db.updatedAt)));

      if (shouldUseIdb && idbDb) {
        setDb(idbDb);
        if (idbDb.settings.pinEnabled && idbDb.settings.pinHash) {
          setIsUnlocked(false);
        }
      }
      setIdbHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [initialLoad]);

  // Persist changes to LocalStorage + serialized IndexedDB queue (only once hydrated & mutated)
  useEffect(() => {
    if (!idbHydrated) return;
    if (!hasMutatedRef.current && initialLoad.fromLocalStorage) return;
    if (!hasMutatedRef.current && !db.settings.accountRegistered) return;
    saveDatabaseSync(db);
  }, [db, idbHydrated, initialLoad.fromLocalStorage]);

  // Refresh todayISO across midnight or tab resume
  useEffect(() => {
    const syncDate = () => {
      const next = getTodayISODate();
      setTodayISO((prev) => (prev === next ? prev : next));
    };
    const timer = window.setInterval(syncDate, 60_000);
    window.addEventListener('focus', syncDate);
    document.addEventListener('visibilitychange', syncDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', syncDate);
      document.removeEventListener('visibilitychange', syncDate);
    };
  }, []);

  // Service Worker update notification listener & Capacitor OTA ready signal
  useEffect(() => {
    void notifyNativeAppReady();
    void getRunningAppVersion()
      .then((v) => setRunningVersion(v))
      .finally(() => setVersionResolved(true));

    const handler = (ev: Event) => {
      const custom = ev as CustomEvent<ServiceWorkerRegistration>;
      if (custom.detail) {
        setSwRegistration(custom.detail);
      }
    };
    window.addEventListener('carnet:sw-update', handler);
    return () => window.removeEventListener('carnet:sw-update', handler);
  }, []);

  // Android hardware back button handling inside Capacitor shell
  const backHandlerRef = useRef<() => void>(() => {});
  backHandlerRef.current = () => {
    const backEv = new CustomEvent('carnet:android-back', { cancelable: true });
    window.dispatchEvent(backEv);
    if (backEv.defaultPrevented) {
      return;
    }

    if (forcePinRecoveryScreen) {
      setForcePinRecoveryScreen(false);
    } else if (logoutConfirmOpen) {
      setLogoutConfirmOpen(false);
    } else if (deleteTxTarget) {
      setDeleteTxTarget(null);
    } else if (deleteContactTarget) {
      setDeleteContactTarget(null);
    } else if (globalReportOpen) {
      setGlobalReportOpen(false);
    } else if (txModalOpen) {
      setTxModalOpen(false);
      setEditingTx(null);
    } else if (contactModalOpen) {
      setContactModalOpen(false);
      setEditingContact(null);
    } else if (selectedContactId) {
      setSelectedContactId(null);
    } else if (activeTab !== 'dashboard') {
      setActiveTab('dashboard');
    } else {
      void import('@capacitor/app').then(({ App: CapApp }) => CapApp.exitApp());
    }
  };

  useEffect(() => {
    if (!isNativeApp()) return;
    let removeHandle: (() => Promise<void>) | null = null;
    let disposed = false;

    void import('@capacitor/app').then(({ App: CapApp }) => {
      if (disposed) return;
      void CapApp.addListener('backButton', () => {
        backHandlerRef.current();
      }).then((listener) => {
        if (disposed) {
          void listener.remove();
        } else {
          removeHandle = () => listener.remove();
        }
      });
    });

    return () => {
      disposed = true;
      if (removeHandle) void removeHandle();
    };
  }, []);

  // Auto-lock timer on inactivity or returning from background
  useEffect(() => {
    const pinActive = Boolean(db.settings.pinEnabled && db.settings.pinHash);
    const autoMins = db.settings.autoLockMinutes;
    if (!pinActive || autoMins <= 0 || !isUnlocked) return;

    const thresholdMs = autoMins * 60_000;
    const touchActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
      } else {
        const hiddenAt = hiddenAtRef.current;
        hiddenAtRef.current = null;
        if (hiddenAt && Date.now() - hiddenAt >= thresholdMs) {
          setIsUnlocked(false);
        } else {
          lastActivityRef.current = Date.now();
        }
      }
    };

    const interval = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= thresholdMs) {
        setIsUnlocked(false);
      }
    }, 15_000);

    window.addEventListener('pointerdown', touchActivity, { passive: true });
    window.addEventListener('keydown', touchActivity);
    window.addEventListener('touchstart', touchActivity, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pointerdown', touchActivity);
      window.removeEventListener('keydown', touchActivity);
      window.removeEventListener('touchstart', touchActivity);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [db.settings.pinEnabled, db.settings.pinHash, db.settings.autoLockMinutes, isUnlocked]);

  const { summaries, allDueItems, totals } = useMemo(
    () => computeAllLedgers(db.contacts, db.transactions, todayISO),
    [db.contacts, db.transactions, todayISO]
  );

  const analytics = useMemo(
    () => computeAnalytics(summaries, db.transactions, todayISO),
    [summaries, db.transactions, todayISO]
  );

  const summariesById = useMemo(
    () => new Map(summaries.map((s) => [s.contact.id, s])),
    [summaries]
  );

  const filteredDashboardSummaries = useMemo(
    () =>
      filterContactSummaries(summaries, {
        search: dashboardSearch,
        filter: dashboardFilter,
        lang,
        includeArchived: false,
      }),
    [summaries, dashboardSearch, dashboardFilter, lang]
  );

  const activeContactsCount = useMemo(
    () => summaries.filter((s) => !s.contact.archived).length,
    [summaries]
  );

  const selectedContactSummary = useMemo(
    () => (selectedContactId ? summariesById.get(selectedContactId) ?? null : null),
    [selectedContactId, summariesById]
  );

  const selectedContactEntries = useMemo(() => {
    if (!selectedContactSummary) return [];
    const txs = db.transactions.filter(
      (tx) => tx.contactId === selectedContactSummary.contact.id
    );
    return computeContactLedger(selectedContactSummary.contact, txs, todayISO).entries;
  }, [selectedContactSummary, db.transactions, todayISO]);

  // Daily browser notification trigger when enabled & urgent due items exist
  useEffect(() => {
    if (!db.settings.notificationsEnabled || !isUnlocked) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const sentKey = `carnet_notif_sent_${todayISO}`;
    try {
      if (window.sessionStorage.getItem(sentKey)) return;
      const urgent = allDueItems.filter(
        (d) => !d.isSettled && (d.urgency === 'overdue' || d.urgency === 'today')
      );
      if (urgent.length === 0) return;

      const body =
        lang === 'ar'
          ? `لديك ${urgent.length} موعد/مواعيد استحقاق عاجلة أو متأخرة.`
          : `Vous avez ${urgent.length} échéance(s) urgente(s) ou en retard.`;
      new Notification(t.appName, { body, tag: `carnet-due-${todayISO}` });
      window.sessionStorage.setItem(sentKey, '1');
    } catch {
      // Ignore notification restrictions on mobile webviews
    }
  }, [db.settings.notificationsEnabled, isUnlocked, todayISO, allDueItems, lang, t.appName]);

  // Weekly backup reminder banner
  const backupReminderDays = useMemo(() => {
    if (backupReminderDismissed || db.contacts.length === 0) return null;
    if (!db.settings.lastBackupAt) {
      return db.transactions.length >= 6 ? 0 : null;
    }
    const lastMs = Date.parse(db.settings.lastBackupAt);
    if (!Number.isFinite(lastMs)) return null;
    const diffDays = Math.floor((Date.now() - lastMs) / 86_400_000);
    return diffDays >= 7 ? diffDays : null;
  }, [
    backupReminderDismissed,
    db.contacts.length,
    db.transactions.length,
    db.settings.lastBackupAt,
  ]);

  const urgentDeadlinesCount = totals.overdueItemsCount + totals.soonItemsCount;

  const handleOpenContact = (contactId: string) => {
    setSelectedContactId(contactId);
  };

  const handleOpenNewContact = () => {
    setEditingContact(null);
    setContactModalOpen(true);
  };

  const handleOpenEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setContactModalOpen(true);
  };

  const handleOpenNewOperation = (
    contactId: string | null = null,
    presetType: TransactionType = 'credit_given',
    presetAmount: number | null = null,
    presetNote = ''
  ) => {
    setEditingTx(null);
    setTxInitialContactId(contactId);
    setTxInitialType(presetType);
    setTxInitialAmount(presetAmount);
    setTxInitialNote(presetNote);
    setTxModalOpen(true);
  };

  const handleOpenEditOperation = (tx: Transaction) => {
    setEditingTx(tx);
    setTxInitialContactId(tx.contactId);
    setTxInitialType(tx.type);
    setTxInitialAmount(null);
    setTxInitialNote('');
    setTxModalOpen(true);
  };

  const handleSaveContact = (data: {
    name: string;
    phone: string;
    category: ContactCategory;
    note?: string;
    creditLimit?: number;
    archived?: boolean;
  }) => {
    const now = new Date().toISOString();
    if (editingContact) {
      updateDb((prev) => ({
        ...prev,
        contacts: prev.contacts.map((c) =>
          c.id === editingContact.id ? { ...c, ...data, updatedAt: now } : c
        ),
      }));
      showToast(t.toasts.contactUpdated(data.name));
    } else {
      const created: Contact = {
        id: generateId('c'),
        name: data.name,
        phone: data.phone,
        category: data.category,
        note: data.note,
        creditLimit: data.creditLimit,
        archived: data.archived ?? false,
        createdAt: now,
        updatedAt: now,
      };
      updateDb((prev) => ({
        ...prev,
        contacts: [created, ...prev.contacts],
      }));
      showToast(t.toasts.contactAdded(created.name));
    }
    setContactModalOpen(false);
    setEditingContact(null);
  };

  const handleToggleArchiveContact = (contact: Contact) => {
    const now = new Date().toISOString();
    const nextArchived = !contact.archived;
    updateDb((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c) =>
        c.id === contact.id ? { ...c, archived: nextArchived, updatedAt: now } : c
      ),
    }));
    showToast(
      nextArchived
        ? t.toasts.contactArchived(contact.name)
        : t.toasts.contactUnarchived(contact.name)
    );
  };

  const handleQuickCreateContact = (data: {
    name: string;
    phone: string;
    category: ContactCategory;
  }): Contact => {
    const now = new Date().toISOString();
    const created: Contact = {
      id: generateId('c'),
      name: data.name,
      phone: data.phone,
      category: data.category,
      createdAt: now,
      updatedAt: now,
    };
    updateDb((prev) => ({
      ...prev,
      contacts: [created, ...prev.contacts],
    }));
    showToast(t.toasts.contactCreated(created.name), 'info');
    return created;
  };

  const handleConfirmDeleteContact = () => {
    if (!deleteContactTarget) return;
    const deletedContact = deleteContactTarget;
    const deletedTxs = db.transactions.filter(
      (tx) => tx.contactId === deletedContact.id
    );

    updateDb((prev) => ({
      ...prev,
      contacts: prev.contacts.filter((c) => c.id !== deletedContact.id),
      transactions: prev.transactions.filter((tx) => tx.contactId !== deletedContact.id),
    }));

    if (selectedContactId === deletedContact.id) {
      setSelectedContactId(null);
    }
    setDeleteContactTarget(null);

    showToast(t.toasts.contactDeleted(deletedContact.name), 'info', {
      label: t.undoBtn,
      onClick: () => {
        updateDb((prev) => ({
          ...prev,
          contacts: prev.contacts.some((c) => c.id === deletedContact.id)
            ? prev.contacts
            : [deletedContact, ...prev.contacts],
          transactions: [
            ...deletedTxs.filter(
              (dt) => !prev.transactions.some((pt) => pt.id === dt.id)
            ),
            ...prev.transactions,
          ],
        }));
        showToast(t.toasts.restoredUndo);
      },
    });
  };

  const handleSaveTransaction = (data: {
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
  }) => {
    const now = new Date().toISOString();
    if (editingTx) {
      updateDb((prev) => ({
        ...prev,
        transactions: prev.transactions.map((tx) =>
          tx.id === editingTx.id
            ? {
                ...tx,
                ...data,
                dueResolved: data.dueDate ? tx.dueResolved : false,
                updatedAt: now,
              }
            : tx
        ),
      }));
      showToast(t.toasts.txUpdated);
    } else {
      const created: Transaction = {
        id: generateId('tx'),
        ...data,
        dueResolved: false,
        createdAt: now,
        updatedAt: now,
      };
      updateDb((prev) => ({
        ...prev,
        transactions: [created, ...prev.transactions],
      }));
      showToast(t.toasts.txCreated);
    }
    setTxModalOpen(false);
    setEditingTx(null);
  };

  const handleConfirmDeleteTransaction = () => {
    if (!deleteTxTarget) return;
    const deletedTx = deleteTxTarget;

    updateDb((prev) => ({
      ...prev,
      transactions: prev.transactions.filter((tx) => tx.id !== deletedTx.id),
    }));
    setDeleteTxTarget(null);

    showToast(t.toasts.txDeleted, 'info', {
      label: t.undoBtn,
      onClick: () => {
        updateDb((prev) => ({
          ...prev,
          transactions: prev.transactions.some((tx) => tx.id === deletedTx.id)
            ? prev.transactions
            : [deletedTx, ...prev.transactions],
        }));
        showToast(t.toasts.restoredUndo);
      },
    });
  };

  const handleToggleDueResolved = (txId: string) => {
    const target = db.transactions.find((tx) => tx.id === txId);
    if (!target) return;
    const prevResolved = Boolean(target.dueResolved);
    const now = new Date().toISOString();

    updateDb((prev) => ({
      ...prev,
      transactions: prev.transactions.map((tx) =>
        tx.id === txId ? { ...tx, dueResolved: !prevResolved, updatedAt: now } : tx
      ),
    }));

    showToast(t.toasts.dueUpdated, 'info', {
      label: t.undoBtn,
      onClick: () => {
        updateDb((prev) => ({
          ...prev,
          transactions: prev.transactions.map((tx) =>
            tx.id === txId ? { ...tx, dueResolved: prevResolved, updatedAt: new Date().toISOString() } : tx
          ),
        }));
        showToast(t.toasts.restoredUndo);
      },
    });
  };

  const handleToggleHideAmounts = () => {
    updateDb((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        hideAmounts: !prev.settings.hideAmounts,
      },
    }));
  };

  const handleToggleHideDecimals = () => {
    updateDb((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        hideDecimals: !prev.settings.hideDecimals,
      },
    }));
  };

  const handleChangeLanguage = (nextLang: AppLanguage) => {
    if (nextLang === lang) return;
    updateDb((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        language: nextLang,
      },
    }));
    showToast(UI_TEXT[nextLang].toasts.langChanged, 'info');
  };

  const handleChangeTheme = (nextTheme: AppTheme) => {
    updateDb((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        theme: nextTheme,
      },
    }));
  };

  const handleSavePin = async (
    newPin: string | null,
    recovery?: { question: string; answer: string } | null
  ) => {
    if (newPin === null) {
      updateDb((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          pinEnabled: false,
          pinHash: null,
          pinRecoveryQuestion: '',
          pinRecoveryHash: null,
        },
      }));
      setIsUnlocked(true);
      showToast(t.toasts.pinDisabled, 'info');
      return;
    }

    const pinHash = await hashPin(newPin, lang);
    const recoveryHash =
      recovery && recovery.question && recovery.answer
        ? await hashRecoveryAnswer(recovery.answer)
        : undefined;

    updateDb((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        pinEnabled: true,
        pinHash,
        pinRecoveryQuestion:
          recovery !== undefined
            ? recovery?.question ?? ''
            : prev.settings.pinRecoveryQuestion,
        pinRecoveryHash:
          recovery !== undefined
            ? recoveryHash ?? null
            : prev.settings.pinRecoveryHash,
      },
    }));
    lastActivityRef.current = Date.now();
    showToast(t.toasts.pinEnabled);
  };

  const handleRecoveredResetPin = () => {
    updateDb((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        pinEnabled: false,
        pinHash: null,
        pinRecoveryQuestion: '',
        pinRecoveryHash: null,
        accountSignedOut: false,
      },
    }));
    setForcePinRecoveryScreen(false);
    setIsUnlocked(true);
    showToast(t.toasts.pinResetByRecovery, 'info');
  };

  const handleEmergencyResetData = () => {
    void disconnectGoogleDrive();
    void clearAllNativeBackups();
    const fresh = createInitialDatabase(lang);
    const resetDb: LedgerDatabase = {
      ...fresh,
      settings: {
        ...fresh.settings,
        language: db.settings.language,
        theme: db.settings.theme,
        updateManifestUrl: db.settings.updateManifestUrl || DEFAULT_UPDATE_MANIFEST_URL,
      },
    };
    updateDb(resetDb);
    setForcePinRecoveryScreen(false);
    setSelectedContactId(null);
    setActiveTab('dashboard');
    setIsUnlocked(true);
    showToast(t.toasts.dataCleared, 'info');
  };

  const handleRegisterAccount = async (payload: AccountRegistrationPayload) => {
    const now = new Date().toISOString();
    let pinHash: string | null = null;
    let recoveryHash: string | null = null;

    if (payload.pin) {
      pinHash = await hashPin(payload.pin, payload.language);
      if (payload.recovery?.question && payload.recovery?.answer) {
        recoveryHash = await hashRecoveryAnswer(payload.recovery.answer);
      }
    }

    if (db.settings.accountRegistered) {
      await clearAllNativeBackups();
      void disconnectGoogleDrive();
    }

    const cleanEmail = payload.email.trim();
    const hasEmail = isValidEmailAddress(cleanEmail);

    const nextDb: LedgerDatabase = {
      ...dbRef.current,
      initialized: true,
      contacts: [],
      transactions: [],
      settings: {
        ...dbRef.current.settings,
        language: payload.language,
        businessName: payload.businessName,
        accountRegistered: true,
        accountSignedOut: false,
        account: {
          fullName: payload.fullName,
          phone: payload.phone,
          email: hasEmail ? cleanEmail : undefined,
          usageType: payload.usageType,
          createdAt: now,
        },
        pinEnabled: Boolean(pinHash),
        pinHash,
        pinRecoveryQuestion: payload.recovery?.question ?? '',
        pinRecoveryHash: recoveryHash,
        emailBackup: {
          enabled: hasEmail,
          email: hasEmail ? cleanEmail : '',
          intervalHours: EMAIL_AUTO_BACKUP_INTERVAL_HOURS,
        },
        driveBackup: {
          enabled: false,
          connected: false,
          email: '',
          intervalHours: DRIVE_AUTO_BACKUP_INTERVAL_HOURS,
          webClientId:
            dbRef.current.settings.driveBackup?.webClientId ?? DEFAULT_GOOGLE_WEB_CLIENT_ID,
        },
      },
    };

    updateDb(nextDb);

    lastActivityRef.current = Date.now();
    setForcePinRecoveryScreen(false);
    setSelectedContactId(null);
    setActiveTab('dashboard');
    setIsUnlocked(true);
    showToast(UI_TEXT[payload.language].toasts.accountCreated(payload.fullName));

    if (hasEmail) {
      void sendBackupToEmail({
        db: nextDb,
        email: cleanEmail,
        lang: payload.language,
      })
        .then((res) => {
          updateDb((prev) => ({
            ...prev,
            settings: {
              ...prev.settings,
              lastBackupAt: res.sentAt,
              emailBackup: {
                ...(prev.settings.emailBackup ?? {
                  enabled: true,
                  email: res.email,
                  intervalHours: EMAIL_AUTO_BACKUP_INTERVAL_HOURS,
                }),
                enabled: true,
                email: res.email,
                lastBackupAt: res.sentAt,
                needsActivation: res.needsActivation,
                lastError: undefined,
              },
            },
          }));
          if (res.needsActivation) {
            showToast(
              UI_TEXT[payload.language].settingsView.emailBackupActivationToast(res.email),
              'info'
            );
          }
        })
        .catch(() => {
          // Will retry automatically on schedule / online
        });
    }
  };

  const handleConfirmLogout = () => {
    setLogoutConfirmOpen(false);
    setSelectedContactId(null);
    setActiveTab('dashboard');
    setForcePinRecoveryScreen(false);
    setIsUnlocked(false);
    updateDb((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        accountSignedOut: true,
      },
    }));
    showToast(t.toasts.signedOut, 'info');
  };

  const handleSignIn = () => {
    const label =
      db.settings.account?.fullName?.trim() || db.settings.businessName.trim() || '';
    updateDb((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        accountSignedOut: false,
      },
    }));
    lastActivityRef.current = Date.now();
    setForcePinRecoveryScreen(false);
    setIsUnlocked(true);
    showToast(t.toasts.signedIn(label));
  };

  const handleRestoreFromOnboarding = (
    payload: ParsedBackupResult,
    driveMeta?: { fileId: string; email: string }
  ) => {
    const now = new Date().toISOString();
    const targetLang = payload.language ?? lang;
    const restoredEmail = (
      payload.account?.email ||
      driveMeta?.email ||
      ''
    ).trim();
    const hasRestoredEmail = isValidEmailAddress(restoredEmail);

    updateDb((prev) => ({
      ...prev,
      initialized: true,
      contacts: payload.contacts,
      transactions: payload.transactions,
      settings: {
        ...prev.settings,
        accountRegistered: true,
        accountSignedOut: false,
        account:
          payload.account ??
          (payload.businessName
            ? {
                fullName: payload.businessName,
                phone: '',
                email: hasRestoredEmail ? restoredEmail : undefined,
                usageType: 'business',
                createdAt: now,
              }
            : prev.settings.account),
        businessName: payload.businessName ?? prev.settings.businessName,
        language: targetLang,
        hideDecimals: payload.hideDecimals ?? prev.settings.hideDecimals,
        csvDelimiter: payload.csvDelimiter ?? prev.settings.csvDelimiter,
        whatsAppTemplate: payload.whatsAppTemplate ?? prev.settings.whatsAppTemplate,
        emailBackup: hasRestoredEmail
          ? {
              ...(prev.settings.emailBackup ?? {
                enabled: true,
                email: restoredEmail,
                intervalHours: EMAIL_AUTO_BACKUP_INTERVAL_HOURS,
              }),
              enabled: true,
              email: restoredEmail,
              intervalHours: EMAIL_AUTO_BACKUP_INTERVAL_HOURS,
            }
          : prev.settings.emailBackup,
        driveBackup: driveMeta
          ? {
              ...(prev.settings.driveBackup ?? {
                enabled: true,
                connected: true,
                email: '',
                intervalHours: DRIVE_AUTO_BACKUP_INTERVAL_HOURS,
              }),
              enabled: true,
              connected: true,
              email: driveMeta.email,
              fileId: driveMeta.fileId,
              intervalHours: DRIVE_AUTO_BACKUP_INTERVAL_HOURS,
              needsReauth: false,
              lastError: undefined,
            }
          : prev.settings.driveBackup,
      },
    }));
    if (driveMeta) {
      void configureNativeDriveSchedule(true, DRIVE_AUTO_BACKUP_INTERVAL_HOURS);
    }
    lastActivityRef.current = Date.now();
    setSelectedContactId(null);
    setActiveTab('dashboard');
    setIsUnlocked(true);
    showToast(
      UI_TEXT[targetLang].toasts.backupRestored(
        payload.contacts.length,
        payload.transactions.length
      )
    );
  };

  const handleUpdateAccountProfile = (data: {
    fullName: string;
    phone: string;
    email: string;
    businessName: string;
    usageType: AccountUsageType;
  }) => {
    const now = new Date().toISOString();
    const cleanEmail = data.email.trim();
    const hasValidEmail = isValidEmailAddress(cleanEmail);
    const prevDb = dbRef.current;
    const prevEmail = (
      prevDb.settings.emailBackup?.email ||
      prevDb.settings.account?.email ||
      ''
    ).trim();

    const nextDb: LedgerDatabase = {
      ...prevDb,
      settings: {
        ...prevDb.settings,
        businessName: data.businessName,
        accountRegistered: true,
        account: {
          fullName: data.fullName,
          phone: data.phone,
          email: hasValidEmail ? cleanEmail : undefined,
          usageType: data.usageType,
          createdAt: prevDb.settings.account?.createdAt ?? now,
        },
        emailBackup: hasValidEmail
          ? {
              ...(prevDb.settings.emailBackup ?? {
                enabled: true,
                email: cleanEmail,
                intervalHours: EMAIL_AUTO_BACKUP_INTERVAL_HOURS,
              }),
              enabled: true,
              email: cleanEmail,
              intervalHours:
                prevDb.settings.emailBackup?.intervalHours ||
                EMAIL_AUTO_BACKUP_INTERVAL_HOURS,
            }
          : prevDb.settings.emailBackup
            ? { ...prevDb.settings.emailBackup, enabled: false, email: '' }
            : undefined,
      },
    };

    updateDb(nextDb);
    showToast(t.toasts.accountUpdated);

    if (hasValidEmail && cleanEmail.toLowerCase() !== prevEmail.toLowerCase()) {
      void handleSendEmailBackupNow(cleanEmail, nextDb);
    }
  };

  const handleResetAccount = () => {
    void disconnectGoogleDrive();
    void clearAllNativeBackups();
    const fresh = createInitialDatabase(lang);
    const resetDb: LedgerDatabase = {
      ...fresh,
      settings: {
        ...fresh.settings,
        language: db.settings.language,
        theme: db.settings.theme,
        updateManifestUrl: db.settings.updateManifestUrl || DEFAULT_UPDATE_MANIFEST_URL,
      },
    };
    updateDb(resetDb);
    setForcePinRecoveryScreen(false);
    setSelectedContactId(null);
    setActiveTab('dashboard');
    setIsUnlocked(true);
    showToast(t.toasts.accountReset, 'info');
  };

  const handleMarkBackedUp = () => {
    const now = new Date().toISOString();
    updateDb((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        lastBackupAt: now,
      },
    }));
    setBackupReminderDismissed(true);
  };

  const handleQuickBackupNow = () => {
    const json = buildJSONBackup(db);
    triggerFileDownload(
      json,
      `carnet-credit-backup-${todayISO}.json`,
      'application/json;charset=utf-8'
    );
    handleMarkBackedUp();
    showToast(t.settingsView.jsonToast);
    const emailAddr = (
      db.settings.emailBackup?.email ||
      db.settings.account?.email ||
      ''
    ).trim();
    if (
      isValidEmailAddress(emailAddr) &&
      !emailBackupBusy &&
      (typeof navigator === 'undefined' || navigator.onLine !== false)
    ) {
      void handleSendEmailBackupNow(emailAddr);
    }
  };

  const handleRestoreBackup = (
    payload: ParsedBackupResult,
    mode: 'replace' | 'merge'
  ) => {
    if (mode === 'merge') {
      const merged = mergeBackupDatabases(db.contacts, db.transactions, payload);
      updateDb((prev) => ({
        ...prev,
        contacts: merged.contacts,
        transactions: merged.transactions,
      }));
      showToast(t.toasts.backupMerged(merged.addedContacts, merged.addedTransactions));
      return;
    }

    const restoredEmail = (payload.account?.email ?? '').trim();
    const hasRestoredEmail = isValidEmailAddress(restoredEmail);

    updateDb((prev) => ({
      ...prev,
      initialized: true,
      contacts: payload.contacts,
      transactions: payload.transactions,
      settings: {
        ...prev.settings,
        accountRegistered: true,
        accountSignedOut: false,
        account: payload.account ?? prev.settings.account,
        businessName: payload.businessName ?? prev.settings.businessName,
        language: payload.language ?? prev.settings.language,
        hideDecimals: payload.hideDecimals ?? prev.settings.hideDecimals,
        csvDelimiter: payload.csvDelimiter ?? prev.settings.csvDelimiter,
        whatsAppTemplate: payload.whatsAppTemplate ?? prev.settings.whatsAppTemplate,
        emailBackup: hasRestoredEmail
          ? {
              ...(prev.settings.emailBackup ?? {
                enabled: true,
                email: restoredEmail,
                intervalHours: EMAIL_AUTO_BACKUP_INTERVAL_HOURS,
              }),
              enabled: true,
              email: restoredEmail,
              intervalHours: EMAIL_AUTO_BACKUP_INTERVAL_HOURS,
            }
          : prev.settings.emailBackup,
      },
    }));
    setSelectedContactId(null);
    setActiveTab('dashboard');
    showToast(
      t.toasts.backupRestored(payload.contacts.length, payload.transactions.length)
    );
  };

  const handleImportCsv = (result: {
    contacts: Contact[];
    transactions: Transaction[];
    addedContacts: number;
    addedTransactions: number;
    skippedRows: number;
  }) => {
    updateDb((prev) => {
      const existingContactIds = new Set(prev.contacts.map((c) => c.id));
      const newContacts = result.contacts.filter((c) => !existingContactIds.has(c.id));
      const existingTxIds = new Set(prev.transactions.map((tx) => tx.id));
      const newTransactions = result.transactions.filter((tx) => !existingTxIds.has(tx.id));
      return {
        ...prev,
        contacts: [...prev.contacts, ...newContacts],
        transactions: [...newTransactions, ...prev.transactions],
      };
    });
  };

  const handleClearAllData = () => {
    updateDb((prev) => createEmptyDatabase(prev.settings));
    setSelectedContactId(null);
    showToast(t.toasts.dataCleared, 'info');
  };

  const handleEnableNotifications = async (): Promise<boolean> => {
    if (typeof Notification === 'undefined') return false;
    try {
      const perm =
        Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission();
      const granted = perm === 'granted';
      updateDb((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          notificationsEnabled: granted,
        },
      }));
      return granted;
    } catch {
      return false;
    }
  };

  const handleApplySwUpdate = () => {
    if (!swRegistration || swReloadingRef.current) return;
    swReloadingRef.current = true;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          window.location.reload();
        },
        { once: true }
      );
    }
    swRegistration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    setSwRegistration(null);
  };

  const handleCheckForUpdates = useCallback(
    async (silent = false, overrideUrl?: string) => {
      const manifestUrl = (
        overrideUrl ??
        db.settings.updateManifestUrl ??
        DEFAULT_UPDATE_MANIFEST_URL
      ).trim();

      if (!manifestUrl) {
        if (!silent) {
          if ('serviceWorker' in navigator) {
            void navigator.serviceWorker
              .getRegistration()
              .then((reg) => reg?.update())
              .catch(() => undefined);
          }
          showToast(t.settingsView.updatesNoUrlHint, 'info');
        }
        return;
      }

      if (!silent) setUpdateChecking(true);
      try {
        const result = await checkForAppUpdate(manifestUrl, runningVersion, lang);
        setUpdateInfo(result);
        setUpdateBannerDismissed(false);
        const now = new Date().toISOString();
        updateDb((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            lastUpdateCheckAt: now,
          },
        }));

        if (!silent) {
          if (result.hasUpdate) {
            showToast(t.settingsView.updatesAvailableTitle(result.latestVersion));
          } else {
            showToast(t.settingsView.updatesUpToDate, 'info');
          }
        }
      } catch (err) {
        if (!silent) {
          showToast(
            err instanceof Error ? err.message : t.settingsView.updatesErrorFallback,
            'error'
          );
        }
      } finally {
        if (!silent) setUpdateChecking(false);
      }
    },
    [db.settings.updateManifestUrl, lang, runningVersion, showToast, t.settingsView, updateDb]
  );

  const handleInstallUpdate = async () => {
    if (!updateInfo?.hasUpdate || updateInstalling) return;

    if (updateInfo.installMode === 'ota' && updateInfo.manifest.bundleUrl) {
      setUpdateInstalling(true);
      setUpdateProgress(5);
      try {
        await installNativeOtaUpdate(
          updateInfo.manifest.bundleUrl,
          updateInfo.latestVersion,
          updateInfo.manifest.checksum,
          (pct) => setUpdateProgress(pct)
        );
      } catch (err) {
        setUpdateInstalling(false);
        setUpdateProgress(0);
        showToast(
          err instanceof Error ? err.message : t.settingsView.updatesErrorFallback,
          'error'
        );
      }
      return;
    }

    if (updateInfo.installMode === 'external' && updateInfo.externalUrl) {
      window.open(updateInfo.externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (swRegistration) {
      handleApplySwUpdate();
      return;
    }

    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update();
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      } catch {
        // Ignore SW update errors before reload
      }
    }

    window.location.reload();
  };

  // Silent automatic OTA check once on startup when online & manifest URL configured
  useEffect(() => {
    if (!idbHydrated || !versionResolved || autoCheckedRef.current) return;
    const configuredUrl = (
      db.settings.updateManifestUrl || DEFAULT_UPDATE_MANIFEST_URL
    ).trim();
    if (!isValidUpdateUrl(configuredUrl)) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    autoCheckedRef.current = true;
    void handleCheckForUpdates(true, configuredUrl);
  }, [idbHydrated, versionResolved, db.settings.updateManifestUrl, handleCheckForUpdates]);

  const dbRef = useRef(db);
  dbRef.current = db;
  const emailBackupBusyRef = useRef(emailBackupBusy);
  emailBackupBusyRef.current = emailBackupBusy;

  const handleSendEmailBackupNow = async (
    overrideEmail?: string,
    overrideDb?: LedgerDatabase
  ) => {
    if (emailBackupBusyRef.current) return;
    const currentDb = overrideDb ?? dbRef.current;
    const targetEmail = (
      overrideEmail ||
      currentDb.settings.emailBackup?.email ||
      currentDb.settings.account?.email ||
      ''
    ).trim();

    if (!isValidEmailAddress(targetEmail)) {
      showToast(t.onboarding.emailInvalidError, 'error');
      return;
    }

    emailBackupBusyRef.current = true;
    setEmailBackupBusy(true);
    try {
      const intervalHours =
        currentDb.settings.emailBackup?.intervalHours ||
        EMAIL_AUTO_BACKUP_INTERVAL_HOURS;

      const res = await sendBackupToEmail({
        db: currentDb,
        email: targetEmail,
        lang,
        onBackgroundSettled: (bgRes, bgErr) => {
          if (bgRes) {
            updateDb((prev) => ({
              ...prev,
              settings: {
                ...prev.settings,
                lastBackupAt: bgRes.sentAt,
                emailBackup: prev.settings.emailBackup
                  ? {
                      ...prev.settings.emailBackup,
                      lastBackupAt: bgRes.sentAt,
                      needsActivation: bgRes.needsActivation,
                      lastError: undefined,
                    }
                  : prev.settings.emailBackup,
              },
            }));
            if (bgRes.needsActivation) {
              showToast(t.settingsView.emailBackupActivationToast(bgRes.email), 'info');
            }
          } else if (bgErr) {
            const msg = formatEmailBackupError(bgErr, dbRef.current.settings.language);
            updateDb((prev) => ({
              ...prev,
              settings: {
                ...prev.settings,
                emailBackup: prev.settings.emailBackup
                  ? { ...prev.settings.emailBackup, lastError: msg }
                  : prev.settings.emailBackup,
              },
            }));
          }
        },
      });

      updateDb((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          lastBackupAt: res.sentAt,
          account: prev.settings.account
            ? { ...prev.settings.account, email: res.email }
            : prev.settings.account,
          emailBackup: {
            ...(prev.settings.emailBackup ?? {
              enabled: true,
              email: res.email,
              intervalHours,
            }),
            enabled: true,
            email: res.email,
            intervalHours,
            lastBackupAt: res.sentAt,
            needsActivation: res.needsActivation,
            lastError: undefined,
          },
        },
      }));
      setBackupReminderDismissed(true);
      if (res.needsActivation) {
        showToast(t.settingsView.emailBackupActivationToast(res.email), 'info');
      } else {
        showToast(t.settingsView.emailBackupSentToast(res.email));
      }
    } catch (err) {
      const msg = formatEmailBackupError(err, lang);
      updateDb((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          emailBackup: prev.settings.emailBackup
            ? { ...prev.settings.emailBackup, lastError: msg }
            : prev.settings.emailBackup,
        },
      }));
      showToast(msg, 'error');
    } finally {
      emailBackupBusyRef.current = false;
      setEmailBackupBusy(false);
    }
  };

  const handleSaveEmailBackupAddress = (emailAddr: string) => {
    const cleaned = emailAddr.trim();
    if (!isValidEmailAddress(cleaned)) {
      showToast(t.onboarding.emailInvalidError, 'error');
      return;
    }
    const prevDb = dbRef.current;
    const intervalHours =
      prevDb.settings.emailBackup?.intervalHours ||
      EMAIL_AUTO_BACKUP_INTERVAL_HOURS;

    const nextDb: LedgerDatabase = {
      ...prevDb,
      settings: {
        ...prevDb.settings,
        account: prevDb.settings.account
          ? { ...prevDb.settings.account, email: cleaned }
          : prevDb.settings.account,
        emailBackup: {
          ...(prevDb.settings.emailBackup ?? {
            enabled: true,
            email: cleaned,
            intervalHours,
          }),
          enabled: true,
          email: cleaned,
          intervalHours,
          lastError: undefined,
        },
      },
    };

    updateDb(nextDb);
    showToast(t.settingsView.emailBackupSavedToast(cleaned));
    void handleSendEmailBackupNow(cleaned, nextDb);
  };

  const handleToggleEmailAutoBackup = () => {
    const current = db.settings.emailBackup;
    const emailAddr = (current?.email || db.settings.account?.email || '').trim();
    if (!isValidEmailAddress(emailAddr)) return;

    const nextEnabled = !(current?.enabled ?? true);
    const intervalHours = current?.intervalHours || EMAIL_AUTO_BACKUP_INTERVAL_HOURS;

    updateDb((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        emailBackup: {
          ...(prev.settings.emailBackup ?? {
            enabled: nextEnabled,
            email: emailAddr,
            intervalHours,
          }),
          enabled: nextEnabled,
          email: emailAddr,
          intervalHours,
        },
      },
    }));
    showToast(
      nextEnabled
        ? t.settingsView.emailBackupEnabledToast
        : t.settingsView.emailBackupDisabledToast,
      'info'
    );
  };

  // Sync native Android email backup snapshot for 10h WorkManager whenever data changes
  useEffect(() => {
    if (!idbHydrated || !db.settings.accountRegistered) return;
    const emailCfg = db.settings.emailBackup;
    const emailAddr = (emailCfg?.email || db.settings.account?.email || '').trim();
    const enabled = Boolean(emailCfg?.enabled && isValidEmailAddress(emailAddr));
    const intervalHours = emailCfg?.intervalHours || EMAIL_AUTO_BACKUP_INTERVAL_HOURS;

    const timer = window.setTimeout(() => {
      const payloadJson = enabled
        ? JSON.stringify(buildEmailBackupPayload(dbRef.current, emailAddr, dbRef.current.settings.language))
        : '';
      const attachmentJson = enabled ? buildEmailAttachmentJSONBackup(dbRef.current) : '';
      void syncNativeEmailBackupConfig({
        enabled,
        email: emailAddr,
        intervalHours,
        payloadJson,
        attachmentJson,
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [
    idbHydrated,
    db.settings.accountRegistered,
    db.settings.emailBackup?.enabled,
    db.settings.emailBackup?.email,
    db.settings.emailBackup?.intervalHours,
    db.settings.account,
    db.settings.businessName,
    db.contacts,
    db.transactions,
  ]);

  // Pull native background email backup status & run 10h auto-email backup check when due
  useEffect(() => {
    if (!idbHydrated || !db.settings.accountRegistered) return;

    const checkAndRunAutoEmailBackup = async () => {
      const currentDb = dbRef.current;
      const emailCfg = currentDb.settings.emailBackup;
      const emailAddr = (emailCfg?.email || currentDb.settings.account?.email || '').trim();
      if (!isValidEmailAddress(emailAddr)) return;

      // 1. Reconcile any background email backup sent by Android WorkManager
      const nativeEmailStatus = await getNativeEmailBackupStatus();
      let effectiveLastBackupAt = emailCfg?.lastBackupAt;
      let effectiveNeedsActivation = Boolean(emailCfg?.needsActivation);

      if (nativeEmailStatus) {
        const nativeLast = nativeEmailStatus.lastBackupAt?.trim() || undefined;
        const newerNative =
          nativeLast && (!effectiveLastBackupAt || nativeLast > effectiveLastBackupAt);
        if (newerNative) {
          effectiveLastBackupAt = nativeLast;
        }
        effectiveNeedsActivation = Boolean(nativeEmailStatus.needsActivation);

        if (
          newerNative ||
          nativeEmailStatus.needsActivation !== Boolean(emailCfg?.needsActivation)
        ) {
          updateDb((prev) => ({
            ...prev,
            settings: {
              ...prev.settings,
              lastBackupAt: newerNative ? nativeLast : prev.settings.lastBackupAt,
              emailBackup: prev.settings.emailBackup
                ? {
                    ...prev.settings.emailBackup,
                    lastBackupAt: effectiveLastBackupAt,
                    needsActivation: effectiveNeedsActivation,
                    lastError: nativeEmailStatus.lastError || undefined,
                  }
                : prev.settings.emailBackup,
            },
          }));
        }
      }

      if (!emailCfg?.enabled || emailAutoRunningRef.current || emailBackupBusyRef.current) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      const intervalHours = emailCfg.intervalHours || EMAIL_AUTO_BACKUP_INTERVAL_HOURS;
      if (!isEmailBackupDue(effectiveLastBackupAt, intervalHours)) return;

      emailAutoRunningRef.current = true;
      try {
        const res = await sendBackupToEmail({
          db: dbRef.current,
          email: emailAddr,
          lang: dbRef.current.settings.language,
        });
        updateDb((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            lastBackupAt: res.sentAt,
            emailBackup: prev.settings.emailBackup
              ? {
                  ...prev.settings.emailBackup,
                  email: res.email,
                  lastBackupAt: res.sentAt,
                  needsActivation: res.needsActivation,
                  lastError: undefined,
                }
              : prev.settings.emailBackup,
          },
        }));
      } catch (err) {
        const msg = formatEmailBackupError(err, dbRef.current.settings.language);
        updateDb((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            emailBackup: prev.settings.emailBackup
              ? { ...prev.settings.emailBackup, lastError: msg }
              : prev.settings.emailBackup,
          },
        }));
      } finally {
        emailAutoRunningRef.current = false;
      }
    };

    const startupTimerId = window.setTimeout(() => {
      void checkAndRunAutoEmailBackup();
    }, 6_000);

    const intervalId = window.setInterval(() => {
      void checkAndRunAutoEmailBackup();
    }, 5 * 60_000);

    const onResume = () => {
      if (document.visibilityState === 'visible') {
        void checkAndRunAutoEmailBackup();
      }
    };
    const onOnline = () => {
      void checkAndRunAutoEmailBackup();
    };

    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('online', onOnline);
    return () => {
      window.clearTimeout(startupTimerId);
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('online', onOnline);
    };
  }, [
    idbHydrated,
    db.settings.accountRegistered,
    db.settings.emailBackup?.enabled,
    db.settings.emailBackup?.email,
    db.settings.emailBackup?.intervalHours,
    db.settings.account?.email,
    updateDb,
  ]);

  const handleConnectDrive = async () => {
    if (driveBusy !== 'idle') return;
    setDriveBusy('connecting');
    try {
      const currentDb = dbRef.current;
      const intervalHours =
        currentDb.settings.driveBackup?.intervalHours || DRIVE_AUTO_BACKUP_INTERVAL_HOURS;
      const webClientId =
        currentDb.settings.driveBackup?.webClientId || DEFAULT_GOOGLE_WEB_CLIENT_ID;
      const snapshotJson = buildJSONBackup(currentDb);

      const { email } = await connectGoogleDrive({
        intervalHours,
        snapshotJson,
        webClientId,
      });

      let initialBackupAt = currentDb.settings.driveBackup?.lastBackupAt;
      let fileId = currentDb.settings.driveBackup?.fileId;
      let resolvedEmail = email;
      try {
        const firstUpload = await backupToGoogleDrive({
          json: snapshotJson,
          interactive: false,
          fileId,
          webClientId,
        });
        initialBackupAt = firstUpload.backedUpAt;
        fileId = firstUpload.fileId || fileId;
        resolvedEmail = firstUpload.email || resolvedEmail;
      } catch {
        // Connection succeeded; initial upload will retry on schedule or manual tap
      }

      updateDb((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          lastBackupAt: initialBackupAt || prev.settings.lastBackupAt,
          driveBackup: {
            ...(prev.settings.driveBackup ?? {
              enabled: true,
              connected: true,
              email: '',
              intervalHours,
            }),
            enabled: true,
            connected: true,
            email: resolvedEmail,
            intervalHours,
            fileId,
            lastBackupAt: initialBackupAt,
            lastError: undefined,
            needsReauth: false,
          },
        },
      }));
      showToast(t.settingsView.driveConnectedToast(resolvedEmail));
    } catch (err) {
      showToast(formatDriveError(err, lang), 'error');
    } finally {
      setDriveBusy('idle');
    }
  };

  const handleDisconnectDrive = async () => {
    if (driveBusy !== 'idle') return;
    await disconnectGoogleDrive();
    updateDb((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        driveBackup: {
          ...(prev.settings.driveBackup ?? {
            enabled: false,
            connected: false,
            email: '',
            intervalHours: DRIVE_AUTO_BACKUP_INTERVAL_HOURS,
          }),
          enabled: false,
          connected: false,
          email: '',
          fileId: undefined,
          lastBackupAt: undefined,
          lastError: undefined,
          needsReauth: false,
        },
      },
    }));
    showToast(t.settingsView.driveDisconnectedToast, 'info');
  };

  const handleToggleDriveAutoBackup = () => {
    const current = db.settings.driveBackup;
    if (!current?.connected) return;
    const nextEnabled = !current.enabled;
    const intervalHours = current.intervalHours || DRIVE_AUTO_BACKUP_INTERVAL_HOURS;
    void configureNativeDriveSchedule(nextEnabled, intervalHours);
    if (nextEnabled) {
      void syncNativeDriveSnapshot(buildJSONBackup(db));
    }
    updateDb((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        driveBackup: {
          ...(prev.settings.driveBackup ?? {
            enabled: nextEnabled,
            connected: true,
            email: '',
            intervalHours,
          }),
          enabled: nextEnabled,
          intervalHours,
        },
      },
    }));
    showToast(
      nextEnabled
        ? t.settingsView.driveScheduleEnabledToast
        : t.settingsView.driveScheduleDisabledToast,
      'info'
    );
  };

  const handleBackupDriveNow = async () => {
    if (driveBusy !== 'idle') return;
    setDriveBusy('backing_up');
    try {
      const currentDb = dbRef.current;
      const driveCfg = currentDb.settings.driveBackup;
      const res = await backupToGoogleDrive({
        json: buildJSONBackup(currentDb),
        interactive: true,
        fileId: driveCfg?.fileId,
        webClientId: driveCfg?.webClientId || DEFAULT_GOOGLE_WEB_CLIENT_ID,
      });

      const intervalHours = driveCfg?.intervalHours || DRIVE_AUTO_BACKUP_INTERVAL_HOURS;
      if (driveCfg?.enabled) {
        void configureNativeDriveSchedule(true, intervalHours);
      }

      updateDb((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          lastBackupAt: res.backedUpAt,
          driveBackup: {
            ...(prev.settings.driveBackup ?? {
              enabled: true,
              connected: true,
              email: '',
              intervalHours,
            }),
            connected: true,
            fileId: res.fileId || prev.settings.driveBackup?.fileId,
            email: res.email || prev.settings.driveBackup?.email || '',
            lastBackupAt: res.backedUpAt,
            lastError: undefined,
            needsReauth: false,
          },
        },
      }));
      setBackupReminderDismissed(true);
      showToast(t.settingsView.driveBackedUpToast);
    } catch (err) {
      const msg = formatDriveError(err, lang);
      updateDb((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          driveBackup: prev.settings.driveBackup
            ? { ...prev.settings.driveBackup, lastError: msg }
            : prev.settings.driveBackup,
        },
      }));
      showToast(msg, 'error');
    } finally {
      setDriveBusy('idle');
    }
  };

  const handleRestoreFromDrive = async (): Promise<ParsedBackupResult | null> => {
    if (driveBusy !== 'idle') return null;
    setDriveBusy('restoring');
    try {
      const driveCfg = dbRef.current.settings.driveBackup;
      const res = await restoreFromGoogleDrive({
        fileId: driveCfg?.fileId,
        webClientId: driveCfg?.webClientId || DEFAULT_GOOGLE_WEB_CLIENT_ID,
      });
      const parsed = parseAndValidateBackupJSON(res.json, lang);
      updateDb((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          driveBackup: prev.settings.driveBackup
            ? {
                ...prev.settings.driveBackup,
                connected: true,
                fileId: res.fileId || prev.settings.driveBackup.fileId,
                email: res.email || prev.settings.driveBackup.email,
                needsReauth: false,
                lastError: undefined,
              }
            : prev.settings.driveBackup,
        },
      }));
      return parsed;
    } catch (err) {
      showToast(formatDriveError(err, lang), 'error');
      return null;
    } finally {
      setDriveBusy('idle');
    }
  };

  // Sync native Android snapshot for 10h WorkManager whenever data changes
  useEffect(() => {
    if (!idbHydrated || !db.settings.accountRegistered) return;
    const driveCfg = db.settings.driveBackup;
    if (!driveCfg?.connected || !driveCfg?.enabled) return;

    const timer = window.setTimeout(() => {
      void syncNativeDriveSnapshot(buildJSONBackup(dbRef.current));
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [
    idbHydrated,
    db.settings.accountRegistered,
    db.settings.driveBackup?.connected,
    db.settings.driveBackup?.enabled,
    db.contacts,
    db.transactions,
    db.settings.businessName,
    db.settings.account,
  ]);

  // Pull native background WorkManager status & run 10h auto-backup check when due
  useEffect(() => {
    if (!idbHydrated || !db.settings.accountRegistered) return;

    const checkAndRunAutoDriveBackup = async () => {
      const currentDb = dbRef.current;
      const driveCfg = currentDb.settings.driveBackup;
      if (!driveCfg?.connected) return;

      // 1. Reconcile any background backup performed by Android WorkManager while app was closed
      const nativeStatus = await getNativeDriveStatus();
      let effectiveLastBackupAt = driveCfg.lastBackupAt;
      let effectiveNeedsReauth = Boolean(driveCfg.needsReauth);

      if (nativeStatus) {
        const nativeLast = nativeStatus.lastBackupAt?.trim() || undefined;
        const newerNative =
          nativeLast && (!effectiveLastBackupAt || nativeLast > effectiveLastBackupAt);
        if (newerNative) {
          effectiveLastBackupAt = nativeLast;
        }
        effectiveNeedsReauth = Boolean(nativeStatus.needsReauth);

        if (
          newerNative ||
          nativeStatus.needsReauth !== Boolean(driveCfg.needsReauth) ||
          (nativeStatus.fileId && nativeStatus.fileId !== driveCfg.fileId)
        ) {
          updateDb((prev) => ({
            ...prev,
            settings: {
              ...prev.settings,
              lastBackupAt: newerNative ? nativeLast : prev.settings.lastBackupAt,
              driveBackup: prev.settings.driveBackup
                ? {
                    ...prev.settings.driveBackup,
                    fileId: nativeStatus.fileId || prev.settings.driveBackup.fileId,
                    email: nativeStatus.email || prev.settings.driveBackup.email,
                    lastBackupAt: effectiveLastBackupAt,
                    needsReauth: effectiveNeedsReauth,
                    lastError: nativeStatus.lastError || undefined,
                  }
                : prev.settings.driveBackup,
            },
          }));
        }
      }

      if (!driveCfg.enabled || effectiveNeedsReauth || driveAutoRunningRef.current) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      const intervalHours = driveCfg.intervalHours || DRIVE_AUTO_BACKUP_INTERVAL_HOURS;
      if (!isDriveBackupDue(effectiveLastBackupAt, intervalHours)) return;

      driveAutoRunningRef.current = true;
      try {
        const res = await backupToGoogleDrive({
          json: buildJSONBackup(dbRef.current),
          interactive: false,
          fileId: driveCfg.fileId,
          webClientId: driveCfg.webClientId || DEFAULT_GOOGLE_WEB_CLIENT_ID,
        });
        updateDb((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            lastBackupAt: res.backedUpAt,
            driveBackup: prev.settings.driveBackup
              ? {
                  ...prev.settings.driveBackup,
                  fileId: res.fileId || prev.settings.driveBackup.fileId,
                  email: res.email || prev.settings.driveBackup.email,
                  lastBackupAt: res.backedUpAt,
                  needsReauth: false,
                  lastError: undefined,
                }
              : prev.settings.driveBackup,
          },
        }));
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err ?? '');
        if (
          raw.includes('AUTH_REQUIRED') ||
          raw.includes('consent_required') ||
          raw.includes('interaction_required')
        ) {
          updateDb((prev) => ({
            ...prev,
            settings: {
              ...prev.settings,
              driveBackup: prev.settings.driveBackup
                ? { ...prev.settings.driveBackup, needsReauth: true }
                : prev.settings.driveBackup,
            },
          }));
        }
      } finally {
        driveAutoRunningRef.current = false;
      }
    };

    void checkAndRunAutoDriveBackup();

    const intervalId = window.setInterval(() => {
      void checkAndRunAutoDriveBackup();
    }, 5 * 60_000);

    const onResume = () => {
      if (document.visibilityState === 'visible') {
        void checkAndRunAutoDriveBackup();
      }
    };
    const onOnline = () => {
      void checkAndRunAutoDriveBackup();
    };

    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('online', onOnline);
    };
  }, [
    idbHydrated,
    db.settings.accountRegistered,
    db.settings.driveBackup?.connected,
    db.settings.driveBackup?.enabled,
    db.settings.driveBackup?.intervalHours,
    updateDb,
  ]);

  const accountDisplayLabel =
    db.settings.businessName.trim() || db.settings.account?.fullName?.trim() || '';

  if (!idbHydrated && !initialLoad.fromLocalStorage) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-3xl bg-teal-700 text-white shadow-lg">
          <BookOpenCheck className="h-7 w-7" />
        </div>
      </div>
    );
  }

  if ((!db.settings.accountRegistered || db.settings.accountSignedOut) && !forcePinRecoveryScreen) {
    return (
      <AccountOnboardingScreen
        lang={lang}
        webDriveClientId={db.settings.driveBackup?.webClientId}
        existingAccount={
          db.settings.accountRegistered
            ? {
                fullName: db.settings.account?.fullName ?? '',
                businessName: db.settings.businessName,
                phone: db.settings.account?.phone ?? '',
                email:
                  db.settings.account?.email ||
                  db.settings.emailBackup?.email ||
                  undefined,
                pinEnabled: Boolean(db.settings.pinEnabled && db.settings.pinHash),
                pinHash: db.settings.pinHash,
                contactsCount: db.contacts.length,
                transactionsCount: db.transactions.length,
              }
            : null
        }
        onChangeLanguage={handleChangeLanguage}
        onSignIn={handleSignIn}
        onOpenPinRecovery={
          db.settings.pinEnabled && db.settings.pinHash
            ? () => setForcePinRecoveryScreen(true)
            : undefined
        }
        onRegister={handleRegisterAccount}
        onRestoreBackup={handleRestoreFromOnboarding}
      />
    );
  }

  if (
    (forcePinRecoveryScreen || !isUnlocked) &&
    db.settings.pinEnabled &&
    db.settings.pinHash
  ) {
    return (
      <PinLockScreen
        pinHash={db.settings.pinHash}
        recoveryQuestion={db.settings.pinRecoveryQuestion}
        recoveryHash={db.settings.pinRecoveryHash}
        accountLabel={accountDisplayLabel || undefined}
        lang={lang}
        onUnlock={() => {
          if (db.settings.accountSignedOut) {
            handleSignIn();
          } else {
            lastActivityRef.current = Date.now();
            setForcePinRecoveryScreen(false);
            setIsUnlocked(true);
          }
        }}
        onRecoveredResetPin={handleRecoveredResetPin}
        onEmergencyResetData={handleEmergencyResetData}
      />
    );
  }

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
    >
      {/* Top App Bar */}
      <header className="no-print sticky top-0 z-20 mx-auto max-w-lg border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedContactId(null);
              setActiveTab('dashboard');
            }}
            className="flex min-w-0 items-center gap-2.5 text-start"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm">
              <BookOpenCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-extrabold tracking-tight text-slate-900 dark:text-white">
                {t.appName}
              </h1>
              <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {accountDisplayLabel || t.appSubtitleDefault}
              </p>
            </div>
          </button>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleChangeLanguage(lang === 'fr' ? 'ar' : 'fr')}
              title={t.switchLangTooltip}
              aria-label={t.switchLangTooltip}
              className="flex h-9 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 px-2.5 text-xs font-extrabold text-teal-800 transition hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-300"
            >
              {lang === 'fr' ? 'AR' : 'FR'}
            </button>

            <button
              type="button"
              onClick={() => handleChangeTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={
                theme === 'dark' ? t.settingsView.themeLight : t.settingsView.themeDark
              }
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            <button
              type="button"
              onClick={handleToggleHideAmounts}
              aria-label={db.settings.hideAmounts ? t.showAmountsLabel : t.hideAmountsLabel}
              title={db.settings.hideAmounts ? t.showAmountsLabel : t.hideAmountsLabel}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {db.settings.hideAmounts ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>

            {db.settings.pinEnabled && db.settings.pinHash && (
              <button
                type="button"
                onClick={() => setIsUnlocked(false)}
                aria-label={t.lockAppLabel}
                title={t.lockAppLabel}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Lock className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setLogoutConfirmOpen(true)}
              aria-label={t.logoutAppLabel}
              title={t.logoutAppLabel}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-700 transition hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900/60"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main
        className={`mx-auto max-w-lg px-4 pt-4 ${
          selectedContactSummary ? 'pb-8' : 'pb-28'
        }`}
      >
        {/* Service Worker New Version Banner */}
        {swRegistration && (
          <div className="no-print mb-3 flex items-center justify-between gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-xs text-teal-900 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-200">
            <span className="font-semibold">{t.updateAvailableBanner}</span>
            <button
              type="button"
              onClick={handleApplySwUpdate}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-teal-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-teal-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t.updateReloadBtn}
            </button>
          </div>
        )}

        {/* Remote / OTA App Update Banner */}
        {updateInfo?.hasUpdate && !updateBannerDismissed && (
          <div className="no-print mb-3 space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-3 text-xs text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <DownloadCloud className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                <div>
                  <p className="font-extrabold">
                    {t.settingsView.updatesBannerTitle(updateInfo.latestVersion)}
                  </p>
                  {(lang === 'ar'
                    ? updateInfo.manifest.notesAr || updateInfo.manifest.notesFr
                    : updateInfo.manifest.notesFr || updateInfo.manifest.notesAr) && (
                    <p className="mt-0.5 text-[11px] opacity-85">
                      {lang === 'ar'
                        ? updateInfo.manifest.notesAr || updateInfo.manifest.notesFr
                        : updateInfo.manifest.notesFr || updateInfo.manifest.notesAr}
                    </p>
                  )}
                </div>
              </div>
              {!updateInfo.manifest.mandatory && !updateInstalling && (
                <button
                  type="button"
                  onClick={() => setUpdateBannerDismissed(true)}
                  aria-label={t.statement.close}
                  className="rounded-full p-1 text-emerald-700/70 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {updateInstalling ? (
              <div className="space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-200 dark:bg-emerald-900">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all duration-200"
                    style={{ width: `${Math.max(8, updateProgress)}%` }}
                  />
                </div>
                <p className="text-[11px] font-bold">
                  {t.settingsView.updatesInstalling(updateProgress)}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleInstallUpdate}
                className="inline-flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-3 text-[11px] font-bold text-white shadow-xs transition hover:bg-emerald-800"
              >
                <DownloadCloud className="h-3.5 w-3.5" />
                <span>
                  {updateInfo.installMode === 'external'
                    ? t.settingsView.updatesDownloadExternalBtn
                    : t.settingsView.updatesInstallOtaBtn}
                </span>
              </button>
            )}
          </div>
        )}

        {selectedContactSummary ? (
          <ContactDetailView
            summary={selectedContactSummary}
            entries={selectedContactEntries}
            hideAmounts={db.settings.hideAmounts}
            hideDecimals={db.settings.hideDecimals}
            lang={lang}
            businessName={db.settings.businessName}
            whatsAppTemplate={db.settings.whatsAppTemplate}
            onBack={() => setSelectedContactId(null)}
            onEditContact={handleOpenEditContact}
            onToggleArchiveContact={handleToggleArchiveContact}
            onDeleteContact={setDeleteContactTarget}
            onAddTransaction={handleOpenNewOperation}
            onEditTransaction={handleOpenEditOperation}
            onDeleteTransaction={setDeleteTxTarget}
            onToggleDueResolved={handleToggleDueResolved}
          />
        ) : activeTab === 'dashboard' ? (
          <DashboardView
            totals={totals}
            analytics={analytics}
            filteredSummaries={filteredDashboardSummaries}
            summariesById={summariesById}
            transactions={db.transactions}
            todayISO={todayISO}
            allContactsCount={activeContactsCount}
            search={dashboardSearch}
            onSearchChange={setDashboardSearch}
            filter={dashboardFilter}
            onFilterChange={setDashboardFilter}
            hideAmounts={db.settings.hideAmounts}
            hideDecimals={db.settings.hideDecimals}
            lang={lang}
            businessName={db.settings.businessName}
            whatsAppTemplate={db.settings.whatsAppTemplate}
            backupReminderDays={backupReminderDays}
            onBackupNow={handleQuickBackupNow}
            onDismissBackupReminder={() => setBackupReminderDismissed(true)}
            onOpenContact={handleOpenContact}
            onQuickOperation={(cid) => handleOpenNewOperation(cid)}
            onEditTransaction={handleOpenEditOperation}
            onOpenDeadlines={() => setActiveTab('deadlines')}
            onAddContact={handleOpenNewContact}
            onOpenGlobalReport={() => setGlobalReportOpen(true)}
          />
        ) : activeTab === 'contacts' ? (
          <ContactsView
            summaries={summaries}
            hideAmounts={db.settings.hideAmounts}
            hideDecimals={db.settings.hideDecimals}
            lang={lang}
            businessName={db.settings.businessName}
            whatsAppTemplate={db.settings.whatsAppTemplate}
            onAddContact={handleOpenNewContact}
            onOpenContact={handleOpenContact}
            onQuickOperation={(cid) => handleOpenNewOperation(cid)}
            onOpenGlobalReport={() => setGlobalReportOpen(true)}
          />
        ) : activeTab === 'deadlines' ? (
          <DeadlinesView
            dueItems={allDueItems}
            summariesById={summariesById}
            hideAmounts={db.settings.hideAmounts}
            hideDecimals={db.settings.hideDecimals}
            lang={lang}
            businessName={db.settings.businessName}
            whatsAppTemplate={db.settings.whatsAppTemplate}
            notificationsEnabled={Boolean(
              db.settings.notificationsEnabled &&
                typeof Notification !== 'undefined' &&
                Notification.permission === 'granted'
            )}
            onEnableNotifications={handleEnableNotifications}
            onOpenContact={handleOpenContact}
            onQuickSettle={(cid, preset) => handleOpenNewOperation(cid, preset)}
            onToggleDueResolved={handleToggleDueResolved}
          />
        ) : (
          <SettingsView
            db={db}
            onChangeLanguage={handleChangeLanguage}
            onChangeTheme={handleChangeTheme}
            onToggleHideAmounts={handleToggleHideAmounts}
            onToggleHideDecimals={handleToggleHideDecimals}
            onUpdateAccountProfile={handleUpdateAccountProfile}
            emailBackupBusy={emailBackupBusy}
            onSaveEmailBackupAddress={handleSaveEmailBackupAddress}
            onToggleEmailAutoBackup={handleToggleEmailAutoBackup}
            onSendEmailBackupNow={() => void handleSendEmailBackupNow()}
            onUpdateAutoLockMinutes={(minutes) =>
              updateDb((prev) => ({
                ...prev,
                settings: { ...prev.settings, autoLockMinutes: minutes },
              }))
            }
            onUpdateCsvDelimiter={(delimiter) =>
              updateDb((prev) => ({
                ...prev,
                settings: { ...prev.settings, csvDelimiter: delimiter },
              }))
            }
            onUpdateWhatsAppTemplate={(template) =>
              updateDb((prev) => ({
                ...prev,
                settings: { ...prev.settings, whatsAppTemplate: template },
              }))
            }
            runningVersion={runningVersion}
            updateInfo={updateInfo}
            updateChecking={updateChecking}
            updateInstalling={updateInstalling}
            updateProgress={updateProgress}
            onUpdateManifestUrl={(url) =>
              updateDb((prev) => ({
                ...prev,
                settings: { ...prev.settings, updateManifestUrl: url },
              }))
            }
            onCheckForUpdates={(overrideUrl) => handleCheckForUpdates(false, overrideUrl)}
            onInstallUpdate={handleInstallUpdate}
            driveBusy={driveBusy}
            onConnectDrive={handleConnectDrive}
            onDisconnectDrive={handleDisconnectDrive}
            onToggleDriveAutoBackup={handleToggleDriveAutoBackup}
            onBackupDriveNow={handleBackupDriveNow}
            onRestoreFromDrive={handleRestoreFromDrive}
            onUpdateDriveWebClientId={(clientId) =>
              updateDb((prev) => ({
                ...prev,
                settings: {
                  ...prev.settings,
                  driveBackup: {
                    ...(prev.settings.driveBackup ?? {
                      enabled: false,
                      connected: false,
                      email: '',
                      intervalHours: DRIVE_AUTO_BACKUP_INTERVAL_HOURS,
                    }),
                    webClientId: clientId,
                  },
                },
              }))
            }
            onSavePin={handleSavePin}
            onLockNow={() => setIsUnlocked(false)}
            onMarkBackedUp={handleMarkBackedUp}
            onRestoreBackup={handleRestoreBackup}
            onImportCsv={handleImportCsv}
            onClearAllData={handleClearAllData}
            onRequestLogout={() => setLogoutConfirmOpen(true)}
            onResetAccount={handleResetAccount}
          />
        )}
      </main>

      {/* Bottom Navigation Bar (hidden on detail screen or print) */}
      {!selectedContactSummary && (
        <BottomNav
          activeTab={activeTab}
          lang={lang}
          onSelectTab={(tab) => {
            setSelectedContactId(null);
            setActiveTab(tab);
          }}
          onNewOperation={() => handleOpenNewOperation(null, 'credit_given')}
          urgentDeadlinesCount={urgentDeadlinesCount}
        />
      )}

      {/* Modals */}
      <ContactModal
        open={contactModalOpen}
        lang={lang}
        existingContacts={db.contacts}
        editingContact={editingContact}
        editingBalance={
          editingContact ? summariesById.get(editingContact.id)?.balance : undefined
        }
        onClose={() => {
          setContactModalOpen(false);
          setEditingContact(null);
        }}
        onSave={handleSaveContact}
      />

      <TransactionModal
        open={txModalOpen}
        lang={lang}
        hideDecimals={db.settings.hideDecimals}
        contacts={db.contacts}
        summariesById={summariesById}
        initialContactId={txInitialContactId}
        initialType={txInitialType}
        initialAmount={txInitialAmount}
        initialNote={txInitialNote}
        editingTransaction={editingTx}
        onClose={() => {
          setTxModalOpen(false);
          setEditingTx(null);
          setTxInitialAmount(null);
          setTxInitialNote('');
        }}
        onSave={handleSaveTransaction}
        onQuickCreateContact={handleQuickCreateContact}
      />

      <GlobalReportModal
        open={globalReportOpen}
        lang={lang}
        hideDecimals={db.settings.hideDecimals}
        summaries={summaries}
        totals={totals}
        businessName={db.settings.businessName}
        onClose={() => setGlobalReportOpen(false)}
      />

      {/* Logout Confirmation */}
      <ConfirmDialog
        open={logoutConfirmOpen}
        lang={lang}
        title={t.settingsView.confirmLogoutTitle}
        description={t.settingsView.confirmLogoutDesc}
        confirmLabel={t.settingsView.confirmLogoutBtn}
        danger
        onConfirm={handleConfirmLogout}
        onCancel={() => setLogoutConfirmOpen(false)}
      />

      {/* Delete Contact Confirmation */}
      <ConfirmDialog
        open={deleteContactTarget !== null}
        lang={lang}
        title={t.dialogs.deleteContactTitle(deleteContactTarget?.name ?? '')}
        description={t.dialogs.deleteContactDesc}
        confirmLabel={t.dialogs.deleteBtn}
        danger
        onConfirm={handleConfirmDeleteContact}
        onCancel={() => setDeleteContactTarget(null)}
      />

      {/* Delete Transaction Confirmation */}
      <ConfirmDialog
        open={deleteTxTarget !== null}
        lang={lang}
        title={t.dialogs.deleteTxTitle}
        description={t.dialogs.deleteTxDesc}
        confirmLabel={t.dialogs.deleteBtn}
        danger
        onConfirm={handleConfirmDeleteTransaction}
        onCancel={() => setDeleteTxTarget(null)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <LedgerApp />
    </ToastProvider>
  );
}
