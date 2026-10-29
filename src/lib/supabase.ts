import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False when the build has no Supabase settings; the app then shows setup help. */
export const isSupabaseConfigured = Boolean(url && anonKey);

// Only the public anon key is ever shipped to the browser. All access control
// is enforced by Row Level Security in the database.
export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'not-configured', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // PKCE puts the auth code in the query string (?code=…), which does not
    // collide with HashRouter's #/route URLs.
    flowType: 'pkce',
  },
  realtime: { params: { eventsPerSecond: 5 } },
});

/** The app's URL without query/hash, used for auth email redirects. */
export function appBaseUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}
