import { useEffect, useState } from 'react';
import { Delete, HelpCircle, Lock, ShieldCheck, Trash2, X } from 'lucide-react';
import { UI_TEXT } from '../i18n/translations.ts';
import type { AppLanguage } from '../types/ledger.ts';
import { verifyPin, verifyRecoveryAnswer } from '../utils/security.ts';

const PIN_ATTEMPTS_KEY = 'carnet_pin_guard_v1';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

interface PinGuardState {
  failures: number;
  lockedUntil: number;
}

function loadGuardState(): PinGuardState {
  try {
    const raw = window.localStorage.getItem(PIN_ATTEMPTS_KEY);
    if (!raw) return { failures: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw) as Partial<PinGuardState>;
    return {
      failures: typeof parsed.failures === 'number' ? parsed.failures : 0,
      lockedUntil: typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : 0,
    };
  } catch {
    return { failures: 0, lockedUntil: 0 };
  }
}

function saveGuardState(state: PinGuardState): void {
  try {
    window.localStorage.setItem(PIN_ATTEMPTS_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage issues
  }
}

interface PinLockScreenProps {
  pinHash: string;
  recoveryQuestion?: string;
  recoveryHash?: string | null;
  lang: AppLanguage;
  onUnlock: () => void;
  onRecoveredResetPin: () => void;
  onEmergencyResetData: () => void;
}

export function PinLockScreen({
  pinHash,
  recoveryQuestion,
  recoveryHash,
  lang,
  onUnlock,
  onRecoveredResetPin,
  onEmergencyResetData,
}: PinLockScreenProps) {
  const t = UI_TEXT[lang].pin;
  const [digits, setDigits] = useState('');
  const [error, setError] = useState(false);

  const [guard, setGuard] = useState<PinGuardState>(() => loadGuardState());
  const [remainingSec, setRemainingSec] = useState<number>(() =>
    Math.max(0, Math.ceil((loadGuardState().lockedUntil - Date.now()) / 1000))
  );

  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [answerInput, setAnswerInput] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);

  useEffect(() => {
    const tick = () => {
      const secs = Math.max(0, Math.ceil((guard.lockedUntil - Date.now()) / 1000));
      setRemainingSec(secs);
    };
    tick();
    if (guard.lockedUntil <= Date.now()) return;
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [guard.lockedUntil]);

  useEffect(() => {
    if (digits.length !== 4 || remainingSec > 0) return;
    let active = true;
    void (async () => {
      const ok = await verifyPin(digits, pinHash);
      if (!active) return;
      if (ok) {
        const clean: PinGuardState = { failures: 0, lockedUntil: 0 };
        saveGuardState(clean);
        setGuard(clean);
        onUnlock();
      } else {
        const nextFailures = guard.failures + 1;
        const lockedUntil =
          nextFailures >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0;
        const nextState: PinGuardState = {
          failures: nextFailures >= MAX_ATTEMPTS ? 0 : nextFailures,
          lockedUntil,
        };
        saveGuardState(nextState);
        setGuard(nextState);
        setError(true);
        setTimeout(() => {
          if (active) {
            setDigits('');
            setError(false);
          }
        }, 450);
      }
    })();
    return () => {
      active = false;
    };
  }, [digits, pinHash, onUnlock, guard.failures, remainingSec]);

  const handlePress = (val: string) => {
    if (error || remainingSec > 0 || digits.length >= 4) return;
    setDigits((prev) => prev + val);
  };

  const handleBackspace = () => {
    if (error || remainingSec > 0) return;
    setDigits((prev) => prev.slice(0, -1));
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');
    const ok = await verifyRecoveryAnswer(answerInput, recoveryHash);
    if (!ok) {
      setRecoveryError(t.recoveryWrongAnswer);
      return;
    }
    const clean: PinGuardState = { failures: 0, lockedUntil: 0 };
    saveGuardState(clean);
    onRecoveredResetPin();
  };

  const isCooldown = remainingSec > 0;

  return (
    <div className="no-print fixed inset-0 z-50 flex flex-col items-center justify-between bg-slate-950 px-6 py-8 text-white">
      <div className="mt-4 flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-teal-500/20 text-teal-300 ring-1 ring-teal-400/30">
          <Lock className="h-8 w-8" />
        </div>
        <h1 className="mt-4 text-xl font-extrabold tracking-tight">{t.lockedTitle}</h1>
        <p className="mt-1 text-sm text-slate-400">{t.enterPinPrompt}</p>

        {/* PIN Dots */}
        <div dir="ltr" className={`mt-7 flex gap-4 ${error ? 'animate-shake' : ''}`}>
          {[0, 1, 2, 3].map((idx) => {
            const filled = idx < digits.length;
            return (
              <div
                key={idx}
                className={`h-4 w-4 rounded-full border-2 transition-all ${
                  error || isCooldown
                    ? 'border-rose-500 bg-rose-500/40'
                    : filled
                      ? 'scale-110 border-teal-400 bg-teal-400'
                      : 'border-slate-600 bg-transparent'
                }`}
              />
            );
          })}
        </div>

        <p
          className={`mt-3 min-h-[20px] text-xs font-semibold ${
            isCooldown || error
              ? 'text-rose-400'
              : guard.failures > 0
                ? 'text-amber-300'
                : 'text-transparent'
          }`}
        >
          {isCooldown
            ? t.lockoutWait(remainingSec)
            : error
              ? t.wrongPin
              : guard.failures > 0
                ? t.attemptsRemaining(MAX_ATTEMPTS - guard.failures)
                : '.'}
        </p>
      </div>

      {/* Keypad */}
      <div className="flex w-full max-w-[290px] flex-col items-center">
        <div
          dir="ltr"
          className={`grid w-full grid-cols-3 gap-3.5 transition ${
            isCooldown ? 'pointer-events-none opacity-40' : ''
          }`}
        >
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              type="button"
              disabled={isCooldown}
              onClick={() => handlePress(num)}
              className="flex h-16 items-center justify-center rounded-2xl bg-slate-800/80 text-2xl font-bold text-white transition active:scale-95 active:bg-teal-700"
            >
              {num}
            </button>
          ))}

          <button
            type="button"
            disabled={isCooldown}
            onClick={() => setDigits('')}
            className="flex h-16 items-center justify-center rounded-2xl text-xs font-bold text-slate-400 transition hover:bg-slate-900 active:scale-95"
          >
            {t.clear}
          </button>

          <button
            type="button"
            disabled={isCooldown}
            onClick={() => handlePress('0')}
            className="flex h-16 items-center justify-center rounded-2xl bg-slate-800/80 text-2xl font-bold text-white transition active:scale-95 active:bg-teal-700"
          >
            0
          </button>

          <button
            type="button"
            disabled={isCooldown}
            onClick={handleBackspace}
            aria-label={t.clear}
            className="flex h-16 items-center justify-center rounded-2xl text-slate-300 transition hover:bg-slate-900 active:scale-95"
          >
            <Delete className="h-6 w-6" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setRecoveryError('');
            setAnswerInput('');
            setConfirmWipe(false);
            setRecoveryOpen(true);
          }}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-teal-300 hover:bg-slate-900 hover:text-teal-200"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span>{t.forgotPinLink}</span>
        </button>
      </div>

      {recoveryOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold">{t.recoveryModalTitle}</h2>
              <button
                type="button"
                onClick={() => setRecoveryOpen(false)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {recoveryHash && recoveryQuestion ? (
              <form onSubmit={handleRecoverySubmit} className="mt-4 space-y-3">
                <div className="rounded-2xl bg-slate-800/80 p-3 text-xs text-slate-200">
                  {recoveryQuestion}
                </div>
                {recoveryError && (
                  <p className="rounded-xl bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-300">
                    {recoveryError}
                  </p>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-400">
                    {t.recoveryAnswerPrompt}
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={answerInput}
                    onChange={(e) => setAnswerInput(e.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-sm text-white outline-none focus:border-teal-500"
                  />
                </div>
                <button
                  type="submit"
                  className="min-h-[44px] w-full rounded-2xl bg-teal-600 text-xs font-bold text-white hover:bg-teal-500"
                >
                  {t.unlockAndResetBtn}
                </button>

                <div className="border-t border-slate-800 pt-3">
                  {!confirmWipe ? (
                    <button
                      type="button"
                      onClick={() => setConfirmWipe(true)}
                      className="w-full text-center text-[11px] font-semibold text-rose-300/90 hover:text-rose-200 hover:underline"
                    >
                      {t.forgotAnswerLink}
                    </button>
                  ) : (
                    <div className="space-y-2 rounded-2xl border border-rose-500/40 bg-rose-950/50 p-3">
                      <p className="text-xs font-semibold text-rose-200">
                        {t.emergencyResetConfirm}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmWipe(false)}
                          className="min-h-[40px] rounded-xl bg-slate-800 text-xs font-bold text-slate-300"
                        >
                          {t.cancel}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            saveGuardState({ failures: 0, lockedUntil: 0 });
                            onEmergencyResetData();
                          }}
                          className="min-h-[40px] rounded-xl bg-rose-600 text-xs font-bold text-white"
                        >
                          {t.validateBtn}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </form>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-xs leading-relaxed text-slate-300">
                  {t.recoveryNoQuestionMsg}
                </p>
                {!confirmWipe ? (
                  <button
                    type="button"
                    onClick={() => setConfirmWipe(true)}
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-rose-600/20 px-4 text-xs font-bold text-rose-300 ring-1 ring-rose-500/40 hover:bg-rose-600/30"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>{t.emergencyResetBtn}</span>
                  </button>
                ) : (
                  <div className="space-y-2 rounded-2xl border border-rose-500/40 bg-rose-950/50 p-3">
                    <p className="text-xs font-semibold text-rose-200">
                      {t.emergencyResetConfirm}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmWipe(false)}
                        className="min-h-[40px] rounded-xl bg-slate-800 text-xs font-bold text-slate-300"
                      >
                        {t.cancel}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          saveGuardState({ failures: 0, lockedUntil: 0 });
                          onEmergencyResetData();
                        }}
                        className="min-h-[40px] rounded-xl bg-rose-600 text-xs font-bold text-white"
                      >
                        {t.validateBtn}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface PinSetupModalProps {
  open: boolean;
  lang: AppLanguage;
  mode: 'enable' | 'change' | 'disable';
  currentPinHash: string | null;
  currentRecoveryQuestion?: string;
  onClose: () => void;
  onComplete: (
    newPin: string | null,
    recovery?: { question: string; answer: string } | null
  ) => void;
}

export function PinSetupModal({
  open,
  lang,
  mode,
  currentPinHash,
  currentRecoveryQuestion,
  onClose,
  onComplete,
}: PinSetupModalProps) {
  const t = UI_TEXT[lang].pin;
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setQuestion(currentRecoveryQuestion ?? '');
    setAnswer('');
    setError('');
  }, [open, mode, currentRecoveryQuestion]);

  if (!open) return null;

  const needsCurrent = mode === 'change' || mode === 'disable';
  const needsNew = mode === 'enable' || mode === 'change';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (needsCurrent) {
      const valid = await verifyPin(currentPin, currentPinHash);
      if (!valid) {
        setError(t.wrongCurrentError);
        return;
      }
    }

    if (!needsNew) {
      onComplete(null, null);
      return;
    }

    if (!/^\d{4}$/.test(newPin)) {
      setError(t.fourDigitsError);
      return;
    }

    if (newPin !== confirmPin) {
      setError(t.mismatchError);
      return;
    }

    const q = question.trim();
    const a = answer.trim();
    const hasExistingQuestion = Boolean(currentRecoveryQuestion?.trim());

    if (mode === 'change' && hasExistingQuestion && q === currentRecoveryQuestion?.trim() && !a) {
      // Keep existing secret question & answer unchanged
      onComplete(newPin, undefined);
      return;
    }

    if ((q && a.length < 2) || (!q && a.length > 0)) {
      setError(t.recoverySetupError);
      return;
    }

    const recovery = q && a.length >= 2 ? { question: q, answer: a } : null;
    onComplete(newPin, recovery);
  };

  const title =
    mode === 'enable'
      ? t.enableTitle
      : mode === 'change'
        ? t.changeTitle
        : t.disableTitle;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="animate-sheet-up max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl dark:border dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300">
              {error}
            </div>
          )}

          {needsCurrent && (
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400">
                {t.currentPinLabel}
              </label>
              <input
                type="password"
                inputMode="numeric"
                dir="ltr"
                maxLength={4}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-xl font-bold tracking-[0.6em] outline-none focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          )}

          {needsNew && (
            <>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400">
                  {t.newPinLabel}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  dir="ltr"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-xl font-bold tracking-[0.6em] outline-none focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-400">
                  {t.confirmPinLabel}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  dir="ltr"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-xl font-bold tracking-[0.6em] outline-none focus:border-teal-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    {t.recoveryQuestionSetupLabel}
                  </label>
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder={t.recoveryQuestionPlaceholder}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    {t.recoveryAnswerSetupLabel}
                  </label>
                  <input
                    type="text"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder={t.recoveryAnswerPlaceholder}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">{t.recoveryHint}</p>
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2.5 pt-2 pb-safe">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[46px] flex-1 rounded-2xl border border-slate-200 text-sm font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className={`min-h-[46px] flex-1 rounded-2xl text-sm font-bold text-white ${
                mode === 'disable'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-teal-700 hover:bg-teal-800'
              }`}
            >
              {mode === 'disable' ? t.disableBtn : t.validateBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
