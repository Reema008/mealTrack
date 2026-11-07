import { useQuery } from '@tanstack/react-query';
import { subscriptionMonths } from '../domain/subscription';
import type { ISODate } from '../domain/types';
import { fetchSubscriptions } from './api';
import { useHousehold } from './household';

export const subscriptionsKey = (householdId: string) => ['subscriptions', householdId] as const;

/** All recorded subscription renewals for this MealTrack, oldest first. */
export function useSubscriptions() {
  const { household } = useHousehold();
  return useQuery({
    queryKey: subscriptionsKey(household.id),
    queryFn: () => fetchSubscriptions(household.id),
    staleTime: 30_000,
  });
}

export interface SubscribedRange {
  /** First day of the first subscribed month (the first recorded payment). */
  first: ISODate;
  /** Last day of this month, or of a later month already paid for. */
  last: ISODate;
  /** False while payments are loading (the range is then just this month). */
  ready: boolean;
  inRange: (d: ISODate) => boolean;
  /** The nearest date inside the range (unchanged while loading). */
  clamp: (d: ISODate) => ISODate;
}

/** The dates the app shows: only the subscribed months. */
export function useSubscribedRange(): SubscribedRange {
  const { today, billing } = useHousehold();
  const subs = useSubscriptions();
  const months = subscriptionMonths(subs.data ?? [], today, billing.billingDay); // newest first
  const first = months[months.length - 1].start;
  const last = months[0].end;
  const ready = !subs.isLoading;
  return {
    first,
    last,
    ready,
    inRange: (d) => !ready || (d >= first && d <= last),
    clamp: (d) => (!ready ? d : d < first ? first : d > last ? last : d),
  };
}
