import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { pinErrorMessage, verifyFamilyPin } from '../data/api';
import { useHousehold } from '../data/household';
import { biometricAvailable, getLockSettings, registerBiometric, RELOCK_AFTER_MS, saveLockSettings, verifyBiometric, type LockSettings } from '../lib/applock';
import { Button, Card, PasswordField } from './ui';

function FingerprintIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 11v3a8 8 0 0 1-1.5 4.7M8 9.5A4 4 0 0 1 16 11v1.5M5.5 7A8 8 0 0 1 20 11.5v1M4 12a8 8 0 0 1 .5-2.8M8 21a11 11 0 0 0 1.5-2M16 14.5a12 12 0 0 1-1.3 5.5M20 16c-.2 1-.5 2-.9 3" />
    </svg>
  );
}

function LockScreen({ settings, onUnlock }: { settings: LockSettings; onUnlock: () => void }) {
  const { membership } = useHousehold();
  const [usePin, setUsePin] = useState(settings.mode === 'pin');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function tryBiometric() {
    if (!settings.credentialId) return setUsePin(true);
    setBusy(true);
    setError(null);
    const ok = await verifyBiometric(settings.credentialId);
    setBusy(false);
    if (ok) onUnlock();
    else setError('Fingerprint / Face ID was not recognised. Try again or use the PIN.');
  }

  async function submitPin(e: FormEvent) {
    e.preventDefault();
    if (!navigator.onLine) return setError('You are offline. Connect to the internet to unlock with the PIN, or use fingerprint / Face ID.');
    setBusy(true);
    setError(null);
    try {
      const r = await verifyFamilyPin(pin);
      if (r.ok) onUnlock();
      else {
        setError(pinErrorMessage(r));
        setPin('');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10 text-center">
      <img src="./icons/icon.svg" alt="" className="mx-auto h-16 w-16" />
      <h1 className="mt-3 text-xl font-bold text-emerald-700 dark:text-emerald-400">MealTrack is locked</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{membership.display_name}</p>
      <Card className="mt-6 text-left">
        {!usePin && settings.mode === 'biometric' ? (
          <div className="space-y-3">
            <Button className="w-full" onClick={tryBiometric} disabled={busy}>
              <FingerprintIcon />
              {busy ? 'Waiting…' : 'Unlock with fingerprint / Face ID'}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setUsePin(true)}>Use PIN instead</Button>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={submitPin}>
            <PasswordField
              id="unlock-pin"
              label="PIN"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={10}
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              required
            />
            <Button type="submit" className="w-full" disabled={busy || pin.length < 6}>{busy ? 'Checking…' : 'Unlock'}</Button>
            {settings.mode === 'biometric' && (
              <Button variant="ghost" className="w-full" onClick={() => setUsePin(false)}>Use fingerprint / Face ID</Button>
            )}
          </form>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      </Card>
    </div>
  );
}

/** One-time offer, right after joining, to protect the app with fingerprint / Face ID. */
function EnableBiometricPrompt({ onDone }: { onDone: () => void }) {
  const { membership } = useHousehold();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const credentialId = await registerBiometric(membership.display_name);
      saveLockSettings({ mode: 'biometric', credentialId, asked: true });
      onDone();
    } catch (err) {
      setError((err as Error).message || 'Could not set up fingerprint / Face ID.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center">
      <div role="dialog" aria-modal="true" aria-labelledby="bio-title" className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-center dark:bg-slate-900 sm:rounded-3xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
          <FingerprintIcon />
        </div>
        <h2 id="bio-title" className="mt-3 text-lg font-semibold">Lock MealTrack with fingerprint / Face ID?</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Opening the app will need your fingerprint or face. Your fingerprint never leaves this phone. You can change this later in Settings.
        </p>
        {error && <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => { saveLockSettings({ ...getLockSettings(), asked: true }); onDone(); }}>
            Not now
          </Button>
          <Button disabled={busy} onClick={enable}>{busy ? 'Waiting…' : 'Turn on'}</Button>
        </div>
      </div>
    </div>
  );
}

/** Locks the app on open (and after time in the background) when an app lock is enabled. */
export function AppLockGate({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(getLockSettings);
  const [locked, setLocked] = useState(() => getLockSettings().mode !== 'off');
  const [offerBiometric, setOfferBiometric] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    if (!settings.asked && settings.mode === 'off') void biometricAvailable().then(setOfferBiometric);
  }, [settings.asked, settings.mode]);

  useEffect(() => {
    const onVisibility = () => {
      const current = getLockSettings();
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else if (current.mode !== 'off' && hiddenAt.current && Date.now() - hiddenAt.current > RELOCK_AFTER_MS) {
        setSettings(current);
        setLocked(true);
      }
    };
    const onChange = () => setSettings(getLockSettings());
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('mealtrack:applock', onChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('mealtrack:applock', onChange);
    };
  }, []);

  if (locked && settings.mode !== 'off') return <LockScreen settings={settings} onUnlock={() => setLocked(false)} />;
  return (
    <>
      {children}
      {offerBiometric && (
        <EnableBiometricPrompt
          onDone={() => {
            setOfferBiometric(false);
            setSettings(getLockSettings());
          }}
        />
      )}
    </>
  );
}
