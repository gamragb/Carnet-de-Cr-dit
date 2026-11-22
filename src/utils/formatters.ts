import type { AppLanguage } from '../types/ledger.ts';

export function roundMoney(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizeDigitInput(raw: string): string {
  return raw
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066b/g, '.')
    .replace(/\u066c/g, '');
}

export function parseMoneyInput(raw: string): number | null {
  const clean = normalizeDigitInput(raw).replace(/\s+/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(clean)) {
    return null;
  }
  const num = Number(clean);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  const rounded = roundMoney(num);
  return rounded > 0 ? rounded : null;
}

export interface FormatMADOptions {
  showSign?: boolean;
  masked?: boolean;
  alwaysDecimals?: boolean;
  hideDecimals?: boolean;
  lang?: AppLanguage;
}

export function formatMAD(amount: number, options: FormatMADOptions = {}): string {
  const {
    showSign = false,
    masked = false,
    alwaysDecimals = false,
    hideDecimals = false,
    lang = 'fr',
  } = options;
  const currency = lang === 'ar' ? 'د.م' : 'DH';

  if (masked) {
    return `•••• ${currency}`;
  }

  const clean = hideDecimals && !alwaysDecimals ? Math.round(amount) : roundMoney(amount);
  const abs = Math.abs(clean);
  const hasDecimals =
    !hideDecimals && (alwaysDecimals || Math.round(abs * 100) % 100 !== 0);

  const formattedNumber = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hideDecimals ? 0 : 2,
  })
    .format(abs)
    .replace(/[\u202f\u00a0]/g, ' ');

  if (clean === 0) {
    return `${formattedNumber} ${currency}`;
  }

  const sign = showSign ? (clean > 0 ? '+' : '-') : clean < 0 ? '-' : '';
  return `${sign}${formattedNumber} ${currency}`;
}

export function normalizeSearchPhone(raw: string): string {
  return normalizeDigitInput(raw)
    .replace(/[^\d]/g, '')
    .replace(/^00212/, '0')
    .replace(/^212([567])/, '0$1');
}

export function formatMoroccanPhone(raw: string): string {
  const trimmed = normalizeDigitInput(raw).trim();
  if (!trimmed) return '';

  let digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.startsWith('00212')) {
    digits = `0${digits.slice(5)}`;
  } else if (digits.startsWith('+212')) {
    digits = `0${digits.slice(4)}`;
  } else if (digits.startsWith('212') && digits.length === 12) {
    digits = `0${digits.slice(3)}`;
  }

  const onlyDigits = digits.replace(/\D/g, '');
  if (/^0[567]\d{8}$/.test(onlyDigits)) {
    return `${onlyDigits.slice(0, 2)} ${onlyDigits.slice(2, 4)} ${onlyDigits.slice(4, 6)} ${onlyDigits.slice(6, 8)} ${onlyDigits.slice(8, 10)}`;
  }

  return trimmed;
}

export function isValidPhoneInput(raw: string): boolean {
  const trimmed = normalizeDigitInput(raw).trim();
  if (!trimmed) return true;
  if (!/^[\d\s+().-]+$/.test(trimmed)) return false;

  const normalizedLocal = normalizeSearchPhone(trimmed);
  if (/^0[567]/.test(normalizedLocal)) {
    return /^0[567]\d{8}$/.test(normalizedLocal);
  }
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

export function toTelHref(phone: string): string | null {
  const clean = normalizeDigitInput(phone).trim().replace(/[^\d+]/g, '');
  if (!clean) return null;

  if (clean.startsWith('+')) {
    return `tel:${clean}`;
  }
  if (clean.startsWith('00')) {
    return `tel:+${clean.slice(2)}`;
  }
  if (/^0[567]\d{8}$/.test(clean)) {
    return `tel:+212${clean.slice(1)}`;
  }
  const digits = clean.replace(/\D/g, '');
  return digits.length >= 6 ? `tel:${digits}` : null;
}

export function toWhatsAppDigits(phone: string): string | null {
  let clean = normalizeDigitInput(phone).trim().replace(/[^\d+]/g, '');
  if (!clean) return null;

  if (clean.startsWith('+')) {
    clean = clean.slice(1);
  } else if (clean.startsWith('00')) {
    clean = clean.slice(2);
  }

  const digits = clean.replace(/\D/g, '');
  if (/^0[567]\d{8}$/.test(digits)) {
    return `212${digits.slice(1)}`;
  }
  if (/^[567]\d{8}$/.test(digits)) {
    return `212${digits}`;
  }

  return digits.length >= 8 ? digits : null;
}

export function getTodayISODate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentLocalDateTime(now: Date = new Date()): string {
  const datePart = getTodayISODate(now);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${datePart}T${hours}:${minutes}`;
}

export function daysBetweenISODates(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = toISO.slice(0, 10).split('-').map(Number);
  const fromUTC = Date.UTC(fy, fm - 1, fd);
  const toUTC = Date.UTC(ty, tm - 1, td);
  return Math.round((toUTC - fromUTC) / (1000 * 60 * 60 * 24));
}

export function formatDateFR(
  isoDateOrDatetime: string,
  lang: AppLanguage = 'fr'
): string {
  if (!isoDateOrDatetime) return '';
  const datePart = isoDateOrDatetime.slice(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return isoDateOrDatetime;
  const date = new Date(y, m - 1, d);
  const locale = lang === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-FR';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatDateTimeFR(
  isoDatetime: string,
  lang: AppLanguage = 'fr'
): { date: string; time: string } {
  if (!isoDatetime) return { date: '', time: '' };
  const date = formatDateFR(isoDatetime, lang);
  const timeMatch = isoDatetime.match(/T(\d{2}:\d{2})/);
  return {
    date,
    time: timeMatch ? timeMatch[1] : '',
  };
}

export function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Copies text safely in both secure contexts (HTTPS/localhost) and insecure HTTP LAN sessions.
 */
export async function copyTextSafe(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below for HTTP LAN / restricted mobile contexts
    }
  }

  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}
