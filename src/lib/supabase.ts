import { createClient, processLock } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False when the build has no Supabase settings; the app then shows setup help. */
export const isSupabaseConfigured = Boolean(url && anonKey);

/** No request may hang forever: give up after this long (a save is then queued and retried). */
export const REQUEST_TIMEOUT_MS = 15_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Request timed out')), REQUEST_TIMEOUT_MS);
  const outer = init?.signal;
  if (outer) {
    if (outer.aborted) controller.abort(outer.reason);
    else outer.addEventListener('abort', () => controller.abort(outer.reason), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

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
    // The default browser-wide lock (navigator.locks) can stay held after a
    // phone suspends the app, which makes every later request wait forever.
    // MealTrack runs in one tab, so an in-page lock is enough and cannot jam.
    lock: processLock,
  },
  global: { fetch: fetchWithTimeout },
  realtime: { params: { eventsPerSecond: 5 } },
});

/** The app's URL without query/hash, used for auth email redirects. */
export function appBaseUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}
