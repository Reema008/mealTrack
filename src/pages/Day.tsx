import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { DayMeals } from '../components/DayMeals';
import { Button, DayTypeChip, ErrorNote, Spinner } from '../components/ui';
import { addDays, formatLong, isISODate } from '../domain/dates';
import { getDayType } from '../domain/schedule';
import { useHousehold } from '../data/household';
import { useOverrides } from '../data/meals';
import { useSubscribedRange } from '../data/subscriptions';

/** Detail view for a single date (also the target of reminder notifications). */
export function DayPage() {
  const { date = '' } = useParams();
  const { today } = useHousehold();
  const navigate = useNavigate();
  const valid = isISODate(date);
  const { map, pendingKeys, isLoading, error, refetch } = useOverrides(valid ? date : today, valid ? date : today);
  const range = useSubscribedRange();
  if (!valid) return <Navigate to="/" replace />;
  // Only days inside the subscription: go to the nearest one.
  if (!range.inRange(date)) return <Navigate to={`/day/${range.clamp(date)}`} replace />;
  const canPrev = range.inRange(addDays(date, -1));
  const canNext = range.inRange(addDays(date, 1));

  const timing = date < today ? 'Past date' : date > today ? 'Future date · planned meals' : 'Today';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" disabled={!canPrev} onClick={() => navigate(`/day/${addDays(date, -1)}`)} aria-label="Previous day">
          ←
        </Button>
        <div className="min-w-0 text-center">
          <h1 className="text-lg font-semibold">{formatLong(date)}</h1>
          <p className="text-xs text-slate-600 dark:text-slate-300">{timing}</p>
        </div>
        <Button variant="secondary" disabled={!canNext} onClick={() => navigate(`/day/${addDays(date, 1)}`)} aria-label="Next day">
          →
        </Button>
      </div>
      <div className="flex justify-center">
        <DayTypeChip type={getDayType(date)} />
      </div>
      {error ? (
        <ErrorNote error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Spinner />
      ) : (
        <DayMeals date={date} map={map} pendingKeys={pendingKeys} today={today} />
      )}
      <div className="flex flex-wrap justify-center gap-2 text-sm">
        {date !== today && (
          <Link to={`/day/${today}`} className="rounded-lg px-3 py-2 font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-slate-800">
            Go to today
          </Link>
        )}
        <Link to={`/calendar?month=${date.slice(0, 7)}`} className="rounded-lg px-3 py-2 font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-slate-800">
          Open in calendar
        </Link>
      </div>
    </div>
  );
}
