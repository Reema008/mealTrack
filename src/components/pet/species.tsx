// The pets you can choose from, drawn on a 64×64 canvas in taro colours.
// Each one shares the same face (eyes, cheeks, mouth) so moods work for all.
import type { ReactNode } from 'react';

export type PetKind = 'bunny' | 'kitty' | 'panda' | 'bao' | 'ghost' | 'chick' | 'hamster' | 'bear' | 'penguin' | 'axolotl' | 'lamb' | 'puppy';

export const LINE = '#8670ab';
export const INK = '#463a5e';
const DEEP = '#6e5a92';
const PINK = '#f3c9dc';
const BLUSH = '#f3b8cf';

export const BLOB = 'M32 21c13 0 22 9 22 21 0 10-8 17-22 17S10 52 10 42c0-12 9-21 22-21Z';

export interface Species {
  id: PetKind;
  name: string;
  kind: string;
  about: string;
  /** Body gradient: top and bottom colour. */
  colors: [string, string];
  /** Body outline (defaults to the round blob). */
  body?: string;
  /** Foot colour, or null for no feet (the ghost floats). */
  feet: string | null;
  eyeY: number;
  eyeGap: number;
  /** Eye colour (light on dark patches for the panda). */
  eyeColor?: string;
  /** Eye scale (1 = normal); big eyes also get a second sparkle. */
  eyeSize?: number;
  cheekY: number;
  mouthY: number;
  /** Ears, tail and other parts behind the body. `fill` is the body gradient. */
  back?: (fill: string) => ReactNode;
  /** Patches and fur on the body, under the face. */
  front?: (fill: string) => ReactNode;
  /** Noses, beaks and whiskers on top of the face. */
  face?: ReactNode;
}

export const SPECIES: Species[] = [
  {
    id: 'bunny',
    name: 'Mochi',
    kind: 'Bunny',
    about: 'Soft, bouncy and a little dramatic.',
    colors: ['#efe6f9', '#c9b6e6'],
    feet: '#c9b6e6',
    eyeY: 38.5,
    eyeGap: 16,
    cheekY: 44,
    mouthY: 44.5,
    back: (fill) => (
      <>
        <path d="M20 26C14 16 15 4 21 3c5-1 7 10 7 21Z" fill={fill} stroke={LINE} strokeWidth="1.6" />
        <path d="M21.5 22c-3-7-2.5-14 0-15 2.5-.5 3.5 7 3.5 14Z" fill={PINK} opacity="0.8" />
        <path d="M44 26c6-10 5-22-1-23-5-1-7 10-7 21Z" fill={fill} stroke={LINE} strokeWidth="1.6" />
        <path d="M42.5 22c3-7 2.5-14 0-15-2.5-.5-3.5 7-3.5 14Z" fill={PINK} opacity="0.8" />
      </>
    ),
  },
  {
    id: 'kitty',
    name: 'Taro Kitty',
    kind: 'Cat',
    about: 'Sleepy and curious; bats the yarn with its paw.',
    colors: ['#efe6f9', '#c9b6e6'],
    feet: '#c9b6e6',
    eyeY: 38.5,
    eyeGap: 16,
    cheekY: 44,
    mouthY: 45,
    back: (fill) => (
      <>
        <path d="M50 50c8 0 10-10 5-14" fill="none" stroke={LINE} strokeWidth="3.2" strokeLinecap="round" />
        <path d="M14 30 15 12 28 22Z" fill={fill} stroke={LINE} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M17 24 17.5 16 24 21Z" fill={PINK} />
        <path d="M50 30 49 12 36 22Z" fill={fill} stroke={LINE} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M47 24 46.5 16 40 21Z" fill={PINK} />
      </>
    ),
    face: (
      <>
        <path d="M30.5 42.3h3l-1.5 1.6Z" fill={DEEP} />
        <path d="M8 41h7M8.5 45l7-1.5M56 41h-7M55.5 45l-7-1.5" stroke={LINE} strokeWidth="1.1" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: 'panda',
    name: 'Boba Panda',
    kind: 'Panda',
    about: 'Chubby, loves bubble tea and naps after dinner.',
    colors: ['#f6f2fb', '#dccdef'],
    feet: DEEP,
    eyeY: 38.5,
    eyeGap: 15,
    eyeColor: '#f6f2fb',
    cheekY: 47,
    mouthY: 46.5,
    back: () => (
      <>
        <circle cx="17" cy="24" r="7" fill={DEEP} stroke={LINE} strokeWidth="1.4" />
        <circle cx="47" cy="24" r="7" fill={DEEP} stroke={LINE} strokeWidth="1.4" />
      </>
    ),
    front: () => (
      <>
        <ellipse cx="24" cy="38.5" rx="5.2" ry="6.2" transform="rotate(-18 24 38.5)" fill={DEEP} />
        <ellipse cx="40" cy="38.5" rx="5.2" ry="6.2" transform="rotate(18 40 38.5)" fill={DEEP} />
      </>
    ),
    face: <ellipse cx="32" cy="44" rx="2" ry="1.4" fill={INK} />,
  },
  {
    id: 'bao',
    name: 'Bao',
    kind: 'Dumpling',
    about: 'A steamed bun with a face, very proud of it.',
    colors: ['#fbf9fc', '#e8e1ef'],
    body: 'M32 15c16 0 24 12 24 25 0 11-9 18-24 18S8 51 8 40c0-13 8-25 24-25Z',
    feet: null,
    eyeY: 40,
    eyeGap: 18,
    cheekY: 46,
    mouthY: 46.5,
    back: () => <path d="M27 10c-2-3 2-5 0-8M33 9c-2-3 2-5 0-8M39 10c-2-3 2-5 0-8" fill="none" stroke="#ab94d3" strokeWidth="1.6" strokeLinecap="round" />,
    front: () => (
      <path
        d="M32 15c-2 4-1 7 0 9M32 15c3 3 6 5 9 5M32 15c-3 3-6 5-9 5M32 15c5 1 10 4 12 8M32 15c-5 1-10 4-12 8"
        fill="none"
        stroke="#c4b0e2"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    ),
  },
  {
    id: 'ghost',
    name: 'Boo',
    kind: 'Little ghost',
    about: 'A shy ghost who floats instead of walking.',
    colors: ['#ffffff', '#dccdef'],
    body: 'M32 8c13 0 21 10 21 23v25l-4.2-3.5L44.5 56l-4.2-3.5L36 56l-4-3.5L28 56l-4.3-3.5L19.5 56l-4.3-3.5L11 56V31C11 18 19 8 32 8Z',
    feet: null,
    eyeY: 30,
    eyeGap: 14,
    cheekY: 36,
    mouthY: 37,
    back: () => <path d="M11 36c-4 1-6 4-5 7M53 36c4 1 6 4 5 7" fill="none" stroke={LINE} strokeWidth="1.6" strokeLinecap="round" />,
  },
  {
    id: 'chick',
    name: 'Puff',
    kind: 'Chick',
    about: 'A tiny round chick with big feelings.',
    colors: ['#f6f2fb', '#dccdef'],
    feet: '#ab94d3',
    eyeY: 37,
    eyeGap: 16,
    cheekY: 43,
    mouthY: 48,
    back: () => (
      <path d="M30 21c-1-5 1-8 3-9-1 3 1 5 2 6M33 21c1-4 4-6 6-6-2 2-2 4-2 6" fill="none" stroke={LINE} strokeWidth="1.6" strokeLinecap="round" />
    ),
    front: () => (
      <>
        <path d="M11 41c-3 3-3 7 0 9 3-2 5-5 4-9Z" fill="#dccdef" stroke={LINE} strokeWidth="1.3" />
        <path d="M53 41c3 3 3 7 0 9-3-2-5-5-4-9Z" fill="#dccdef" stroke={LINE} strokeWidth="1.3" />
      </>
    ),
    face: <path d="M28.8 42.5h6.4L32 46.6Z" fill="#bba6dc" stroke={DEEP} strokeWidth="1.1" strokeLinejoin="round" />,
  },
  {
    id: 'hamster',
    name: 'Nibbles',
    kind: 'Hamster',
    about: 'Stuffs its cheeks with every curry it can find.',
    colors: ['#efe6f9', '#c9b6e6'],
    feet: '#c9b6e6',
    eyeY: 36.5,
    eyeGap: 15,
    cheekY: 43,
    mouthY: 43.5,
    back: (fill) => (
      <>
        <circle cx="19" cy="24" r="5" fill={fill} stroke={LINE} strokeWidth="1.5" />
        <circle cx="19" cy="24" r="2.4" fill={PINK} />
        <circle cx="45" cy="24" r="5" fill={fill} stroke={LINE} strokeWidth="1.5" />
        <circle cx="45" cy="24" r="2.4" fill={PINK} />
      </>
    ),
    front: () => (
      <>
        <ellipse cx="32" cy="50" rx="11" ry="7.5" fill="#f6f2fb" opacity="0.9" />
        <ellipse cx="17" cy="43" rx="6" ry="4.6" fill={BLUSH} opacity="0.45" />
        <ellipse cx="47" cy="43" rx="6" ry="4.6" fill={BLUSH} opacity="0.45" />
      </>
    ),
    face: <ellipse cx="32" cy="41.5" rx="1.6" ry="1.1" fill={DEEP} />,
  },
  {
    id: 'bear',
    name: 'Momo',
    kind: 'Bear cub',
    about: 'Gives the best hugs after a long day.',
    colors: ['#e8e1ef', '#c4b0e2'],
    feet: '#ab94d3',
    eyeY: 37,
    eyeGap: 16,
    cheekY: 44,
    mouthY: 46.3,
    back: (fill) => (
      <>
        <circle cx="17" cy="24" r="6.5" fill={fill} stroke={LINE} strokeWidth="1.5" />
        <circle cx="17" cy="24" r="3" fill={PINK} opacity="0.8" />
        <circle cx="47" cy="24" r="6.5" fill={fill} stroke={LINE} strokeWidth="1.5" />
        <circle cx="47" cy="24" r="3" fill={PINK} opacity="0.8" />
      </>
    ),
    front: () => <ellipse cx="32" cy="45" rx="7.5" ry="5.5" fill="#f6f2fb" stroke={LINE} strokeWidth="1.2" />,
    face: <ellipse cx="32" cy="43" rx="2.3" ry="1.6" fill={INK} />,
  },
  {
    id: 'penguin',
    name: 'Pudding',
    kind: 'Penguin',
    about: 'A round, squishy penguin with a heart-shaped face.',
    colors: ['#8670ab', '#594977'],
    body: 'M32 18c12 0 20 10 20 23 0 11-8 18-20 18S12 52 12 41c0-13 8-23 20-23Z',
    feet: '#bba6dc',
    eyeY: 36,
    eyeGap: 13,
    eyeSize: 1.25,
    cheekY: 42.5,
    mouthY: 46,
    back: () => (
      <>
        <path d="M13 37c-5 2-6 9-4 12 3 0 5-4 5.5-8.5Z" fill={DEEP} stroke={LINE} strokeWidth="1.2" />
        <path d="M51 37c5 2 6 9 4 12-3 0-5-4-5.5-8.5Z" fill={DEEP} stroke={LINE} strokeWidth="1.2" />
      </>
    ),
    front: () => <path d="M32 29c-3-6-15-5-15 4 0 9 10 14 15 18 5-4 15-9 15-18 0-9-12-10-15-4Z" fill="#fbf9fc" />,
    face: <path d="M29.6 40.6h4.8L32 43.4Z" fill="#bba6dc" stroke={DEEP} strokeWidth="1" strokeLinejoin="round" />,
  },
  {
    id: 'axolotl',
    name: 'Lilo',
    kind: 'Axolotl',
    about: 'Frilly gills, always a little bit happy.',
    colors: ['#f6f2fb', '#d6c8ec'],
    feet: '#c9b6e6',
    eyeY: 38,
    eyeGap: 20,
    cheekY: 44,
    mouthY: 44.5,
    back: () => (
      <g stroke={LINE} strokeWidth="1.3" fill="#e2c3da">
        <path d="M12 30c-6-3-8-1-7 2 2 0 4 0 7 1Z" />
        <path d="M12 36c-7-1-8 2-6 4 2-1 4-2 6-2Z" />
        <path d="M13 42c-6 1-6 4-4 5 2-1 3-2 5-3Z" />
        <path d="M52 30c6-3 8-1 7 2-2 0-4 0-7 1Z" />
        <path d="M52 36c7-1 8 2 6 4-2-1-4-2-6-2Z" />
        <path d="M51 42c6 1 6 4 4 5-2-1-3-2-5-3Z" />
      </g>
    ),
  },
  {
    id: 'lamb',
    name: 'Cloud',
    kind: 'Lamb',
    about: 'A fluffy lamb, calm and very soft.',
    colors: ['#ffffff', '#e8e1ef'],
    feet: '#ab94d3',
    eyeY: 39,
    eyeGap: 16,
    cheekY: 45,
    mouthY: 45.5,
    back: () => <path d="M15 33c-6 0-8 6-4 8M49 33c6 0 8 6 4 8" fill="#c4b0e2" stroke={LINE} strokeWidth="1.4" strokeLinecap="round" />,
    front: () => (
      <g fill="#f6f2fb" stroke={LINE} strokeWidth="1.3">
        <circle cx="22" cy="24" r="6" />
        <circle cx="32" cy="20" r="7" />
        <circle cx="42" cy="24" r="6" />
        <circle cx="27" cy="28" r="5" />
        <circle cx="37" cy="28" r="5" />
      </g>
    ),
  },
  {
    id: 'puppy',
    name: 'Biscuit',
    kind: 'Puppy',
    about: 'Floppy ears, loves fetch more than food.',
    colors: ['#efe6f9', '#c9b6e6'],
    feet: '#c9b6e6',
    eyeY: 37,
    eyeGap: 14,
    cheekY: 44,
    mouthY: 44.5,
    back: () => <path d="M53 46c6-1 8-6 6-9" fill="none" stroke={LINE} strokeWidth="3" strokeLinecap="round" />,
    front: () => (
      <>
        <path d="M15 25c-6 1-7 12-3 17 3 1 5-3 6-7 0-4 0-7-3-10Z" fill="#ab94d3" stroke={LINE} strokeWidth="1.5" />
        <path d="M49 25c6 1 7 12 3 17-3 1-5-3-6-7 0-4 0-7 3-10Z" fill="#ab94d3" stroke={LINE} strokeWidth="1.5" />
      </>
    ),
    face: <ellipse cx="32" cy="42" rx="2.4" ry="1.7" fill={INK} />,
  },
];

export const speciesFor = (id: PetKind | null | undefined): Species => SPECIES.find((s) => s.id === id) ?? SPECIES[0];
