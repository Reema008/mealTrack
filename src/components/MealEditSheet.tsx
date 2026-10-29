import { useEffect, useRef, useState } from 'react';
import { formatLong } from '../domain/dates';
import { defaultValues, normalizeValues, valuesEqual } from '../domain/meals';
import { PERIOD_LABEL } from '../domain/schedule';
import type { EffectiveMeal, MealValues } from '../domain/types';
import { useSaveMeal } from '../data/meals';
import { useSync } from './AppShell';
import { cutoffLabel } from './MealCard';
import { useToast } from './Toast';
import { Button, Segmented } from './ui';

export function MealEditSheet({ meal, pending, onClose }: { meal: EffectiveMeal; pending: boolean; onClose: () => void }) {
  const save = useSaveMeal();
  const toast = useToast();
  const sync = useSync();
  // Snapshot what the user started editing. If someone else saves meanwhile,
  // the server detects the stale version and we show a conflict instead of
  // silently overwriting their change.
  const [initial] = useState<MealValues>(() => ({
    deliveryStatus: meal.deliveryStatus,
    mainDish: meal.mainDish,
    extraCurryReceived: meal.extraCurryReceived,
  }));
  // An unsynced edit has no real server version; the outbox keeps the
  // version its first queued edit was based on.
  const [expectedVersion] = useState<number | null>(() => (pending ? null : meal.override?.version ?? null));
  const [values, setValues] = useState<MealValues>(initial);
  const dialogRef = useRef<HTMLDivElement>(null);
  const nonveg = meal.dayType === 'nonveg';
  const future = meal.timing === 'future';
  // Today's meal before its cutoff: saving records it right away, even as "Delivered".
  const awaiting = meal.timing === 'pending';
  const defaults = defaultValues(meal.dayType);
  const changed = !valuesEqual(normalizeValues(meal.dayType, values), normalizeValues(meal.dayType, initial));
  const canRestore = meal.source === 'explicit' || pending;

  // Focus management: focus the dialog, trap Tab, close on Escape, restore focus.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('button, [href], input')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && dialogRef.current) {
        const els = dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input');
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  /** Close at once; the screen already shows the new value while the cloud save finishes. */
  function submit(next: MealValues, keep: boolean) {
    const valuesToSave = normalizeValues(meal.dayType, next);
    onClose();
    void save({ date: meal.date, period: meal.period, values: valuesToSave, expectedVersion, keep })
      .then((r) => {
        if (r.kind === 'conflict') sync.reportConflict({ date: meal.date, period: meal.period, mine: valuesToSave, outcome: r.outcome });
        else if (r.kind === 'queued') toast('Saved on this phone. It will sync when you are back online.', 'info');
      })
      .catch((e: Error) => toast(`Could not save ${PERIOD_LABEL[meal.period].toLowerCase()}: ${e.message}`, 'error'));
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="presentation">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
        className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[2rem] bg-slate-50 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-soft dark:bg-slate-900 sm:rounded-[2rem]"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" aria-hidden />
        <h2 id="edit-title" className="text-2xl">
          Edit {PERIOD_LABEL[meal.period].toLowerCase()}
        </h2>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          {formatLong(meal.date)} · {nonveg ? 'Non-Veg' : 'Veg'}
          {future && ' · planned (future date)'}
        </p>
        {awaiting && (
          <p className="mb-4 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800">
            Mark it now, or leave it: if nothing is saved by {cutoffLabel(meal.period)}, it is assumed delivered.
          </p>
        )}

        <div className="space-y-5">
          <Segmented
            label="Meal delivery"
            value={values.deliveryStatus}
            onChange={(v) => setValues({ ...values, deliveryStatus: v })}
            options={[
              { value: 'delivered', label: 'Delivered' },
              { value: 'not_received', label: 'Not received', tone: 'bad' },
            ]}
          />
          {nonveg && values.deliveryStatus === 'delivered' && (
            <>
              <Segmented
                label="Main dish"
                value={values.mainDish ?? 'chicken'}
                onChange={(v) => setValues({ ...values, mainDish: v })}
                options={[
                  { value: 'chicken', label: 'Chicken' },
                  { value: 'egg', label: 'Egg' },
                ]}
              />
              <Segmented
                label="Extra curries"
                value={values.extraCurryReceived ?? true}
                onChange={(v) => setValues({ ...values, extraCurryReceived: v })}
                options={[
                  { value: true, label: 'Received' },
                  { value: false, label: 'Not received', tone: 'bad' },
                ]}
              />
            </>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-4 dark:border-slate-800">
            <div>
              {canRestore && (
                <Button variant="ghost" className="px-3 text-xs" onClick={() => submit(defaults, false)}>
                  Restore defaults
                </Button>
              )}
            </div>
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => submit(values, awaiting)} disabled={!changed && !awaiting}>
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
