"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BuildItem, Item } from "@/lib/types";
import { MAX_ITEM_SLOTS } from "@/lib/calc/timeline";
import { CATEGORY_COLOR, fmtInt } from "@/lib/format";
import { ITEM_PREVIEW_WIDTH, ItemPreviewCard } from "./ItemPreviewCard";

/**
 * The item grid from the game's own inventory screen (Tab), redrawn here so
 * the held loadout reads at a glance instead of only as rows in the purchase
 * order list below. Matches the game's own box order: lower tier first, and
 * within a tier, buy order — the same rule the game itself sorts by, so a
 * build that has been reordered or partially sold still lays out the way it
 * would in a real match. Slots fill top to bottom within a column, then move
 * to the next column, exactly like the game's own two-row layout — not left
 * to right along a row, which is why this uses `grid-auto-flow: column`
 * rather than the CSS grid default.
 */
const ROWS = 2;

const TIER_ROMAN: Record<number, string> = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V" };

/** The game's own tier badge colors, independent of item category. */
const TIER_BADGE: Record<number, string> = {
  1: "#8c7bf0",
  2: "#e8e8ef",
  3: "#e2793e",
  4: "#e35fd0",
  5: "#f2c94c",
};

interface Row {
  item: Item;
  entry: BuildItem;
}

function Cell({ item }: { item: Item }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number } | null>(
    null,
  );
  const badgeColor = TIER_BADGE[item.tier] ?? TIER_BADGE[1];

  const show = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    const left = Math.min(Math.max(margin, rect.left), window.innerWidth - ITEM_PREVIEW_WIDTH - margin);
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    if (spaceBelow >= spaceAbove) setPos({ top: rect.bottom + 6, left, maxHeight: spaceBelow - 6 });
    else setPos({ bottom: window.innerHeight - rect.top + 6, left, maxHeight: spaceAbove - 6 });
  };
  const hide = () => setPos(null);

  return (
    <div
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={hide}
      className="relative aspect-square overflow-hidden rounded-md border bg-ink-900"
      style={{ borderColor: CATEGORY_COLOR[item.category] }}
    >
      {item.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.iconUrl} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span className="grid h-full w-full place-items-center text-[10px] font-semibold text-ink-300">
          {item.name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span
        className="absolute right-0.5 top-0.5 rounded px-1 text-[9px] font-bold leading-[14px]"
        style={{ background: badgeColor, color: "#1a1425" }}
      >
        {TIER_ROMAN[item.tier] ?? item.tier}
      </span>
      {pos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50"
            style={{ top: pos.top, bottom: pos.bottom, left: pos.left }}
          >
            <ItemPreviewCard item={item} maxHeight={pos.maxHeight} />
          </div>,
          document.body,
        )}
    </div>
  );
}

export function InventoryGrid({
  rows,
  heldSlugs,
  itemValue,
}: {
  /** Every purchase in the plan, in buy order — same shape `LoadoutPanel` takes. */
  rows: Row[];
  heldSlugs: Set<string>;
  itemValue: number;
}) {
  const held = rows
    .map((row, buyOrder) => ({ ...row, buyOrder }))
    .filter((row) => heldSlugs.has(row.item.slug))
    // Box order: lower tier first, then — within a tier — buy order, exactly
    // like the game's own inventory screen.
    .sort((a, b) => a.item.tier - b.item.tier || a.buyOrder - b.buyOrder);

  if (held.length === 0) return null;

  return (
    <div className="border-b border-ink-800 p-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-ink-500">Inventory</span>
        <span className="tnum text-[11px] text-ink-400">
          {held.length} items · {fmtInt(itemValue)} souls
        </span>
      </div>
      <div
        className="grid gap-1.5"
        style={{
          gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
          gridAutoFlow: "column",
          gridAutoColumns: "minmax(0, 1fr)",
        }}
      >
        {Array.from({ length: MAX_ITEM_SLOTS }, (_, i) =>
          held[i] ? (
            <Cell key={held[i].item.slug} item={held[i].item} />
          ) : (
            <div
              key={`empty-${i}`}
              className="aspect-square rounded-md border border-dashed border-ink-800 bg-ink-950/40"
            />
          ),
        )}
      </div>
    </div>
  );
}
