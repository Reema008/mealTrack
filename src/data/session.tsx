import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { NetworkError, toAppError } from '../lib/errors';
import { supabase } from '../lib/supabase';

/**
 * Sign-in with a username and password that an admin created. Supabase Auth
 * needs an email, so each username is stored as "<username>@mealtrack.invalid"
 * (no mail is ever sent). The session stays on the phone until sign out.
 */
export const LOGIN_DOMAIN = 'mealtrack.invalid';
export const loginEmail = (username: string) => `${username.trim().toLowerCase()}@${LOGIN_DOMAIN}`;
export const usernameFromEmail = (email: string | undefined) => (email ?? '').replace(`@${LOGIN_DOMAIN}`, '');

interface SessionState {
  session: Session | null;
  loading: boolean;
  /** Set when the phone was signed out without the person asking (e.g. account deleted). */
  notice: string | null;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let intentional = false;
    const onSignOut = () => (intentional = true);
    window.addEventListener('mealtrack:signout', onSignOut);

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setLoading(false);
      if (event === 'SIGNED_IN') setNotice(null);
      if (event === 'SIGNED_OUT') {
        if (!intentional) setNotice('You were signed out. Please sign in again.');
        intentional = false;
      }
    });
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener('mealtrack:signout', onSignOut);
    };
  }, []);

  return <SessionContext.Provider value={{ session, loading, notice }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

export async function signIn(username: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(username), password });
  if (!error) return;
  if (/invalid login credentials/i.test(error.message)) throw new Error('Wrong username or password.');
  if (/rate limit|too many/i.test(error.message)) throw new Error('Too many attempts. Please wait a few minutes and try again.');
  const e = toAppError(error);
  throw e instanceof NetworkError ? new Error('No internet connection. Connect and try again.') : e;
}

/** Changes the signed-in person's own password. */
export async function changePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (/should be different/i.test(error.message)) throw new Error('Choose a password different from the current one.');
    throw toAppError(error);
  }
  const { error: flagErr } = await supabase.rpc('password_changed');
  if (flagErr) throw toAppError(flagErr);
}

export async function signOut() {
  window.dispatchEvent(new Event('mealtrack:signout'));
  // Only this phone: other phones signed in to the same account stay signed in.
  await supabase.auth.signOut({ scope: 'local' });
}
