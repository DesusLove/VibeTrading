import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "bg-base": "hsl(var(--bg-base))",
        "bg-elevated": "hsl(var(--bg-elevated))",
        "bg-raised": "hsl(var(--bg-raised))",
        "text-primary": "hsl(var(--text-primary))",
        "text-secondary": "hsl(var(--text-secondary))",
        "text-tertiary": "hsl(var(--text-tertiary))",
        "border-hairline": "hsl(var(--border-hairline))",
        "border-subtle": "hsl(var(--border-subtle))",
        accent: { DEFAULT: "hsl(var(--accent-primary))", foreground: "hsl(var(--accent-primary-foreground))" },
        "surface-muted": "hsl(var(--surface-muted))",
        positive: "hsl(var(--positive))",
        negative: "hsl(var(--negative))",
        warning: "hsl(var(--warning))",
        info: "hsl(var(--info))",
        // Backwards compat aliases so existing `border-border`, `bg-background`, etc. still work
        border: "hsl(var(--border-hairline))",
        background: "hsl(var(--bg-base))",
        foreground: "hsl(var(--text-primary))",
        muted: { DEFAULT: "hsl(var(--surface-muted))", foreground: "hsl(var(--text-secondary))" },
        primary: { DEFAULT: "hsl(var(--accent-primary))", foreground: "hsl(var(--accent-primary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--negative))", foreground: "white" },
        card: { DEFAULT: "hsl(var(--bg-elevated))", foreground: "hsl(var(--text-primary))" },
        popover: { DEFAULT: "hsl(var(--bg-raised))", foreground: "hsl(var(--text-primary))" },
        success: "hsl(var(--positive))",
        danger: "hsl(var(--negative))",
        profit: "hsl(var(--positive))",
        loss: "hsl(var(--negative))",
        amber: "hsl(var(--warning))",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius-md)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      animation: {
        "ticker-scroll": "ticker-scroll 25s linear infinite",
        "live-pulse": "live-pulse 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
} satisfies Config;
