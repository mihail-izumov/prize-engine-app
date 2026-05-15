/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Strategy-Visual-Identity §3.2 — 7-step grayscale + debug
        'ink-black':   '#000000',
        'paper-white': '#FFFFFF',
        'ash-900':     '#1A1A1A',
        'ash-700':     '#4A4A4A',
        'ash-500':     '#8A8A8A',
        'ash-300':     '#C8C8C8',
        'ash-100':     '#EEEEEE',
        'debug-red':   '#DC2626',
      },
      fontFamily: {
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        body:    ['Manrope', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
