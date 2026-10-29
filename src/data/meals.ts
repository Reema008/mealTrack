import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { getDayType } from '../domain/schedule';
import { isDefault, overrideKey, toOverrideMap } from '../domain/meals';
import type { ISODate, MealOverride, OverrideMap } from '../domain/types';
import { AuthExpiredError, isNetworkFailure, toAppError } from '../lib/errors';
import { flushOutbox, outbox, type OutboxItem } from '../lib/outbox';
import { supabase } from '../lib/supabase';
import { fetchOverrides, saveMealOverride, type SaveOutcome, type SaveRequest } from './api';
import { useHousehold } from './household';
import { subscribeToHouseholdMeals, type RealtimeState } from './realtime';
import { signOut } from './session';

export const overridesKey = (householdId: string) => ['overrides', householdId] as const;

export function useOutboxItems(householdId: string): OutboxItem[] {
  const subscribe = useCallback((cb: () => void) => outbox.subscribe(cb), []);
  const all = useSyncExternalStore(subscribe, () => outbox.list());
  return useMemo(() => all.filter((i) => i.householdId === householdId), [all, householdId]);
}

/**
 * Overrides for a date range, with any unsynchronised local edits layered on
 * top so the UI reflects what the user did (marked as pending).
 */
export function useOverrides(start: ISODate, end: ISODate) {
  const { household } = useHousehold();
  const query = useQuery({
    queryKey: [...overridesKey(household.id), start, end],
    queryFn: () => fetchOverrides(household.id, start, end),
    staleTime: 15_000,
  });
  const pending = useOutboxItems(household.id);

  const { map, pendingKeys } = useMemo(() => {
    const m = toOverrideMap(query.data ?? []);
    const keys = new Set<string>();
    for (const item of pending) {
      if (item.date < start || item.date > end) continue;
      const dayType = getDayType(item.date);
      if (dayType === 'none') continue;
      keys.add(item.key);
      if (isDefault(dayType, item.values)) {
        m.delete(item.key);
      } else {
        m.set(item.key, localOverride(household.id, item, m.get(item.key)));
      }
    }
    return { map: m as OverrideMap, pendingKeys: keys as ReadonlySet<string> };
  }, [query.data, pending, start, end, household.id]);

  return { ...query, map, pendingKeys };
}

function localOverride(householdId: string, item: OutboxItem, server?: MealOverride): MealOverride {
  return {
    id: server?.id ?? `local-${item.key}`,
    household_id: householdId,
    meal_date: item.date,
    meal_period: item.period,
    delivery_status: item.values.deliveryStatus,
    main_dish: item.values.mainDish,
    extra_curry_received: item.values.extraCurryReceived,
    created_by: server?.created_by ?? null,
    updated_by: null,
    created_at: server?.created_at ?? item.queuedAt,
    updated_at: item.queuedAt,
    version: server?.version ?? 0,
  };
}

export type SaveResult =
  | { kind: 'saved' | 'deleted' | 'unchanged'; outcome: SaveOutcome }
  | { kind: 'queued' }
  | { kind: 'conflict'; outcome: SaveOutcome };

/** Save a meal; queues offline, never reports success before the server confirms. */
export function useSaveMeal() {
  const { household } = useHousehold();
  const qc = useQueryClient();

  return useCallback(
    async (req: SaveRequest): Promise<SaveResult> => {
      const queue = (): SaveResult => {
        outbox.enqueue(household.id, req);
        return { kind: 'queued' };
      };
      // Keep ordering: if this meal already has a queued edit, queue behind it.
      if (!navigator.onLine || outbox.get(household.id, req.date, req.period)) return queue();
      try {
        const outcome = await saveMealOverride(req);
        await qc.invalidateQueries({ queryKey: overridesKey(household.id) });
        if (outcome.status === 'conflict') return { kind: 'conflict', outcome };
        return { kind: outcome.status, outcome };
      } catch (err) {
        if (isNetworkFailure(err)) return queue();
        const appErr = toAppError(err);
        if (appErr instanceof AuthExpiredError) void signOut();
        throw appErr;
      }
    },
    [household.id, qc],
  );
}

export interface SyncConflict {
  date: ISODate;
  period: OutboxItem['period'];
  mine: OutboxItem['values'];
  outcome: SaveOutcome;
}

/**
 * Keeps the household's data live: realtime subscription, outbox replay on
 * reconnect, and refetch when the app returns to the foreground.
 */
export function useHouseholdSync(onSynced: (count: number) => void) {
  const { household } = useHousehold();
  const qc = useQueryClient();
  const [realtime, setRealtime] = useState<RealtimeState>('connecting');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [syncing, setSyncing] = useState(false);
  const flushing = useRef(false);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const refetch = useCallback(() => {
    void qc.invalidateQueries({ queryKey: overridesKey(household.id) });
  }, [qc, household.id]);

  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine || outbox.list(household.id).length === 0) return;
    flushing.current = true;
    setSyncing(true);
    try {
      const r = await flushOutbox(outbox, household.id, saveMealOverride);
      if (r.conflicts.length) {
        setConflicts((c) => [
          ...c,
          ...r.conflicts.map(({ item, outcome }) => ({ date: item.date, period: item.period, mine: item.values, outcome })),
        ]);
      }
      if (r.synced) onSyncedRef.current(r.synced);
      refetch();
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
  }, [household.id, refetch]);

  useEffect(() => subscribeToHouseholdMeals(supabase, household.id, refetch, setRealtime), [household.id, refetch]);

  useEffect(() => {
    const up = () => {
      setOnline(true);
      void flush();
    };
    const down = () => setOnline(false);
    const visible = () => {
      if (document.visibilityState === 'visible') {
        refetch();
        void flush();
      }
    };
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    document.addEventListener('visibilitychange', visible);
    void flush();
    const id = window.setInterval(() => void flush(), 30_000);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      document.removeEventListener('visibilitychange', visible);
      window.clearInterval(id);
    };
  }, [flush, refetch]);

  const pending = useOutboxItems(household.id);

  return {
    online,
    realtime,
    syncing,
    pendingCount: pending.length,
    failedItems: pending.filter((p) => p.lastError),
    conflicts,
    dismissConflict: (c: SyncConflict) => setConflicts((all) => all.filter((x) => x !== c)),
    flush,
  };
}

export { overrideKey };
