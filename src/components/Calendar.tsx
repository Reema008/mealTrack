import { CurryIcon, NonVegIcon, VegIcon } from './ui';
import { addDays, eachDay, endOfMonth, formatDate, formatLong, startOfMonth, startOfWeek, weekdayShort } from '../domain/dates';
import { mealsForDate } from '../domain/meals';
import { getDayType } from '../domain/schedule';
import { useHousehold } from '../data/household';
import type { EffectiveMeal, ISODate, OverrideMap } from '../domain/types';

/** What the calendar shows for one meal: only delivered, not delivered or pending. */
export type MealMark = 'delivered' | 'missed' | 'pending' | null;

export interface DaySummary {
  dayType: ReturnType<typeof getDayType>;
  /** Lunch then dinner; null = nothing to show yet (a normal future meal). */
  meals: MealMark[];
  /** A delivered non-veg meal came without the extra curries. */
  noExtra: boolean;
}

function markFor(m: EffectiveMeal): MealMark {
  if (m.deliveryStatus === 'not_received') return 'missed';
  if (m.timing === 'pending') return 'pending';
  if (m.timing === 'future') return null;
  return 'delivered';
}

export function summarizeDay(date: ISODate, map: OverrideMap, today: ISODate, nowMinutes?: number): DaySummary {
  const meals = mealsForDate(date, map, today, nowMinutes);
  return {
    dayType: getDayType(date),
    meals: meals.map(markFor),
    noExtra: meals.some(
      (m) => m.dayType === 'nonveg' && m.deliveryStatus === 'delivered' && m.extraCurryReceived === false && (m.timing === 'past' || m.timing === 'today'),
    ),
  };
}

const MARK_TEXT: Record<Exclude<MealMark, null>, string> = {
  delivered: 'delivered',
  missed: 'not delivered',
  pending: 'pending',
};

function describeDay(date: ISODate, s: DaySummary): string {
  const parts = [formatLong(date), s.dayType === 'none' ? 'no delivery' : s.dayType === 'veg' ? 'veg' : 'non-veg'];
  ['lunch', 'dinner'].forEach((name, i) => {
    const mark = s.meals[i];
    if (mark) parts.push(`${name} ${MARK_TEXT[mark]}`);
  });
  if (s.noExtra) parts.push('no extra curry');
  return parts.join(', ');
}

const TYPE_COLOR = { veg: 'text-emerald-600 dark:text-emerald-300', nonveg: 'text-emerald-800 dark:text-emerald-100', none: '' } as const;

function TypeMark({ type, className }: { type: DaySummary['dayType']; className: string }) {
  if (type === 'veg') return <VegIcon className={`${className} ${TYPE_COLOR.veg}`} />;
  if (type === 'nonveg') return <NonVegIcon className={`${className} ${TYPE_COLOR.nonveg}`} />;
  return null;
}

/** Small status icon for one meal: ✓ delivered, ✕ not delivered, clock = pending. */
export function MealIcon({ mark, className = 'h-3 w-3' }: { mark: Exclude<MealMark, null>; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden>
      {mark === 'delivered' && (
        <>
          <circle cx="6" cy="6" r="5.5" style={{ fill: 'var(--st-delivered)' }} />
          <path d="M3.4 6.2 5.2 8l3.4-3.8" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--st-on)' }} />
        </>
      )}
      {mark === 'missed' && (
        <>
          <circle cx="6" cy="6" r="5.5" style={{ fill: 'var(--st-missed)' }} />
          <path d="M4 4l4 4M8 4 4 8" fill="none" strokeWidth="1.5" strokeLinecap="round" style={{ stroke: 'var(--st-on-missed)' }} />
        </>
      )}
      {mark === 'pending' && (
        <>
          <circle cx="6" cy="6" r="4.9" fill="none" strokeWidth="1.3" style={{ stroke: 'var(--st-pending)' }} />
          <path d="M6 3.4V6l1.8 1.2" fill="none" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--st-pending)' }} />
        </>
      )}
    </svg>
  );
}

/** One icon per meal: lunch first, then dinner. */
function MealIcons({ meals, className }: { meals: MealMark[]; className?: string }) {
  if (!meals.some(Boolean)) return <span className="h-3" aria-hidden />;
  return (
    <span className="flex items-center gap-0.5" aria-hidden>
      {meals.map((m, i) => (m ? <MealIcon key={i} mark={m} className={className} /> : <span key={i} className="h-3 w-3" />))}
    </span>
  );
}

/** The curry bowl with a line through it: a non-veg meal came without the extra curries. */
export function NoExtraMark({ className }: { className: string }) {
  return (
    <span className={`relative inline-flex ${className}`} aria-hidden>
      <CurryIcon className="h-full w-full opacity-80" />
      <svg viewBox="0 0 12 12" className="absolute inset-0 h-full w-full">
        <path d="M1.5 10.5 10.5 1.5" strokeWidth="1.6" strokeLinecap="round" style={{ stroke: 'var(--st-missed)' }} />
      </svg>
    </span>
  );
}

export function CalendarLegend() {
  return (
    <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-700 dark:text-slate-200 sm:grid-cols-3">
      <li className="flex items-center gap-2"><TypeMark type="veg" className="h-3.5 w-3.5" />Veg day</li>
      <li className="flex items-center gap-2"><TypeMark type="nonveg" className="h-3.5 w-3.5" />Non-veg day</li>
      <li className="flex items-center gap-2"><MealIcon mark="delivered" className="h-3.5 w-3.5" />Delivered</li>
      <li className="flex items-center gap-2"><MealIcon mark="missed" className="h-3.5 w-3.5" />Not delivered</li>
      <li className="flex items-center gap-2"><MealIcon mark="pending" className="h-3.5 w-3.5" />Pending</li>
      <li className="flex items-center gap-2"><NoExtraMark className="h-3.5 w-3.5" />No extra curry</li>
      <li className="col-span-full text-slate-500 dark:text-slate-300">Each day shows two icons: lunch first, then dinner.</li>
    </ul>
  );
}

export function MonthCalendar({
  month,
  selected,
  today,
  map,
  onSelect,
}: {
  month: ISODate;
  selected: ISODate;
  today: ISODate;
  map: OverrideMap;
  pendingKeys?: ReadonlySet<string>;
  onSelect: (d: ISODate) => void;
}) {
  const { nowMinutes } = useHousehold();
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(startOfWeek(last), 6);
  const days = eachDay(gridStart, gridEnd);
  const headers = eachDay(gridStart, addDays(gridStart, 6));

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500 dark:text-slate-300" aria-hidden>
        {headers.map((d) => (
          <div key={d} className="py-1">
            {weekdayShort(d)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Month calendar">
        {days.map((d) => {
          const inMonth = d >= first && d <= last;
          const s = summarizeDay(d, map, today, nowMinutes);
          const isSel = d === selected;
          const isToday = d === today;
          return (
            <button
              key={d}
              type="button"
              role="gridcell"
              aria-selected={isSel}
              aria-label={describeDay(d, s)}
              onClick={() => onSelect(d)}
              className={`flex min-h-[3.6rem] flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                inMonth ? 'taro-inset text-slate-900 hover:bg-white dark:text-slate-50 dark:hover:bg-white/10' : 'text-slate-400 opacity-60 dark:text-slate-400'
              } ${isSel ? 'ring-2 ring-emerald-500 dark:ring-emerald-300' : ''}`}
            >
              <span className="flex h-2.5 items-center gap-0.5" aria-hidden>
                <TypeMark type={s.dayType} className="h-2.5 w-2.5" />
                {s.noExtra && <NoExtraMark className="h-2.5 w-2.5" />}
              </span>
              <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[13px] leading-none ${isToday ? 'btn-taro font-bold' : isSel ? 'font-bold' : ''}`}>
                {Number(formatDate(d, { day: 'numeric' }))}
              </span>
              <MealIcons meals={s.meals} />
            </button>
          );
        })}
      </div>
      <CalendarLegend />
    </div>
  );
}

export function WeekStrip({
  start,
  today,
  map,
  onSelect,
}: {
  start: ISODate;
  today: ISODate;
  map: OverrideMap;
  pendingKeys?: ReadonlySet<string>;
  onSelect: (d: ISODate) => void;
}) {
  const { nowMinutes } = useHousehold();
  return (
    <ol className="grid grid-cols-7 gap-1.5">
      {eachDay(start, addDays(start, 6)).map((d) => {
        const s = summarizeDay(d, map, today, nowMinutes);
        const isToday = d === today;
        return (
          <li key={d}>
            <button
              type="button"
              onClick={() => onSelect(d)}
              aria-label={describeDay(d, s)}
              aria-current={isToday ? 'date' : undefined}
              className={`taro-inset flex w-full min-w-0 flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-xs leading-tight text-slate-700 transition-colors hover:bg-white dark:text-slate-50 dark:hover:bg-white/10 ${
                isToday ? 'ring-2 ring-emerald-500 dark:ring-emerald-300' : ''
              }`}
            >
              <span className="font-semibold">{weekdayShort(d)}</span>
              <span className={`flex h-7 min-w-7 items-center justify-center rounded-full text-base font-bold ${isToday ? 'btn-taro' : ''}`}>
                {Number(formatDate(d, { day: 'numeric' }))}
              </span>
              <span className="flex h-3.5 items-center gap-1">
                <TypeMark type={s.dayType} className="h-3 w-3" />
                {s.noExtra && <NoExtraMark className="h-2.5 w-2.5" />}
              </span>
              <MealIcons meals={s.meals} />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
