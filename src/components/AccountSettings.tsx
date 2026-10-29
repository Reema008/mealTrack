import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { createAccount, deleteAccount, fetchAccounts, resetAccountPassword, setAccountRole, type Account } from '../data/api';
import { useHousehold } from '../data/household';
import { signOut } from '../data/session';
import { ChangePasswordForm } from '../pages/Auth';
import { useConfirm } from './Confirm';
import { useToast } from './Toast';
import { Button, Card, ErrorNote, PasswordField, Segmented, Spinner, TextField } from './ui';

const accountsKey = (householdId: string) => ['accounts', householdId] as const;

/** Signed-in person: who they are, change password, sign out. */
export function MyAccountSection() {
  const { membership } = useHousehold();
  const toast = useToast();
  const [changing, setChanging] = useState(false);

  return (
    <Card>
      <h2 className="mb-1 text-xl">My account</h2>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
        Signed in as <strong className="text-slate-900 dark:text-slate-100">{membership.display_name}</strong>
        {membership.username && <> · username <strong className="text-slate-900 dark:text-slate-100">{membership.username}</strong></>}
        {membership.role === 'admin' && ' · admin'}
      </p>
      {changing ? (
        <ChangePasswordForm
          onCancel={() => setChanging(false)}
          onDone={() => {
            setChanging(false);
            toast('Password changed.');
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setChanging(true)}>
            Change password
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      )}
    </Card>
  );
}

function NewAccountForm({ onClose }: { onClose: () => void }) {
  const { household } = useHousehold();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createAccount(name.trim(), username.trim().toLowerCase(), password, role);
      await qc.invalidateQueries({ queryKey: accountsKey(household.id) });
      toast(`Account created. Give ${name.trim()} the username “${username.trim().toLowerCase()}” and the password you chose.`);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:ring-slate-700" onSubmit={submit}>
      <h3 className="font-display text-lg">New account</h3>
      <TextField id="acc-name" label="Name" placeholder="e.g. Priya" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
      <TextField
        id="acc-username"
        label="Username"
        placeholder="e.g. priya"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
      />
      <p className="-mt-1 text-xs text-slate-600 dark:text-slate-400">3–30 characters: letters, numbers, dot, dash or underscore.</p>
      <PasswordField id="acc-password" label="Temporary password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <p className="-mt-1 text-xs text-slate-600 dark:text-slate-400">At least 8 characters. They choose their own when they first sign in.</p>
      <Segmented<'member' | 'admin'>
        label="Access"
        value={role}
        onChange={setRole}
        options={[
          { value: 'member', label: 'Member' },
          { value: 'admin', label: 'Admin' },
        ]}
      />
      {error && (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !name.trim() || !username.trim() || password.length < 8}>
          {busy ? 'Creating…' : 'Create account'}
        </Button>
      </div>
    </form>
  );
}

function ResetPasswordForm({ account, onClose }: { account: Account; onClose: () => void }) {
  const { household } = useHousehold();
  const qc = useQueryClient();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await resetAccountPassword(account.user_id, password);
      await qc.invalidateQueries({ queryKey: accountsKey(household.id) });
      toast(`New password set for ${account.display_name}. They will choose their own after signing in.`);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-3 space-y-3" onSubmit={submit}>
      <PasswordField
        id={`reset-${account.user_id}`}
        label={`New temporary password for ${account.display_name}`}
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || password.length < 8}>
          {busy ? 'Saving…' : 'Set password'}
        </Button>
      </div>
    </form>
  );
}

function AccountRow({ account }: { account: Account }) {
  const { userId, household } = useHousehold();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [resetting, setResetting] = useState(false);
  const isMe = account.user_id === userId;
  const refresh = () => qc.invalidateQueries({ queryKey: accountsKey(household.id) });

  async function run(fn: () => Promise<void>, ok: string) {
    try {
      await fn();
      await refresh();
      toast(ok);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <li className="rounded-2xl bg-white/90 p-3 ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:ring-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">
            {account.display_name}
            {isMe && <span className="font-normal text-slate-600 dark:text-slate-400"> (you)</span>}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {account.username ? `@${account.username}` : 'no username'} · {account.role === 'admin' ? 'Admin' : 'Member'}
            {account.must_change_password && ' · temporary password'}
          </p>
        </div>
      </div>
      {!isMe && !resetting && (
        <div className="mt-2 flex flex-wrap gap-1">
          <Button variant="ghost" className="min-h-9 px-3 text-xs" onClick={() => setResetting(true)}>
            Reset password
          </Button>
          <Button
            variant="ghost"
            className="min-h-9 px-3 text-xs"
            onClick={() =>
              void run(
                () => setAccountRole(account.user_id, account.role === 'admin' ? 'member' : 'admin'),
                account.role === 'admin' ? `${account.display_name} is now a member.` : `${account.display_name} is now an admin.`,
              )
            }
          >
            {account.role === 'admin' ? 'Make member' : 'Make admin'}
          </Button>
          <Button
            variant="ghost"
            className="min-h-9 px-3 text-xs !text-rose-700 dark:!text-rose-300"
            onClick={async () => {
              const ok = await confirm({
                emoji: '🗑️',
                tone: 'danger',
                title: `Delete ${account.display_name}’s account?`,
                message: 'They will be signed out and can no longer open MealTrack. Meal records they saved are kept.',
                confirmLabel: 'Delete account',
              });
              if (ok) void run(() => deleteAccount(account.user_id), `${account.display_name}’s account was deleted.`);
            }}
          >
            Delete
          </Button>
        </div>
      )}
      {resetting && <ResetPasswordForm account={account} onClose={() => setResetting(false)} />}
    </li>
  );
}

/** Admin only: create, reset and delete family accounts. */
export function FamilyAccountsSection() {
  const { household } = useHousehold();
  const accounts = useQuery({ queryKey: accountsKey(household.id), queryFn: () => fetchAccounts(household.id) });
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl">Family accounts</h2>
        {!adding && <Button onClick={() => setAdding(true)}>+ Add person</Button>}
      </div>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">Only people with an account can open MealTrack. You create their username and a temporary password.</p>
      {adding && (
        <div className="mb-3">
          <NewAccountForm onClose={() => setAdding(false)} />
        </div>
      )}
      {accounts.error ? (
        <ErrorNote error={accounts.error} onRetry={() => void accounts.refetch()} />
      ) : accounts.isLoading ? (
        <Spinner label="Loading accounts" />
      ) : (
        <ul className="space-y-2">
          {(accounts.data ?? []).map((a) => (
            <AccountRow key={a.user_id} account={a} />
          ))}
        </ul>
      )}
    </Card>
  );
}
