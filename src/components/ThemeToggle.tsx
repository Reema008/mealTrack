import { useThemePreference, type ThemePreference } from '../lib/theme';

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: string }> = [
  // sun
  { value: 'light', label: 'Light', icon: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z' },
  // moon
  { value: 'dark', label: 'Dark', icon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z' },
  // phone
  { value: 'system', label: 'Same as phone', icon: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm3 17h2' },
];

/** Light / Dark / System switch, shown in the top bar of every page. Saved on this phone. */
export function ThemeToggle() {
  const [theme, setTheme] = useThemePreference();
  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/80 p-1 shadow-soft ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
    >
      {OPTIONS.map((o) => {
        const selected = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.label}
            title={o.label}
            onClick={() => setTheme(o.value)}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${
              selected ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={o.icon} />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
