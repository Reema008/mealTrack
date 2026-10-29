import { useState } from 'react';
import { formatShort } from '../domain/dates';
import { defaultValues, mealsForDate, overrideKey } from '../domain/meals';
import type { EffectiveMeal, ISODate, MealPeriod, MealValues, OverrideMap } from '../domain/types';
import { useHousehold } from '../data/household';
import { useSaveMeal } from '../data/meals';
import { MealCard } from './MealCard';
import { MealEditSheet } from './MealEditSheet';
import { useSync } from './AppShell';
import { useConfirm } from './Confirm';
import { useToast } from './Toast';
import { Button } from './ui';

const NOT_DELIVERED: MealValues = { deliveryStatus: 'not_received', mainDish: null, extraCurryReceived: null };

/** Lunch and dinner cards for one date, with per-meal editing and a whole-day action. */
export function DayMeals({
  date,
  map,
  pendingKeys,
  today,
}: {
  date: ISODate;
  map: OverrideMap;
  pendingKeys: ReadonlySet<string>;
  today: ISODate;
}) {
  const [editing, setEditing] = useState<MealPeriod | null>(null);
  const save = useSaveMeal();
  const toast = useToast();
  const confirm = useConfirm();
  const sync = useSync();
  const { nowMinutes } = useHousehold();
  const meals = mealsForDate(date, map, today, nowMinutes);

  if (meals.length === 0) {
    return (
      <div className="taro-card rounded-[1.6rem] p-8 text-center">
        <p className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-3xl shadow-soft dark:bg-slate-900" aria-hidden>
          ☁️
        </p>
        <p className="mt-3 font-display text-2xl">No Delivery Scheduled</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Sunday is a day off. Enjoy your meal at home!</p>
      </div>
    );
  }

  const editingMeal: EffectiveMeal | undefined = meals.find((m) => m.period === editing);
  const wholeDayMissing = meals.every((m) => m.deliveryStatus === 'not_received');
  const future = date > today;

  /** Apply one status to both meals (not delivered, or back to the standard defaults). */
  async function markWholeDay(toNotDelivered: boolean) {
    const ok = await confirm(
      toNotDelivered
        ? {
            emoji: '🚫',
            tone: 'danger',
            title: future ? 'Skip this whole day?' : 'No delivery this day?',
            message: (
              <>
                Both <strong>lunch</strong> and <strong>dinner</strong> on <strong>{formatShort(date)}</strong> will be marked{' '}
                {future ? 'as not expected' : 'as not delivered'}. Everyone in the family will see this.
              </>
            ),
            confirmLabel: future ? 'Skip day' : 'Mark not delivered',
          }
        : {
            emoji: '💜',
            title: 'Mark the whole day delivered?',
            message: (
              <>
                Lunch and dinner on <strong>{formatShort(date)}</strong> go back to the standard schedule: delivered
                {meals.some((m) => m.dayType === 'nonveg') ? ', chicken and extra curries' : ''}.
              </>
            ),
            confirmLabel: 'Mark delivered',
          },
    );
    if (!ok) return;
    // Both cards change on screen at once; the two saves run together in the background.
    const results = await Promise.allSettled(
      meals.map((m) => {
        const values = toNotDelivered ? NOT_DELIVERED : defaultValues(m.dayType);
        const pending = pendingKeys.has(overrideKey(m.date, m.period));
        return save({ date: m.date, period: m.period, values, expectedVersion: pending ? null : m.override?.version ?? null }).then((r) => {
          if (r.kind === 'conflict') sync.reportConflict({ date: m.date, period: m.period, mine: values, outcome: r.outcome });
          return r;
        });
      }),
    );
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) toast(`Could not save the whole day: ${(failed.reason as Error).message}`, 'error');
    else if (results.some((r) => r.status === 'fulfilled' && r.value.kind === 'queued')) {
      toast('Saved on this phone. It will sync when you are back online.', 'info');
    }
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {meals.map((m) => (
          <MealCard key={m.period} meal={m} pending={pendingKeys.has(overrideKey(m.date, m.period))} onEdit={() => setEditing(m.period)} />
        ))}
      </div>
      <Button
        variant={wholeDayMissing ? 'secondary' : 'danger'}
        className="mt-3 w-full"
        onClick={() => void markWholeDay(!wholeDayMissing)}
      >
        {wholeDayMissing ? 'Mark whole day as delivered' : future ? 'No delivery this day (skip both meals)' : 'No delivery this whole day'}
      </Button>
      {editingMeal && (
        <MealEditSheet
          key={`${editingMeal.date}-${editingMeal.period}`}
          meal={editingMeal}
          pending={pendingKeys.has(overrideKey(editingMeal.date, editingMeal.period))}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
