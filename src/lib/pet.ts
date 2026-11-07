import { useEffect, useState } from 'react';
import { speciesFor, type PetKind } from '../components/pet/species';

/** Whether Mochi the pet is shown on this phone (on unless turned off in Settings). */
const STORAGE_KEY = 'mealtrack.pet';
const EVENT = 'mealtrack-pet';

export function getPetEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setPetEnabled(on: boolean) {
  try {
    if (on) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, 'off');
  } catch {
    /* not remembered, but still applied for this visit */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function usePetEnabled(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(getPetEnabled);
  useEffect(() => {
    const sync = () => setOn(getPetEnabled());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return [on, setPetEnabled];
}

const KIND_KEY = 'mealtrack.pet.kind';

/** Which pet lives on this phone (Mochi the bunny unless another was chosen in Settings). */
export function getPetKind(): PetKind {
  try {
    return speciesFor(localStorage.getItem(KIND_KEY) as PetKind).id;
  } catch {
    return 'bunny';
  }
}

export function setPetKind(kind: PetKind) {
  try {
    localStorage.setItem(KIND_KEY, kind);
  } catch {
    /* not remembered, but still applied for this visit */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function usePetKind(): [PetKind, (kind: PetKind) => void] {
  const [kind, setKind] = useState(getPetKind);
  useEffect(() => {
    const sync = () => setKind(getPetKind());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return [kind, setPetKind];
}

/** Something for your pet to say, given where you are and what is going on. */
export interface PetContext {
  /** The pet's name, e.g. "Mochi". */
  name: string;
  route: string;
  nowMinutes: number;
  /** Today's meals still waiting to be marked (before 2 PM / 10 PM). */
  pendingLunch: boolean;
  pendingDinner: boolean;
  sleepy: boolean;
}

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

export const TAP_LINES = ['Hehe, that tickles! 💜', 'Yay! Pets! ✦', 'Again! Again!', '*happy wiggle*', 'Boop! 💜', 'You’re my favourite human ♡'];
export const SLEEPY_LINES = ['zzz… five more minutes…', '*yawns* is it breakfast yet?', 'zzz… dreaming of curry…'];

export function idleLine(c: PetContext): string {
  if (c.sleepy) return pick(SLEEPY_LINES);
  const options: string[] = [];
  if (c.pendingLunch) options.push('Did lunch come yet? Tap “Edit lunch” to tell me! ☀️', 'Lunch check! Is it here? 💜');
  if (c.pendingDinner && c.nowMinutes >= 19 * 60) options.push('Quick dinner check before bed? 🌙', 'Did dinner arrive? 🌙');
  if (c.route.startsWith('/reports')) options.push('Ooh, numbers! You’re doing great ✦', 'Tap a box to see the dates behind it!');
  if (c.route.startsWith('/calendar')) options.push('So many days… so many meals! ✦', 'Tap a date to open that day 💜');
  if (c.route.startsWith('/subscriptions')) options.push('Counting rupees… ₹ ₹ ₹', 'Tap Calculate to see next month’s amount!');
  if (c.route.startsWith('/settings')) options.push('Psst… you can turn me off here. But please don’t ♡');
  if (c.route.startsWith('/day')) options.push('Mark lunch and dinner here ✦');
  options.push(
    c.nowMinutes < 12 * 60 ? 'Good morning! ☀️' : c.nowMinutes < 17 * 60 ? 'Good afternoon! 💜' : 'Good evening! 🌙',
    'Double-tap me to play yarn chase! ♡',
    'Wanna chase the yarn? Double-tap me! ✦',
    `Hiii, I’m ${c.name} 💜`,
    'Taro latte is my favourite colour ✦',
    'Pet me! Tap tap!',
    'Rub my belly! Draw little circles on me ♡',
    'Hold me to see how I’m feeling ✦',
  );
  return pick(options);
}

export { pick };
