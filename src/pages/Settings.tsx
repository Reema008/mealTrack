import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useToast } from '../components/Toast';
import { Button, Card, ErrorNote, PasswordField, Spinner, TextField } from '../components/ui';
import { isValidTimeZone } from '../domain/dates';
import {
  approveMember,
  changeFamilyPin,
  fetchMembers,
  fetchRecentNotifications,
  fetchReminderPreference,
  leaveHousehold,
  pinErrorMessage,
  removeMember,
  setMemberRole,
  setReminderPreference,
  updateDisplayName,
  updateHousehold,
} from '../data/api';
import { membershipKey, useHousehold } from '../data/household';
import { signOut } from '../data/session';
import { biometricAvailable, getLockSettings, registerBiometric, saveLockSettings, type LockMode, type LockSettings } from '../lib/applock';
import { currentSubscription, disablePushOnThisDevice, enablePushOnThisDevice, pushSupport, sendTestNotification } from '../lib/push';

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney'];

function ProfileSection() {
  const { household, isAdmin, userId, membership } = useHousehold();
  const qc = useQueryClient();
  const toast = useToast();
  const [tz, setTz] = useState(household.timezone);
  const [displayName, setDisplayName] = useState(membership.display_name);

  const save = useMutation({
    mutationFn: async () => {
      if (!isValidTimeZone(tz)) throw new Error('Unknown timezone');
      if (isAdmin && tz !== household.timezone) await updateHousehold(household.id, { timezone: tz });
      if (displayName.trim() !== membership.display_name) await updateDisplayName(household.id, userId, displayName.trim());
    },
    onSuccess: () => {
      toast('Settings saved.');
      void qc.invalidateQueries({ queryKey: membershipKey(userId) });
      void qc.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <Card>
      <h2 className="mb-3 font-semibold">You</h2>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <TextField id="my-name" label="Your name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} required />
        {isAdmin && (
          <div>
            <label htmlFor="tz" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Timezone (used for “today” and the 10 PM reminder)</label>
            <select
              id="tz"
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              className="block min-h-11 w-full rounded-xl border-0 bg-white px-3 ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:ring-slate-600"
            >
              {[...new Set([household.timezone, ...TIMEZONES])].map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
      </form>
    </Card>
  );
}

function PeopleSection() {
  const { household, userId, isAdmin } = useHousehold();
  const qc = useQueryClient();
  const toast = useToast();
  const members = useQuery({ queryKey: ['members', household.id], queryFn: () => fetchMembers(household.id), refetchInterval: isAdmin ? 15_000 : false });

  const act = useMutation({
    mutationFn: async (a: { kind: 'approve' | 'remove' | 'role'; userId: string; role?: 'admin' | 'member' }) => {
      if (a.kind === 'approve') await approveMember(a.userId);
      else if (a.kind === 'remove') await removeMember(a.userId);
      else await setMemberRole(a.userId, a.role!);
      return a;
    },
    onSuccess: (a) => {
      toast(a.kind === 'approve' ? 'Approved. They can now use MealTrack.' : a.kind === 'remove' ? 'Done.' : 'Role updated.');
      void qc.invalidateQueries({ queryKey: ['members', household.id] });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const pending = (members.data ?? []).filter((m) => m.status === 'pending');
  const approved = (members.data ?? []).filter((m) => m.status === 'approved');

  return (
    <Card>
      <h2 className="mb-1 font-semibold">People</h2>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
        To add someone: they open MealTrack, tap Sign in, and enter their name and the PIN. {isAdmin ? 'You then approve them here.' : 'An admin then approves them.'}
      </p>
      {members.isLoading ? (
        <Spinner />
      ) : members.error ? (
        <ErrorNote error={members.error} onRetry={() => void members.refetch()} />
      ) : (
        <>
          {isAdmin && pending.length > 0 && (
            <div className="mb-4 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200 dark:bg-amber-950 dark:ring-amber-800">
              <h3 className="mb-2 text-sm font-semibold text-amber-900 dark:text-amber-100">Waiting for approval</h3>
              <ul className="space-y-2">
                {pending.map((m) => (
                  <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{m.display_name}</span>
                      <span className="block text-xs text-slate-600 dark:text-slate-400">Signed in {new Date(m.joined_at).toLocaleString()}</span>
                    </span>
                    <span className="flex gap-2">
                      <Button variant="secondary" className="min-h-10 px-3" disabled={act.isPending} onClick={() => act.mutate({ kind: 'remove', userId: m.user_id })}>
                        Decline
                      </Button>
                      <Button className="min-h-10 px-3" disabled={act.isPending} onClick={() => act.mutate({ kind: 'approve', userId: m.user_id })}>
                        Approve
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {approved.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{m.display_name}</span>
                  {m.user_id === userId && <span className="text-slate-500"> (you)</span>}
                  {m.role === 'admin' && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">Admin</span>}
                </span>
                {isAdmin && m.user_id !== userId && (
                  <span className="flex gap-1">
                    <Button
                      variant="ghost"
                      className="min-h-9 px-2 text-xs"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ kind: 'role', userId: m.user_id, role: m.role === 'admin' ? 'member' : 'admin' })}
                    >
                      {m.role === 'admin' ? 'Remove admin' : 'Make admin'}
                    </Button>
                    <Button
                      variant="ghost"
                      className="min-h-9 px-2 text-xs text-rose-700"
                      disabled={act.isPending}
                      onClick={() => confirm(`Remove ${m.display_name} from MealTrack?`) && act.mutate({ kind: 'remove', userId: m.user_id })}
                    >
                      Remove
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

const digits = (v: string) => v.replace(/\D/g, '');
const PIN_PROPS = { inputMode: 'numeric' as const, pattern: '[0-9]*', autoComplete: 'off', maxLength: 10, required: true };

function FamilyPinSection() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[0-9]{6,10}$/.test(next)) return setError('The new PIN must be 6 to 10 digits.');
    if (next !== next2) return setError('The new PINs do not match.');
    setBusy(true);
    try {
      const r = await changeFamilyPin(current, next);
      if (!r.ok) return setError(pinErrorMessage(r));
      setCurrent('');
      setNext('');
      setNext2('');
      toast('PIN changed. Share the new PIN with anyone who still needs to sign in.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 font-semibold">PIN</h2>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">People who are already approved stay signed in after a change.</p>
      <form className="space-y-3" onSubmit={submit}>
        <PasswordField id="pin-current" label="Current PIN" value={current} onChange={(e) => setCurrent(digits(e.target.value))} {...PIN_PROPS} />
        <PasswordField id="pin-new" label="New PIN (6–10 digits)" value={next} onChange={(e) => setNext(digits(e.target.value))} {...PIN_PROPS} />
        <PasswordField id="pin-new2" label="New PIN again" value={next2} onChange={(e) => setNext2(digits(e.target.value))} {...PIN_PROPS} />
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change PIN'}</Button>
      </form>
    </Card>
  );
}

function AppLockSection() {
  const { membership } = useHousehold();
  const toast = useToast();
  const [settings, setSettings] = useState(getLockSettings);
  const [bioOk, setBioOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void biometricAvailable().then(setBioOk);
  }, []);

  function apply(next: LockSettings, message: string) {
    saveLockSettings(next);
    setSettings(next);
    window.dispatchEvent(new Event('mealtrack:applock'));
    toast(message);
  }

  async function choose(mode: LockMode) {
    if (mode === settings.mode) return;
    if (mode === 'biometric') {
      setBusy(true);
      try {
        const credentialId = await registerBiometric(membership.display_name);
        apply({ mode, credentialId, asked: true }, 'Fingerprint / Face ID lock is on.');
      } catch (e) {
        toast((e as Error).message || 'Could not set up fingerprint / Face ID.', 'error');
      } finally {
        setBusy(false);
      }
      return;
    }
    apply({ mode, asked: true }, mode === 'pin' ? 'MealTrack will ask for the PIN when opened.' : 'App lock is off.');
  }

  const options: Array<{ mode: LockMode; label: string; hint: string; disabled?: boolean }> = [
    { mode: 'biometric', label: 'Fingerprint / Face ID', hint: bioOk === false ? 'Not available on this device' : 'Recommended', disabled: bioOk === false },
    { mode: 'pin', label: 'PIN', hint: 'Needs internet to unlock' },
    { mode: 'off', label: 'Off', hint: 'Opens without a lock' },
  ];

  return (
    <Card>
      <h2 className="mb-1 font-semibold">App lock on this phone</h2>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">Asked when MealTrack opens, and after 2 minutes in the background.</p>
      <div className="grid gap-2" role="radiogroup" aria-label="App lock">
        {options.map((o) => (
          <button
            key={o.mode}
            type="button"
            role="radio"
            aria-checked={settings.mode === o.mode}
            disabled={busy || o.disabled}
            onClick={() => void choose(o.mode)}
            className={`flex min-h-12 items-center justify-between rounded-xl px-4 text-left text-sm ring-1 ring-inset disabled:opacity-50 ${
              settings.mode === o.mode
                ? 'bg-emerald-50 font-semibold text-emerald-900 ring-emerald-500 dark:bg-emerald-950 dark:text-emerald-100'
                : 'bg-white ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:ring-slate-600'
            }`}
          >
            <span>{o.label}</span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{settings.mode === o.mode ? '✓ On' : o.hint}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function RemindersSection() {
  const { userId, household } = useHousehold();
  const toast = useToast();
  const qc = useQueryClient();
  const support = pushSupport();
  const pref = useQuery({ queryKey: ['reminder-pref', userId], queryFn: () => fetchReminderPreference(userId) });
  const log = useQuery({ queryKey: ['notif-log', userId], queryFn: () => fetchRecentNotifications(userId) });
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
      void qc.invalidateQueries({ queryKey: ['notif-log', userId] });
    }
  }

  const enabled = pref.data ?? false;

  return (
    <Card>
      <h2 className="mb-1 font-semibold">Daily 10 PM reminder</h2>
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
      {log.data && log.data.length > 0 && (
        <details className="mt-3 text-xs text-slate-600 dark:text-slate-400">
          <summary className="cursor-pointer">Recent notification attempts</summary>
          <ul className="mt-1 space-y-0.5">
            {log.data.map((l) => (
              <li key={l.id}>
                {new Date(l.created_at).toLocaleString()} · {l.kind} for {l.reminder_date} · <strong>{l.status}</strong>
                {l.error ? ` (${l.error})` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

export function SettingsPage() {
  const { isAdmin } = useHousehold();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function signOutHere() {
    if (!confirm('Sign out of MealTrack on this phone? The meal records stay safe. To use MealTrack again you sign in with your name and the PIN, and an admin approves you again.')) return;
    setBusy(true);
    try {
      await leaveHousehold();
      await disablePushOnThisDevice().catch(() => {});
      await signOut();
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <ProfileSection />
      <RemindersSection />
      <AppLockSection />
      <PeopleSection />
      {isAdmin && <FamilyPinSection />}
      <Card>
        <Button variant="danger" disabled={busy} onClick={() => void signOutHere()}>{busy ? 'Signing out…' : 'Sign out'}</Button>
      </Card>
    </div>
  );
}
