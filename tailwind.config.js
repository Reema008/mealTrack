/** @type {import('tailwindcss').Config} */

// "Taro Latte": milky taro purple-grey, Pinterest-style and cutesy. The
// standard Tailwind colour names used throughout the app are remapped so every
// screen stays in the taro family, like the theme preview:
//   emerald, matcha, amber → taro purple (buttons, veg days, delivered, pending)
//   slate, sky            → taro grey (text, surfaces, planned)
//   orange                → plum mauve (non-veg days)
//   rose                  → raspberry ("not received")
const taro = {
  50: '#f6f2fb', 100: '#ece4f6', 200: '#dccdef', 300: '#c4b0e2', 400: '#ab94d3',
  500: '#9d88bd', 600: '#8670ab', 700: '#6e5a92', 800: '#594977', 900: '#463a5e', 950: '#2d2540',
};
const taroGrey = {
  50: '#fbf9fc', 100: '#f4f0f8', 200: '#e8e1ef', 300: '#d6cce2', 400: '#ab9fc0',
  500: '#85789a', 600: '#6a5e80', 700: '#54496a', 800: '#3d3450', 900: '#2b2538', 950: '#19161f',
};
const raspberry = {
  50: '#fdf2f5', 100: '#fbe3ea', 200: '#f6c6d4', 300: '#ee9db4', 400: '#e26d8e',
  500: '#d2496f', 600: '#b8365a', 700: '#982b4a', 800: '#7d263f', 900: '#682337', 950: '#3b0f1d',
};
const plum = {
  50: '#f8f0f6', 100: '#f0dfec', 200: '#e2c3da', 300: '#cf9fc2', 400: '#b97ca8',
  500: '#a3628f', 600: '#8a4f78', 700: '#713f62', 800: '#5b344f', 900: '#4a2c41', 950: '#2c1826',
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
        sky: taroGrey,
        orange: plum,
        rose: raspberry,
        taro,
        plum,
        raspberry,
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
      },
    },
  },
  plugins: [],
};
