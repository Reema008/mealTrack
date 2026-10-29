import { formatLong } from '../domain/dates';
import { MEAL_CUTOFF_MINUTES } from '../domain/meals';
import { PERIOD_LABEL } from '../domain/schedule';
import type { EffectiveMeal, MealPeriod } from '../domain/types';
import { Button, StatusBadge, type BadgeKind } from './ui';

/** Tag for a meal: none when it simply follows the schedule. */
export function badgeFor(meal: EffectiveMeal, unsynced: boolean): BadgeKind | null {
  if (unsynced) return 'unsynced';
  if (meal.source === 'explicit') return 'saved';
  if (meal.timing === 'pending') return 'awaiting';
  if (meal.timing === 'future') return 'planned';
  return null;
}

/** "2 PM" / "10 PM": when today's meal becomes assumed delivered. */
export function cutoffLabel(period: MealPeriod): string {
  const h = MEAL_CUTOFF_MINUTES[period] / 60;
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Whether to show dish/curry as expected (not yet received). */
const isUpcoming = (meal: EffectiveMeal) => meal.timing === 'future' || meal.timing === 'pending';

export function deliveryLabel(meal: EffectiveMeal): string {
  if (meal.timing === 'pending') return 'Pending';
  if (meal.timing === 'future') return meal.deliveryStatus === 'delivered' ? 'Scheduled' : 'Not expected';
  return meal.deliveryStatus === 'delivered' ? 'Delivered' : 'Not Received';
}

const PERIOD_STYLE: Record<MealPeriod, { emoji: string; tint: string }> = {
  lunch: { emoji: '☀️', tint: 'bg-amber-50/90 dark:bg-amber-950/25' },
  dinner: { emoji: '🌙', tint: 'bg-sky-50/90 dark:bg-sky-950/25' },
};

function Row({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2">
      <dt className="text-sm text-slate-600 dark:text-slate-400">{label}</dt>
      <dd className={`ml-auto text-right text-sm font-semibold ${bad ? 'text-rose-700 dark:text-rose-300' : 'text-slate-900 dark:text-slate-100'}`}>{value}</dd>
    </div>
  );
}

export function MealCard({ meal, pending, onEdit }: { meal: EffectiveMeal; pending: boolean; onEdit: () => void }) {
  const upcoming = isUpcoming(meal);
  const notReceived = meal.deliveryStatus === 'not_received';
  const style = PERIOD_STYLE[meal.period];
  return (
    <article
      className={`rounded-3xl p-5 shadow-soft ring-1 ${style.tint} ${
        notReceived ? 'ring-rose-300 dark:ring-rose-800' : 'ring-white/60 dark:ring-white/[0.06]'
      }`}
      aria-label={`${PERIOD_LABEL[meal.period]}, ${formatLong(meal.date)}`}
    >
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-xl">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-lg shadow-sm dark:bg-white/10" aria-hidden>
            {style.emoji}
          </span>
          {PERIOD_LABEL[meal.period]}
        </h3>
        <StatusBadge kind={badgeFor(meal, pending)} />
      </header>
      <dl className="divide-y divide-slate-900/5 dark:divide-white/10">
        <Row label="Delivery" value={deliveryLabel(meal)} bad={notReceived} />
        {meal.dayType === 'nonveg' && !notReceived && (
          <>
            <Row label="Main dish" value={meal.mainDish === 'egg' ? 'Egg 🍳' : 'Chicken 🍗'} />
            <Row
              label="Extra curries"
              value={meal.extraCurryReceived ? (upcoming ? 'Expected' : 'Received') : upcoming ? 'Not expected' : 'Not Received'}
              bad={!meal.extraCurryReceived}
            />
          </>
        )}
      </dl>
      {meal.timing === 'pending' && (
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          Assumed delivered from {cutoffLabel(meal.period)} unless someone marks it.
        </p>
      )}
      <Button
        variant="secondary"
        className="mt-3 w-full"
        onClick={onEdit}
        aria-label={`Edit ${PERIOD_LABEL[meal.period].toLowerCase()} for ${formatLong(meal.date)}`}
      >
        Edit {PERIOD_LABEL[meal.period].toLowerCase()}
      </Button>
    </article>
  );
}
