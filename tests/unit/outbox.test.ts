import { describe, expect, it, vi } from 'vitest';
import { flushOutbox, memoryStore, Outbox } from '../../src/lib/outbox';
import { NetworkError } from '../../src/lib/errors';
import type { SaveOutcome, SaveRequest } from '../../src/data/api';

const H = 'household-1';
const egg = { deliveryStatus: 'delivered', mainDish: 'egg', extraCurryReceived: true } as const;
const missing = { deliveryStatus: 'not_received', mainDish: 'egg', extraCurryReceived: true } as const;

describe('15. offline outbox', () => {
  it('keeps one entry per meal and the version the first edit was based on', () => {
    const box = new Outbox(memoryStore());
    box.enqueue(H, { date: '2026-10-27', period: 'lunch', values: egg, expectedVersion: 4 });
    box.enqueue(H, { date: '2026-10-27', period: 'lunch', values: missing, expectedVersion: null });
    box.enqueue(H, { date: '2026-10-27', period: 'dinner', values: egg, expectedVersion: null });
    const items = box.list(H);
    expect(items).toHaveLength(2);
    const lunch = box.get(H, '2026-10-27', 'lunch')!;
    expect(lunch.values).toEqual(missing);
    expect(lunch.expectedVersion).toBe(4);
  });

  it('survives a reload (persists to storage)', () => {
    const store = memoryStore();
    new Outbox(store).enqueue(H, { date: '2026-10-27', period: 'lunch', values: egg, expectedVersion: null });
    expect(new Outbox(store).list(H)).toHaveLength(1);
  });

  it('flushes in order, removes synced items and reports conflicts', async () => {
    const box = new Outbox(memoryStore());
    box.enqueue(H, { date: '2026-10-27', period: 'lunch', values: egg, expectedVersion: null });
    box.enqueue(H, { date: '2026-10-28', period: 'lunch', values: egg, expectedVersion: 2 });
    const send = vi.fn(async (req: SaveRequest): Promise<SaveOutcome> =>
      req.date === '2026-10-28' ? { status: 'conflict', row: null } : { status: 'saved', row: null },
    );
    const r = await flushOutbox(box, H, send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(r.synced).toBe(1);
    expect(r.conflicts).toHaveLength(1);
    expect(box.list(H)).toHaveLength(0);
  });

  it('a network failure keeps everything queued and nothing is marked synced', async () => {
    const box = new Outbox(memoryStore());
    box.enqueue(H, { date: '2026-10-27', period: 'lunch', values: egg, expectedVersion: null });
    box.enqueue(H, { date: '2026-10-28', period: 'lunch', values: egg, expectedVersion: null });
    const send = vi.fn(async (): Promise<SaveOutcome> => {
      throw new NetworkError();
    });
    const r = await flushOutbox(box, H, send);
    expect(r).toMatchObject({ synced: 0, stoppedOffline: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(box.list(H)).toHaveLength(2);
  });

  it('a server error is recorded on the item and kept for retry', async () => {
    const box = new Outbox(memoryStore());
    box.enqueue(H, { date: '2026-10-27', period: 'lunch', values: egg, expectedVersion: null });
    const r = await flushOutbox(box, H, async () => {
      throw new Error('boom');
    });
    expect(r.failed).toBe(1);
    expect(box.list(H)[0]).toMatchObject({ attempts: 1, lastError: 'boom' });
  });

  it('notifies subscribers and scopes items per household', () => {
    const box = new Outbox(memoryStore());
    const listener = vi.fn();
    box.subscribe(listener);
    box.enqueue(H, { date: '2026-10-27', period: 'lunch', values: egg, expectedVersion: null });
    box.enqueue('other', { date: '2026-10-27', period: 'lunch', values: egg, expectedVersion: null });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(box.list(H)).toHaveLength(1);
    expect(box.list()).toHaveLength(2);
  });
});
