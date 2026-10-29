import { useQuery } from '@tanstack/react-query';
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
