import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { FamilyAccountsSection, MyAccountSection } from '../components/AccountSettings';
import { useToast } from '../components/Toast';
import { Button, Card, Segmented } from '../components/ui';
import { MochiSvg } from '../components/pet/art';
import { SPECIES, speciesFor } from '../components/pet/species';
import { usePetEnabled, usePetKind } from '../lib/pet';
import { isValidTimeZone } from '../domain/dates';
import { fetchReminderPreference, setReminderPreference, updateHousehold } from '../data/api';
import { membershipKey, useHousehold } from '../data/household';
import { currentSubscription, enablePushOnThisDevice, pushSupport, sendTestNotification } from '../lib/push';

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney'];

function PetSection() {
  const [on, setOn] = usePetEnabled();
  const [kind, setKind] = usePetKind();
  const pet = speciesFor(kind);
  return (
    <Card>
      <h2 className="mb-1 text-xl">Your pet</h2>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        A little friend who wanders around the app and chats with you. Tap to pet · hold to see its mood and this week’s streak · rub in little circles for a
        belly rub · drag to move · double-tap for yarn chase. When food is delivered every day from Monday to Saturday, it throws a little party. Saved on this phone only.
      </p>
      <Segmented<boolean>
        label={`Show ${pet.name}`}
        value={on}
        onChange={setOn}
        options={[
          { value: true, label: 'On 💜' },
          { value: false, label: 'Off' },
        ]}
      />
      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Choose your pet</legend>
        <div className="grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2" role="radiogroup" aria-label="Choose your pet">
          {SPECIES.map((p) => {
            const selected = p.id === kind;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setKind(p.id)}
                className={`taro-inset flex flex-col items-center gap-1 rounded-2xl px-1 pb-2 pt-3 text-center transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                  selected ? 'ring-2 ring-emerald-500 dark:ring-emerald-300' : ''
                }`}
              >
                <span className={`block h-14 w-14 ${selected ? 'pet-idle' : ''}`}>
                  <MochiSvg kind={p.id} happy={selected} />
                </span>
                <span className="text-xs font-bold leading-tight">{p.name}</span>
                <span className="text-[10.5px] leading-tight text-slate-500 dark:text-slate-300">{p.kind}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
          {pet.name}: {pet.about} Its happiness and outfits carry over when you switch.
        </p>
      </fieldset>
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
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">Decides what “today” is, the 2 PM / 10 PM meal times, and the 10 PM reminder.</p>
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
          className="block min-h-11 min-w-0 flex-1 rounded-2xl border-0 bg-white px-3 text-slate-900 ring-1 ring-inset ring-slate-300 dark:bg-slate-900 dark:text-slate-50 dark:ring-slate-600"
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
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        Monday–Saturday at 10:00 PM ({household.timezone}), a push notification asks you to check today’s meals. Reminders never mark meals as confirmed.
      </p>
      {support === 'not-configured' && <p className="text-sm text-amber-800 dark:text-amber-300">Push notifications are not configured for this app build (missing VAPID public key).</p>}
      {support === 'needs-install' && (
        <p className="text-sm text-amber-800 dark:text-amber-300">On iPhone, first add MealTrack to your Home Screen (Share → Add to Home Screen), then open it from there to enable reminders. Requires iOS 16.4 or later.</p>
      )}
      {support === 'unsupported' && <p className="text-sm text-amber-800 dark:text-amber-300">This browser does not support push notifications.</p>}

      {support === 'supported' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-slate-700 dark:text-slate-50">
              Reminders on this phone: <strong className={enabled && deviceSubscribed ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-slate-50'}>{pref.isLoading ? '…' : enabled && deviceSubscribed ? 'On' : 'Off'}</strong>
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
  const { isAdmin } = useHousehold();
  return (
    <div className="space-y-4">
      <h1 className="text-3xl">Settings</h1>
      <MyAccountSection />
      {isAdmin && <FamilyAccountsSection />}
      <PetSection />
      <TimezoneSection />
      <RemindersSection />
      <p className="pb-2 text-center text-xs text-slate-500 dark:text-slate-400">
        MealTrack version {__APP_VERSION__} · {__BUILD_DATE__}
      </p>
    </div>
  );
}
