import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BillSheet, PaymentDifference, periodTitle } from '../components/BillSheet';
import { useConfirm } from '../components/Confirm';
import { SubscriptionCard } from '../components/SubscriptionCard';
import { useToast } from '../components/Toast';
import { Button, Card, ErrorNote, Spinner } from '../components/ui';
import { billingPeriodFor, calculatedPayment, computeBill, shiftPeriod, type BillingPeriod, type BillingSettings } from '../domain/billing';
import { formatShort, isISODate } from '../domain/dates';
import { firstSubscriptionStart, formatAmount, paymentFor, subscriptionMonths, type SubscriptionRecord } from '../domain/subscription';
import { addSubscription, deleteSubscription, updateBilling, updateSubscription } from '../data/api';
import { membershipKey, useHousehold } from '../data/household';
import { useOverrides } from '../data/meals';
import { subscriptionsKey, useSubscriptions } from '../data/subscriptions';

const inputClass =
  'block min-h-11 w-full rounded-2xl border-0 bg-white px-3 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-emerald-600 disabled:opacity-70 dark:bg-slate-900 dark:text-slate-50 dark:ring-slate-600';

/** Parse a rupee amount typed by the user; '' means "not entered". */
function parseAmount(text: string): number | null | 'invalid' {
  const t = text.replace(/[₹,\s]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n < 100_000_000 ? Math.round(n * 100) / 100 : 'invalid';
}

function useApplyPayments() {
  const { household } = useHousehold();
  const qc = useQueryClient();
  return (update: (list: SubscriptionRecord[]) => SubscriptionRecord[]) => {
    const key = subscriptionsKey(household.id);
    qc.setQueryData<SubscriptionRecord[]>(key, (old) => update(old ?? []).sort((a, b) => (a.start_date < b.start_date ? -1 : 1)));
    void qc.invalidateQueries({ queryKey: key });
  };
}

// ---------------------------------------------------------------------------
// Prices and start day
// ---------------------------------------------------------------------------
const PRICE_FIELDS: Array<{ key: Exclude<keyof BillingSettings, 'billingDay'>; label: string }> = [
  { key: 'monthlyAmount', label: 'Monthly subscription (₹)' },
  { key: 'vegMeal', label: 'Veg meal (₹)' },
  { key: 'nonvegMeal', label: 'Non-veg meal (₹)' },
  { key: 'chickenCurry', label: 'Extra chicken curry (₹)' },
  { key: 'eggCurry', label: 'Extra egg curry (₹)' },
];

function BillingSettingsCard() {
  const { household, billing, isAdmin, userId } = useHousehold();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<keyof BillingSettings, string>>(() => toForm(billing));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toForm(b: BillingSettings) {
    return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, String(v)])) as Record<keyof BillingSettings, string>;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const day = Number(form.billingDay);
    if (!Number.isInteger(day) || day < 1 || day > 28) return setError('The start day must be a whole number from 1 to 28.');
    const next: BillingSettings = { ...billing, billingDay: day };
    for (const f of PRICE_FIELDS) {
      const v = parseAmount(form[f.key]);
      if (v === null || v === 'invalid') return setError(`Enter a valid amount for “${f.label.replace(' (₹)', '')}”.`);
      next[f.key] = v;
    }
    setBusy(true);
    try {
      await updateBilling(household.id, next);
      await qc.invalidateQueries({ queryKey: membershipKey(userId) });
      toast('Prices and start day saved.');
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl">Prices & start day</h2>
        {isAdmin && !editing && (
          <Button
            variant="secondary"
            className="min-h-9 px-4"
            onClick={() => {
              setForm(toForm(billing));
              setEditing(true);
            }}
          >
            Edit
          </Button>
        )}
      </div>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        Each subscription starts on day {billing.billingDay} of the month. A cancelled meal takes its meal price off the next subscription, and each delivered
        extra curry adds its curry price.{!isAdmin && ' Only an admin can change these.'}
      </p>
      {editing ? (
        <form className="space-y-3" onSubmit={save}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
            <div>
              <label htmlFor="billing-day" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                Start day of the month
              </label>
              <input
                id="billing-day"
                inputMode="numeric"
                value={form.billingDay}
                onChange={(e) => setForm({ ...form, billingDay: e.target.value })}
                className={inputClass}
              />
            </div>
            {PRICE_FIELDS.map((f) => (
              <div key={f.key}>
                <label htmlFor={`price-${f.key}`} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  {f.label}
                </label>
                <input
                  id={`price-${f.key}`}
                  inputMode="decimal"
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      ) : (
        <dl className="grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2 text-sm">
          <div className="taro-inset rounded-2xl p-2">
            <dt className="text-xs text-slate-600 dark:text-slate-300">Starts on</dt>
            <dd className="font-semibold">Day {billing.billingDay}</dd>
          </div>
          {PRICE_FIELDS.map((f) => (
            <div key={f.key} className="taro-inset rounded-2xl p-2">
              <dt className="text-xs text-slate-600 dark:text-slate-300">{f.label.replace(' (₹)', '')}</dt>
              <dd className="font-semibold">{formatAmount(billing[f.key])}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
function PaymentForm({
  initialMonth,
  initialAmount,
  initialPaidOn,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialMonth: string;
  initialAmount: number | null;
  /** A date already saved for this payment; otherwise it defaults to the 1st of the month paid for. */
  initialPaidOn: string | null;
  submitLabel: string;
  onSubmit: (start: string, amount: number | null, paidOn: string | null) => Promise<void>;
  onCancel?: () => void;
}) {
  const { billing } = useHousehold();
  // Not before the subscription started (once a first payment is saved).
  const subs = useSubscriptions();
  const firstMonth = firstSubscriptionStart(subs.data ?? [], billing.billingDay);
  const [date, setDate] = useState(initialMonth);
  const [amount, setAmount] = useState(initialAmount === null ? '' : String(initialAmount));
  // Until a date is picked, "Paid on" follows the 1st of the chosen month.
  const [pickedPaidOn, setPickedPaidOn] = useState<string | null>(initialPaidOn);
  const monthStart = isISODate(date) ? billingPeriodFor(date, billing.billingDay).start : '';
  const paidOn = pickedPaidOn ?? monthStart;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = submitLabel.replace(/\W/g, '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isISODate(date)) return setError('Choose a date in the month you paid for.');
    if (firstMonth && date < firstMonth) return setError(`The subscription started on ${formatShort(firstMonth)}; choose that month or later.`);
    const value = parseAmount(amount);
    if (value === 'invalid') return setError('Enter the amount as a number, e.g. 6600.');
    if (paidOn && !isISODate(paidOn)) return setError('Choose the date you paid, or leave it empty.');
    setBusy(true);
    try {
      await onSubmit(billingPeriodFor(date, billing.billingDay).start, value, paidOn || null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
        <div>
          <label htmlFor={`month-${id}`} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Subscription paid for
          </label>
          <input id={`month-${id}`} type="date" min={firstMonth ?? undefined} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} required />
          {isISODate(date) && (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{periodTitle(billingPeriodFor(date, billing.billingDay), billing.billingDay)}</p>
          )}
        </div>
        <div>
          <label htmlFor={`amount-${id}`} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Amount paid (₹)
          </label>
          <input id={`amount-${id}`} inputMode="decimal" placeholder="e.g. 6600" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor={`paid-${id}`} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Paid on
          </label>
          <input id={`paid-${id}`} type="date" value={paidOn} onChange={(e) => setPickedPaidOn(e.target.value)} className={inputClass} />
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{paidOn ? formatShort(paidOn) : 'Not recorded'}</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function MonthRow({
  period,
  payment,
  firstStart,
  onDetails,
}: {
  period: BillingPeriod;
  payment: SubscriptionRecord | null;
  firstStart: string | null;
  onDetails: () => void;
}) {
  const { household, billing, today, nowMinutes } = useHousehold();
  const toast = useToast();
  const confirm = useConfirm();
  const apply = useApplyPayments();
  const [editing, setEditing] = useState(false);
  const previous = shiftPeriod(period, -1, billing.billingDay);
  const { map } = useOverrides(previous.start, period.end);
  const bill = computeBill(period.start, period.end, map, today, nowMinutes, billing);
  const calculated = calculatedPayment(period, firstStart, map, today, nowMinutes, billing);
  const title = periodTitle(period, billing.billingDay);
  const current = period.start <= today && today <= period.end;

  return (
    <li className="taro-card rounded-[1.6rem] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-lg leading-tight">{title}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {formatShort(period.start)} – {formatShort(period.end)}
            {current && ' · this month'}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-xl leading-none">{payment ? formatAmount(payment.amount) : '—'}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {!payment ? 'no payment saved' : payment.paid_on ? `paid on ${formatShort(payment.paid_on)}` : 'paid'}
          </p>
        </div>
      </div>
      <p className="mt-2 text-sm">
        {bill.missedMeals.length} cancelled meal{bill.missedMeals.length === 1 ? '' : 's'} <strong>− {formatAmount(bill.mealDeductions)}</strong> ·{' '}
        {bill.addedCurries.length} extra curr{bill.addedCurries.length === 1 ? 'y' : 'ies'} <strong>+ {formatAmount(bill.curryCharges)}</strong>
        {current && ' so far'}
      </p>
      {payment && (
        <div className="mt-2">
          <PaymentDifference calculated={calculated} paid={payment.amount} />
        </div>
      )}

      {editing ? (
        <div className="mt-3 border-t border-slate-900/10 pt-3 dark:border-white/10">
          <PaymentForm
            initialMonth={period.start}
            initialAmount={payment?.amount ?? null}
            initialPaidOn={payment?.paid_on ?? null}
            submitLabel="Save payment"
            onCancel={() => setEditing(false)}
            onSubmit={async (start, amount, paidOn) => {
              const saved = payment
                ? await updateSubscription(payment.id, start, amount, paidOn)
                : await addSubscription(household.id, start, amount, paidOn);
              apply((list) => [...list.filter((r) => r.id !== saved.id), saved]);
              setEditing(false);
              toast('Payment saved.');
            }}
          />
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1">
          <Button variant="ghost" className="min-h-9 px-3 text-xs" onClick={onDetails}>
            Details & next amount
          </Button>
          <Link
            to={`/reports?period=${period.start}`}
            className="inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-white/10"
          >
            Report →
          </Link>
          <Button variant="ghost" className="min-h-9 px-3 text-xs" onClick={() => setEditing(true)}>
            {payment ? 'Edit payment' : 'Add payment'}
          </Button>
          {payment && (
            <Button
              variant="ghost"
              className="min-h-9 px-3 text-xs !text-rose-700 dark:!text-rose-300"
              onClick={async () => {
                const ok = await confirm({
                  emoji: '🗑️',
                  tone: 'danger',
                  title: 'Delete this payment?',
                  message: `The ${title} payment (${formatAmount(payment.amount)}) will be removed. Meal records are not affected.`,
                  confirmLabel: 'Delete',
                });
                if (!ok) return;
                try {
                  await deleteSubscription(payment.id);
                  apply((list) => list.filter((r) => r.id !== payment.id));
                  toast('Payment deleted.');
                } catch (e) {
                  toast((e as Error).message, 'error');
                }
              }}
            >
              Delete
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export function SubscriptionsPage() {
  const { household, billing, today } = useHousehold();
  const toast = useToast();
  const apply = useApplyPayments();
  const subs = useSubscriptions();
  const records = subs.data ?? [];
  const [sheet, setSheet] = useState<BillingPeriod | null>(null);

  const current = billingPeriodFor(today, billing.billingDay);
  // From the first month with a recorded payment (when the subscription started) to now.
  const months = subscriptionMonths(records, today, billing.billingDay);
  const totalPaid = records.reduce((sum, r) => sum + (r.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl">Subscriptions</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Each subscription runs for a month from day {billing.billingDay}. The next one is the monthly amount, minus cancelled meals, plus delivered extra curries.
        </p>
      </div>

      <SubscriptionCard />
      <BillingSettingsCard />

      <Card>
        <h2 className="mb-1 text-xl">Record a payment</h2>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">Or use “Calculate” above and save the calculated amount in one tap.</p>
        <PaymentForm
          key={records.length}
          // Paid in advance: next month's subscription.
          initialMonth={shiftPeriod(current, 1, billing.billingDay).start}
          initialAmount={billing.monthlyAmount}
          initialPaidOn={null}
          submitLabel="Save payment"
          onSubmit={async (start, amount, paidOn) => {
            const existing = paymentFor(records, billingPeriodFor(start, billing.billingDay), billing.billingDay);
            const saved = existing
              ? await updateSubscription(existing.id, start, amount, paidOn)
              : await addSubscription(household.id, start, amount, paidOn);
            apply((list) => [...list.filter((r) => r.id !== saved.id), saved]);
            toast(existing ? 'Payment updated.' : 'Payment saved.');
          }}
        />
      </Card>

      {subs.error ? (
        <ErrorNote error={subs.error} onRetry={() => void subs.refetch()} />
      ) : subs.isLoading ? (
        <Spinner label="Loading subscriptions" />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-2 pt-2">
            <h2 className="text-xl">Month by month</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">Total paid: {formatAmount(totalPaid)}</p>
          </div>
          <ol className="space-y-3">
            {months.map((p) => (
              <MonthRow
                key={p.start}
                period={p}
                payment={paymentFor(records, p, billing.billingDay)}
                firstStart={firstSubscriptionStart(records, billing.billingDay)}
                onDetails={() => setSheet(p)}
              />
            ))}
          </ol>
        </>
      )}
      {sheet && <BillSheet initial={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}
