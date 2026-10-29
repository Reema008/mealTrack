import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ErrorNote, Spinner } from './components/ui';
import { enterMealTrack } from './data/api';
import { HouseholdProvider, membershipKey, useMembership } from './data/household';
import { signOut, useSession } from './data/session';
import { AuthExpiredError } from './lib/errors';
import { isSupabaseConfigured } from './lib/supabase';
import { SessionErrorPage, SetupRequiredPage } from './pages/Auth';
import { CalendarPage } from './pages/Calendar';
import { DayPage } from './pages/Day';
import { HomePage } from './pages/Home';
import { ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { SubscriptionsPage } from './pages/Subscriptions';

/** Lets the service worker deep-link an already-open window (notification click). */
function ServiceWorkerNavigation() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'navigate' && typeof e.data.url === 'string') {
        const hash = new URL(e.data.url).hash.replace(/^#/, '');
        if (hash) navigate(hash);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Every phone is let in automatically: no sign-in, PIN or approval. */
function SignedIn() {
  const { session } = useSession();
  const membership = useMembership();
  const qc = useQueryClient();
  const [enterError, setEnterError] = useState<Error | null>(null);
  const needsEntry = membership.isSuccess && (!membership.data || membership.data.status !== 'approved');

  useEffect(() => {
    if (membership.error instanceof AuthExpiredError) void signOut();
  }, [membership.error]);

  useEffect(() => {
    if (!needsEntry) return;
    let cancelled = false;
    enterMealTrack()
      .then(() => qc.invalidateQueries({ queryKey: membershipKey(session?.user.id) }))
      .catch((e: Error) => !cancelled && setEnterError(e));
    return () => {
      cancelled = true;
    };
  }, [needsEntry, qc, session?.user.id]);

  const error = membership.error ?? enterError;
  if (error) {
    return (
      <div className="mx-auto max-w-sm p-6">
        <ErrorNote
          error={error}
          onRetry={() => {
            setEnterError(null);
            void membership.refetch();
          }}
        />
      </div>
    );
  }
  if (membership.isLoading || needsEntry || !membership.data || membership.data.status !== 'approved') {
    return <Spinner label="Opening MealTrack" />;
  }

  return (
    <HouseholdProvider membership={membership.data} userId={session!.user.id} email={session!.user.email ?? ''}>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/day/:date" element={<DayPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </HouseholdProvider>
  );
}

export function App() {
  const { session, loading, error, retry } = useSession();
  if (!isSupabaseConfigured) return <SetupRequiredPage />;
  return (
    <HashRouter>
      <ScrollToTop />
      <ServiceWorkerNavigation />
      {loading ? (
        <Spinner label="Starting MealTrack" />
      ) : error && !session ? (
        <SessionErrorPage error={error} onRetry={retry} />
      ) : !session ? (
        <Spinner label="Starting MealTrack" />
      ) : (
        <SignedIn />
      )}
    </HashRouter>
  );
}
