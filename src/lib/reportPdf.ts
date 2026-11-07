import type { Bill, BillingSettings, DayRow } from '../domain/billing';
import { addDays, formatDate, formatLong, startOfWeek } from '../domain/dates';
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

/** An [r, g, b] colour. */
type RGB = [number, number, number];
const TARO: RGB = [134, 112, 171];
const TARO_PALE: RGB = [246, 242, 251];
const INK: RGB = [43, 37, 56];

const DEEP: RGB = [110, 90, 146];
const LILAC: RGB = [220, 205, 239];
const MUTED: RGB = [133, 120, 154];
const WHITE: RGB = [255, 255, 255];

type Pdf = import('jspdf').jsPDF;
type Meal = DayRow['meals'][number];

function tick(doc: Pdf, x: number, y: number, s = 1) {
  doc.line(x, y, x + 2 * s, y + 2 * s);
  doc.line(x + 2 * s, y + 2 * s, x + 5.5 * s, y - 2.5 * s);
}
function cross(doc: Pdf, x: number, y: number, s = 1) {
  doc.line(x, y - 2.2 * s, x + 4.4 * s, y + 2.2 * s);
  doc.line(x, y + 2.2 * s, x + 4.4 * s, y - 2.2 * s);
}

/** One meal as a pill: filled when delivered, outlined with a cross when cancelled. */
function mealPill(doc: Pdf, m: Meal | undefined, label: string, x: number, y: number, w: number) {
  const h = 15;
  const mid = y + h / 2;
  doc.setLineWidth(0.8);
  if (!m) return;
  if (m.status === 'delivered') {
    doc.setFillColor(...TARO);
    doc.setDrawColor(...TARO);
    doc.roundedRect(x, y, w, h, 7.5, 7.5, 'FD');
    doc.setDrawColor(...WHITE);
    doc.setLineWidth(1.1);
    tick(doc, x + 5, mid);
    doc.setTextColor(...WHITE);
  } else if (m.status === 'not_received') {
    doc.setFillColor(...WHITE);
    doc.setDrawColor(...DEEP);
    doc.setLineDashPattern([2, 1.5], 0);
    doc.roundedRect(x, y, w, h, 7.5, 7.5, 'FD');
    doc.setLineDashPattern([], 0);
    doc.setLineWidth(1.1);
    cross(doc, x + 5, mid);
    doc.setTextColor(...DEEP);
  } else {
    doc.setFillColor(...TARO_PALE);
    doc.setDrawColor(...LILAC);
    doc.roundedRect(x, y, w, h, 7.5, 7.5, 'FD');
    doc.setTextColor(...MUTED);
  }
  doc.setFont('helvetica', 'bold');
  const text = m.status === 'not_received' ? `${label} (${m.cancelledBy === 'you' ? 'you' : 'sender'})` : label;
  // Shrink to fit beside the tick/cross (and the curry badge, if any).
  const room = w - 15 - (m.curry ? 13 : 3);
  let size = 7;
  doc.setFontSize(size);
  while (size > 5 && doc.getTextWidth(text) > room) doc.setFontSize((size -= 0.25));
  doc.text(text, x + 13, mid + 2.4);

  // Extra curry: a small badge, "C" chicken or "E" egg, struck through when it did not come.
  if (m.curry) {
    const cx = x + w - 7.5;
    doc.setLineWidth(0.8);
    doc.setFillColor(...(m.curry.received ? WHITE : TARO_PALE));
    doc.setDrawColor(...(m.status === 'delivered' ? WHITE : DEEP));
    doc.circle(cx, mid, 5, 'FD');
    doc.setTextColor(...DEEP);
    doc.setFontSize(6.5);
    doc.text(m.curry.type === 'egg' ? 'E' : 'C', cx, mid + 2.3, { align: 'center' });
    if (!m.curry.received) {
      doc.setDrawColor(...DEEP);
      doc.setLineWidth(1);
      doc.line(cx - 4, mid + 4, cx + 4, mid - 4);
    }
  }
}

type Cancelled = Bill['missedMeals'][number];

/** "Cancelled meals": a summary strip, then one card per day. Returns the y below it. */
function drawCancelled(doc: Pdf, missed: Cancelled[], total: number, top: number, M: number): number {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const full = W - 2 * M;
  let y = top;

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Cancelled meals', M, y);
  y += 10;

  if (missed.length === 0) {
    doc.setFillColor(...TARO_PALE);
    doc.roundedRect(M, y, full, 34, 10, 10, 'F');
    doc.setFillColor(...TARO);
    doc.circle(M + 18, y + 17, 9, 'F');
    doc.setDrawColor(...WHITE);
    doc.setLineWidth(1.6);
    tick(doc, M + 13.5, y + 17.5, 1.3);
    doc.setTextColor(...INK);
    doc.setFontSize(11);
    doc.text('No meals were cancelled', M + 36, y + 21);
    return y + 34;
  }

  // Summary strip
  const bySender = missed.filter((l) => l.cancelledBy !== 'you').length;
  const byYou = missed.length - bySender;
  doc.setFillColor(...TARO_PALE);
  doc.roundedRect(M, y, full, 40, 12, 12, 'F');
  doc.setFillColor(...TARO);
  doc.circle(M + 22, y + 20, 13, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(13);
  doc.text(String(missed.length), M + 22, y + 24.5, { align: 'center' });
  doc.setTextColor(...INK);
  doc.setFontSize(11);
  doc.text(`cancelled meal${missed.length === 1 ? '' : 's'}`, M + 44, y + 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(`${bySender} by sender  ·  ${byYou} by you`, M + 44, y + 29);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('TAKEN OFF', W - M - 14, y + 15, { align: 'right' });
  doc.setTextColor(...DEEP);
  doc.setFontSize(13);
  doc.text(`- ${rs(total)}`, W - M - 14, y + 30, { align: 'right' });
  y += 50;

  // One card per day, two to a row
  const days: Cancelled[][] = [];
  for (const l of missed) {
    const last = days[days.length - 1];
    if (last && last[0].date === l.date) last.push(l);
    else days.push([l]);
  }
  const gap = 8;
  const cw = (full - gap) / 2;
  const lineH = 24;
  const cardH = (n: number) => Math.max(50, 12 + n * lineH);

  for (let i = 0; i < days.length; i += 2) {
    const rowH = Math.max(cardH(days[i].length), days[i + 1] ? cardH(days[i + 1].length) : 0);
    if (y + rowH > H - 36) {
      doc.addPage();
      y = 50;
    }
    [days[i], days[i + 1]].forEach((meals, col) => {
      if (!meals) return;
      const x = M + col * (cw + gap);
      const h = rowH; // cards in a row share a height
      const date = meals[0].date;
      doc.setFillColor(...WHITE);
      doc.setDrawColor(...LILAC);
      doc.setLineWidth(0.9);
      doc.roundedRect(x, y, cw, h, 10, 10, 'FD');

      // Date block
      doc.setFillColor(...TARO_PALE);
      doc.roundedRect(x + 6, y + 6, 40, h - 12, 7, 7, 'F');
      const cy = y + h / 2;
      doc.setTextColor(...MUTED);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.text(formatDate(date, { weekday: 'short' }).toUpperCase(), x + 26, cy - 9, { align: 'center' });
      doc.setTextColor(...INK);
      doc.setFontSize(15);
      doc.text(String(Number(date.slice(8, 10))), x + 26, cy + 4, { align: 'center' });
      doc.setTextColor(...MUTED);
      doc.setFontSize(6.5);
      doc.text(formatDate(date, { month: 'short' }).toUpperCase(), x + 26, cy + 13, { align: 'center' });

      // Each cancelled meal
      const firstY = y + h / 2 - ((meals.length - 1) * lineH) / 2;
      meals.forEach((l, j) => {
        const ly = firstY + j * lineH;
        const lx = x + 54;
        // dashed circle with a cross, like the calendar
        doc.setDrawColor(...DEEP);
        doc.setFillColor(...WHITE);
        doc.setLineWidth(0.8);
        doc.setLineDashPattern([1.6, 1.2], 0);
        doc.circle(lx + 7, ly, 7, 'FD');
        doc.setLineDashPattern([], 0);
        doc.setLineWidth(1.1);
        cross(doc, lx + 4.8, ly, 1);

        doc.setTextColor(...INK);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        const meal = PERIOD_LABEL[l.period];
        doc.text(meal, lx + 19, ly - 1);
        const mealW = doc.getTextWidth(meal);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        doc.text(`${l.dayType === 'veg' ? 'Veg' : 'Non-veg'} meal`, lx + 19, ly + 8);

        // Who cancelled: filled tag for "you", outlined for "sender"
        const who = l.cancelledBy === 'you' ? 'BY YOU' : 'BY SENDER';
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        const tw = doc.getTextWidth(who) + 9;
        const tx = lx + 19 + mealW + 6;
        if (l.cancelledBy === 'you') {
          doc.setFillColor(...DEEP);
          doc.roundedRect(tx, ly - 8.5, tw, 10, 5, 5, 'F');
          doc.setTextColor(...WHITE);
        } else {
          doc.setDrawColor(...TARO);
          doc.setLineWidth(0.7);
          doc.roundedRect(tx, ly - 8.5, tw, 10, 5, 5, 'S');
          doc.setTextColor(...TARO);
        }
        doc.text(who, tx + tw / 2, ly - 1.6, { align: 'center' });

        doc.setTextColor(...DEEP);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`- ${rs(l.amount)}`, x + cw - 10, ly + 3, { align: 'right' });
      });
    });
    y += rowH + gap;
  }
  return y - gap;
}

/** Day-by-day calendar: weeks as rows (Mon–Sun), one card per day. */
function drawCalendar(doc: Pdf, rows: DayRow[], top: number, M: number) {
  if (rows.length === 0) return;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const gap = 5;
  const cw = (W - 2 * M - gap * 6) / 7;
  const ch = 76;
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const first = rows[0].date;
  const last = rows[rows.length - 1].date;
  const weeks = Math.floor((Date.parse(last) - Date.parse(startOfWeek(first))) / (7 * 86_400_000)) + 1;
  const needed = 40 + weeks * (ch + gap);

  let y = top;
  const heading = () => {
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Day by day', M, y);
    // Legend
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(
      'Filled = delivered  ·  dashed with a cross = cancelled (by sender / you)  ·  pale = not yet  ·  C / E = extra chicken / egg curry, struck = did not come',
      M,
      y + 13,
    );
    y += 26;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].forEach((d, i) => {
      doc.setTextColor(...(i === 6 ? MUTED : DEEP));
      doc.text(d, M + i * (cw + gap) + cw / 2, y, { align: 'center' });
    });
    y += 7;
  };
  // Start on a fresh page if that keeps the whole calendar together (e.g. a month).
  if (y + 40 + ch > H - 36 || (y + needed > H - 36 && 50 + needed <= H - 36)) {
    doc.addPage();
    y = 50;
  }
  heading();

  for (let week = startOfWeek(first); week <= last; week = addDays(week, 7)) {
    if (y + ch > H - 36) {
      doc.addPage();
      y = 50;
      heading();
    }
    for (let i = 0; i < 7; i++) {
      const date = addDays(week, i);
      const row = byDate.get(date);
      const x = M + i * (cw + gap);
      if (!row) continue; // outside the report's dates
      const dom = Number(date.slice(8, 10));
      const showMonth = dom === 1 || date === first;
      doc.setLineWidth(0.8);

      if (row.dayType === 'none') {
        doc.setFillColor(...TARO_PALE);
        doc.setDrawColor(...TARO_PALE);
        doc.roundedRect(x, y, cw, ch, 8, 8, 'FD');
        doc.setTextColor(...MUTED);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(showMonth ? `${dom} ${formatDate(date, { month: 'short' })}` : String(dom), x + 7, y + 15);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text('No delivery', x + cw / 2, y + ch / 2 + 8, { align: 'center' });
        continue;
      }

      const cancelled = row.meals.some((m) => m.status === 'not_received');
      doc.setFillColor(...WHITE);
      doc.setDrawColor(...(cancelled ? DEEP : LILAC));
      doc.setLineWidth(cancelled ? 1.2 : 0.8);
      doc.roundedRect(x, y, cw, ch, 8, 8, 'FD');

      // Date and the day's kind
      doc.setTextColor(...INK);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(showMonth ? `${dom} ${formatDate(date, { month: 'short' })}` : String(dom), x + 7, y + 15);
      const kind = row.dayType === 'veg' ? 'VEG' : 'NON-VEG';
      doc.setFontSize(5.8);
      const kw = doc.getTextWidth(kind) + 7;
      doc.setFillColor(...LILAC);
      doc.roundedRect(x + cw - kw - 5, y + 7, kw, 10, 5, 5, 'F');
      doc.setTextColor(...DEEP);
      doc.text(kind, x + cw - 5 - kw / 2, y + 13.8, { align: 'center' });

      mealPill(doc, row.meals.find((m) => m.period === 'lunch'), 'Lunch', x + 4, y + 22, cw - 8);
      mealPill(doc, row.meals.find((m) => m.period === 'dinner'), 'Dinner', x + 4, y + 40, cw - 8);

      // That day's change to the amount
      if (row.change) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...(row.change < 0 ? DEEP : TARO));
        doc.text(`${row.change > 0 ? '+' : '-'} ${rs(Math.abs(row.change))}`, x + cw - 6, y + ch - 6, { align: 'right' });
      }
    }
    y += ch + gap;
  }
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

  // ---- What was cancelled: a summary, then a card per day ----
  y = drawCancelled(doc, b.missedMeals, b.mealDeductions, y, M) + 24;

  // ---- Day by day: a calendar, one card per day ----
  drawCalendar(doc, r.rows, y, M);

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
