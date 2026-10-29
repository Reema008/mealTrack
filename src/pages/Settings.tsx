import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useToast } from '../components/Toast';
import { Button, Card } from '../components/ui';
import { formatShort, isISODate, isValidTimeZone, todayInTimeZone } from '../domain/dates';
import { PERIOD_DAYS, periodProgress } from '../domain/subscription';
import { fetchReminderPreference, setReminderPreference, updateHousehold } from '../data/api';
import { membershipKey, useHousehold } from '../data/household';
import { currentSubscription, enablePushOnThisDevice, pushSupport, sendTestNotification } from '../lib/push';

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney'];

function SubscriptionSection() {
  const { household, userId } = useHousehold();
  const qc = useQueryClient();
  const toast = useToast();
  const [date, setDate] = useState(household.subscription_start ?? todayInTimeZone(household.timezone));
  const today = todayInTimeZone(household.timezone);
  const progress = household.subscription_start ? periodProgress(household.subscription_start, today) : null;

  const save = useMutation({
    mutationFn: async () => {
      if (!isISODate(date)) throw new Error('Choose the renewal date.');
      await updateHousehold(household.id, { subscription_start: date });
    },
    onSuccess: () => {
      toast('Renewal date saved.');
      void qc.invalidateQueries({ queryKey: membershipKey(userId) });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <Card>
      <h2 className="mb-1 text-xl">Subscription</h2>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
        Each subscription period runs {PERIOD_DAYS / 7} weeks from the renewal date. The next period starts automatically.
      </p>
      {progress && (
        <p className="mb-3 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          Current period: <strong>{formatShort(progress.period.start)} – {formatShort(progress.period.end)}</strong> · day {progress.day} of {PERIOD_DAYS} ·
          renews <strong>{formatShort(progress.period.renewsOn)}</strong>
        </p>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="renewal" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Renewal date
          </label>
          <input
            id="renewal"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="block min-h-11 w-full rounded-2xl border-0 bg-white px-3 ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:ring-slate-600"
          />
        </div>
        <Button type="submit" disabled={save.isPending || date === household.subscription_start}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </Card>
  );
}

function TimezoneSection() {
  const { household, userId } = useHousehold();
  const qc = useQueryClient();
  const toast = useToast();
  const [tz, setTz] = useState(household.timezone);

  const save = useMutation({
    mutationFn: async () => {
      if (!isValidTimeZone(tz)) throw new Error('Unknown timezone');
      await updateHousehold(household.id, { timezone: tz });
    },
    onSuccess: () => {
      toast('Timezone saved.');
      void qc.invalidateQueries({ queryKey: membershipKey(userId) });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <Card>
      <h2 className="mb-1 text-xl">Timezone</h2>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">Decides what “today” is, the 2 PM / 10 PM meal times, and the 10 PM reminder.</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <select
          aria-label="Timezone"
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          className="block min-h-11 min-w-0 flex-1 rounded-2xl border-0 bg-white px-3 ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:ring-slate-600"
        >
          {[...new Set([household.timezone, ...TIMEZONES])].map((z) => (
            <option key={z} value={z}>{z}</option>
          ))}
        </select>
        <Button type="submit" disabled={save.isPending || tz === household.timezone}>{save.isPending ? 'Saving…' : 'Save'}</Button>
      </form>
    </Card>
  );
}

function RemindersSection() {
  const { userId, household } = useHousehold();
  const toast = useToast();
  const qc = useQueryClient();
  const support = pushSupport();
  const pref = useQuery({ queryKey: ['reminder-pref', userId], queryFn: () => fetchReminderPreference(userId) });
  const [deviceSubscribed, setDeviceSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void currentSubscription().then((s) => setDeviceSubscribed(Boolean(s)));
  }, []);

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
      setDeviceSubscribed(Boolean(await currentSubscription()));
      void qc.invalidateQueries({ queryKey: ['reminder-pref', userId] });
    }
  }

  const enabled = pref.data ?? false;

  return (
    <Card>
      <h2 className="mb-1 text-xl">Daily 10 PM reminder</h2>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
        Monday–Saturday at 10:00 PM ({household.timezone}), a push notification asks you to check today’s meals. Reminders never mark meals as confirmed.
      </p>
      {support === 'not-configured' && <p className="text-sm text-amber-800 dark:text-amber-300">Push notifications are not configured for this app build (missing VAPID public key).</p>}
      {support === 'needs-install' && (
        <p className="text-sm text-amber-800 dark:text-amber-300">On iPhone, first add MealTrack to your Home Screen (Share → Add to Home Screen), then open it from there to enable reminders. Requires iOS 16.4 or later.</p>
      )}
      {support === 'unsupported' && <p className="text-sm text-amber-800 dark:text-amber-300">This browser does not support push notifications.</p>}

      {support === 'supported' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">
              Reminders on this phone: <strong>{pref.isLoading ? '…' : enabled && deviceSubscribed ? 'On' : 'Off'}</strong>
            </span>
            {enabled && deviceSubscribed ? (
              <Button variant="secondary" disabled={busy} onClick={() => run(() => setReminderPreference(userId, household.id, false), 'Reminders turned off.')}>Turn off</Button>
            ) : (
              <Button disabled={busy} onClick={() => run(enablePushOnThisDevice, 'Reminders turned on for this phone.')}>Turn on</Button>
            )}
          </div>
          <Button variant="secondary" disabled={busy || !deviceSubscribed} onClick={() => run(async () => {
            const r = await sendTestNotification();
            if (r.sent === 0) throw new Error(`Test notification failed on ${r.failed} device(s). See the log below.`);
          }, 'Test notification sent. It should appear within a few seconds.')}>
            Send test notification
          </Button>
        </div>
      )}
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl">Settings</h1>
      <SubscriptionSection />
      <TimezoneSection />
      <RemindersSection />
    </div>
  );
}
