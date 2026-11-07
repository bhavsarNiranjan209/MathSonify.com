/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Semantic tokens — resolved to CSS variables defined in global.css.
        // Two themes (Analog / Digital) are set by swapping :root var values.
        'sc-bg': 'rgb(var(--sc-bg) / <alpha-value>)',
        'sc-surface': 'rgb(var(--sc-surface) / <alpha-value>)',
        'sc-sunken': 'rgb(var(--sc-sunken) / <alpha-value>)',
        'sc-text': 'rgb(var(--sc-text) / <alpha-value>)',
        'sc-text-soft': 'rgb(var(--sc-text-soft) / <alpha-value>)',
        'sc-text-faint': 'rgb(var(--sc-text-faint) / <alpha-value>)',
        'sc-line': 'rgb(var(--sc-line) / <alpha-value>)',
        'sc-paper': 'rgb(var(--sc-paper) / <alpha-value>)',
        'sc-ink': 'rgb(var(--sc-ink) / <alpha-value>)',
        'sc-accent': 'rgb(var(--sc-accent) / <alpha-value>)',
        'sc-live': 'rgb(var(--sc-live) / <alpha-value>)',
        'sc-on-accent': 'rgb(var(--sc-on-accent) / <alpha-value>)',
        'sc-on-live': 'rgb(var(--sc-on-live) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        // Space Grotesk — the wordmark voice (nav logo, loading screen).
        // Used for UI headings so the Studio reads as one family with the
        // logo; the editorial serif (Fraunces) stays on the big titles.
        display: ['Space Grotesk', 'Inter', 'sans-serif'],
        // Instrument Serif — the How It Works page voice (hero title and
        // card titles, per the redesign mockup). Loaded in BaseLayout.
        instrument: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      fontSize: {
        'display-xl': ['48px', { lineHeight: '48px', letterSpacing: '-1px', fontWeight: '600' }],
        'heading-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.5px', fontWeight: '600' }],
        'heading-md': ['20px', { lineHeight: '28px', letterSpacing: '0', fontWeight: '600' }],
      },
      borderRadius: {
        'sc-sm': '4px',
        'sc-md': '8px',
        'sc-lg': '12px',
      },
      spacing: {
        'sc-section': '128px',
      },
    },
  },
  plugins: [],
};