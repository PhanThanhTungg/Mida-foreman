import type { Config } from 'tailwindcss';
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { mono: ['var(--font-mono)', 'monospace'] },
      colors: {
        terminal: { bg: '#0d1117', text: '#c9d1d9' },
      },
    },
  },
  plugins: [],
};
export default config;
