import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ThemeToggle } from '../components/ThemeToggle';
import { Button, Card, PasswordField, TextField } from '../components/ui';
import { changePassword, signIn, signOut } from '../data/session';

function Screen({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="fixed right-4 top-[calc(0.75rem+env(safe-area-inset-top))]">
        <ThemeToggle />
      </div>
      <div className="mb-6 text-center">
        <img src="./icons/icon.svg" alt="" className="mx-auto h-20 w-20 rounded-[1.75rem] shadow-soft" />
        <h1 className="mt-4 text-4xl text-slate-900 dark:text-slate-50">MealTrack</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800">
      {message}
    </p>
  );
}

export function LoginPage({ notice }: { notice: string | null }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Screen subtitle="Lunch & dinner tracker">
      <Card>
        <form className="space-y-4" onSubmit={submit}>
          <h2 className="text-2xl">Sign in</h2>
          {notice && <p className="text-sm text-slate-600 dark:text-slate-400">{notice}</p>}
          <TextField
            id="username"
            label="Username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <PasswordField id="password" label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <FormError message={error} />
          <Button type="submit" className="w-full" disabled={busy || !username.trim() || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <p className="text-center text-xs text-slate-600 dark:text-slate-400">No account or forgot your password? Ask your MealTrack admin.</p>
        </form>
      </Card>
    </Screen>
  );
}

/** Asks for a new password; used on first sign-in and from Settings. */
export function ChangePasswordForm({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirmPw) return setError('The two passwords do not match.');
    setBusy(true);
    setError(null);
    try {
      await changePassword(password);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <PasswordField id="new-password" label="New password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <PasswordField id="confirm-password" label="Type it again" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required />
      <p className="text-xs text-slate-600 dark:text-slate-400">At least 8 characters.</p>
      <FormError message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </Button>
      </div>
    </form>
  );
}

export function FirstPasswordPage({ name, membershipKey }: { name: string; membershipKey: readonly unknown[] }) {
  const qc = useQueryClient();
  return (
    <Screen subtitle={`Welcome, ${name}`}>
      <Card>
        <h2 className="text-2xl">Choose your password</h2>
        <p className="mb-4 mt-1 text-sm text-slate-600 dark:text-slate-400">
          You signed in with a temporary password. Pick your own so only you know it.
        </p>
        <ChangePasswordForm onDone={() => void qc.invalidateQueries({ queryKey: membershipKey })} />
      </Card>
      <Button variant="ghost" className="mx-auto mt-4" onClick={() => void signOut()}>
        Sign out
      </Button>
    </Screen>
  );
}

/** Signed in, but the account is no longer part of MealTrack (e.g. deleted by an admin). */
export function NoAccessPage() {
  return (
    <Screen subtitle="No access">
      <Card>
        <p className="text-sm">This account does not have access to MealTrack any more. Ask your admin for a new account.</p>
        <Button className="mt-3 w-full" onClick={() => void signOut()}>
          Sign out
        </Button>
      </Card>
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
