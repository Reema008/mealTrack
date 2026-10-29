import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export type RealtimeState = 'connecting' | 'live' | 'offline';

/**
 * Subscribe to meal_overrides changes for one household. Any change triggers
 * `onChange`, which should refetch from the database (the source of truth)
 * rather than trusting the event payload. A (re)subscription also triggers a
 * refetch so edits made while disconnected are picked up.
 *
 * Note: Postgres DELETE events cannot be filtered by column, so deletes are
 * received unfiltered (payload contains only the primary key) and simply
 * cause a refetch.
 */
export function subscribeToHouseholdMeals(
  client: Pick<SupabaseClient, 'channel' | 'removeChannel'>,
  householdId: string,
  onChange: () => void,
  onState: (state: RealtimeState) => void = () => {},
): () => void {
  onState('connecting');
  const channel: RealtimeChannel = client
    .channel(`meal_overrides:${householdId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'meal_overrides', filter: `household_id=eq.${householdId}` },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'meal_overrides', filter: `household_id=eq.${householdId}` },
      () => onChange(),
    )
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'meal_overrides' }, () => onChange())
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        onState('live');
        onChange();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        onState('offline');
      }
    });

  return () => {
    void client.removeChannel(channel);
  };
}
