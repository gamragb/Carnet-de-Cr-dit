import { TX_TYPE_LABELS } from '../i18n/translations.ts';
import type {
  AppLanguage,
  ContactSummary,
  Transaction,
} from '../types/ledger.ts';
import { formatDateFR, formatMAD, toWhatsAppDigits } from './formatters.ts';

export interface WhatsAppOptions {
  hideDecimals?: boolean;
  customTemplate?: string;
}

export function buildWhatsAppReminderMessage(
  summary: ContactSummary,
  businessName?: string,
  lang: AppLanguage = 'fr',
  options: WhatsAppOptions = {}
): string {
  const { contact, balance, lastTransaction, nextDue } = summary;
  const { hideDecimals = false, customTemplate } = options;

  const formattedAbsBalance = formatMAD(Math.abs(balance), { lang, hideDecimals });
  const formattedSignedBalance = formatMAD(balance, {
    lang,
    hideDecimals,
    showSign: balance !== 0,
  });
  const dueStr =
    nextDue && !nextDue.isSettled
      ? formatDateFR(nextDue.transaction.dueDate ?? '', lang)
      : '';
  const lastOpStr = lastTransaction
    ? `${TX_TYPE_LABELS[lang][lastTransaction.type].shortLabel} (${formatMAD(
        lastTransaction.amount,
        { lang, hideDecimals }
      )} • ${formatDateFR(lastTransaction.occurredAt, lang)})`
    : '';

  if (customTemplate && customTemplate.trim()) {
    return customTemplate
      .replace(/\{nom\}|\{الاسم\}/g, contact.name)
      .replace(/\{solde\}|\{الرصيد\}/g, formattedSignedBalance)
      .replace(/\{montant\}|\{المبلغ\}/g, formattedAbsBalance)
      .replace(/\{entreprise\}|\{المتجر\}/g, businessName?.trim() || '')
      .replace(/\{echeance\}|\{الأجل\}/g, dueStr || '-')
      .replace(/\{derniere_op\}|\{آخر_عملية\}/g, lastOpStr || '-')
      .trim();
  }

  const lines: string[] = [];

  if (lang === 'ar') {
    lines.push(`السلام عليكم ${contact.name}،`);
    lines.push('');

    if (balance > 0) {
      lines.push(
        `تذكير ودي بخصوص تتبع الحساب بيننا: الرصيد المتبقي لي عندك هو *${formatMAD(
          balance,
          { lang: 'ar', hideDecimals }
        )}*.`
      );
    } else if (balance < 0) {
      lines.push(
        `بخصوص تتبع الحساب بيننا: المبلغ المتبقي عليّ لك هو *${formatMAD(
          Math.abs(balance),
          { lang: 'ar', hideDecimals }
        )}*.`
      );
    } else {
      lines.push(`للإخبار: الحساب بيننا حالياً مساوي (*0 د.م*).`);
    }

    if (lastTransaction) {
      const txLabel = TX_TYPE_LABELS.ar[lastTransaction.type].shortLabel;
      const dateStr = formatDateFR(lastTransaction.occurredAt, 'ar');
      const notePart = lastTransaction.note ? ` (${lastTransaction.note})` : '';
      lines.push(
        `آخر عملية (${dateStr}): ${txLabel} بمبلغ ${formatMAD(
          lastTransaction.amount,
          { lang: 'ar', hideDecimals }
        )}${notePart}.`
      );
    }

    if (nextDue && !nextDue.isSettled) {
      if (nextDue.urgency === 'overdue') {
        lines.push(
          `تاريخ الأجل فات منذ ${dueStr} (متأخر بـ ${Math.abs(
            nextDue.daysDiff
          )} يوم). المرجو التواصل.`
        );
      } else if (nextDue.urgency === 'today') {
        lines.push(`تاريخ الأجل المحدد هو اليوم (${dueStr}).`);
      } else {
        lines.push(`تاريخ الأجل القادم: ${dueStr}.`);
      }
    }

    lines.push('');
    lines.push(
      businessName?.trim()
        ? `مع التحية،\n${businessName.trim()}`
        : 'شكراً لك ويومك سعيد.'
    );
    return lines.join('\n');
  }

  lines.push(`Bonjour ${contact.name},`);
  lines.push('');

  if (balance > 0) {
    lines.push(
      `Petit rappel amical concernant notre suivi de compte : le solde restant en votre défaveur est de *${formatMAD(
        balance,
        { hideDecimals }
      )}*.`
    );
  } else if (balance < 0) {
    lines.push(
      `Pour suivi de notre compte : je vous dois actuellement un solde de *${formatMAD(
        Math.abs(balance),
        { hideDecimals }
      )}*.`
    );
  } else {
    lines.push(`Pour information : notre compte est actuellement soldé (*0 DH*).`);
  }

  if (lastTransaction) {
    const txLabel = TX_TYPE_LABELS.fr[lastTransaction.type].shortLabel;
    const dateStr = formatDateFR(lastTransaction.occurredAt, 'fr');
    const notePart = lastTransaction.note ? ` (${lastTransaction.note})` : '';
    lines.push(
      `Dernière opération (${dateStr}) : ${txLabel} de ${formatMAD(
        lastTransaction.amount,
        { hideDecimals }
      )}${notePart}.`
    );
  }

  if (nextDue && !nextDue.isSettled) {
    if (nextDue.urgency === 'overdue') {
      lines.push(
        `Échéance dépassée depuis le ${dueStr} (${Math.abs(
          nextDue.daysDiff
        )} j). Merci de me tenir informé(e).`
      );
    } else if (nextDue.urgency === 'today') {
      lines.push(`Échéance prévue aujourd'hui (${dueStr}).`);
    } else {
      lines.push(`Prochaine échéance : ${dueStr}.`);
    }
  }

  lines.push('');
  lines.push(
    businessName?.trim()
      ? `Cordialement,\n${businessName.trim()}`
      : 'Merci et bonne journée.'
  );

  return lines.join('\n');
}

export function buildWhatsAppUrl(
  summary: ContactSummary,
  businessName?: string,
  lang: AppLanguage = 'fr',
  options: WhatsAppOptions = {}
): string | null {
  const digits = toWhatsAppDigits(summary.contact.phone);
  if (!digits) return null;

  const message = buildWhatsAppReminderMessage(summary, businessName, lang, options);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function buildSingleTxWhatsAppMessage(
  summary: ContactSummary,
  tx: Transaction,
  businessName?: string,
  lang: AppLanguage = 'fr',
  hideDecimals = false
): string {
  const txLabel = TX_TYPE_LABELS[lang][tx.type].shortLabel;
  const dateStr = formatDateFR(tx.occurredAt, lang);
  const amountStr = formatMAD(tx.amount, { lang, hideDecimals });
  const balStr = formatMAD(Math.abs(summary.balance), { lang, hideDecimals });
  const refPart = tx.reference ? ` [${tx.reference}]` : '';
  const notePart = tx.note ? ` — ${tx.note}` : '';
  const duePart = tx.dueDate
    ? lang === 'ar'
      ? `\nتاريخ الأجل: ${formatDateFR(tx.dueDate, 'ar')}`
      : `\nÉchéance prévue : ${formatDateFR(tx.dueDate, 'fr')}`
    : '';

  if (lang === 'ar') {
    return [
      `السلام عليكم ${summary.contact.name}،`,
      `بخصوص العملية بتاريخ ${dateStr}: *${txLabel}* بمبلغ *${amountStr}*${refPart}${notePart}.${duePart}`,
      summary.balance !== 0 ? `الرصيد الحالي للحساب: *${balStr}*.` : `الحساب الحالي مساوي.`,
      businessName?.trim() ? `مع التحية، ${businessName.trim()}` : 'شكراً لكم.',
    ].join('\n');
  }

  return [
    `Bonjour ${summary.contact.name},`,
    `Concernant l'opération du ${dateStr} : *${txLabel}* de *${amountStr}*${refPart}${notePart}.${duePart}`,
    summary.balance !== 0 ? `Solde global actuel : *${balStr}*.` : `Compte actuellement soldé.`,
    businessName?.trim() ? `Cordialement, ${businessName.trim()}` : 'Merci.',
  ].join('\n');
}

export function buildSingleTxWhatsAppUrl(
  summary: ContactSummary,
  tx: Transaction,
  businessName?: string,
  lang: AppLanguage = 'fr',
  hideDecimals = false
): string | null {
  const digits = toWhatsAppDigits(summary.contact.phone);
  if (!digits) return null;
  const msg = buildSingleTxWhatsAppMessage(summary, tx, businessName, lang, hideDecimals);
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
}
