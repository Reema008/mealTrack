/** @type {import('tailwindcss').Config} */

// "Taro Latte": milky taro purple-grey, Pinterest-style and cutesy. The
// standard Tailwind colour names used throughout the app are remapped so every
// screen uses only the taro colours from the theme preview:
//   emerald, matcha, amber → taro purple (buttons, veg days, delivered, pending)
//   slate, sky, orange    → taro grey (text, surfaces, planned, non-veg days)
//   rose                  → deeper taro ("not received", warnings)
const taro = {
  50: '#f6f2fb', 100: '#ece4f6', 200: '#dccdef', 300: '#c4b0e2', 400: '#ab94d3',
  500: '#9d88bd', 600: '#8670ab', 700: '#6e5a92', 800: '#594977', 900: '#463a5e', 950: '#2d2540',
};
// Deeper taro, two steps darker: "not received" and warnings.
const taroDeep = {
  50: '#ece4f6', 100: '#dccdef', 200: '#c4b0e2', 300: '#ab94d3', 400: '#8670ab',
  500: '#6e5a92', 600: '#594977', 700: '#463a5e', 800: '#2d2540', 900: '#241d33', 950: '#1a1526',
};
const taroGrey = {
  50: '#fbf9fc', 100: '#f4f0f8', 200: '#e8e1ef', 300: '#d6cce2', 400: '#ab9fc0',
  500: '#85789a', 600: '#6a5e80', 700: '#54496a', 800: '#3d3450', 900: '#2b2538', 950: '#19161f',
};

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Dark mode follows the `dark` class on <html> (the top-bar switch). A plain
  // descendant selector (not :is/:where) so older phone browsers apply it too.
  darkMode: ['variant', '.dark &'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Comfortaa', 'Nunito', 'system-ui', 'sans-serif'],
      },
      colors: {
        emerald: taro,
        matcha: taro,
        amber: taro,
        yellow: taro,
        slate: taroGrey,
        gray: taroGrey,
        sky: taroGrey,
        orange: taroGrey,
        rose: taroDeep,
        taro,
      },
      // Tailwind's default focus ring is blue; use taro instead.
      ringColor: { DEFAULT: taro[500] },
      boxShadow: {
        soft: 'var(--shadow-soft)',
      },
    },
  },
  plugins: [],
};
