import { supabase } from '../lib/supabase';
import { toAppError } from '../lib/errors';
import type { SubscriptionRecord } from '../domain/subscription';
import type { ISODate, MealOverride, MealPeriod, MealValues } from '../domain/types';

export interface Household {
  id: string;
  name: string;
  timezone: string;
  /** Subscription renewal date; each period lasts 4 weeks from it. */
  subscription_start: string | null;
}

export type MemberStatus = 'pending' | 'approved';

export interface Membership {
  role: 'admin' | 'member';
  display_name: string;
  status: MemberStatus;
  household: Household;
}

/** A signed-in person whose request has not been approved yet. */
export interface PendingMembership {
  display_name: string;
  status: 'pending';
}

export type SaveStatus = 'saved' | 'deleted' | 'unchanged' | 'conflict';
export interface SaveOutcome {
  status: SaveStatus;
  row: MealOverride | null;
}

export interface SaveRequest {
  date: ISODate;
  period: MealPeriod;
  values: MealValues;
  /** Version of the override the user was editing (null = they saw the default). */
  expectedVersion: number | null;
}

const OVERRIDE_COLUMNS =
  'id, household_id, meal_date, meal_period, delivery_status, main_dish, extra_curry_received, created_by, updated_by, created_at, updated_at, version';

/**
 * This person's access: null (not signed in on this phone yet), pending
 * (waiting for an admin), or an approved membership with the app settings.
 */
export async function fetchMembership(userId: string): Promise<Membership | PendingMembership | null> {
  const { data, error } = await supabase
    .from('household_members')
    .select('role, display_name, status, household:households(id, name, timezone, subscription_start)')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw toAppError(error);
  if (!data) return null;
  const row = data as unknown as Membership;
  if (row.status !== 'approved' || !row.household) return { display_name: row.display_name, status: 'pending' };
  return row;
}

export async function fetchOverrides(householdId: string, start: ISODate, end: ISODate): Promise<MealOverride[]> {
  const { data, error } = await supabase
    .from('meal_overrides')
    .select(OVERRIDE_COLUMNS)
    .eq('household_id', householdId)
    .gte('meal_date', start)
    .lte('meal_date', end)
    .order('meal_date');
  if (error) throw toAppError(error);
  return (data ?? []) as MealOverride[];
}

export async function saveMealOverride(req: SaveRequest): Promise<SaveOutcome> {
  const { data, error } = await supabase.rpc('save_meal_override', {
    p_date: req.date,
    p_period: req.period,
    p_delivery_status: req.values.deliveryStatus,
    p_main_dish: req.values.mainDish,
    p_extra_curry: req.values.extraCurryReceived,
    p_expected_version: req.expectedVersion,
  });
  if (error) throw toAppError(error);
  return data as SaveOutcome;
}

/** Let this phone into MealTrack (no sign-in): creates MealTrack on first use. */
export async function enterMealTrack(): Promise<void> {
  const { error } = await supabase.rpc('enter_mealtrack');
  if (error) throw toAppError(error);
}

export async function updateHousehold(id: string, patch: { name?: string; timezone?: string; subscription_start?: string | null }): Promise<void> {
  const { error } = await supabase.from('households').update(patch).eq('id', id);
  if (error) throw toAppError(error);
}

export async function fetchReminderPreference(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('reminders_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw toAppError(error);
  return data?.reminders_enabled ?? false;
}

export async function setReminderPreference(userId: string, householdId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      { user_id: userId, household_id: householdId, reminders_enabled: enabled, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw toAppError(error);
}

export async function fetchRecentNotifications(userId: string) {
  const { data, error } = await supabase
    .from('notification_log')
    .select('id, kind, reminder_date, status, error, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw toAppError(error);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Subscription renewals (history)
// ---------------------------------------------------------------------------
export async function fetchSubscriptions(householdId: string): Promise<SubscriptionRecord[]> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, start_date, amount')
    .eq('household_id', householdId)
    .order('start_date');
  if (error) throw toAppError(error);
  return (data ?? []).map((r) => ({ id: r.id as string, start_date: r.start_date as string, amount: r.amount === null ? null : Number(r.amount) }));
}

function subscriptionError(err: { code?: string; message?: string }): Error {
  if (err.code === '23505') return new Error('There is already a subscription starting on that date.');
  return toAppError(err);
}

export async function addSubscription(householdId: string, startDate: ISODate, amount: number | null): Promise<void> {
  const { error } = await supabase.from('subscriptions').insert({ household_id: householdId, start_date: startDate, amount });
  if (error) throw subscriptionError(error);
}

export async function updateSubscription(id: string, startDate: ISODate, amount: number | null): Promise<void> {
  const { error } = await supabase.from('subscriptions').update({ start_date: startDate, amount }).eq('id', id);
  if (error) throw subscriptionError(error);
}

export async function deleteSubscription(id: string): Promise<void> {
  const { error } = await supabase.from('subscriptions').delete().eq('id', id);
  if (error) throw toAppError(error);
}
