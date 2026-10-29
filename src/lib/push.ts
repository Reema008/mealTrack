import { supabase } from './supabase';
import { toAppError } from './errors';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushSupport = 'supported' | 'unsupported' | 'needs-install' | 'not-configured';

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function pushSupport(): PushSupport {
  if (!VAPID_PUBLIC_KEY) return 'not-configured';
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  // iOS only exposes Web Push to apps added to the Home Screen (iOS 16.4+).
  if (isIOS() && !isStandalone()) return 'needs-install';
  return hasApis ? 'supported' : 'unsupported';
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Ask permission, subscribe this device, and register it with the backend. */
export async function enablePushOnThisDevice(): Promise<void> {
  if (pushSupport() !== 'supported') throw new Error('Push notifications are not available on this device.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications are blocked. Allow them for this site in your browser settings, then try again.');
  }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
    });
  }
  const json = sub.toJSON();
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw toAppError(error);
}

/** Unsubscribe this device and remove its registration. */
export async function disablePushOnThisDevice(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

export async function sendTestNotification(): Promise<{ sent: number; failed: number }> {
  const { data, error } = await supabase.functions.invoke('send-daily-reminders', { body: { mode: 'test' } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let detail = '';
    try {
      detail = ctx ? ((await ctx.json()) as { error?: string }).error ?? '' : '';
    } catch {
      /* ignore */
    }
    throw new Error(detail || error.message);
  }
  return data as { sent: number; failed: number };
}
