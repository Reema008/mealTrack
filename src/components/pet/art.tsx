// Drawings for your pet and its toys (taro colours only).
import { useId } from 'react';
import { BLOB, INK, LINE, speciesFor, type PetKind } from './species';

/** Things your pet can hold: last month's bill, in the first days of a month. */
export type Accessory = 'bill';
export type Mood = 'normal' | 'happy' | 'sad' | 'sleeping' | 'eating';

function Accessories({ wear }: { wear: Accessory[] }) {
  return (
    <g>
      {wear.includes('bill') && (
        <g transform="rotate(-12 54 44)">
          <rect x="47" y="36" width="12" height="15" rx="1.5" fill="#fbf9fc" stroke={LINE} strokeWidth="1.3" />
          <path d="M49.5 40h7M49.5 43h7M49.5 46h4.5" stroke="#ab94d3" strokeWidth="1.1" strokeLinecap="round" />
          <text x="53" y="50.2" fontSize="3.6" fontWeight="700" fill={INK} textAnchor="middle">₹</text>
        </g>
      )}
    </g>
  );
}

/**
 * Your pet, drawn in SVG: any of the species in `species.tsx`, with the same
 * moods and outfits for all. `look` (−1…1) moves the eyes toward where you
 * last tapped.
 */
export function MochiSvg({
  kind = 'bunny',
  sleeping = false,
  happy = false,
  mood,
  look = { x: 0, y: 0 },
  wear = [],
}: {
  kind?: PetKind;
  sleeping?: boolean;
  happy?: boolean;
  mood?: Mood;
  look?: { x: number; y: number };
  wear?: Accessory[];
}) {
  const s = speciesFor(kind);
  const face: Mood = mood ?? (sleeping ? 'sleeping' : happy ? 'happy' : 'normal');
  const gid = useId().replace(/:/g, '');
  const fill = `url(#pet-${gid})`;
  const ex = look.x * 1.6;
  const ey = look.y * 1.3;
  const l = 32 - s.eyeGap / 2;
  const r = 32 + s.eyeGap / 2;
  const y = s.eyeY;
  const m = s.mouthY;
  const k = s.eyeSize ?? 1;
  const closed = (dy: number, curve: number) => (
    <g stroke={INK} strokeWidth={face === 'sleeping' ? 1.8 : 2} strokeLinecap="round" fill="none">
      <path d={`M${l - 3} ${y + dy}q3 ${curve} 6 0`} />
      <path d={`M${r - 3} ${y + dy}q3 ${curve} 6 0`} />
    </g>
  );
  return (
    <svg viewBox="0 0 64 64" overflow="visible" className="h-full w-full drop-shadow-[0_6px_8px_rgba(70,58,94,0.35)]" aria-hidden>
      <defs>
        <linearGradient id={`pet-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={s.colors[0]} />
          <stop offset="1" stopColor={s.colors[1]} />
        </linearGradient>
      </defs>
      {s.back && <g className={face === 'sad' ? 'pet-ears-down' : 'pet-ears'}>{s.back(fill)}</g>}
      <path d={s.body ?? BLOB} fill={fill} stroke={LINE} strokeWidth="1.8" strokeLinejoin="round" />
      {s.feet && (
        <>
          <ellipse cx="23" cy="58.5" rx="5" ry="2.6" fill={s.feet} stroke={LINE} strokeWidth="1.4" />
          <ellipse cx="41" cy="58.5" rx="5" ry="2.6" fill={s.feet} stroke={LINE} strokeWidth="1.4" />
        </>
      )}
      {s.front?.(fill)}
      {s.hat}
      {/* eyes */}
      {face === 'sleeping' ? (
        closed(0.5, 2.4)
      ) : face === 'happy' || face === 'eating' ? (
        closed(1.5, -3.4)
      ) : (
        // Looking moves the outer layer; blinking squashes the inner one (a CSS
        // animation would replace a transform set on the same element).
        <g transform={`translate(${ex} ${ey})`}>
          <g className="pet-eyes" fill={s.eyeColor ?? '#2d2540'} style={{ transformOrigin: `32px ${y}px` }}>
            <ellipse cx={l} cy={y} rx={2.7 * k} ry={(face === 'sad' ? 2.9 : 3.3) * k} />
            <ellipse cx={r} cy={y} rx={2.7 * k} ry={(face === 'sad' ? 2.9 : 3.3) * k} />
            <circle cx={l + k} cy={y - 1.2 * k} r={0.9 * k} fill={s.eyeColor ? '#2d2540' : '#fff'} />
            <circle cx={r + k} cy={y - 1.2 * k} r={0.9 * k} fill={s.eyeColor ? '#2d2540' : '#fff'} />
            {k > 1 && (
              <>
                <circle cx={l - 0.9} cy={y + 1.4} r="0.55" fill="#fff" />
                <circle cx={r - 0.9} cy={y + 1.4} r="0.55" fill="#fff" />
              </>
            )}
          </g>
        </g>
      )}
      {face === 'sad' && (
        <g stroke={INK} strokeWidth="1.3" strokeLinecap="round" fill="none">
          {/* worried brows: inner ends raised */}
          <path d={`M${l - 3.5} ${y - 2.9}l5-1.6M${r + 3.5} ${y - 2.9}l-5-1.6`} />
          <path d={`M${l - 2.5} ${y + 4}q-.8 2.4.4 3.2`} stroke="#ab94d3" strokeWidth="1.4" />
        </g>
      )}
      {/* cheeks */}
      <ellipse cx="18.5" cy={s.cheekY} rx="3.6" ry="2.2" fill="#f3b8cf" opacity="0.75" />
      <ellipse cx="45.5" cy={s.cheekY} rx="3.6" ry="2.2" fill="#f3b8cf" opacity="0.75" />
      {s.face}
      {/* mouth */}
      {face === 'eating' ? (
        <ellipse className="pet-chew" cx="32" cy={m + 1} rx="2.6" ry="2.2" fill="#6e5a92" style={{ transformOrigin: `32px ${m + 1}px` }} />
      ) : face === 'sad' ? (
        <path d={`M29 ${m + 2}q3-2.6 6 0`} stroke={INK} strokeWidth="1.6" strokeLinecap="round" fill="none" />
      ) : (
        <path
          d={face === 'happy' ? `M28.5 ${m - 0.5}q3.5 4 7 0` : `M29.5 ${m}q2.5 2 5 0`}
          stroke={INK}
          strokeWidth="1.6"
          strokeLinecap="round"
          fill={face === 'happy' ? '#f3b8cf' : 'none'}
        />
      )}
      <Accessories wear={wear} />
    </svg>
  );
}

/** A taro ball of yarn. */
export function Yarn() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#bba6dc" stroke="#6e5a92" strokeWidth="1.6" />
      <path d="M4 9c5 1 11 6 13 12M7 4.5c4 3 8 9 9 15M3 14c4 0 9 3 11 7M12 2c2 4 3 9 2 14" fill="none" stroke="#6e5a92" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
