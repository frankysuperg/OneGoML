/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // TopBar fondo; más adelante earnings sobre blanco
        accent: '#fbf546',
      },
    },
  },
  plugins: [],
}
