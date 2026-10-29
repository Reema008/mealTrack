import { useState } from 'react';
import { formatLong } from '../domain/dates';
import { defaultValues, mealsForDate, overrideKey } from '../domain/meals';
import type { EffectiveMeal, ISODate, MealPeriod, MealValues, OverrideMap } from '../domain/types';
import { useSaveMeal } from '../data/meals';
import { MealCard } from './MealCard';
import { MealEditSheet } from './MealEditSheet';
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
  const [busy, setBusy] = useState(false);
  const save = useSaveMeal();
  const toast = useToast();
  const meals = mealsForDate(date, map, today);

  if (meals.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <p className="text-3xl" aria-hidden>
          🌤️
        </p>
        <p className="mt-2 font-semibold">No Delivery Scheduled</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Sunday is a day off. Enjoy your meal at home!</p>
      </div>
    );
  }

  const editingMeal: EffectiveMeal | undefined = meals.find((m) => m.period === editing);
  const wholeDayMissing = meals.every((m) => m.deliveryStatus === 'not_received');
  const future = date > today;

  /** Apply one status to both meals (not delivered, or back to the standard defaults). */
  async function markWholeDay(toNotDelivered: boolean) {
    const question = toNotDelivered
      ? `Mark both lunch and dinner on ${formatLong(date)} as ${future ? 'no delivery' : 'not delivered'}?`
      : `Mark both meals on ${formatLong(date)} as delivered (standard schedule)?`;
    if (!confirm(question)) return;
    setBusy(true);
    let queued = 0;
    const conflicts: string[] = [];
    const errors: string[] = [];
    for (const m of meals) {
      const pending = pendingKeys.has(overrideKey(m.date, m.period));
      try {
        const r = await save({
          date: m.date,
          period: m.period,
          values: toNotDelivered ? NOT_DELIVERED : defaultValues(m.dayType),
          expectedVersion: pending ? null : m.override?.version ?? null,
        });
        if (r.kind === 'queued') queued++;
        if (r.kind === 'conflict') conflicts.push(m.period);
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    setBusy(false);
    if (errors.length) toast(`Could not save the whole day: ${errors[0]}`, 'error');
    else if (conflicts.length) toast(`Someone else just changed ${conflicts.join(' and ')}. Please check and try again.`, 'error');
    else if (queued) toast('Saved on this device. It will sync when you are back online.', 'info');
    else toast(toNotDelivered ? 'Whole day marked as not delivered.' : 'Whole day restored to delivered.');
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
        disabled={busy}
        onClick={() => void markWholeDay(!wholeDayMissing)}
      >
        {busy
          ? 'Saving…'
          : wholeDayMissing
            ? 'Mark whole day as delivered'
            : future
              ? 'No delivery this day (skip both meals)'
              : 'No delivery this whole day'}
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
