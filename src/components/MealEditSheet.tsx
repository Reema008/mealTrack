import { useEffect, useRef, useState } from 'react';
import { formatLong } from '../domain/dates';
import { defaultValues, normalizeValues, overrideValues, valuesEqual } from '../domain/meals';
import { PERIOD_LABEL } from '../domain/schedule';
import type { EffectiveMeal, MealValues } from '../domain/types';
import type { SaveOutcome } from '../data/api';
import { useSaveMeal } from '../data/meals';
import { useToast } from './Toast';
import { Button, Segmented } from './ui';

function describe(v: MealValues, nonveg: boolean): string {
  const parts = [v.deliveryStatus === 'delivered' ? 'Delivered' : 'Not received'];
  if (nonveg && v.deliveryStatus === 'delivered') {
    parts.push(v.mainDish === 'egg' ? 'Egg' : 'Chicken');
    parts.push(v.extraCurryReceived ? 'extra curries received' : 'extra curries not received');
  }
  return parts.join(' · ');
}

export function MealEditSheet({ meal, pending, onClose }: { meal: EffectiveMeal; pending: boolean; onClose: () => void }) {
  const save = useSaveMeal();
  const toast = useToast();
  // Snapshot what the user started editing. If someone else saves meanwhile,
  // the server detects the stale version and we show a conflict instead of
  // silently overwriting their change.
  const [initial] = useState<MealValues>(() => ({
    deliveryStatus: meal.deliveryStatus,
    mainDish: meal.mainDish,
    extraCurryReceived: meal.extraCurryReceived,
  }));
  // A pending (unsynced) edit has no real server version; the outbox keeps
  // the version its first queued edit was based on.
  const [expectedVersion] = useState<number | null>(() => (pending ? null : meal.override?.version ?? null));
  const [values, setValues] = useState<MealValues>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<SaveOutcome | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const nonveg = meal.dayType === 'nonveg';
  const future = meal.timing === 'future';
  const defaults = defaultValues(meal.dayType);
  const changed = !valuesEqual(normalizeValues(meal.dayType, values), normalizeValues(meal.dayType, initial));
  const isDefaultState = valuesEqual(normalizeValues(meal.dayType, values), defaults);

  // Focus management: focus the dialog, trap Tab, close on Escape, restore focus.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('button, [href], input')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
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
  }, [busy, onClose]);

  async function submit(next: MealValues, expectedVersion: number | null) {
    setBusy(true);
    setError(null);
    try {
      const r = await save({ date: meal.date, period: meal.period, values: normalizeValues(meal.dayType, next), expectedVersion });
      if (r.kind === 'conflict') {
        setConflict(r.outcome);
        return;
      }
      if (r.kind === 'queued') toast('Saved on this device. It will sync when you are back online.', 'info');
      else if (r.kind === 'deleted') toast('Restored to the standard schedule.');
      else toast(`${PERIOD_LABEL[meal.period]} saved for everyone in your household.`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const theirs = conflict ? (conflict.row ? normalizeValues(meal.dayType, overrideValues(conflict.row)) : defaults) : null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="presentation">
      <div className="absolute inset-0 bg-slate-900/50" onClick={() => !busy && onClose()} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
        className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl dark:bg-slate-900 sm:rounded-3xl"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" aria-hidden />
        <h2 id="edit-title" className="text-lg font-semibold">
          Edit {PERIOD_LABEL[meal.period].toLowerCase()}
        </h2>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          {formatLong(meal.date)} · {nonveg ? 'Non-Veg' : 'Veg'}
          {future && ' · planned (future date)'}
        </p>

        {conflict && theirs ? (
          <div role="alert" className="space-y-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-700">
            <p className="font-semibold">Someone else changed this meal while you were editing.</p>
            <p>
              <span className="font-medium">Now saved:</span> {describe(theirs, nonveg)}
              {!conflict.row && ' (standard default)'}
            </p>
            <p>
              <span className="font-medium">Your change:</span> {describe(normalizeValues(meal.dayType, values), nonveg)}
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="secondary" onClick={onClose} disabled={busy}>
                Keep theirs
              </Button>
              <Button onClick={() => submit(values, conflict.row?.version ?? null)} disabled={busy}>
                {busy ? 'Saving…' : 'Use mine'}
              </Button>
            </div>
          </div>
        ) : (
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

            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-200">
                Could not save: {error}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={() => submit(values, expectedVersion)} disabled={busy || !changed}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </div>
            {(meal.source === 'explicit' || pending) && (
              <Button
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={() => (isDefaultState && !changed ? onClose() : submit(defaults, expectedVersion))}
              >
                Restore standard defaults
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
