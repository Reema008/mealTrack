import { describe, expect, it, vi } from 'vitest';
import { subscribeToHouseholdMeals } from '../../src/data/realtime';

type Handler = (payload: unknown) => void;

function mockClient() {
  const handlers: Array<{ filter: Record<string, string>; cb: Handler }> = [];
  let statusCb: (s: string) => void = () => {};
  const channel = {
    on(_type: string, filter: Record<string, string>, cb: Handler) {
      handlers.push({ filter, cb });
      return channel;
    },
    subscribe(cb: (s: string) => void) {
      statusCb = cb;
      return channel;
    },
  };
  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => 'ok'),
  };
  return {
    client,
    channel,
    handlers,
    emit: (event: string) => handlers.filter((h) => h.filter.event === event).forEach((h) => h.cb({})),
    status: (s: string) => statusCb(s),
  };
}

describe('12. realtime sync', () => {
  it('subscribes to this household only and refetches when another member edits', () => {
    const m = mockClient();
    const onChange = vi.fn();
    const states: string[] = [];
    subscribeToHouseholdMeals(m.client as never, 'h-123', onChange, (s) => states.push(s));

    expect(m.client.channel).toHaveBeenCalledWith('meal_overrides:h-123');
    const filtered = m.handlers.filter((h) => h.filter.event !== 'DELETE');
    expect(filtered.every((h) => h.filter.filter === 'household_id=eq.h-123')).toBe(true);

    m.status('SUBSCRIBED');
    expect(states).toEqual(['connecting', 'live']);
    expect(onChange).toHaveBeenCalledTimes(1); // refetch on (re)connect

    m.emit('UPDATE');
    m.emit('INSERT');
    m.emit('DELETE');
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it('reports disconnection and unsubscribes on cleanup', () => {
    const m = mockClient();
    const states: string[] = [];
    const stop = subscribeToHouseholdMeals(m.client as never, 'h-1', () => {}, (s) => states.push(s));
    m.status('CHANNEL_ERROR');
    expect(states.at(-1)).toBe('offline');
    stop();
    expect(m.client.removeChannel).toHaveBeenCalledWith(m.channel);
  });
});
