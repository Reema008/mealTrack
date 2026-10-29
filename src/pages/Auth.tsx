import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button, Card, ErrorNote, PasswordField, Spinner, TextField } from '../components/ui';
import { fetchMealTrackStatus, leaveHousehold, pinErrorMessage, setupHousehold, signIn } from '../data/api';
import { membershipKey } from '../data/household';
import { signOut, useSession } from '../data/session';

const PIN_RE = /^[0-9]{6,10}$/;

function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-6 text-center">
      <img src="./icons/icon.svg" alt="" className="mx-auto h-20 w-20 rounded-[1.75rem] shadow-soft" />
      <h1 className="mt-4 text-4xl text-slate-900 dark:text-slate-50">MealTrack</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
    </div>
  );
}

function Screen({ subtitle, children }: { subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <Brand subtitle={subtitle} />
      {children}
    </div>
  );
}

function PinInput(props: { id: string; label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <PasswordField
      id={props.id}
      label={props.label}
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      maxLength={10}
      autoFocus={props.autoFocus}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value.replace(/\D/g, ''))}
      required
    />
  );
}

const REQUESTED_KEY = 'mealtrack.requested';
const markRequested = (on: boolean) => {
  try {
    if (on) localStorage.setItem(REQUESTED_KEY, '1');
    else localStorage.removeItem(REQUESTED_KEY);
  } catch {
    /* ignore */
  }
};
/** Forget the "request sent" marker once someone is approved. */
export const clearRequested = () => markRequested(false);
const wasRequested = () => {
  try {
    return localStorage.getItem(REQUESTED_KEY) === '1';
  } catch {
    return false;
  }
};

/** First-time setup: the first person becomes the admin. */
function SetupPage({ onDone }: { onDone: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!PIN_RE.test(pin)) return setError('Choose a PIN of 6 to 10 digits.');
    if (pin !== pin2) return setError('The two PINs do not match.');
    setBusy(true);
    try {
      await setupHousehold('MealTrack', name.trim(), pin, 'Asia/Kolkata');
      await onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen subtitle="Welcome! You’re the first one here, so you’ll be the admin.">
      <Card>
        <form className="space-y-4" onSubmit={submit}>
          <TextField id="me" label="Your name" placeholder="e.g. Priya" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
          <PinInput id="pin" label="Create your PIN (6–10 digits)" value={pin} onChange={setPin} />
          <PinInput id="pin2" label="Enter your PIN again" value={pin2} onChange={setPin2} />
          <p className="text-xs text-slate-600 dark:text-slate-400">
            This PIN is just for you: keep it to yourself. Your family will each create their own when they sign in, and you approve them once.
          </p>
          {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Setting up…' : 'Set up MealTrack'}</Button>
        </form>
      </Card>
    </Screen>
  );
}

/**
 * Everyone else signs in with their name + their own PIN.
 * Returning people go straight in; a new name confirms the PIN once and
 * sends a request to the admin.
 */
function JoinPage({ onDone }: { onDone: () => Promise<void> }) {
  const { notice: sessionNotice } = useSession();
  const [declined] = useState(() => {
    const was = wasRequested();
    markRequested(false);
    return was;
  });
  const notice = declined ? 'Your request was not approved. Check with the admin, then try again.' : sessionNotice;
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!PIN_RE.test(pin)) return setError('Your PIN is 6 to 10 digits.');
    if (isNew && pin !== pin2) return setError('The two PINs do not match.');
    setBusy(true);
    try {
      const r = await signIn(name.trim(), pin, isNew);
      if (!r.ok) {
        if (r.error === 'new_user') {
          setIsNew(true);
          return;
        }
        setError(pinErrorMessage(r));
        setPin('');
        return;
      }
      if (r.status === 'pending' && !r.returning) markRequested(true);
      await onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen subtitle={isNew ? 'Nice to meet you!' : 'Welcome back. Sign in with your name and PIN.'}>
      {notice && <p role="status" className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800">{notice}</p>}
      <Card>
        <form className="space-y-4" onSubmit={submit}>
          <h2 className="text-2xl">{isNew ? 'Create your account' : 'Sign in'}</h2>
          <TextField
            id="me"
            label="Your name"
            placeholder="e.g. Arjun"
            autoComplete="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setIsNew(false);
            }}
            maxLength={60}
            required
          />
          <PinInput id="pin" label={isNew ? 'Create your PIN (6–10 digits)' : 'Your PIN'} value={pin} onChange={setPin} />
          {isNew && (
            <>
              <PinInput id="pin2" label="Enter your PIN again" value={pin2} onChange={setPin2} autoFocus />
              <p className="rounded-2xl bg-sky-50 p-3 text-xs text-sky-900 dark:bg-sky-950 dark:text-sky-100">
                We don’t know <strong>{name.trim()}</strong> yet. Confirm your PIN to send a request. The admin approves you <strong>once</strong>; after that you sign in straight away with your name and PIN.
              </p>
            </>
          )}
          {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Checking…' : isNew ? 'Send request' : 'Sign in'}
          </Button>
          {isNew && (
            <Button variant="ghost" className="w-full" onClick={() => setIsNew(false)}>
              I already have an account
            </Button>
          )}
        </form>
      </Card>
      <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">Forgot your PIN? Ask the admin to reset it in Settings → People.</p>
    </Screen>
  );
}

/** Signed in with the PIN, waiting for the admin. The membership query polls until approved. */
export function PendingApprovalPage({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    try {
      markRequested(false);
      await leaveHousehold();
      await signOut();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Screen subtitle={`Hi ${name}!`}>
      <Card className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" aria-hidden />
        <h2 className="mt-3 text-2xl">Waiting for approval</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400" role="status">
          Your sign-in request was sent. Ask the admin to approve you in <strong>Settings → People</strong>. This screen opens MealTrack automatically once you’re approved. You only need approval this once.
        </p>
        {error && <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <Button variant="ghost" className="mt-4 w-full" disabled={busy} onClick={() => void cancel()}>
          Cancel request
        </Button>
      </Card>
    </Screen>
  );
}

/** Shown to someone who has not signed in on this phone yet. */
export function JoinOrSetupPage() {
  const { session } = useSession();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['mealtrack-status'], queryFn: fetchMealTrackStatus });
  const onDone = () => qc.invalidateQueries({ queryKey: membershipKey(session?.user.id) });

  if (status.isLoading) return <Spinner label="Starting MealTrack" />;
  if (status.error)
    return (
      <Screen subtitle="Could not reach MealTrack">
        <ErrorNote error={status.error} onRetry={() => void status.refetch()} />
      </Screen>
    );
  if (status.data === 'not_set_up') return <SetupPage onDone={async () => { await status.refetch(); await onDone(); }} />;
  return <JoinPage onDone={onDone} />;
}

export function SessionErrorPage({ error, onRetry }: { error: string; onRetry: () => void }) {
  if (error === 'anonymous-disabled') {
    return (
      <Screen subtitle="One more setup step">
        <Card>
          <p className="text-sm">
            In the Supabase dashboard, go to <strong>Authentication → Sign In / Providers</strong> and turn on <strong>Allow anonymous sign-ins</strong>. Save, then tap Try again.
          </p>
          <Button className="mt-3 w-full" onClick={onRetry}>Try again</Button>
        </Card>
      </Screen>
    );
  }
  return (
    <Screen subtitle="Could not start MealTrack">
      <ErrorNote error={new Error(error)} onRetry={onRetry} />
    </Screen>
  );
}

export function SetupRequiredPage() {
  return (
    <Screen subtitle="Setup required">
      <Card>
        <p className="text-sm">
          This build has no Supabase connection. Copy <code>.env.example</code> to <code>.env.local</code>, set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>, then restart the dev server or rebuild. See README.md.
        </p>
      </Card>
    </Screen>
  );
}
