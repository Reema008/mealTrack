import type { ReactNode } from 'react';
import { Button, Card, ErrorNote } from '../components/ui';

function Screen({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <img src="./icons/icon.svg" alt="" className="mx-auto h-20 w-20 rounded-[1.75rem] shadow-soft" />
        <h1 className="mt-4 text-4xl text-slate-900 dark:text-slate-50">MealTrack</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

/** Shown when this phone could not get its (invisible) connection to MealTrack. */
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
