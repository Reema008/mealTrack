import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { nowInTimeZone } from '../domain/dates';
import type { ISODate } from '../domain/types';
import { fetchMembership, type Household, type Membership } from './api';
import { useSession } from './session';

export const membershipKey = (userId: string | undefined) => ['membership', userId] as const;

export function useMembership() {
  const { session } = useSession();
  const userId = session?.user.id;
  return useQuery({
    queryKey: membershipKey(userId),
    queryFn: () => fetchMembership(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
    // While waiting for approval, check every few seconds so the app opens as soon as the admin approves.
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 5_000 : false),
  });
}

interface HouseholdState {
  userId: string;
  email: string;
  membership: Membership;
  household: Household;
  isAdmin: boolean;
  /** Today's date in the household timezone; updates at local midnight. */
  today: ISODate;
  /** Minutes after local midnight (household timezone); drives the 2 PM / 10 PM cutoffs. */
  nowMinutes: number;
}

const HouseholdContext = createContext<HouseholdState | null>(null);

export function HouseholdProvider({
  membership,
  userId,
  email,
  children,
}: {
  membership: Membership;
  userId: string;
  email: string;
  children: ReactNode;
}) {
  const { date: today, minutes: nowMinutes } = useLocalNow(membership.household.timezone);
  return (
    <HouseholdContext.Provider
      value={{ userId, email, membership, household: membership.household, isAdmin: membership.role === 'admin', today, nowMinutes }}
    >
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold(): HouseholdState {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error('useHousehold must be used inside HouseholdProvider');
  return ctx;
}

/** Local date + minutes in the household timezone, refreshed every 30 s and on app focus. */
function useLocalNow(timeZone: string): { date: ISODate; minutes: number } {
  const [now, setNow] = useState(() => nowInTimeZone(timeZone));
  useEffect(() => {
    const tick = () =>
      setNow((prev) => {
        const next = nowInTimeZone(timeZone);
        return prev.date === next.date && prev.minutes === next.minutes ? prev : next;
      });
    tick();
    const id = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [timeZone]);
  return now;
}
