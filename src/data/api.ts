import { supabase } from '../lib/supabase';
import { toAppError } from '../lib/errors';
import type { ISODate, MealOverride, MealPeriod, MealValues } from '../domain/types';

export interface Household {
  id: string;
  name: string;
  timezone: string;
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

export interface Member {
  user_id: string;
  role: 'admin' | 'member';
  display_name: string;
  status: MemberStatus;
  joined_at: string;
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
 * This person's access: null (not signed in with the PIN yet), pending
 * (waiting for an admin), or an approved membership with the app settings.
 */
export async function fetchMembership(userId: string): Promise<Membership | PendingMembership | null> {
  const { data, error } = await supabase
    .from('household_members')
    .select('role, display_name, status, household:households(id, name, timezone)')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw toAppError(error);
  if (!data) return null;
  const row = data as unknown as Membership;
  if (row.status !== 'approved' || !row.household) return { display_name: row.display_name, status: 'pending' };
  return row;
}

export async function approveMember(userId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_member', { p_user_id: userId });
  if (error) throw toAppError(error);
}

export async function setMemberRole(userId: string, role: 'admin' | 'member'): Promise<void> {
  const { error } = await supabase.rpc('set_member_role', { p_user_id: userId, p_role: role });
  if (error) throw toAppError(error);
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

export type MealTrackStatus = 'not_set_up' | 'needs_pin' | 'ready';

export async function fetchMealTrackStatus(): Promise<MealTrackStatus> {
  const { data, error } = await supabase.rpc('mealtrack_status');
  if (error) throw toAppError(error);
  return data as MealTrackStatus;
}

export async function setupHousehold(name: string, displayName: string, pin: string, timezone: string): Promise<void> {
  const { error } = await supabase.rpc('setup_household', {
    p_name: name,
    p_display_name: displayName,
    p_pin: pin,
    p_timezone: timezone,
  });
  if (error) throw toAppError(error);
}

/** Result of any family-PIN check. */
export interface PinResult {
  ok: boolean;
  /** For sign-in: whether the request is still waiting for an admin. */
  status?: MemberStatus;
  error?: 'wrong_pin' | 'locked';
  attempts_left?: number;
}

export function pinErrorMessage(r: PinResult): string {
  if (r.error === 'locked') return 'Too many wrong PINs. PIN entry is paused for 15 minutes.';
  const left = r.attempts_left ?? 0;
  return `Wrong PIN. ${left} attempt${left === 1 ? '' : 's'} left before a 15-minute pause.`;
}

export async function joinWithPin(pin: string, displayName: string): Promise<PinResult> {
  const { data, error } = await supabase.rpc('join_with_pin', { p_pin: pin, p_display_name: displayName });
  if (error) throw toAppError(error);
  return data as PinResult;
}

export async function verifyFamilyPin(pin: string): Promise<PinResult> {
  const { data, error } = await supabase.rpc('verify_family_pin', { p_pin: pin });
  if (error) throw toAppError(error);
  return data as PinResult;
}

export async function changeFamilyPin(current: string, next: string): Promise<PinResult> {
  const { data, error } = await supabase.rpc('change_family_pin', { p_current: current, p_new: next });
  if (error) throw toAppError(error);
  return data as PinResult;
}

/** Remove this phone from the family (membership, reminders, push registration). */
export async function leaveHousehold(): Promise<void> {
  const { error } = await supabase.rpc('leave_household');
  if (error) throw toAppError(error);
}

export async function fetchMembers(householdId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('household_members')
    .select('user_id, role, display_name, status, joined_at')
    .eq('household_id', householdId)
    .order('joined_at');
  if (error) throw toAppError(error);
  return (data ?? []) as Member[];
}

export async function updateHousehold(id: string, patch: { name?: string; timezone?: string }): Promise<void> {
  const { error } = await supabase.from('households').update(patch).eq('id', id);
  if (error) throw toAppError(error);
}

export async function updateDisplayName(householdId: string, userId: string, displayName: string): Promise<void> {
  const { error } = await supabase
    .from('household_members')
    .update({ display_name: displayName })
    .eq('household_id', householdId)
    .eq('user_id', userId);
  if (error) throw toAppError(error);
}

/** Admin only: decline a pending request or remove an approved person (also stops their reminders). */
export async function removeMember(userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_member', { p_user_id: userId });
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
