/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        bg: "var(--bg)",
        panel: "var(--bg-panel)",
        "panel-hover": "var(--bg-panel-hover)",
        sunken: "var(--bg-sunken)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        fg: "var(--fg)",
        "fg-mid": "var(--fg-mid)",
        "fg-mute": "var(--fg-mute)",
        "fg-faint": "var(--fg-faint)",
        emerald: "var(--emerald)",
        "emerald-dim": "var(--emerald-dim)",
        amber: "var(--amber)",
        "amber-dim": "var(--amber-dim)",
        violet: "var(--violet)",
        "violet-dim": "var(--violet-dim)",
        sky: "var(--sky)",
        "sky-dim": "var(--sky-dim)",
        rose: "var(--rose)",
        "rose-dim": "var(--rose-dim)",
        pink: "var(--pink)",
        "pink-dim": "var(--pink-dim)",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        sm: "3px",
        md: "var(--radius)",
        lg: "var(--radius-lg)",
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans: ['"Geist"', "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
