import { CATEGORY_LABELS, TX_TYPE_LABELS, UI_TEXT } from '../i18n/translations.ts';
import type {
  AppLanguage,
  ContactSummary,
  LedgerEntryWithBalance,
} from '../types/ledger.ts';
import { formatDateFR, formatMAD, getTodayISODate } from './formatters.ts';

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (!text || ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) {
    end -= 1;
  }
  return `${text.slice(0, Math.max(1, end))}…`;
}

export async function generateStatementPngBlob(params: {
  summary: ContactSummary;
  entries: LedgerEntryWithBalance[];
  businessName?: string;
  lang: AppLanguage;
  hideDecimals?: boolean;
}): Promise<Blob> {
  const { summary, entries, businessName, lang, hideDecimals = false } = params;
  const s = UI_TEXT[lang].statement;
  const isAr = lang === 'ar';
  const recent = [...entries].slice(-7).reverse();

  const width = 820;
  const rowHeight = 56;
  const height = 430 + Math.max(1, recent.length) * rowHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error(isAr ? 'متصفحك لا يدعم إنشاء الصور.' : 'Canvas 2D indisponible');
  }

  // Background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  // Header gradient card
  const headerGrad = ctx.createLinearGradient(0, 0, width, 190);
  if (summary.balance > 0) {
    headerGrad.addColorStop(0, '#047857');
    headerGrad.addColorStop(1, '#134e4a');
  } else if (summary.balance < 0) {
    headerGrad.addColorStop(0, '#be123c');
    headerGrad.addColorStop(1, '#881337');
  } else {
    headerGrad.addColorStop(0, '#334155');
    headerGrad.addColorStop(1, '#0f172a');
  }
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, width, 210);

  ctx.textBaseline = 'top';
  const padX = 40;
  const textDir: CanvasDirection = isAr ? 'rtl' : 'ltr';

  ctx.direction = textDir;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = 'bold 18px Inter, Segoe UI, Tahoma, sans-serif';
  ctx.textAlign = isAr ? 'right' : 'left';
  ctx.fillText(
    fitCanvasText(ctx, businessName?.trim() || s.defaultHeader, 460),
    isAr ? width - padX : padX,
    28
  );

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px Inter, Segoe UI, Tahoma, sans-serif';
  ctx.fillText(
    fitCanvasText(ctx, summary.contact.name, 700),
    isAr ? width - padX : padX,
    60
  );

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '18px Inter, Segoe UI, Tahoma, sans-serif';
  const metaLine = `${CATEGORY_LABELS[lang][summary.contact.category]}${
    summary.contact.phone ? ` • ${summary.contact.phone}` : ''
  }`;
  ctx.fillText(
    fitCanvasText(ctx, metaLine, 700),
    isAr ? width - padX : padX,
    108
  );

  // Date badge opposite side
  ctx.textAlign = isAr ? 'left' : 'right';
  ctx.font = '16px Inter, Segoe UI, Tahoma, sans-serif';
  ctx.fillText(
    fitCanvasText(ctx, s.issuedOn(formatDateFR(getTodayISODate(), lang)), 250),
    isAr ? padX : width - padX,
    30
  );

  // Balance Banner
  drawRoundRect(ctx, padX, 152, width - padX * 2, 92, 20);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.stroke();

  const balLabel =
    summary.balance > 0
      ? s.balanceFavorable
      : summary.balance < 0
        ? s.balancePayable
        : s.balanceZero;

  const balanceStr = formatMAD(summary.balance, {
    showSign: summary.balance !== 0,
    lang,
    hideDecimals,
  });

  ctx.direction = 'ltr';
  ctx.fillStyle =
    summary.balance > 0 ? '#047857' : summary.balance < 0 ? '#be123c' : '#334155';
  ctx.font = 'bold 32px Inter, Segoe UI, Tahoma, sans-serif';
  ctx.textAlign = isAr ? 'left' : 'right';
  const balTextFitted = fitCanvasText(ctx, balanceStr, 290);
  ctx.fillText(balTextFitted, isAr ? padX + 24 : width - padX - 24, 182);

  ctx.direction = textDir;
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 17px Inter, Segoe UI, Tahoma, sans-serif';
  ctx.textAlign = isAr ? 'right' : 'left';
  ctx.fillText(
    fitCanvasText(ctx, balLabel, 380),
    isAr ? width - padX - 24 : padX + 24,
    186
  );

  // Recent operations section
  let cursorY = 272;
  ctx.direction = textDir;
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px Inter, Segoe UI, Tahoma, sans-serif';
  ctx.textAlign = isAr ? 'right' : 'left';
  const headingText = isAr
    ? `آخر العمليات (${recent.length}/${entries.length})`
    : `Dernières opérations (${recent.length}/${entries.length})`;
  ctx.fillText(fitCanvasText(ctx, headingText, 720), isAr ? width - padX : padX, cursorY);
  cursorY += 38;

  if (recent.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '18px Inter, Segoe UI, Tahoma, sans-serif';
    ctx.fillText(fitCanvasText(ctx, s.noOps, 720), isAr ? width - padX : padX, cursorY + 12);
  } else {
    for (const entry of recent) {
      drawRoundRect(ctx, padX, cursorY, width - padX * 2, rowHeight - 8, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.stroke();

      const tx = entry.transaction;
      const typeShort = TX_TYPE_LABELS[lang][tx.type].shortLabel;
      const dateStr = formatDateFR(tx.occurredAt, lang);
      const label = `${dateStr} • ${typeShort}${tx.note ? ` — ${tx.note}` : ''}`;

      ctx.direction = textDir;
      ctx.fillStyle = '#1e293b';
      ctx.font = '600 16px Inter, Segoe UI, Tahoma, sans-serif';
      ctx.textAlign = isAr ? 'right' : 'left';
      ctx.fillText(
        fitCanvasText(ctx, label, 490),
        isAr ? width - padX - 16 : padX + 16,
        cursorY + 15
      );

      ctx.direction = 'ltr';
      ctx.fillStyle = entry.signedAmount > 0 ? '#047857' : '#be123c';
      ctx.font = 'bold 18px Inter, Segoe UI, Tahoma, sans-serif';
      ctx.textAlign = isAr ? 'left' : 'right';
      const amtStr = formatMAD(entry.signedAmount, {
        showSign: true,
        lang,
        hideDecimals,
      });
      ctx.fillText(
        fitCanvasText(ctx, amtStr, 195),
        isAr ? padX + 16 : width - padX - 16,
        cursorY + 14
      );

      cursorY += rowHeight;
    }
  }

  // Footer
  ctx.direction = textDir;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '15px Inter, Segoe UI, Tahoma, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(fitCanvasText(ctx, s.footer(entries.length), 740), width / 2, height - 34);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else
        reject(
          new Error(isAr ? 'تعذر إنشاء صورة PNG.' : 'Impossible de générer l’image PNG.')
        );
    }, 'image/png');
  });
}
