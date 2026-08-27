export function fmt(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtInt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString();
}

export function fmtPct(fraction: number | null | undefined, digits = 1): string {
  if (fraction == null || !Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function fmtSouls(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return String(value);
}

/** Signed delta with its own sign, for comparison tables. */
export function fmtDelta(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  const s = value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return value > 0 ? `+${s}` : s;
}

// Literal hex, not `var(--color-weapon)` etc. — these values only ever reach
// the page via inline `style` attributes (borders, backgrounds, dynamic
// per-item colors), and browser extensions that repaint the page (Dark
// Reader and friends) parse inline styles ahead of stylesheet custom
// properties. A `var()` reference there resolves to black until something
// forces a style recalc (e.g. the user clicking the element). Keep this in
// sync with the --color-weapon/vitality/spirit tokens in globals.css.
export const CATEGORY_COLOR: Record<string, string> = {
  Weapon: "#e8834a",
  Vitality: "#6bbf59",
  Spirit: "#a879e6",
};
