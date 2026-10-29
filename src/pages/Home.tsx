import { Link, useNavigate } from 'react-router-dom';
import { WeekStrip } from '../components/Calendar';
import { DayMeals } from '../components/DayMeals';
import { SubscriptionCard } from '../components/SubscriptionCard';
import { Card, DayTypeChip, ErrorNote, Spinner } from '../components/ui';
import { endOfWeek, formatLong, startOfWeek } from '../domain/dates';
import { getDayType } from '../domain/schedule';
import { computeStats, formatPercent } from '../domain/stats';
import { useHousehold } from '../data/household';
import { useOverrides } from '../data/meals';

export function HomePage() {
  const { today, nowMinutes } = useHousehold();
  const greeting = nowMinutes < 12 * 60 ? 'Good morning ☀️' : nowMinutes < 17 * 60 ? 'Good afternoon 🌿' : 'Good evening 🌙';
  const navigate = useNavigate();
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);
  const { map, pendingKeys, isLoading, error, refetch } = useOverrides(weekStart, weekEnd);
  const week = computeStats(weekStart, weekEnd, map, today, nowMinutes);

  return (
    <div className="space-y-5">
      <section aria-labelledby="today-heading">
        <p className="text-sm text-slate-600 dark:text-slate-300">{greeting}</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h1 id="today-heading" className="text-[1.7rem] leading-tight">
            {formatLong(today)}
          </h1>
          <DayTypeChip type={getDayType(today)} />
        </div>
      </section>

      {error ? (
        <ErrorNote error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Spinner label="Loading today's meals" />
      ) : (
        <DayMeals date={today} map={map} pendingKeys={pendingKeys} today={today} />
      )}

      <SubscriptionCard />

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-2">
          <h2 className="text-xl">This week</h2>
          <Link to="/calendar" className="rounded-lg px-2 py-1 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-slate-800">
            Calendar & history →
          </Link>
        </div>
        <WeekStrip start={weekStart} today={today} map={map} pendingKeys={pendingKeys} onSelect={(d) => navigate(`/day/${d}`)} />
        {!isLoading && !error && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            So far: <span className="font-semibold text-slate-900 dark:text-slate-50">{week.actual.delivered}</span> of {week.actual.meals} meals
            delivered ({formatPercent(week.actual.successRate)})
            {week.actual.assumedMeals > 0 && <>, {week.actual.assumedMeals} assumed</>}. {week.planned.meals} planned for later this week.
          </p>
        )}
      </Card>
    </div>
  );
}
