// Drawings for your pet and its toys (taro colours only).
import { useId } from 'react';
import { BLOB, INK, LINE, speciesFor, type PetKind } from './species';

/** Things Mochi can wear or hold. */
export type Accessory = 'crown' | 'party' | 'scarf' | 'umbrella' | 'diya' | 'bill';
export type Mood = 'normal' | 'happy' | 'sad' | 'sleeping' | 'eating';


function Accessories({ wear, layer }: { wear: Accessory[]; layer: 'back' | 'front' }) {
  const has = (a: Accessory) => wear.includes(a);
  if (layer === 'back') {
    return has('umbrella') ? (
      <g>
        <path d="M50 46V12" stroke={LINE} strokeWidth="1.6" />
        <path d="M37 13a13 9 0 0 1 26 0c-2.2-1.4-4.3-1.4-6.5 0-2.2-1.4-4.3-1.4-6.5 0-2.2-1.4-4.3-1.4-6.5 0-2.2-1.4-4.3-1.4-6.5 0Z" fill="#bba6dc" stroke={LINE} strokeWidth="1.4" />
      </g>
    ) : null;
  }
  return (
    <g>
      {has('crown') && (
        <g className="pet-sparkle">
          <path d="M24 23l1.5-8 4.5 4.5 2-6.5 2 6.5 4.5-4.5 1.5 8Z" fill="#ece4f6" stroke={LINE} strokeWidth="1.4" strokeLinejoin="round" />
          <circle cx="32" cy="13" r="1.4" fill="#ab94d3" />
          <circle cx="25.5" cy="15" r="1.1" fill="#ab94d3" />
          <circle cx="38.5" cy="15" r="1.1" fill="#ab94d3" />
        </g>
      )}
      {has('party') && (
        <g>
          <path d="M32 3 25.5 22h13Z" fill="#dccdef" stroke={LINE} strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M28.5 13.5h7M27 18h10" stroke="#ab94d3" strokeWidth="1.6" />
          <circle cx="32" cy="3" r="2" fill="#ab94d3" />
        </g>
      )}
      {has('scarf') && (
        <g>
          <path d="M13.5 47q18.5 6 37 0l-.6 4.6q-18 5.8-35.8 0Z" fill="#8670ab" />
          <path d="M41 51l2.5 8 4-1.5-2-7.5Z" fill="#6e5a92" />
          <path d="M17 48.6l1 3.6M23 50l.6 3.6M29 50.8v3.6M35 50.8v3.6M41 50l-.6 3.6M47 48.6l-1 3.6" stroke="#ab94d3" strokeWidth="1" />
        </g>
      )}
      {has('diya') && (
        <g>
          <path d="M1 57h14a7 4 0 0 1-14 0Z" fill="#8670ab" stroke={INK} strokeWidth="1.2" />
          <path className="pet-flame" d="M8 56c-2.6-2.6-1.4-5.6 0-8.4 1.4 2.8 2.6 5.8 0 8.4Z" fill="#f6f2fb" stroke="#ab94d3" strokeWidth="1" />
          <circle className="pet-glow" cx="8" cy="52" r="6" fill="#ece4f6" opacity="0.35" />
        </g>
      )}
      {has('bill') && (
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
      <Accessories wear={wear} layer="back" />
      {s.back && <g className={face === 'sad' ? 'pet-ears-down' : 'pet-ears'}>{s.back(fill)}</g>}
      <path d={s.body ?? BLOB} fill={fill} stroke={LINE} strokeWidth="1.8" strokeLinejoin="round" />
      {s.feet && (
        <>
          <ellipse cx="23" cy="58.5" rx="5" ry="2.6" fill={s.feet} stroke={LINE} strokeWidth="1.4" />
          <ellipse cx="41" cy="58.5" rx="5" ry="2.6" fill={s.feet} stroke={LINE} strokeWidth="1.4" />
        </>
      )}
      {s.front?.(fill)}
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
      <Accessories wear={wear} layer="front" />
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
