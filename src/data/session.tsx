import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { clearLockSettings } from '../lib/applock';
import { toAppError } from '../lib/errors';
import { supabase } from '../lib/supabase';

/**
 * Every phone gets its own anonymous Supabase session automatically (no
 * email or password). The session persists on the device; the phone then
 * is linked to a person when they sign in with their name and personal PIN.
 */
interface SessionState {
  session: Session | null;
  loading: boolean;
  /** Error starting a session (e.g. anonymous sign-ins disabled, offline). */
  error: string | null;
  /** Set when the phone lost its session and must sign in again with name + PIN. */
  notice: string | null;
  retry(): void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const signingIn = useRef(false);
  const intentionalSignOut = useRef(false);

  const ensureSession = useCallback(async () => {
    if (signingIn.current) return;
    signingIn.current = true;
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setSession(data.session);
        return;
      }
      const { data: anon, error: anonErr } = await supabase.auth.signInAnonymously();
      if (anonErr) throw anonErr;
      setSession(anon.session);
    } catch (err) {
      const msg = (err as Error).message ?? '';
      setError(
        /anonymous sign-ins are disabled/i.test(msg)
          ? 'anonymous-disabled'
          : toAppError(err).message,
      );
    } finally {
      signingIn.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onSignOut = () => (intentionalSignOut.current = true);
    window.addEventListener('mealtrack:signout', onSignOut);
    void ensureSession();

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_OUT') {
        if (!intentionalSignOut.current) setNotice('This phone was signed out. Sign in again with your name and PIN.');
        intentionalSignOut.current = false;
        // Start a fresh anonymous session for this phone.
        window.setTimeout(() => void ensureSession(), 0);
      }
    });
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener('mealtrack:signout', onSignOut);
    };
  }, [ensureSession]);

  return (
    <SessionContext.Provider value={{ session, loading, error, notice, retry: () => void ensureSession() }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/** Forget this phone's session (it must re-enter the family PIN). */
export async function signOut() {
  window.dispatchEvent(new Event('mealtrack:signout'));
  clearLockSettings();
  await supabase.auth.signOut();
}
