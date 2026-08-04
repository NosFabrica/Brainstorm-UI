import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  // The profile customizer reorders sections via dynamically-built `order-N`
  // classes (order-1…order-8). JIT can't see runtime-built class names, so
  // safelist them — otherwise reordering into slots 6–8 silently does nothing.
  safelist: [{ pattern: /^order-([1-9]|1[0-2])$/ }],
  theme: {
    extend: {
      // Height-based variant for SHORT viewports — a phone in landscape (~390-440px
      // tall) is 850-960px WIDE, so it receives every `sm:`/`md:` desktop style
      // while having barely half the vertical room. Width variants can't tell it
      // apart from a desktop window; height is the only honest signal. 560px sits
      // above every phone landscape height and well below iPad landscape (744-820),
      // so tablets and desktops are untouched.
      screens: {
        short: { raw: "(max-height: 560px)" },
      },
      borderRadius: {
        lg: ".5625rem", /* 9px */
        md: ".375rem", /* 6px */
        sm: ".1875rem", /* 3px */
      },
      colors: {
        // Flat / base colors (regular buttons)
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
          border: "hsl(var(--card-border) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
          border: "hsl(var(--popover-border) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          border: "var(--primary-border)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
          border: "var(--secondary-border)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
          border: "var(--muted-border)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
          border: "var(--accent-border)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
          border: "var(--destructive-border)",
        },
        ring: "hsl(var(--ring) / <alpha-value>)",
        chart: {
          "1": "hsl(var(--chart-1) / <alpha-value>)",
          "2": "hsl(var(--chart-2) / <alpha-value>)",
          "3": "hsl(var(--chart-3) / <alpha-value>)",
          "4": "hsl(var(--chart-4) / <alpha-value>)",
          "5": "hsl(var(--chart-5) / <alpha-value>)",
        },
        sidebar: {
          ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
          DEFAULT: "hsl(var(--sidebar) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
        },
        "sidebar-primary": {
          DEFAULT: "hsl(var(--sidebar-primary) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
          border: "var(--sidebar-primary-border)",
        },
        "sidebar-accent": {
          DEFAULT: "hsl(var(--sidebar-accent) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "var(--sidebar-accent-border)"
        },
        status: {
          online: "rgb(34 197 94)",
          away: "rgb(245 158 11)",
          busy: "rgb(239 68 68)",
          offline: "rgb(156 163 175)",
        },
        // Brand palette — single source of truth in index.css (--brand-*).
        // RGB channels keep these exact to the legacy hex while `<alpha-value>`
        // preserves `/opacity` (e.g. bg-brand-accent/20). Reskin swaps the
        // values in index.css; these mappings don't change.
        brand: {
          primary: "rgb(var(--brand-primary) / <alpha-value>)",
          "primary-hover": "rgb(var(--brand-primary-hover) / <alpha-value>)",
          accent: "rgb(var(--brand-accent) / <alpha-value>)",
          "accent-hover": "rgb(var(--brand-accent-hover) / <alpha-value>)",
          deep: "rgb(var(--brand-deep) / <alpha-value>)",
          link: "rgb(var(--brand-link) / <alpha-value>)",
        },
        // Brand neutral ramp (Design System v1.0) — overrides Tailwind's default
        // `slate` so every `*-slate-N` across the app adopts the brand greys
        // without a per-usage codemod. Anchored on Balanced White (#F2F3F0),
        // Secondary (#B5BAC3), Neutral Grey (#8C929E), #7F8794, #555D69, and
        // Brainstorm Ink (#0A0E18); darks are blue-tinted to match Surface Blue
        // (#151C2A) / Deep Blue (#10213A).
        slate: {
          50: "#f2f3f0",
          100: "#e8eae7",
          200: "#d6d9db",
          300: "#b5bac3",
          400: "#9aa1ac",
          500: "#8c929e",
          600: "#6b7480",
          700: "#555d69",
          800: "#2b3442",
          900: "#151c2a",
          950: "#0a0e18",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
        // `font-display` utility (Figtree) so headings/titles stop re-applying
        // the display face via inline style={{ fontFamily: "var(--font-display)" }}.
        display: ["var(--font-display)"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "gradient-x": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "blob-morph": {
          "0%, 100%": {
            borderRadius: "42% 58% 63% 37% / 41% 44% 56% 59%",
            transform: "translateZ(0) rotate(0deg) scale(1)",
          },
          "33%": {
            borderRadius: "67% 33% 47% 53% / 37% 62% 38% 63%",
            transform: "translateZ(0) rotate(8deg) scale(1.05)",
          },
          "66%": {
            borderRadius: "38% 62% 56% 44% / 62% 38% 62% 38%",
            transform: "translateZ(0) rotate(-6deg) scale(0.97)",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "gradient-x": "gradient-x 6s ease infinite",
        "float": "float 6s ease-in-out infinite",
        "fade-up": "fade-up 0.5s ease-out forwards",
        "blob-morph": "blob-morph 14s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
