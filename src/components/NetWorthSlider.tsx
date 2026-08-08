"use client";

import clsx from "clsx";
import { fmtInt } from "@/lib/format";
import type { Item } from "@/lib/types";
import { ItemIcon } from "./ItemIcon";

export const MAX_SOULS = 80000;

export type SliderIcon = Pick<Item, "name" | "iconUrl" | "category">;

/** A souls-earned value at which one or more builds' loadouts change. */
export interface SliderBreakpoint {
  souls: number;
  items: SliderIcon[];
}

/**
 * Groups purchase transactions (from one build, or several merged together
 * for the compare page) into the icon-bearing breakpoints the slider draws.
 * Multiple transactions landing on the same soul threshold — whether from
 * the same build's zero-cost absorption or two builds buying at once — stack
 * into one breakpoint.
 */
export function buildBreakpoints(
  transactions: { slug: string; threshold: number }[],
  itemsBySlug: Map<string, SliderIcon>,
): SliderBreakpoint[] {
  const bySouls = new Map<number, SliderIcon[]>();
  for (const t of transactions) {
    const item = itemsBySlug.get(t.slug);
    if (!item) continue;
    const list = bySouls.get(t.threshold);
    if (list) list.push(item);
    else bySouls.set(t.threshold, [item]);
  }
  return [...bySouls.entries()]
    .map(([souls, items]) => ({ souls, items }))
    .sort((a, b) => a.souls - b.souls);
}

/**
 * The souls-earned control.
 *
 * Ticks mark the points where a build's loadout changes, rendered as the
 * item's own icon so you can see at a glance *what* the next purchase is,
 * not just where it lands, and step onto it exactly rather than hunting for
 * it with the mouse.
 */
export function NetWorthSlider({
  value,
  onChange,
  breakpoints = [],
  label = "Souls earned",
  detail,
  className,
}: {
  value: number;
  onChange: (souls: number) => void;
  breakpoints?: SliderBreakpoint[];
  label?: string;
  detail?: React.ReactNode;
  className?: string;
}) {
  const next = breakpoints.find((b) => b.souls > value) ?? null;
  const previous = [...breakpoints].reverse().find((b) => b.souls <= value) ?? null;

  return (
    <div className={clsx("space-y-1", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-ink-300">
          {label}{" "}
          <span className="tnum ml-1 text-[13px] font-semibold text-ink-100">
            {fmtInt(value)}
          </span>
        </span>
        <span className="flex items-center gap-1">
          {detail}
          <button
            type="button"
            className="btn flex items-center gap-1 px-1.5 py-0 text-[10px]"
            disabled={previous === null || previous.souls === value}
            onClick={() => previous !== null && onChange(previous.souls)}
            title="Jump back to the previous purchase"
          >
            ◀
            {previous && previous.souls !== value && <BreakpointIcons items={previous.items} />}
          </button>
          <button
            type="button"
            className="btn flex items-center gap-1 px-1.5 py-0 text-[10px]"
            disabled={next === null}
            onClick={() => next !== null && onChange(next.souls)}
            title={next ? `Next purchase at ${fmtInt(next.souls)} souls` : "Plan complete"}
          >
            {next && <BreakpointIcons items={next.items} />}
            ▶
          </button>
        </span>
      </div>

      <div className="relative">
        <input
          type="range"
          min={0}
          max={MAX_SOULS}
          step={100}
          value={Math.min(value, MAX_SOULS)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1.5 w-full accent-[var(--color-amber-brand)]"
        />
      </div>

      {/* Purchase markers, aligned to their soul value and rendered as the
          item's own icon, so the slider doubles as a purchase timeline
          rather than a row of anonymous ticks. Real height (not absolute
          over the input) so it doesn't overlap the range legend below. */}
      <div className="relative h-5">
        {breakpoints
          .filter((b) => b.souls <= MAX_SOULS)
          .map((b) => (
            <span
              key={b.souls}
              className="absolute top-0 flex -translate-x-1/2 gap-px"
              style={{ left: `${(b.souls / MAX_SOULS) * 100}%` }}
            >
              <BreakpointIcons items={b.items} reached={b.souls <= value} />
            </span>
          ))}
      </div>

      <div className="flex justify-between pt-1 text-[9px] text-ink-600">
        <span>0</span>
        <span className="tnum">
          {next === null ? "plan complete" : `next purchase at ${fmtInt(next.souls)}`}
        </span>
        <span>{fmtInt(MAX_SOULS)}</span>
      </div>
    </div>
  );
}

/** Small icon strip for a single breakpoint; more than a couple of items collapses to a count. */
function BreakpointIcons({ items, reached }: { items: SliderIcon[]; reached?: boolean }) {
  const shown = items.slice(0, 2);
  const overflow = items.length - shown.length;
  return (
    <>
      {shown.map((item, i) => (
        <ItemIcon
          key={`${item.name}-${i}`}
          item={item}
          size="xs"
          dimmed={reached === false}
        />
      ))}
      {overflow > 0 && (
        <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-sm border border-ink-700 bg-ink-850 text-[8px] font-semibold text-ink-300">
          +{overflow}
        </span>
      )}
    </>
  );
}
