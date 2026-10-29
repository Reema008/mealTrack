/**
 * Device app lock: fingerprint / Face ID via WebAuthn (platform authenticator
 * with user verification), with the person's own PIN as fallback.
 *
 * This is a LOCAL lock that keeps someone holding an unlocked phone out of
 * the app. Server-side access is controlled separately by family membership
 * (signed in with name + PIN) and Row Level Security.
 */

export type LockMode = 'off' | 'biometric' | 'pin';

export interface LockSettings {
  mode: LockMode;
  credentialId?: string;
  /** True once the user has answered the "use fingerprint/Face ID?" prompt. */
  asked?: boolean;
}

const KEY = 'mealtrack.applock.v1';
/** Re-lock after the app has been in the background this long. */
export const RELOCK_AFTER_MS = 2 * 60 * 1000;

export function getLockSettings(): LockSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as LockSettings;
  } catch {
    /* ignore */
  }
  return { mode: 'off' };
}

export function saveLockSettings(s: LockSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function clearLockSettings(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export async function biometricAvailable(): Promise<boolean> {
  try {
    return (
      typeof window !== 'undefined' &&
      'PublicKeyCredential' in window &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

function toB64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Create a device credential guarded by the phone's fingerprint / Face ID. Returns its id. */
export async function registerBiometric(displayName: string): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: random(32),
      rp: { name: 'MealTrack' },
      user: { id: random(16), name: `MealTrack (${displayName})`, displayName },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      attestation: 'none',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Fingerprint / Face ID setup was cancelled.');
  return toB64url(cred.rawId);
}

/** Ask the phone to verify the user's fingerprint / face. Resolves true on success. */
export async function verifyBiometric(credentialId: string): Promise<boolean> {
  try {
    const result = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        allowCredentials: [{ type: 'public-key', id: fromB64url(credentialId) as BufferSource, transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return result !== null;
  } catch {
    return false;
  }
}
