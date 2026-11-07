import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { pick } from '../../lib/pet';
import { Button } from '../ui';
import { MochiSvg, Yarn } from './art';
import type { PetKind } from './species';
import { createContext, useContext } from 'react';

/** The pet playing (chosen in Settings). */
const KindContext = createContext<PetKind>('bunny');

const MOCHI = 80; // px

// ---- Best scores (this phone only) ----------------------------------------
function getBest(game: string): number {
  try {
    return Number(localStorage.getItem(`mealtrack.pet.best.${game}`)) || 0;
  } catch {
    return 0;
  }
}
function saveBest(game: string, value: number): boolean {
  if (value <= getBest(game)) return false;
  try {
    localStorage.setItem(`mealtrack.pet.best.${game}`, String(value));
  } catch {
    /* not saved */
  }
  return true;
}

// ---- Helpers --------------------------------------------------------------
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Calls `step(dt)` every animation frame while `active`. */
function useLoop(step: (dt: number) => void, active: boolean) {
  const ref = useRef(step);
  ref.current = step;
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ref.current(dt);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);
}

/** Size of the play area, kept up to date. */
function useArea() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 360, h: 560 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const point = useCallback((e: ReactPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);
  return { ref, size, point };
}

/** Mochi drawn centred on (x, y). */
function Sprite({ x, y, facing = -1, happy = false, size = MOCHI, children }: { x: number; y: number; facing?: 1 | -1; happy?: boolean; size?: number; children?: ReactNode }) {
  const kind = useContext(KindContext);
  return (
    <div className="pointer-events-none absolute left-0 top-0" style={{ width: size, height: size, transform: `translate(${x - size / 2}px, ${y - size / 2}px)` }}>
      {children}
      <div className={`h-full w-full ${happy ? 'pet-jump' : 'pet-idle'}`}>
        <div className="h-full w-full" style={{ transform: `scaleX(${facing === 1 ? -1 : 1})` }}>
          <MochiSvg kind={kind} sleeping={false} happy={happy} />
        </div>
      </div>
    </div>
  );
}

function SpeechBubble({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="pet-bubble absolute bottom-full left-1/2 mb-1 w-max max-w-[12rem] -translate-x-1/2 rounded-2xl bg-white px-3 py-1.5 text-center text-sm font-semibold text-slate-800 shadow-soft ring-1 ring-emerald-200 dark:bg-slate-800 dark:text-slate-50 dark:ring-emerald-800">
      {text}
    </div>
  );
}

/** "+3" style labels that float up and fade. */
function useSpeech() {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<number>();
  const say = useCallback((t: string, ms = 1600) => {
    setText(t);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setText(null), ms);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [text, say] as const;
}

// ---- Shell ------------------------------------------------------------------
function Shell({
  title,
  stats,
  onBack,
  onClose,
  children,
}: {
  title: string;
  stats?: ReactNode;
  onBack?: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[45] flex flex-col bg-slate-50 dark:bg-slate-950" role="dialog" aria-modal="true" aria-label={`Play with Mochi: ${title}`}>
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        {onBack ? (
          <Button variant="secondary" className="min-h-10 px-3" onClick={onBack} aria-label="Back to games">
            ←
          </Button>
        ) : (
          <span className="w-10" />
        )}
        <h2 className="min-w-0 truncate text-center text-xl">{title}</h2>
        <Button variant="secondary" className="min-h-10 px-3" onClick={onClose} aria-label="Stop playing">
          ✕
        </Button>
      </div>
      {stats && <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-4 pb-2 text-sm font-semibold">{stats}</div>}
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}

// ---- Yarn chase -------------------------------------------------------------
// Positions live in refs (changed only by the game loop and your finger); a
// frame counter re-renders the scene.
function useFrame() {
  const [, setFrame] = useState(0);
  return useCallback(() => setFrame((f) => (f + 1) % 1_000_000), []);
}

function YarnChase() {
  const { ref, size, point } = useArea();
  const redraw = useFrame();
  const mochi = useRef({ x: 80, y: 120, facing: -1 as 1 | -1 });
  const yarn = useRef({ x: 260, y: 360 });
  const dragging = useRef(false);
  const escape = useRef(0);
  const catches = useRef(0);
  const best = useRef(getBest('yarn') / 10);
  const happyUntil = useRef(0);
  const [speech, say] = useSpeech();

  useLoop((dt) => {
    const now = performance.now();
    if (now >= happyUntil.current) {
      if (dragging.current) escape.current += dt;
      const m = mochi.current;
      const dx = yarn.current.x - m.x;
      const dy = yarn.current.y - m.y;
      const d = Math.hypot(dx, dy);
      if (d < 36) {
        // Caught it!
        const time = Math.round(escape.current * 10) / 10;
        if (time > best.current) {
          best.current = time;
          saveBest('yarn', Math.round(time * 10));
        }
        escape.current = 0;
        dragging.current = false;
        catches.current += 1;
        happyUntil.current = now + 700;
        say(pick(['Got it!! ♡', 'Mine! Hehe ✦', 'Too slow! 💜', 'Again! Again!']));
        yarn.current = { x: rand(30, size.w - 30), y: rand(60, size.h - 30) };
      } else {
        const speed = Math.min(330, 150 + catches.current * 14);
        const step = Math.min(d, speed * dt);
        mochi.current = { x: m.x + (dx / d) * step, y: m.y + (dy / d) * step, facing: dx > 0 ? 1 : -1 };
      }
    }
    redraw();
  }, true);

  const grab = (e: ReactPointerEvent) => {
    dragging.current = true;
    const p = point(e);
    yarn.current = { x: Math.min(size.w - 14, Math.max(14, p.x)), y: Math.min(size.h - 14, Math.max(14, p.y)) };
  };

  return (
    <>
      <div className="absolute inset-x-0 top-0 z-10 flex justify-center gap-4 pt-1 text-sm font-semibold">
        <span>Mochi caught it: {catches.current}</span>
        <span>
          Escape {escape.current.toFixed(1)}s · Best {best.current.toFixed(1)}s
        </span>
      </div>
      <div
        ref={ref}
        className="absolute inset-0 touch-none select-none overflow-hidden"
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          grab(e);
        }}
        onPointerMove={(e) => dragging.current && grab(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <div className="pointer-events-none absolute h-10 w-10" style={{ transform: `translate(${yarn.current.x - 20}px, ${yarn.current.y - 20}px)` }}>
          <Yarn />
        </div>
        <Sprite x={mochi.current.x} y={mochi.current.y} facing={mochi.current.facing} happy={performance.now() < happyUntil.current}>
          <SpeechBubble text={speech} />
        </Sprite>
        <p className="pointer-events-none absolute inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] text-center text-sm text-slate-600 dark:text-slate-300">
          Touch and drag to move the yarn ♡
        </p>
      </div>
    </>
  );
}

/** Yarn chase: drag the yarn around while your pet chases it. */
export function PetGames({ kind, onClose }: { kind: PetKind; onClose: () => void }) {
  return (
    <KindContext.Provider value={kind}>
      <Shell title="Yarn chase" onClose={onClose}>
        <YarnChase />
      </Shell>
    </KindContext.Provider>
  );
}
