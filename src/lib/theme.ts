import { useEffect, useState } from 'react';

/** Appearance chosen on this phone. "system" follows the phone's dark-mode setting. */
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'mealtrack.theme';
const THEME_COLOR = { light: '#fbf9fc', dark: '#19161f' } as const;
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export function getThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* storage blocked: fall back to system */
  }
  return 'system';
}

export function resolveTheme(pref: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
}

/** Puts the `dark` class on <html> and matches the browser/status bar colour. */
export function applyTheme(pref: ThemePreference = getThemePreference()) {
  const theme = resolveTheme(pref, darkQuery().matches);
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute('content', THEME_COLOR[theme]);
    m.removeAttribute('media');
  });
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* not remembered, but still applied for this visit */
  }
  applyTheme(pref);
  window.dispatchEvent(new Event('mealtrack-theme'));
}

/** Applies the saved theme now and re-applies it when the phone switches light/dark. */
export function initTheme() {
  applyTheme();
  darkQuery().addEventListener('change', () => applyTheme());
}

export function useThemePreference(): [ThemePreference, (p: ThemePreference) => void] {
  const [pref, setPref] = useState(getThemePreference);
  useEffect(() => {
    const sync = () => setPref(getThemePreference());
    window.addEventListener('mealtrack-theme', sync);
    return () => window.removeEventListener('mealtrack-theme', sync);
  }, []);
  return [pref, setThemePreference];
}
