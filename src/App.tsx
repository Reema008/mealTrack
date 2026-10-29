import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Button, ErrorNote, Spinner } from './components/ui';
import { HouseholdProvider, useMembership } from './data/household';
import { signOut, useSession } from './data/session';
import { AuthExpiredError } from './lib/errors';
import { isSupabaseConfigured } from './lib/supabase';
import { AppLockGate } from './components/AppLock';
import { clearRequested, JoinOrSetupPage, PendingApprovalPage, SessionErrorPage, SetupRequiredPage } from './pages/Auth';
import { CalendarPage } from './pages/Calendar';
import { DayPage } from './pages/Day';
import { HomePage } from './pages/Home';
import { ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';

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

function SignedIn() {
  const { session } = useSession();
  const membership = useMembership();

  useEffect(() => {
    if (membership.error instanceof AuthExpiredError) void signOut();
  }, [membership.error]);
  useEffect(() => {
    if (membership.data?.status === 'approved') clearRequested();
  }, [membership.data?.status]);

  if (membership.isLoading) return <Spinner label="Loading MealTrack" />;
  if (membership.error) {
    return (
      <div className="mx-auto max-w-sm p-6">
        <ErrorNote error={membership.error} onRetry={() => void membership.refetch()} />
        <Button variant="ghost" className="mt-3 w-full" onClick={() => void signOut()}>Start over on this phone</Button>
      </div>
    );
  }
  if (!membership.data) return <JoinOrSetupPage />;
  if (membership.data.status === 'pending') return <PendingApprovalPage name={membership.data.display_name} />;

  return (
    <HouseholdProvider membership={membership.data} userId={session!.user.id} email={session!.user.email ?? ''}>
      <AppLockGate>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/day/:date" element={<DayPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
      </AppLockGate>
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
