// Supabase Edge Function: sends the daily 10 PM "Daily Food Check" Web Push.
//
// Invoked two ways:
//  1. By pg_cron every 15 minutes with header `x-cron-secret` (see the
//     *_cron.sql migration). For each household it checks the LOCAL time in the
//     household timezone and sends Mon–Sat between 22:00 and 23:59, once per
//     device per local date (deduplicated by claim_daily_reminder).
//  2. By a signed-in user from Settings with {"mode":"test"}: sends a test
//     notification to that user's own devices only.
//
// Secrets (set with `supabase secrets set`): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT, APP_URL, CRON_SECRET. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided automatically by Supabase.
//
// This function never reads or writes meal_overrides: a reminder is not a
// confirmation.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';
import { reminderPayload, reminderPlan } from '../_shared/reminder.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret ${name}`);
  return v;
}

/** Constant-time string comparison for the cron secret. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface Subscription {
  id: string;
  user_id: string;
  household_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface SendResult {
  ok: boolean;
  status?: number;
  gone?: boolean;
  error?: string;
}

async function sendPush(sub: Subscription, payload: unknown): Promise<SendResult> {
  try {
    const res = await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 2, urgency: 'normal' },
    );
    return { ok: true, status: res.statusCode };
  } catch (err) {
    const e = err as { statusCode?: number; body?: string; message?: string };
    return {
      ok: false,
      status: e.statusCode,
      gone: e.statusCode === 404 || e.statusCode === 410,
      error: (e.body || e.message || 'unknown error').slice(0, 500),
    };
  }
}

async function recordResult(admin: SupabaseClient, logId: string, sub: Subscription, r: SendResult) {
  await admin
    .from('notification_log')
    .update({
      status: r.ok ? 'sent' : r.gone ? 'gone' : 'failed',
      http_status: r.status ?? null,
      error: r.error ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', logId);
  if (r.ok) {
    await admin.from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('id', sub.id);
  } else if (r.gone) {
    // The browser revoked this subscription; stop sending to it.
    await admin.from('push_subscriptions').update({ disabled_at: new Date().toISOString() }).eq('id', sub.id);
  }
}

async function runDaily(admin: SupabaseClient, appUrl: string, now: Date) {
  const { data: households, error } = await admin.from('households').select('id, timezone');
  if (error) throw error;

  const summary = { households: households.length, due: 0, sent: 0, failed: 0, skipped: 0 };

  for (const h of households) {
    const plan = reminderPlan(now, h.timezone);
    if (!plan.due) continue;
    summary.due++;

    const { data: prefs, error: pErr } = await admin
      .from('notification_preferences')
      .select('user_id')
      .eq('household_id', h.id)
      .eq('reminders_enabled', true);
    if (pErr) throw pErr;
    const userIds = prefs.map((p) => p.user_id);
    if (userIds.length === 0) continue;

    const { data: subs, error: sErr } = await admin
      .from('push_subscriptions')
      .select('id, user_id, household_id, endpoint, p256dh, auth')
      .eq('household_id', h.id)
      .in('user_id', userIds)
      .is('disabled_at', null);
    if (sErr) throw sErr;

    const payload = reminderPayload(appUrl, plan.reminderDate);
    for (const sub of subs as Subscription[]) {
      const { data: logId, error: cErr } = await admin.rpc('claim_daily_reminder', {
        p_household_id: h.id,
        p_user_id: sub.user_id,
        p_subscription_id: sub.id,
        p_reminder_date: plan.reminderDate,
      });
      if (cErr) throw cErr;
      if (!logId) {
        summary.skipped++; // already sent to this device today
        continue;
      }
      const r = await sendPush(sub, payload);
      await recordResult(admin, logId as string, sub, r);
      if (r.ok) summary.sent++;
      else summary.failed++;
    }
  }
  return summary;
}

async function runTest(admin: SupabaseClient, appUrl: string, authHeader: string | null) {
  const jwt = authHeader?.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Sign in required' }, 401);
  const { data: userData, error: uErr } = await admin.auth.getUser(jwt);
  if (uErr || !userData.user) return json({ error: 'Your session has expired. Please sign in again.' }, 401);
  const userId = userData.user.id;

  const { data: member } = await admin
    .from('household_members')
    .select('household_id, status, households(timezone)')
    .eq('user_id', userId)
    .maybeSingle();
  if (!member || member.status !== 'approved') return json({ error: 'You are not approved to use MealTrack yet' }, 403);

  const tz = (member.households as unknown as { timezone: string }).timezone;
  const date = reminderPlan(new Date(), tz).reminderDate;
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, user_id, household_id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .is('disabled_at', null);
  if (!subs?.length) return json({ error: 'No registered devices. Turn on reminders on this device first.' }, 400);

  const payload = { ...reminderPayload(appUrl, date), tag: `mealtrack-test-${Date.now()}` };
  let sent = 0;
  let failed = 0;
  for (const sub of subs as Subscription[]) {
    const { data: log } = await admin
      .from('notification_log')
      .insert({ household_id: member.household_id, user_id: userId, subscription_id: sub.id, kind: 'test', reminder_date: date })
      .select('id')
      .single();
    const r = await sendPush(sub, payload);
    if (log) await recordResult(admin, log.id, sub, r);
    if (r.ok) sent++;
    else failed++;
  }
  return json({ sent, failed });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const appUrl = env('APP_URL');
    const body = (await req.json().catch(() => ({}))) as { mode?: string; now?: string };

    if (body.mode === 'test') return await runTest(admin, appUrl, req.headers.get('Authorization'));

    const secret = req.headers.get('x-cron-secret') ?? '';
    if (!safeEqual(secret, env('CRON_SECRET'))) return json({ error: 'Unauthorized' }, 401);

    // `now` override lets an operator dry-run a specific moment (cron secret required).
    const now = body.now ? new Date(body.now) : new Date();
    if (Number.isNaN(now.getTime())) return json({ error: 'Invalid now' }, 400);
    const summary = await runDaily(admin, appUrl, now);
    console.log('daily reminders', JSON.stringify({ at: now.toISOString(), ...summary }));
    return json(summary);
  } catch (err) {
    console.error('send-daily-reminders failed', err);
    return json({ error: (err as Error).message }, 500);
  }
});
