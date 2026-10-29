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
  username: string | null;
  /** Set for new accounts and after an admin reset: the person must pick their own password. */
  must_change_password: boolean;
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
  /** Save even if the values equal the default (confirming a meal before its cutoff). */
  keep?: boolean;
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
    .select('role, display_name, username, must_change_password, status, household:households(id, name, timezone, subscription_start)')
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
  const { data, error } = await supabase.rpc('save_meal', {
    p_date: req.date,
    p_period: req.period,
    p_delivery_status: req.values.deliveryStatus,
    p_main_dish: req.values.mainDish,
    p_extra_curry: req.values.extraCurryReceived,
    p_expected_version: req.expectedVersion,
    p_keep: req.keep ?? false,
  });
  if (error) throw toAppError(error);
  return data as SaveOutcome;
}

export interface Account {
  user_id: string;
  display_name: string;
  username: string | null;
  role: 'admin' | 'member';
  must_change_password: boolean;
}

/** Everyone with an account in this family. */
export async function fetchAccounts(householdId: string): Promise<Account[]> {
  const { data, error } = await supabase
    .from('household_members')
    .select('user_id, display_name, username, role, must_change_password')
    .eq('household_id', householdId)
    .eq('status', 'approved')
    .order('display_name');
  if (error) throw toAppError(error);
  return (data ?? []) as Account[];
}

/** Admin only: create a login for someone. */
export async function createAccount(displayName: string, username: string, password: string, role: 'admin' | 'member'): Promise<void> {
  const { error } = await supabase.rpc('create_account', { p_display_name: displayName, p_username: username, p_password: password, p_role: role });
  if (error) throw toAppError(error);
}

/** Admin only: give someone a new password (they must change it after signing in). */
export async function resetAccountPassword(userId: string, password: string): Promise<void> {
  const { error } = await supabase.rpc('reset_account_password', { p_user_id: userId, p_password: password });
  if (error) throw toAppError(error);
}

export async function deleteAccount(userId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_account', { p_user_id: userId });
  if (error) throw toAppError(error);
}

export async function setAccountRole(userId: string, role: 'admin' | 'member'): Promise<void> {
  const { error } = await supabase.rpc('set_member_role', { p_user_id: userId, p_role: role });
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

const SUBSCRIPTION_COLUMNS = 'id, start_date, amount';
const toRecord = (r: { id: unknown; start_date: unknown; amount: unknown }): SubscriptionRecord => ({
  id: r.id as string,
  start_date: r.start_date as string,
  amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
});

export async function addSubscription(householdId: string, startDate: ISODate, amount: number | null): Promise<SubscriptionRecord> {
  const { data, error } = await supabase
    .from('subscriptions')
    .insert({ household_id: householdId, start_date: startDate, amount })
    .select(SUBSCRIPTION_COLUMNS)
    .single();
  if (error) throw subscriptionError(error);
  return toRecord(data);
}

export async function updateSubscription(id: string, startDate: ISODate, amount: number | null): Promise<SubscriptionRecord> {
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ start_date: startDate, amount })
    .eq('id', id)
    .select(SUBSCRIPTION_COLUMNS)
    .maybeSingle();
  if (error) throw subscriptionError(error);
  if (!data) throw new Error('That subscription no longer exists. It may have been deleted on another phone.');
  return toRecord(data);
}

/** Delete a subscription; fails loudly if nothing was actually removed. */
export async function deleteSubscription(id: string): Promise<void> {
  const { data, error } = await supabase.from('subscriptions').delete().eq('id', id).select('id');
  if (error) throw toAppError(error);
  if (!data || data.length === 0) throw new Error('That subscription was not found. It may already have been deleted.');
}
