import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { billingPeriodFor, computeBill, shiftPeriod, type BillingPeriod } from '../domain/billing';
import { addDays } from '../domain/dates';
import { mealsForDate } from '../domain/meals';
import { formatAmount } from '../domain/subscription';
import { useHousehold } from '../data/household';
import { useOverrides } from '../data/meals';
import { idleLine, pick, SLEEPY_LINES, TAP_LINES, usePetEnabled, usePetKind } from '../lib/pet';
import {
  addHappiness,
  happinessNow,
  loadMemory,
  menuLine,
  MISSED_YOU_HOURS,
  saveMemory,
  SEASON_LINES,
  seasonFor,
  dayOutcome,
  deliveryWeekStart,
  hasCrown,
  STREAK_GOAL,
  streakFrom,
  type PetMemory,
} from '../lib/petLife';
import { BillSheet, periodTitle } from './BillSheet';
import { MochiSvg, type Accessory, type Mood } from './pet/art';
import { PetGames } from './pet/PetGames';
import { speciesFor } from './pet/species';

const SIZE = 84; // px
const WALK_SPEED = 70; // px per second
const DOUBLE_TAP_MS = 280;
const LONG_PRESS_MS = 550;
/** Space kept clear for the top bar and the bottom menu. */
const TOP_GAP = 76;
const BOTTOM_GAP = 100;
/** Days at the start of a month when Mochi carries last month's bill. */
const BILL_DAYS = 3;

type Mode = 'idle' | 'walk' | 'happy' | 'eating' | 'roll';
interface Bubble {
  text: string;
  action?: { label: string; run: () => void };
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const randomBetween = (a: number, b: number) => a + Math.random() * (b - a);

function bounds() {
  const w = typeof window === 'undefined' ? 390 : window.innerWidth;
  const h = typeof window === 'undefined' ? 800 : window.innerHeight;
  return { minX: 8, maxX: Math.max(8, w - SIZE - 8), minY: TOP_GAP, maxY: Math.max(TOP_GAP, h - BOTTOM_GAP - SIZE) };
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs font-semibold">
        <span>{label}</span>
        <span className="tabular-nums">{value}%</span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/70 dark:bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-emerald-500" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/**
 * Mochi, a little pet who wanders around the screen and lives with your meals:
 * delivered meals feed it, cancelled ones make it sad, checking in every
 * delivery day builds a streak (a crown at 6 days), and it dresses up for the
 * season. Tap to pet (and hear today's menu), hold for its moods, rub in
 * circles for a belly rub, drag to move, double-tap for yarn chase.
 */
export function Pet() {
  const [enabled] = usePetEnabled();
  const [kind] = usePetKind();
  const petName = speciesFor(kind).name;
  const { today, nowMinutes, billing } = useHousehold();
  const { pathname } = useLocation();

  // Today's meals: feeding, moods and the menu.
  const { map } = useOverrides(today, today);
  const meals = mealsForDate(today, map, today, nowMinutes);
  const pendingLunch = meals.some((m) => m.period === 'lunch' && m.timing === 'pending');
  const pendingDinner = meals.some((m) => m.period === 'dinner' && m.timing === 'pending');
  const fed = meals.filter((m) => m.deliveryStatus === 'delivered' && (m.timing === 'today' || m.source === 'explicit'));
  const cancelled = meals.filter((m) => m.deliveryStatus === 'not_received');
  const tummy = meals.length === 0 ? 100 : Math.round((fed.length / meals.length) * 100);

  // Last month's bill, carried in the first days of a new month.
  const current = billingPeriodFor(today, billing.billingDay);
  const day = Number(today.slice(8, 10)) - Number(current.start.slice(8, 10)) + 1;
  const billTime = day >= 1 && day <= BILL_DAYS;
  const previous = shiftPeriod(current, -1, billing.billingDay);
  const lastMonth = useOverrides(billTime ? previous.start : today, billTime ? previous.end : today);
  const lastBill = billTime ? computeBill(previous.start, previous.end, lastMonth.map, today, nowMinutes, billing) : null;

  const [memory, setMemory] = useState<PetMemory>(() => loadMemory());
  // Delivery streak: this week and last week (for the crown).
  const weekStart = deliveryWeekStart(today);
  const weeks = useOverrides(addDays(weekStart, -7), addDays(weekStart, 5));
  const outcome = (d: string) => dayOutcome(d, weeks.map, today, nowMinutes);
  const streak = weeks.isLoading ? 0 : streakFrom(outcome, today);
  const crown = !weeks.isLoading && hasCrown(outcome, today);
  const happiness = happinessNow(memory);
  const season = seasonFor(today);
  const sleepyTime = nowMinutes >= 23 * 60 || nowMinutes < 6 * 60;

  const [box, setBox] = useState(bounds);
  const [pos, setPos] = useState(() => ({ x: bounds().maxX, y: bounds().maxY }));
  const [duration, setDuration] = useState(0);
  const [facing, setFacing] = useState<1 | -1>(-1);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<Mode>('idle');
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [hearts, setHearts] = useState<number[]>([]);
  const [confetti, setConfetti] = useState(false);
  const [awake, setAwake] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState(false);
  const [billOpen, setBillOpen] = useState<BillingPeriod | null>(null);

  const posRef = useRef(pos);
  posRef.current = pos;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const bubbleTimer = useRef<number>();
  const tapTimer = useRef<number>();
  const pressTimer = useRef<number>();
  const lookTimer = useRef<number>();
  const lastTap = useRef(0);
  const drag = useRef<{ sx: number; sy: number; px: number; py: number; lx: number; ly: number; path: number; moved: boolean; done: boolean } | null>(null);
  const sleepy = sleepyTime && !awake;
  const context = { name: petName, route: pathname, nowMinutes, pendingLunch, pendingDinner, sleepy };
  const contextRef = useRef(context);
  contextRef.current = context;

  const say = useCallback((text: string, ms = 4200, action?: Bubble['action']) => {
    setBubble({ text, action });
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), action ? ms + 3000 : ms);
  }, []);

  const cheer = useCallback((delta: number) => {
    setMemory((m) => addHappiness(m, delta));
  }, []);

  const moveTo = useCallback((tx: number, ty: number, speed: number) => {
    const { x, y } = posRef.current;
    const dist = Math.hypot(tx - x, ty - y);
    if (Math.abs(tx - x) > 2) setFacing(tx > x ? 1 : -1);
    if (dist < 2 || reducedMotion()) {
      setDuration(0);
      setPos({ x: tx, y: ty });
      return false;
    }
    setDuration(dist / speed);
    setPos({ x: tx, y: ty });
    return true;
  }, []);

  // Remember Mochi between visits.
  useEffect(() => saveMemory(memory), [memory]);

  // Welcome back after a long time away.
  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    const before = loadMemory(now);
    const away = (now - before.lastSeen) / 3_600_000;
    setMemory({ ...before, lastSeen: now });
    if (away <= MISSED_YOU_HOURS) return;
    const timer = window.setTimeout(() => {
      say('I missed you! ♡ Where did you go?', 4500);
      setMemory((m) => addHappiness(m, 15));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [enabled, today, say]);

  // A full week of deliveries (Mon–Sat): confetti and a crown, once per week.
  useEffect(() => {
    if (!enabled || streak < STREAK_GOAL || memory.celebrated === weekStart) return;
    const timer = window.setTimeout(() => {
      setConfetti(true);
      window.setTimeout(() => setConfetti(false), 2600);
      say("Food came every day, Monday to Saturday! ✦ Here's your crown!", 5000);
      setMemory((m) => addHappiness({ ...m, celebrated: weekStart }, 20));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [enabled, streak, weekStart, memory.celebrated, say]);

  // Meals marked delivered feed Mochi; a cancelled meal makes it sad.
  const fedCount = useRef<number | null>(null);
  const cancelledCount = useRef<number | null>(null);
  const lastFedPeriod = fed[fed.length - 1]?.period;
  useEffect(() => {
    if (!enabled) return;
    const prevFed = fedCount.current;
    const prevCancelled = cancelledCount.current;
    fedCount.current = fed.length;
    cancelledCount.current = cancelled.length;
    if (prevFed === null || prevCancelled === null) return;
    if (fed.length > prevFed) {
      const meal = lastFedPeriod === 'dinner' ? 'dinner' : 'lunch';
      setMode('eating');
      say(pick([`Nom nom! Thanks for ${meal} ♡`, `Yummy ${meal}! ✦`, 'My tummy is happy ♡']), 3200);
      cheer(10);
      window.setTimeout(() => setMode((m) => (m === 'eating' ? 'idle' : m)), 1800);
    } else if (cancelled.length > prevCancelled) {
      say(pick(['Aww… no meal this time ♡', 'My tummy is sad…', 'Cancelled? Hug me? ♡']), 3600);
    }
  }, [enabled, fed.length, cancelled.length, lastFedPeriod, say, cheer]);

  // In the first days of a month, show last month's bill (once per page).
  const billSummary = lastBill
    ? `${periodTitle(previous, billing.billingDay)}: ${lastBill.missedMeals.length} cancelled · ${formatAmount(lastBill.nextAmount)} for ${periodTitle(current, billing.billingDay)} ✦`
    : null;
  const billSummaryRef = useRef(billSummary);
  billSummaryRef.current = billSummary;
  const previousRef = useRef(previous);
  previousRef.current = previous;
  useEffect(() => {
    if (!enabled || !billTime) return;
    const id = window.setTimeout(() => {
      if (billSummaryRef.current) say(billSummaryRef.current, 5500, { label: 'See the bill', run: () => setBillOpen(previousRef.current) });
    }, 2500);
    return () => window.clearTimeout(id);
  }, [enabled, billTime, pathname, say]);

  // Stay on screen when the phone is rotated or the window resized.
  useEffect(() => {
    const onResize = () => setBox(bounds());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    setPos((p) => ({ x: Math.min(Math.max(p.x, box.minX), box.maxX), y: Math.min(Math.max(p.y, box.minY), box.maxY) }));
  }, [box]);

  // Look toward wherever you tap on the screen.
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: PointerEvent) => {
      const cx = posRef.current.x + SIZE / 2;
      const cy = posRef.current.y + SIZE / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const d = Math.hypot(dx, dy) || 1;
      if (d < SIZE / 2) return;
      setLook({ x: dx / d, y: dy / d });
      if (Math.abs(dx) > 20 && modeRef.current === 'idle') setFacing(dx > 0 ? 1 : -1);
      window.clearTimeout(lookTimer.current);
      lookTimer.current = window.setTimeout(() => setLook({ x: 0, y: 0 }), 2500);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [enabled]);

  // Wander anywhere on the screen now and then.
  useEffect(() => {
    if (!enabled || playing || status || sleepy || reducedMotion()) return;
    const id = window.setInterval(() => {
      if (modeRef.current !== 'idle' || drag.current) return;
      if (Math.random() < 0.6) {
        const b = bounds();
        if (moveTo(Math.round(randomBetween(b.minX, b.maxX)), Math.round(randomBetween(b.minY, b.maxY)), WALK_SPEED)) setMode('walk');
      }
    }, 4200);
    return () => window.clearInterval(id);
  }, [enabled, playing, status, sleepy, moveTo]);

  // Chat every so often, and say something on a new page.
  useEffect(() => {
    if (!enabled || playing) return;
    const id = window.setInterval(() => {
      const extra = season && Math.random() < 0.3 ? pick(SEASON_LINES[season]) : null;
      say(extra ?? idleLine(contextRef.current));
    }, randomBetween(28_000, 42_000));
    return () => window.clearInterval(id);
  }, [enabled, playing, season, say]);
  useEffect(() => {
    if (!enabled) return;
    const id = window.setTimeout(() => Math.random() < 0.6 && say(idleLine(contextRef.current)), 1200);
    return () => window.clearTimeout(id);
  }, [enabled, pathname, say]);

  // Woken up at night: plays for a minute, then dozes off again.
  useEffect(() => {
    if (!awake) return;
    const id = window.setTimeout(() => setAwake(false), 60_000);
    return () => window.clearTimeout(id);
  }, [awake]);

  useEffect(
    () => () => {
      window.clearTimeout(bubbleTimer.current);
      window.clearTimeout(lookTimer.current);
    },
    [],
  );

  if (!enabled) return null;
  if (playing)
    return (
      <PetGames
        kind={kind}
        onClose={() => {
          setPlaying(false);
          cheer(10);
          say('That was fun! ♡', 2500);
        }}
      />
    );

  function petIt() {
    if (sleepy) {
      setAwake(true);
      say(pick(SLEEPY_LINES), 2600);
      return;
    }
    setMode('happy');
    setHearts((h) => [...h, Date.now()]);
    cheer(6);
    // Often tell you what's on today.
    say(Math.random() < 0.45 ? menuLine(meals) : pick(TAP_LINES), 3600);
    window.setTimeout(() => setMode((m) => (m === 'happy' ? 'idle' : m)), 900);
  }

  function bellyRub() {
    setMode('roll');
    setHearts((h) => [...h, Date.now(), Date.now() + 1]);
    cheer(15);
    say(pick(['Hehehe! Belly rubs! ♡', 'Hihihi that tickles!! ✦', '*rolls over* more please ♡']), 3000);
    window.setTimeout(() => setMode((m) => (m === 'roll' ? 'idle' : m)), 1100);
  }

  function openGames() {
    setAwake(true);
    setBubble(null);
    setPlaying(true);
  }

  function onPointerDown(e: ReactPointerEvent) {
    drag.current = { sx: e.clientX, sy: e.clientY, px: posRef.current.x, py: posRef.current.y, lx: e.clientX, ly: e.clientY, path: 0, moved: false, done: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      if (drag.current && !drag.current.moved) {
        drag.current.done = true;
        setStatus(true);
      }
    }, LONG_PRESS_MS);
  }
  function onPointerMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d || d.done) return;
    d.path += Math.hypot(e.clientX - d.lx, e.clientY - d.ly);
    d.lx = e.clientX;
    d.ly = e.clientY;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    // Rubbing in small circles: lots of finger movement, but staying on Mochi.
    if (d.path > 140 && Math.hypot(dx, dy) < 44) {
      d.done = true;
      window.clearTimeout(pressTimer.current);
      setPos({ x: d.px, y: d.py });
      bellyRub();
      return;
    }
    if (Math.hypot(dx, dy) > 6) {
      d.moved = true;
      window.clearTimeout(pressTimer.current);
    }
    if (!d.moved || d.path < 60) return;
    const b = bounds();
    setDuration(0);
    if (Math.abs(dx) > 2) setFacing(dx > 0 ? 1 : -1);
    setPos({ x: Math.min(b.maxX, Math.max(b.minX, d.px + dx)), y: Math.min(b.maxY, Math.max(b.minY, d.py + dy)) });
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    window.clearTimeout(pressTimer.current);
    if (!d || d.done) return;
    if (d.moved) {
      if (d.path >= 60) say('Wheee! ✦', 1800);
      return;
    }
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      window.clearTimeout(tapTimer.current);
      lastTap.current = 0;
      openGames();
    } else {
      lastTap.current = now;
      tapTimer.current = window.setTimeout(petIt, DOUBLE_TAP_MS);
    }
  }

  // Face: asleep at night, eating, happy, sad (cancelled meal or lonely), or normal.
  const mood: Mood =
    sleepy && mode !== 'happy'
      ? 'sleeping'
      : mode === 'eating'
        ? 'eating'
        : mode === 'happy' || mode === 'roll'
          ? 'happy'
          : cancelled.length > 0 || happiness < 25
            ? 'sad'
            : 'normal';
  const wear: Accessory[] = [];
  if (crown && season !== 'newyear') wear.push('crown');
  if (season === 'newyear') wear.push('party');
  if (season === 'winter') wear.push('scarf');
  if (season === 'monsoon') wear.push('umbrella');
  if (season === 'diwali') wear.push('diya');
  if (lastBill) wear.push('bill');

  const bubbleBelow = pos.y < TOP_GAP + 80;
  const bubbleOnLeft = pos.x > box.maxX / 2;

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-20" aria-live="polite">
        {confetti && (
          <div className="absolute inset-0 overflow-hidden" aria-hidden>
            {Array.from({ length: 28 }, (_, i) => (
              <span
                key={i}
                className="pet-confetti absolute top-0 h-2.5 w-1.5 rounded-sm"
                style={{
                  left: `${(i * 37) % 100}%`,
                  animationDelay: `${(i % 7) * 0.12}s`,
                  background: ['#8670ab', '#ab94d3', '#dccdef', '#bba6dc', '#6e5a92'][i % 5],
                }}
              />
            ))}
          </div>
        )}
        <div
          className="absolute left-0 top-0"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px)`,
            transition: duration ? `transform ${duration}s ease-in-out` : 'none',
            width: SIZE,
            height: SIZE,
          }}
          onTransitionEnd={() => modeRef.current === 'walk' && setMode('idle')}
        >
          {bubble && (
            <div
              className={`pet-bubble absolute w-max max-w-[15rem] rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-soft ring-1 ring-emerald-200 dark:bg-slate-800 dark:text-slate-50 dark:ring-emerald-800 ${
                bubbleBelow ? 'top-full mt-2' : 'bottom-full mb-2'
              } ${bubbleOnLeft ? 'right-0' : 'left-0'} ${bubble.action ? 'pointer-events-auto' : ''}`}
              role="status"
            >
              {bubble.text}
              {bubble.action && (
                <button
                  type="button"
                  className="btn-taro mt-2 block w-full rounded-full px-3 py-1.5 text-xs font-bold"
                  onClick={() => {
                    bubble.action!.run();
                    setBubble(null);
                  }}
                >
                  {bubble.action.label}
                </button>
              )}
            </div>
          )}
          {hearts.map((id, i) => (
            <span
              key={id}
              className="pet-heart absolute left-1/2 top-0 text-lg text-emerald-500"
              style={{ marginLeft: (i % 3) * 10 - 10 }}
              onAnimationEnd={() => setHearts((h) => h.filter((v) => v !== id))}
              aria-hidden
            >
              ♥
            </span>
          ))}
          {season === 'winter' &&
            [0, 1, 2, 3].map((i) => (
              <span key={i} className="pet-snow absolute text-xs text-emerald-200" style={{ left: `${i * 26}%`, animationDelay: `${i * 0.7}s` }} aria-hidden>
                ✦
              </span>
            ))}
          {mood === 'sleeping' && (
            <span className="pet-zzz absolute -top-3 right-0 text-base font-bold text-emerald-500" aria-hidden>
              z<span className="text-xs">z</span>
            </span>
          )}
          <button
            type="button"
            aria-label={`${petName}, your MealTrack pet. Tap to pet, hold to see its mood, rub in circles for a belly rub, double-tap to play yarn chase, drag to move.`}
            className={`pointer-events-auto block h-full w-full touch-none select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${
              mode === 'roll' ? 'pet-rollover' : mode === 'happy' ? 'pet-jump' : mode === 'walk' ? 'pet-walk' : mood === 'sleeping' ? 'pet-sleep' : 'pet-idle'
            }`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              drag.current = null;
              window.clearTimeout(pressTimer.current);
            }}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                petIt();
              }
              if (e.key === 'g') openGames();
              if (e.key === 's') setStatus(true);
            }}
          >
            {/* Flipped on its own layer so it does not fight the hop animation. */}
            <span className="block h-full w-full" style={{ transform: `scaleX(${facing === 1 ? -1 : 1})` }}>
              <MochiSvg kind={kind} mood={mood} look={{ x: look.x * facing * -1, y: look.y }} wear={wear} />
            </span>
          </button>
        </div>
      </div>

      {status && (
        <div
          className="fixed inset-0 z-[45] flex items-end justify-center p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal="true"
          aria-label={`${petName}’s mood`}
        >
          <button type="button" className="absolute inset-0 bg-slate-900/30" aria-label="Close" onClick={() => setStatus(false)} />
          <div className="taro-card relative w-full max-w-xs space-y-3 rounded-[1.6rem] p-5">
            <div className="flex items-center gap-3">
              <div className="pet-idle h-16 w-16 shrink-0">
                <MochiSvg kind={kind} mood={mood === 'sleeping' ? 'sleeping' : mood === 'sad' ? 'sad' : 'happy'} wear={wear} />
              </div>
              <div className="min-w-0">
                <p className="font-display text-xl">{petName}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {mood === 'sad' ? 'A little sad… pet me? ♡' : mood === 'sleeping' ? 'Sleepy… zzz' : 'Feeling great ♡'}
                </p>
              </div>
            </div>
            <Meter label="Happiness" value={happiness} />
            <Meter label="Tummy" value={tummy} />
            <div className="taro-inset rounded-2xl p-2.5 text-sm">
              <p className="font-semibold">
                Delivery streak: {streak} of {STREAK_GOAL} days this week {crown ? '♛' : ''}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {streak >= STREAK_GOAL
                  ? 'Food came every day this week! Crown earned ♡ It stays all next week too.'
                  : `A day counts when both lunch and dinner are delivered (Mon–Sat). A cancelled meal starts it again. ${STREAK_GOAL - streak} more for a crown.${crown ? ' Wearing last week’s crown ♛' : ''}`}
              </p>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">{menuLine(meals)}</p>
            <button type="button" className="btn-taro w-full rounded-full px-4 py-2 text-sm font-bold" onClick={() => setStatus(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {billOpen && <BillSheet initial={billOpen} onClose={() => setBillOpen(null)} />}
    </>
  );
}
