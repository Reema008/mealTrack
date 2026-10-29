import { overrideKey } from '../domain/meals';
import type { ISODate, MealPeriod, MealValues } from '../domain/types';
import type { SaveOutcome, SaveRequest } from '../data/api';
import { isNetworkFailure } from './errors';

/** A meal change made while offline, waiting for the server to confirm it. */
export interface OutboxItem {
  key: string;
  householdId: string;
  date: ISODate;
  period: MealPeriod;
  values: MealValues;
  /** Version of the server row the user's FIRST queued edit was based on. */
  expectedVersion: number | null;
  queuedAt: string;
  attempts: number;
  /** Save even if the values equal the default. */
  keep?: boolean;
  lastError?: string;
}

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Durable queue of unsynchronised edits, at most one per meal (the latest
 * edit wins locally). Stored in localStorage so it survives reloads.
 */
export class Outbox {
  private listeners = new Set<() => void>();
  private cache: OutboxItem[] | null = null;

  constructor(
    private readonly store: KeyValueStore,
    private readonly storageKey = 'mealtrack.outbox.v1',
  ) {}

  list(householdId?: string): OutboxItem[] {
    if (!this.cache) {
      try {
        this.cache = JSON.parse(this.store.getItem(this.storageKey) ?? '[]') as OutboxItem[];
      } catch {
        this.cache = [];
      }
    }
    return householdId ? this.cache.filter((i) => i.householdId === householdId) : this.cache;
  }

  get(householdId: string, date: ISODate, period: MealPeriod): OutboxItem | undefined {
    const key = overrideKey(date, period);
    return this.list().find((i) => i.householdId === householdId && i.key === key);
  }

  enqueue(householdId: string, req: SaveRequest, now = new Date()): OutboxItem {
    const key = overrideKey(req.date, req.period);
    const existing = this.get(householdId, req.date, req.period);
    const item: OutboxItem = {
      key,
      householdId,
      date: req.date,
      period: req.period,
      values: req.values,
      // Keep the version the first offline edit was based on, so the server
      // can still detect that someone else changed the meal meanwhile.
      expectedVersion: existing ? existing.expectedVersion : req.expectedVersion,
      queuedAt: existing?.queuedAt ?? now.toISOString(),
      attempts: 0,
      keep: req.keep,
    };
    this.write([...this.list().filter((i) => !(i.householdId === householdId && i.key === key)), item]);
    return item;
  }

  remove(householdId: string, key: string): void {
    this.write(this.list().filter((i) => !(i.householdId === householdId && i.key === key)));
  }

  markFailed(householdId: string, key: string, error: string): void {
    this.write(
      this.list().map((i) =>
        i.householdId === householdId && i.key === key ? { ...i, attempts: i.attempts + 1, lastError: error } : i,
      ),
    );
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private write(items: OutboxItem[]) {
    this.cache = items;
    try {
      this.store.setItem(this.storageKey, JSON.stringify(items));
    } catch {
      // Storage full or unavailable: keep the in-memory copy for this session.
    }
    this.listeners.forEach((l) => l());
  }
}

export interface FlushResult {
  synced: number;
  conflicts: Array<{ item: OutboxItem; outcome: SaveOutcome }>;
  failed: number;
  stoppedOffline: boolean;
}

/**
 * Replay queued edits in order. Successful and conflicting items leave the
 * queue (conflicts are reported for the user to resolve); network failures
 * stop the flush and keep everything queued; other errors are recorded.
 * Safe to call repeatedly: the save RPC is idempotent for identical values.
 */
export async function flushOutbox(
  outbox: Outbox,
  householdId: string,
  send: (req: SaveRequest) => Promise<SaveOutcome>,
): Promise<FlushResult> {
  const result: FlushResult = { synced: 0, conflicts: [], failed: 0, stoppedOffline: false };
  for (const item of [...outbox.list(householdId)]) {
    try {
      const outcome = await send({
        date: item.date,
        period: item.period,
        values: item.values,
        expectedVersion: item.expectedVersion,
        keep: item.keep,
      });
      outbox.remove(householdId, item.key);
      if (outcome.status === 'conflict') result.conflicts.push({ item, outcome });
      else result.synced++;
    } catch (err) {
      if (isNetworkFailure(err)) {
        result.stoppedOffline = true;
        break;
      }
      outbox.markFailed(householdId, item.key, (err as Error).message);
      result.failed++;
    }
  }
  return result;
}

const memoryStore = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

export const outbox = new Outbox(typeof localStorage !== 'undefined' ? localStorage : memoryStore());
export { memoryStore };
