import { addDays, eachDay, endOfMonth, formatDate, formatLong, startOfMonth, startOfWeek, weekdayShort } from '../domain/dates';
import { mealsForDate, overrideKey } from '../domain/meals';
import { getDayType } from '../domain/schedule';
import { useHousehold } from '../data/household';
import type { ISODate, OverrideMap } from '../domain/types';

export interface DaySummary {
  dayType: ReturnType<typeof getDayType>;
  explicit: number;
  notReceived: number;
  pending: number;
}

export function summarizeDay(
  date: ISODate,
  map: OverrideMap,
  pendingKeys: ReadonlySet<string>,
  today: ISODate,
  nowMinutes?: number,
): DaySummary {
  const meals = mealsForDate(date, map, today, nowMinutes);
  return {
    dayType: getDayType(date),
    explicit: meals.filter((m) => m.source === 'explicit').length,
    notReceived: meals.filter((m) => m.deliveryStatus === 'not_received').length,
    pending: meals.filter((m) => pendingKeys.has(overrideKey(m.date, m.period))).length,
  };
}

const TYPE_DOT: Record<string, string> = {
  veg: 'bg-emerald-500',
  nonveg: 'bg-orange-500',
  none: 'bg-slate-300 dark:bg-slate-600',
};

function describeDay(date: ISODate, s: DaySummary, today: ISODate): string {
  const parts = [formatLong(date), s.dayType === 'none' ? 'no delivery' : s.dayType === 'veg' ? 'veg' : 'non-veg'];
  if (date > today && s.dayType !== 'none') parts.push('planned');
  if (s.notReceived) parts.push(`${s.notReceived} not received`);
  if (s.explicit) parts.push(`${s.explicit} saved`);
  if (s.pending) parts.push(`${s.pending} pending sync`);
  return parts.join(', ');
}

export function MonthCalendar({
  month,
  selected,
  today,
  map,
  pendingKeys,
  onSelect,
}: {
  month: ISODate;
  selected: ISODate;
  today: ISODate;
  map: OverrideMap;
  pendingKeys: ReadonlySet<string>;
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
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500 dark:text-slate-400" aria-hidden>
        {headers.map((d) => (
          <div key={d} className="py-1">
            {weekdayShort(d)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Month calendar">
        {days.map((d) => {
          const inMonth = d >= first && d <= last;
          const s = summarizeDay(d, map, pendingKeys, today, nowMinutes);
          const isSel = d === selected;
          const isToday = d === today;
          return (
            <button
              key={d}
              type="button"
              role="gridcell"
              aria-selected={isSel}
              aria-label={describeDay(d, s, today)}
              onClick={() => onSelect(d)}
              className={`relative flex aspect-square min-h-11 flex-col items-center justify-center rounded-xl text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                isSel
                  ? 'bg-emerald-600 font-semibold text-white'
                  : inMonth
                    ? 'bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-white/[0.05] dark:text-slate-100 dark:ring-white/[0.06]'
                    : 'text-slate-400 dark:text-slate-600'
              } ${isToday && !isSel ? 'ring-2 ring-emerald-600 dark:ring-emerald-500' : ''} ${d > today && !isSel && inMonth ? 'bg-slate-50 dark:bg-white/[0.02]' : ''}`}
            >
              <span>{Number(formatDate(d, { day: 'numeric' }))}</span>
              <span className="mt-0.5 flex h-1.5 items-center gap-0.5" aria-hidden>
                <span className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT[s.dayType]}`} />
                {s.notReceived > 0 && <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />}
                {s.explicit > 0 && s.notReceived === 0 && <span className="h-1.5 w-1.5 rounded-full bg-sky-600" />}
              </span>
              {s.pending > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500" aria-hidden />}
            </button>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Veg</li>
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-500" />Non-Veg</li>
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300" />No delivery</li>
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-600" />Not received</li>
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-600" />Changed (saved)</li>
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />Pending sync</li>
      </ul>
    </div>
  );
}

export function WeekStrip({
  start,
  today,
  map,
  pendingKeys,
  onSelect,
}: {
  start: ISODate;
  today: ISODate;
  map: OverrideMap;
  pendingKeys: ReadonlySet<string>;
  onSelect: (d: ISODate) => void;
}) {
  const { nowMinutes } = useHousehold();
  return (
    <ol className="grid grid-cols-7 gap-1.5">
      {eachDay(start, addDays(start, 6)).map((d) => {
        const s = summarizeDay(d, map, pendingKeys, today, nowMinutes);
        const label = s.dayType === 'none' ? 'Off' : s.dayType === 'veg' ? 'Veg' : 'NV';
        return (
          <li key={d}>
            <button
              type="button"
              onClick={() => onSelect(d)}
              aria-label={describeDay(d, s, today)}
              aria-current={d === today ? 'date' : undefined}
              className={`flex w-full min-w-0 flex-col items-center gap-0.5 rounded-xl px-0.5 py-2 text-xs leading-tight ring-1 transition-colors ${
                d === today
                  ? 'bg-emerald-600 text-white ring-emerald-600'
                  : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:bg-white/[0.05] dark:text-slate-200 dark:ring-white/[0.06]'
              }`}
            >
              <span className="font-medium">{weekdayShort(d)}</span>
              <span className="text-base font-semibold">{Number(formatDate(d, { day: 'numeric' }))}</span>
              <span className="flex items-center gap-1">
                {label}
                {s.notReceived > 0 && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />}
                {s.pending > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
