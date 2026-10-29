import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useConfirm } from '../components/Confirm';
import { useToast } from '../components/Toast';
import { Button, Card, ErrorNote, Spinner } from '../components/ui';
import { formatShort, isISODate } from '../domain/dates';
import { computeStats, formatPercent } from '../domain/stats';
import {
  formatAmount,
  subscriptionPeriods,
  subscriptionStatus,
  suggestedRenewalDate,
  type SubscriptionPeriod,
} from '../domain/subscription';
import type { OverrideMap } from '../domain/types';
import { addSubscription, deleteSubscription, updateSubscription } from '../data/api';
import { useHousehold } from '../data/household';
import { useOverrides } from '../data/meals';
import { subscriptionsKey, useSubscriptions } from '../data/subscriptions';

const inputClass =
  'block min-h-11 w-full rounded-2xl border-0 bg-white px-3 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-emerald-600 dark:bg-slate-800 dark:ring-slate-600';

/** Parse a rupee amount typed by the user; '' means "not entered". */
function parseAmount(text: string): number | null | 'invalid' {
  const t = text.replace(/[₹,\s]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n < 100_000_000 ? Math.round(n * 100) / 100 : 'invalid';
}

function SubscriptionForm({
  initialDate,
  initialAmount,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialDate: string;
  initialAmount: number | null;
  submitLabel: string;
  onSubmit: (date: string, amount: number | null) => Promise<void>;
  onCancel?: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [amount, setAmount] = useState(initialAmount === null ? '' : String(initialAmount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isISODate(date)) return setError('Choose the start date.');
    const value = parseAmount(amount);
    if (value === 'invalid') return setError('Enter the amount as a number, e.g. 4200.');
    setBusy(true);
    try {
      await onSubmit(date, value);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`start-${submitLabel}`} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Start date</label>
          <input id={`start-${submitLabel}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} required />
        </div>
        <div>
          <label htmlFor={`amount-${submitLabel}`} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Amount (₹)</label>
          <input
            id={`amount-${submitLabel}`}
            inputMode="decimal"
            placeholder="e.g. 4200"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</Button>
      </div>
    </form>
  );
}

function PeriodCard({
  period,
  label,
  map,
  today,
  nowMinutes,
  onChanged,
}: {
  period: SubscriptionPeriod;
  label: 'Current' | 'Ended' | 'Upcoming';
  map: OverrideMap;
  today: string;
  nowMinutes: number;
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const s = computeStats(period.start, period.end, map, today, nowMinutes);
  const a = s.actual;
  const costPerMeal = period.record.amount !== null && a.delivered > 0 ? period.record.amount / a.delivered : null;
  const chip = {
    Current: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
    Ended: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    Upcoming: 'bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200',
  }[label];

  return (
    <li className="rounded-3xl bg-white/85 p-4 shadow-soft ring-1 ring-slate-200/60 dark:bg-slate-900/80 dark:ring-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-lg leading-tight">
            {formatShort(period.start)} – {formatShort(period.end)}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {period.days} days{period.days < 28 && ' (renewed early)'}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl leading-none">{formatAmount(period.record.amount)}</p>
          <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip}`}>{label}</span>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="rounded-2xl bg-emerald-50/80 p-2 dark:bg-emerald-950/40">
          <dt className="text-xs text-slate-600 dark:text-slate-400">Delivered</dt>
          <dd className="font-semibold">{a.delivered} / {s.scheduledTotal}</dd>
        </div>
        <div className="rounded-2xl bg-rose-50/80 p-2 dark:bg-rose-950/40">
          <dt className="text-xs text-slate-600 dark:text-slate-400">Not received</dt>
          <dd className="font-semibold">{a.notReceived}</dd>
        </div>
        <div className="rounded-2xl bg-sky-50/80 p-2 dark:bg-sky-950/40">
          <dt className="text-xs text-slate-600 dark:text-slate-400">Success</dt>
          <dd className="font-semibold">{formatPercent(a.successRate)}</dd>
        </div>
        <div className="rounded-2xl bg-amber-50/80 p-2 dark:bg-amber-950/40">
          <dt className="text-xs text-slate-600 dark:text-slate-400">Per delivered meal</dt>
          <dd className="font-semibold">{costPerMeal === null ? '—' : formatAmount(Math.round(costPerMeal * 100) / 100)}</dd>
        </div>
      </dl>
      {(s.planned.meals > 0 || s.pending > 0) && (
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          {s.planned.meals + s.pending} meals still to come in this subscription.
        </p>
      )}

      {editing ? (
        <div className="mt-3 border-t border-slate-200/70 pt-3 dark:border-slate-800">
          <SubscriptionForm
            initialDate={period.start}
            initialAmount={period.record.amount}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={async (date, amount) => {
              await updateSubscription(period.record.id, date, amount);
              toast('Subscription updated.');
              setEditing(false);
              onChanged();
            }}
          />
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1">
          <Link to={`/reports?period=${period.start}`} className="inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-slate-800">
            View report →
          </Link>
          <Button variant="ghost" className="min-h-9 px-3 text-xs" onClick={() => setEditing(true)}>Edit</Button>
          <Button
            variant="ghost"
            className="min-h-9 px-3 text-xs text-rose-700"
            onClick={async () => {
              const ok = await confirm({
                emoji: '🗑️',
                tone: 'danger',
                title: 'Delete this subscription?',
                message: `The ${formatShort(period.start)} subscription (${formatAmount(period.record.amount)}) will be removed from the history. Meal records are not affected.`,
                confirmLabel: 'Delete',
              });
              if (!ok) return;
              try {
                await deleteSubscription(period.record.id);
                toast('Subscription deleted.');
                onChanged();
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            }}
          >
            Delete
          </Button>
        </div>
      )}
    </li>
  );
}

export function SubscriptionsPage() {
  const { household, today, nowMinutes } = useHousehold();
  const qc = useQueryClient();
  const toast = useToast();
  const subs = useSubscriptions();
  const records = subs.data ?? [];
  const periods = subscriptionPeriods(records);
  const status = subscriptionStatus(records, today);
  const first = periods[0]?.start ?? today;
  const last = periods[periods.length - 1]?.end ?? today;
  const overrides = useOverrides(first, last);
  const refresh = () => void qc.invalidateQueries({ queryKey: subscriptionsKey(household.id) });

  const totalSpent = records.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const deliveredWithAmount = periods
    .filter((p) => p.record.amount !== null)
    .reduce((n, p) => n + computeStats(p.start, p.end, overrides.map, today, nowMinutes).actual.delivered, 0);
  const lastAmount = [...records].reverse().find((r) => r.amount !== null)?.amount ?? null;

  const labelFor = (p: SubscriptionPeriod): 'Current' | 'Ended' | 'Upcoming' =>
    p.start > today ? 'Upcoming' : p.end < today ? 'Ended' : 'Current';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl">Subscriptions</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Each subscription covers 4 weeks from its start date.</p>
      </div>

      <Card>
        <h2 className="mb-1 text-xl">{status.kind === 'ended' ? 'Renewal due' : 'Record a renewal'}</h2>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
          {status.kind === 'active'
            ? `The current subscription renews on ${formatShort(status.period.renewsOn)}.`
            : status.kind === 'ended'
              ? `The last subscription ended on ${formatShort(status.period.end)}.`
              : 'Enter when the subscription started and how much you paid.'}
        </p>
        {!subs.isLoading && (
          <SubscriptionForm
            key={records.length}
            initialDate={suggestedRenewalDate(records, today)}
            initialAmount={lastAmount}
            submitLabel="Save renewal"
            onSubmit={async (date, amount) => {
              await addSubscription(household.id, date, amount);
              toast('Renewal saved.');
              refresh();
            }}
          />
        )}
      </Card>

      {subs.error ? (
        <ErrorNote error={subs.error} onRetry={() => void subs.refetch()} />
      ) : subs.isLoading || overrides.isLoading ? (
        <Spinner label="Loading subscriptions" />
      ) : periods.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-600 dark:text-slate-400">No subscriptions recorded yet. 🌿</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-3xl bg-amber-100/80 p-3 shadow-soft dark:bg-amber-950/50">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Total paid</p>
              <p className="mt-1 font-display text-xl">{formatAmount(totalSpent)}</p>
            </div>
            <div className="rounded-3xl bg-sky-100/80 p-3 shadow-soft dark:bg-sky-950/50">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Subscriptions</p>
              <p className="mt-1 font-display text-xl">{periods.length}</p>
            </div>
            <div className="rounded-3xl bg-emerald-100/80 p-3 shadow-soft dark:bg-emerald-950/50">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">Avg / meal</p>
              <p className="mt-1 font-display text-xl">
                {deliveredWithAmount > 0 ? formatAmount(Math.round((totalSpent / deliveredWithAmount) * 100) / 100) : '—'}
              </p>
            </div>
          </div>

          <h2 className="pt-2 text-xl">History</h2>
          <ol className="space-y-3">
            {[...periods].reverse().map((p) => (
              <PeriodCard key={p.record.id} period={p} label={labelFor(p)} map={overrides.map} today={today} nowMinutes={nowMinutes} onChanged={refresh} />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
