import { formatLong } from '../domain/dates';
import { PERIOD_LABEL } from '../domain/schedule';
import type { EffectiveMeal } from '../domain/types';
import { Button, StatusBadge, type BadgeKind } from './ui';

export function badgeFor(meal: EffectiveMeal, pending: boolean): BadgeKind {
  if (pending) return 'pending';
  if (meal.timing === 'future') return 'planned';
  return meal.source === 'explicit' ? 'saved' : 'assumed';
}

function Row({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-sm text-slate-600 dark:text-slate-400">{label}</dt>
      <dd className={`text-sm font-semibold ${bad ? 'text-rose-700 dark:text-rose-300' : 'text-slate-900 dark:text-slate-100'}`}>{value}</dd>
    </div>
  );
}

export function deliveryLabel(meal: EffectiveMeal): string {
  if (meal.timing === 'future') return meal.deliveryStatus === 'delivered' ? 'Scheduled' : 'Not expected';
  return meal.deliveryStatus === 'delivered' ? 'Delivered' : 'Not Received';
}

export function MealCard({ meal, pending, onEdit }: { meal: EffectiveMeal; pending: boolean; onEdit: () => void }) {
  const future = meal.timing === 'future';
  const notReceived = meal.deliveryStatus === 'not_received';
  return (
    <article
      className={`rounded-2xl bg-white p-4 shadow-sm ring-1 dark:bg-slate-900 ${
        notReceived ? 'ring-rose-300 dark:ring-rose-800' : 'ring-slate-200 dark:ring-slate-800'
      }`}
      aria-label={`${PERIOD_LABEL[meal.period]}, ${formatLong(meal.date)}`}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{PERIOD_LABEL[meal.period]}</h3>
        <StatusBadge kind={badgeFor(meal, pending)} />
      </header>
      <dl className="divide-y divide-slate-100 dark:divide-slate-800">
        <Row label="Delivery" value={deliveryLabel(meal)} bad={notReceived} />
        {meal.dayType === 'nonveg' && !notReceived && (
          <>
            <Row label="Main dish" value={meal.mainDish === 'egg' ? 'Egg' : 'Chicken'} />
            <Row
              label="Extra curries"
              value={meal.extraCurryReceived ? (future ? 'Expected' : 'Received') : future ? 'Not expected' : 'Not Received'}
              bad={!meal.extraCurryReceived}
            />
          </>
        )}
      </dl>
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
