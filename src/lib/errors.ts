/** Error raised when the request never reached the server (offline, DNS, timeout). */
export class NetworkError extends Error {
  constructor(message = 'You appear to be offline') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** Error raised when the session is missing or expired. */
export class AuthExpiredError extends Error {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

interface SupabaseLikeError {
  message?: string;
  code?: string;
  status?: number;
  details?: string | null;
  hint?: string | null;
}

const NETWORK_RE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout/i;

export function isNetworkFailure(err: unknown): boolean {
  if (err instanceof NetworkError) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = (err as SupabaseLikeError | undefined)?.message ?? String(err);
  return NETWORK_RE.test(msg);
}

/** Convert a Supabase/PostgREST error into a typed, user-friendly Error. */
export function toAppError(err: unknown): Error {
  if (err instanceof Error && (err instanceof NetworkError || err instanceof AuthExpiredError)) return err;
  if (isNetworkFailure(err)) return new NetworkError();
  const e = (err ?? {}) as SupabaseLikeError;
  if (e.status === 401 || e.code === 'PGRST301' || e.code === '28000' || /jwt expired|invalid jwt/i.test(e.message ?? '')) {
    return new AuthExpiredError();
  }
  if (e.code === '42501') return new Error(e.message?.includes('row-level') ? 'You do not have access to this household.' : e.message ?? 'Not allowed');
  return new Error(e.message || 'Something went wrong. Please try again.');
}
