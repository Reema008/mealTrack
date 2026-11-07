import type { Bill, BillingSettings, DayRow } from '../domain/billing';
import { formatDate, formatLong } from '../domain/dates';
import { PERIOD_LABEL } from '../domain/schedule';

export interface ReportInput {
  title: string;
  start: string;
  end: string;
  bill: Bill;
  rows: DayRow[];
  settings: BillingSettings;
  /** True when the range is exactly one monthly subscription, so "next amount" applies. */
  isSubscriptionPeriod: boolean;
  generatedOn: string;
}

// The PDF's built-in font has no ₹ sign, so amounts are written "Rs. 6,600".
const rs = (n: number) => `Rs. ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)}`;
const day = (d: string) => formatDate(d, { weekday: 'short', day: 'numeric', month: 'short' });

const TARO = [134, 112, 171] as const;
const TARO_PALE = [246, 242, 251] as const;
const INK = [43, 37, 56] as const;

const STATUS: Record<DayRow['meals'][number]['status'], string> = {
  delivered: 'Delivered',
  not_received: 'CANCELLED',
  pending: 'Pending',
  planned: 'Planned',
};

function mealCell(row: DayRow, period: 'lunch' | 'dinner'): string {
  const m = row.meals.find((x) => x.period === period);
  if (!m) return '-';
  const curry = m.curry ? `\n${m.curry.type === 'egg' ? 'Egg' : 'Chicken'} curry: ${m.curry.received ? 'received' : 'MISSING'}` : '';
  const by = m.status === 'not_received' ? (m.cancelledBy === 'you' ? ' by you' : ' by sender') : '';
  return STATUS[m.status] + by + curry;
}

/** Builds the report PDF and returns it as a file (loaded on demand, so the app stays small). */
export async function buildReportPdf(r: ReportInput): Promise<File> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const b = r.bill;

  doc.setFillColor(...TARO);
  doc.rect(0, 0, W, 78, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('MealTrack report', M, 38);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`${r.title}  ·  ${formatLong(r.start)} to ${formatLong(r.end)}`, M, 58);

  doc.setTextColor(...INK);
  let y = 106;

  // ---- Amount ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(r.isSubscriptionPeriod ? 'Next subscription amount' : 'Amount summary', M, y);
  const amountRows: Array<[string, string]> = [];
  if (r.isSubscriptionPeriod) amountRows.push(['Monthly subscription amount', rs(b.base)]);
  amountRows.push(
    [`Cancelled meals (${b.missedMeals.length})`, `- ${rs(b.mealDeductions)}`],
    [`Chicken curries delivered (${b.curriesAdded.chicken.count} x ${rs(r.settings.chickenCurry)})`, `+ ${rs(b.curriesAdded.chicken.amount)}`],
    [`Egg curries delivered (${b.curriesAdded.egg.count} x ${rs(r.settings.eggCurry)})`, `+ ${rs(b.curriesAdded.egg.amount)}`],
  );
  if (r.isSubscriptionPeriod) amountRows.push(['Amount for the next subscription', rs(b.nextAmount)]);
  else {
    const change = b.curryCharges - b.mealDeductions;
    amountRows.push(['Change to the subscription amount', `${change >= 0 ? '+' : '-'} ${rs(Math.abs(change))}`]);
  }
  autoTable(doc, {
    startY: y + 8,
    margin: { left: M, right: M },
    body: amountRows,
    theme: 'plain',
    styles: { fontSize: 11, cellPadding: 5, textColor: [...INK] },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    didParseCell: (d) => {
      if (d.row.index === amountRows.length - 1) {
        d.cell.styles.fillColor = [...TARO_PALE];
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fontSize = 12;
      }
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(106, 94, 128);
  const prices = `Prices: veg meal ${rs(r.settings.vegMeal)}, non-veg meal ${rs(r.settings.nonvegMeal)}, chicken curry ${rs(r.settings.chickenCurry)}, egg curry ${rs(r.settings.eggCurry)}. A cancelled meal takes its meal price off; each delivered extra curry adds its curry price. A missing extra curry adds nothing.`;
  const lines = doc.splitTextToSize(prices, W - 2 * M);
  doc.text(lines, M, y);
  y += lines.length * 11 + 4;
  if (b.notYetCounted > 0) {
    doc.text(`${b.notYetCounted} meal(s) are still pending or in the future and are not counted yet.`, M, y);
    y += 14;
  }
  doc.text(
    `Delivered: ${b.delivered.veg} veg + ${b.delivered.nonveg} non-veg meals. Extra curries that did not come: ${b.missingCurries}.`,
    M,
    y,
  );
  y += 22;

  // ---- What was missed ----
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Cancelled meals', M, y);
  const missed = b.missedMeals;
  autoTable(doc, {
    startY: y + 8,
    margin: { left: M, right: M },
    head: [['Date', 'Meal', 'What', 'Taken off']],
    body: missed.length
      ? missed.map((l) => [
          day(l.date),
          PERIOD_LABEL[l.period],
          `${l.dayType === 'veg' ? 'Veg' : 'Non-veg'} meal, cancelled by ${l.cancelledBy === 'you' ? 'you' : 'sender'}`,
          `- ${rs(l.amount)}`,
        ])
      : [['-', '-', 'No meals were cancelled', rs(0)]],
    headStyles: { fillColor: [...TARO], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [...TARO_PALE] },
    styles: { fontSize: 10, textColor: [...INK] },
    columnStyles: { 3: { halign: 'right' } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  // ---- Day by day ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Day by day', M, y);
  autoTable(doc, {
    startY: y + 8,
    margin: { left: M, right: M },
    head: [['Date', 'Day', 'Lunch', 'Dinner', 'Amount']],
    body: r.rows.map((row) => [
      day(row.date),
      row.dayType === 'none' ? 'No delivery' : row.dayType === 'veg' ? 'Veg' : 'Non-veg',
      row.dayType === 'none' ? '-' : mealCell(row, 'lunch'),
      row.dayType === 'none' ? '-' : mealCell(row, 'dinner'),
      row.change ? `${row.change > 0 ? '+' : '-'} ${rs(Math.abs(row.change))}` : '-',
    ]),
    headStyles: { fillColor: [...TARO], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [...TARO_PALE] },
    styles: { fontSize: 9, textColor: [...INK], cellPadding: 4 },
    columnStyles: { 4: { halign: 'right' } },
    didParseCell: (d) => {
      if (d.section === 'body' && typeof d.cell.raw === 'string' && /CANCELLED|MISSING/.test(d.cell.raw)) d.cell.styles.fontStyle = 'bold';
    },
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(133, 120, 154);
    doc.text(`Generated by MealTrack on ${r.generatedOn}  ·  Page ${i} of ${pages}`, M, doc.internal.pageSize.getHeight() - 20);
  }

  const name = `MealTrack ${r.start} to ${r.end}.pdf`;
  return new File([doc.output('blob')], name, { type: 'application/pdf' });
}

/** Save the file: share sheet on phones that support it, otherwise a normal download. */
export async function saveFile(file: File): Promise<void> {
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  const isPhone = /Android|iPhone|iPad/i.test(navigator.userAgent);
  if (isPhone && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
