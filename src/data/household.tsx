import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { todayInTimeZone } from '../domain/dates';
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
  const today = useToday(membership.household.timezone);
  return (
    <HouseholdContext.Provider
      value={{ userId, email, membership, household: membership.household, isAdmin: membership.role === 'admin', today }}
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

function useToday(timeZone: string): ISODate {
  const [today, setToday] = useState(() => todayInTimeZone(timeZone));
  useEffect(() => {
    const tick = () => setToday(todayInTimeZone(timeZone));
    tick();
    const id = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [timeZone]);
  return today;
}
