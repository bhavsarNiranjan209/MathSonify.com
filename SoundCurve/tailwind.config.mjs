/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        'sc-bg': 'rgb(var(--sc-bg) / <alpha-value>)',
        'sc-surface': 'rgb(var(--sc-surface) / <alpha-value>)',
        'sc-sunken': 'rgb(var(--sc-sunken) / <alpha-value>)',
        'sc-text': 'rgb(var(--sc-text) / <alpha-value>)',
        'sc-text-soft': 'rgb(var(--sc-text-soft) / <alpha-value>)',
        'sc-text-faint': 'rgb(var(--sc-text-faint) / <alpha-value>)',
        'sc-line': 'rgb(var(--sc-line) / <alpha-value>)',
        'sc-accent': 'rgb(var(--sc-accent) / <alpha-value>)',
        'sc-on-accent': 'rgb(var(--sc-on-accent) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
