/** @type {import('tailwindcss').Config} */

// "Taro Latte": milky taro purple-grey, Pinterest-style and cutesy. The
// standard Tailwind colour names used throughout the app are remapped so every
// screen shares the same look:
//   emerald → taro purple (buttons, links, selected)   slate → taro grey (text, surfaces)
//   matcha  → soft green (veg days, delivered)          rose  → raspberry ("not received")
//   orange  → peach (non-veg)                           sky   → blueberry (planned)
//   amber   → butter (pending, notices)
const taro = {
  50: '#f6f2fb', 100: '#ece4f6', 200: '#dccdef', 300: '#c4b0e2', 400: '#ab94d3',
  500: '#9d88bd', 600: '#8670ab', 700: '#6e5a92', 800: '#594977', 900: '#463a5e', 950: '#2d2540',
};
const taroGrey = {
  50: '#fbf9fc', 100: '#f4f0f8', 200: '#e8e1ef', 300: '#d6cce2', 400: '#ab9fc0',
  500: '#85789a', 600: '#6a5e80', 700: '#54496a', 800: '#3d3450', 900: '#2b2538', 950: '#19161f',
};
const matcha = {
  50: '#f2f9ec', 100: '#e1f1d5', 200: '#cde6bb', 300: '#afd49a', 400: '#8fc07a',
  500: '#72a85c', 600: '#5a8a48', 700: '#476d3a', 800: '#3a5731', 900: '#30482a', 950: '#182616',
};
const raspberry = {
  50: '#fdf2f5', 100: '#fbe3ea', 200: '#f6c6d4', 300: '#ee9db4', 400: '#e26d8e',
  500: '#d2496f', 600: '#b8365a', 700: '#982b4a', 800: '#7d263f', 900: '#682337', 950: '#3b0f1d',
};
const peach = {
  50: '#fef5ef', 100: '#fce7da', 200: '#f8cdb4', 300: '#f2ac86', 400: '#ea8857',
  500: '#df6d3a', 600: '#c9562a', 700: '#a74424', 800: '#863a24', 900: '#6d3221', 950: '#3b170e',
};
const blueberry = {
  50: '#f0f3ff', 100: '#dfe6ff', 200: '#cad5ff', 300: '#a9b8f5', 400: '#8a9de9',
  500: '#6f84e0', 600: '#5a6ccc', 700: '#4a59ad', 800: '#3d4a8c', 900: '#343f70', 950: '#212a4e',
};
const butter = {
  50: '#fefaec', 100: '#fcf1c9', 200: '#f8e28f', 300: '#f3cd55', 400: '#eeb82e',
  500: '#de9c17', 600: '#c07811', 700: '#995712', 800: '#7e4516', 900: '#6a3a17', 950: '#3d1d08',
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
        slate: taroGrey,
        rose: raspberry,
        orange: peach,
        sky: blueberry,
        amber: butter,
        yellow: butter,
        taro,
        matcha,
        raspberry,
        peach,
        blueberry,
        butter,
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
      },
    },
  },
  plugins: [],
};
