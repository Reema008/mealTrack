import { createContext, useContext, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { formatLong } from '../domain/dates';
import { normalizeValues, overrideValues } from '../domain/meals';
import { getDayType, PERIOD_LABEL } from '../domain/schedule';
import type { MealValues } from '../domain/types';
import { saveMealOverride } from '../data/api';
import { useHouseholdSync, type SyncConflict } from '../data/meals';
import { useToast } from './Toast';
import { ThemeToggle } from './ThemeToggle';
import { Button } from './ui';

type SyncState = ReturnType<typeof useHouseholdSync>;
const SyncContext = createContext<SyncState | null>(null);
export const useSync = () => useContext(SyncContext)!;

const NAV = [
  { to: '/', label: 'Home', icon: 'M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z' },
  { to: '/calendar', label: 'Calendar', icon: 'M7 3v3M17 3v3M3.5 9h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 21H5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5 5Z' },
  { to: '/reports', label: 'Reports', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  {
    to: '/settings',
    label: 'Settings',
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  },
];

function SyncIndicator({ sync }: { sync: SyncState }) {
  // Nothing to show when everything is connected and saved.
  if (sync.online && !sync.syncing && !sync.pendingCount && sync.realtime !== 'offline') return null;
  let text = '';
  let dot = 'bg-amber-400';
  if (!sync.online) {
    text = sync.pendingCount ? `Offline · ${sync.pendingCount} not synced` : 'Offline';
    dot = 'bg-slate-400';
  } else if (sync.syncing) {
    text = 'Syncing…';
    dot = 'bg-amber-400 animate-pulse';
  } else if (sync.pendingCount) {
    text = `${sync.pendingCount} not synced`;
    dot = 'bg-amber-500';
  } else if (sync.realtime !== 'live') {
    text = 'Reconnecting…';
    dot = 'bg-amber-400';
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700" role="status" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {text}
    </span>
  );
}

function describe(v: MealValues, nonveg: boolean) {
  const parts = [v.deliveryStatus === 'delivered' ? 'Delivered' : 'Not received'];
  if (nonveg && v.deliveryStatus === 'delivered') parts.push(v.mainDish === 'egg' ? 'Egg' : 'Chicken', v.extraCurryReceived ? 'curries received' : 'curries not received');
  return parts.join(' · ');
}

/** Conflicts found while replaying offline edits. */
function OfflineConflictDialog({ conflict, onDone }: { conflict: SyncConflict; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const dayType = getDayType(conflict.date);
  if (dayType === 'none') return null;
  const nonveg = dayType === 'nonveg';
  const theirs = conflict.outcome.row ? normalizeValues(dayType, overrideValues(conflict.outcome.row)) : null;

  async function useMine() {
    setBusy(true);
    try {
      const r = await saveMealOverride({
        date: conflict.date,
        period: conflict.period,
        values: conflict.mine,
        expectedVersion: conflict.outcome.row?.version ?? null,
      });
      toast(r.status === 'conflict' ? 'It changed again. Please review the meal.' : 'Your offline change was saved.', r.status === 'conflict' ? 'error' : 'success');
      onDone();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center">
      <div role="alertdialog" aria-modal="true" aria-labelledby="conflict-title" className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] dark:bg-slate-900 sm:rounded-3xl">
        <h2 id="conflict-title" className="text-2xl">Someone else changed this meal</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {PERIOD_LABEL[conflict.period]} on {formatLong(conflict.date)} was changed on another phone just before your change was saved.
        </p>
        <dl className="mt-3 space-y-1 text-sm">
          <div><dt className="inline font-medium">Now saved: </dt><dd className="inline">{theirs ? describe(theirs, nonveg) : 'Standard default'}</dd></div>
          <div><dt className="inline font-medium">Your edit: </dt><dd className="inline">{describe(conflict.mine, nonveg)}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onDone} disabled={busy}>Keep theirs</Button>
          <Button onClick={useMine} disabled={busy}>{busy ? 'Saving…' : 'Use mine'}</Button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const toast = useToast();
  const sync = useHouseholdSync((n) => toast(`${n} offline change${n === 1 ? '' : 's'} synced.`));
  const conflict = sync.conflicts[0];

  return (
    <SyncContext.Provider value={sync}>
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 bg-slate-50/75 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-md dark:bg-slate-950/75">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src="./icons/icon.svg" alt="" className="taro-logo h-10 w-10 shrink-0 rounded-2xl" />
            <div className="min-w-0">
            <p className="truncate font-display text-2xl leading-none text-slate-900 dark:text-slate-50">MealTrack</p>
            <p className="truncate text-xs text-slate-600 dark:text-slate-300">Lunch & dinner tracker</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SyncIndicator sync={sync} />
            <ThemeToggle />
          </div>
        </header>
        {sync.failedItems.length > 0 && (
          <div role="alert" className="mx-4 mb-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800">
            {sync.failedItems.length} change{sync.failedItems.length === 1 ? '' : 's'} could not sync: {sync.failedItems[0].lastError}
            <Button variant="secondary" className="ml-2 min-h-8 px-3" onClick={() => void sync.flush()}>Retry</Button>
          </div>
        )}
        <main className="flex-1 px-4 pb-28 pt-2">{children}</main>
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <ul className="taro-nav mx-auto grid max-w-md grid-cols-4 gap-1 rounded-full p-1.5 shadow-soft backdrop-blur-md">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.to === '/'}
                  className={({ isActive }) =>
                    `flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-center text-[11px] font-semibold leading-tight transition-colors ${
                      isActive ? 'taro-tab text-emerald-800 dark:text-white' : 'text-slate-600 dark:text-slate-300'
                    }`
                  }
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={n.icon} />
                  </svg>
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      {conflict && <OfflineConflictDialog conflict={conflict} onDone={() => sync.dismissConflict(conflict)} />}
    </SyncContext.Provider>
  );
}
