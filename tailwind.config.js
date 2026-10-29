/** @type {import('tailwindcss').Config} */

// Soft, Pinterest-style palette. The standard Tailwind colour names used
// throughout the app are remapped to warm pastels so every screen shares the
// same look:
//   emerald → sage (primary, "delivered")      slate  → warm cocoa / cream (text, surfaces)
//   orange  → peach (non-veg)                   rose   → dusty blush ("not received")
//   sky     → lavender (planned)                amber  → butter (pending, notices)
const sage = {
  50: '#f3f6f1', 100: '#e4ece0', 200: '#cbdac4', 300: '#a9c1a0', 400: '#86a57c',
  500: '#6a8a60', 600: '#56734d', 700: '#455c3e', 800: '#384a33', 900: '#2e3d2b', 950: '#182117',
};
const cocoa = {
  50: '#fbf7f2', 100: '#f4ede4', 200: '#e8ddd0', 300: '#d5c6b5', 400: '#b3a08c',
  500: '#8e7a68', 600: '#6f5d4e', 700: '#574940', 800: '#3e342d', 900: '#2b2420', 950: '#1c1714',
};
const blush = {
  50: '#fcf3f3', 100: '#f8e3e4', 200: '#f0c9cc', 300: '#e4a6ab', 400: '#d47f86',
  500: '#c25e67', 600: '#a84852', 700: '#8c3a43', 800: '#73323a', 900: '#602d34', 950: '#351519',
};
const peach = {
  50: '#fef5ef', 100: '#fce7da', 200: '#f8cdb4', 300: '#f2ac86', 400: '#ea8857',
  500: '#df6d3a', 600: '#c9562a', 700: '#a74424', 800: '#863a24', 900: '#6d3221', 950: '#3b170e',
};
const lavender = {
  50: '#f6f5fc', 100: '#eceaf8', 200: '#d9d5f1', 300: '#bdb6e6', 400: '#9d92d8',
  500: '#8475c9', 600: '#705db8', 700: '#5f4d9f', 800: '#4f4283', 900: '#42386a', 950: '#282140',
};
const butter = {
  50: '#fefaec', 100: '#fcf1c9', 200: '#f8e28f', 300: '#f3cd55', 400: '#eeb82e',
  500: '#de9c17', 600: '#c07811', 700: '#995712', 800: '#7e4516', 900: '#6a3a17', 950: '#3d1d08',
};

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Dark mode follows the `dark` class on <html> (Settings → Appearance). A plain
  // descendant selector (not :is/:where) so older phone browsers apply it too.
  darkMode: ['variant', '.dark &'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      colors: {
        emerald: sage,
        slate: cocoa,
        rose: blush,
        orange: peach,
        sky: lavender,
        amber: butter,
        yellow: butter,
        sage,
        cocoa,
        blush,
        peach,
        lavender,
        butter,
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
      },
    },
  },
  plugins: [],
};
