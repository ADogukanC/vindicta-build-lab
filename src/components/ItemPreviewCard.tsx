"use client";

import clsx from "clsx";
import type { Item } from "@/lib/types";
import { ACTIVATION_LABELS, TIER_LABELS } from "@/lib/types";
import { humaniseGameKey } from "@/lib/stats";
import { CATEGORY_COLOR, fmtSouls } from "@/lib/format";
import { ItemIcon } from "./ItemIcon";
import { infoRowScaleText, itemStatLines, type ScaleContext } from "./ItemStatLines";

/** Read by `ItemShop.tsx` when it computes where the popup can fit. */
export const ITEM_PREVIEW_WIDTH = 416;
const DEFAULT_MAX_HEIGHT = 560;

/**
 * A read of an item styled like its card on deadlock.wiki: category-tinted
 * background, description, then every gameplay effect the item has — both
 * the numbers the engine models (`itemStatLines`, the same list the shop
 * card and admin panel use) and the ones it only displays (`item.info`,
 * i.e. whatever the calculator doesn't need for its own math). The
 * calculator-internal split between those two is not a wiki concept, so this
 * view merges them back into one list instead of showing only the leftover
 * half. Sourced entirely from `item.info`/`item.stats`/`item.description` —
 * the wiki-mirrored fields already carry no sound cues or internal
 * identifiers, and the catalogue only ever holds the Default
 * (non-Street-Brawl "Enhanced") version of each item, so neither needs
 * filtering here.
 */
export function ItemPreviewCard({
  item,
  maxHeight,
  ctx,
}: {
  item: Item;
  maxHeight?: number;
  ctx?: ScaleContext;
}) {
  const color = CATEGORY_COLOR[item.category];
  const effects = itemStatLines(item, ctx);
  const blocks = (item.info ?? []).filter((b) => b.rows.length > 0 || b.cooldown);
  const hasExtras =
    effects.length > 0 ||
    blocks.length > 0 ||
    Boolean(item.conditional) ||
    (item.maxStacks ?? 0) > 1 ||
    (item.maxStacksSecondary ?? 0) > 1;

  return (
    <div
      className="overflow-y-auto rounded-lg border shadow-2xl"
      style={{
        width: ITEM_PREVIEW_WIDTH,
        maxHeight: maxHeight ?? DEFAULT_MAX_HEIGHT,
        borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
      }}
    >
      <div
        className="p-3"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${color} 24%, #14131c), #14131c 75%)`,
        }}
      >
        <div className="flex items-start gap-2.5">
          <ItemIcon item={item} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[14px] font-semibold leading-snug text-ink-50">{item.name}</span>
              {item.cost < 9999 && (
                <span className="tnum shrink-0 text-[12px] text-ink-200">{fmtSouls(item.cost)}</span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px]">
              <span
                className="rounded px-1.5 py-px font-semibold uppercase tracking-wide"
                style={{ color, background: `color-mix(in srgb, ${color} 20%, transparent)` }}
              >
                {item.category}
              </span>
              <span className="text-ink-400">{TIER_LABELS[item.tier] ?? `Tier ${item.tier}`}</span>
              {item.activation !== "Passive" && (
                <span className="text-ink-400">· {ACTIVATION_LABELS[item.activation]}</span>
              )}
              {item.isImbue && <span className="text-ink-400">· Imbue</span>}
            </div>
          </div>
        </div>
        {item.description && (
          <p className="mt-2 text-[12px] leading-relaxed text-ink-200">{item.description}</p>
        )}
      </div>

      {hasExtras && (
        <div className="space-y-2.5 bg-ink-900 p-3">
          {item.conditional && (
            <p className="text-[11px] leading-snug text-amber-brand">◇ {item.conditional.label}</p>
          )}
          {(item.maxStacks ?? 0) > 1 && (
            <p className="text-[11px] leading-snug text-ink-300">
              Stacks up to {item.maxStacks}
              {item.stackLabel ? ` ${item.stackLabel.toLowerCase()}` : ""}
            </p>
          )}
          {(item.maxStacksSecondary ?? 0) > 1 && (
            <p className="text-[11px] leading-snug text-ink-300">
              Stacks up to {item.maxStacksSecondary}
              {item.stackLabelSecondary ? ` ${item.stackLabelSecondary.toLowerCase()}` : ""}
            </p>
          )}

          {effects.length > 0 && (
            <ul className="space-y-1 text-[12px]">
              {effects.map((line, i) => (
                <li
                  key={`${line.text}-${i}`}
                  className={clsx(
                    "leading-snug",
                    line.conditional || line.perStack ? "text-ink-300" : "text-ink-100",
                  )}
                >
                  {(line.conditional || line.perStack) && (
                    <span
                      className="mr-1 text-amber-brand"
                      title="Only counts when the item's condition is met"
                    >
                      ◇
                    </span>
                  )}
                  {line.text}
                </li>
              ))}
            </ul>
          )}

          {blocks.map((block, i) => (
            <div key={i} className="rounded-md border border-ink-800 bg-ink-950/60 p-2">
              <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-ink-500">
                <span>{block.type}</span>
                {block.cooldown != null && (
                  <span className="chip tnum py-0">{block.cooldown}s cooldown</span>
                )}
                {block.chargeUp != null && (
                  <span className="chip tnum py-0">{block.chargeUp}s charge</span>
                )}
              </div>
              <ul className="space-y-1 text-[11px]">
                {block.rows.map((row, j) => {
                  const scaleText = infoRowScaleText(row, ctx);
                  return (
                    <li key={j} className="flex items-start justify-between gap-3">
                      <span className="text-ink-300">{humaniseGameKey(row.key)}</span>
                      <span
                        className={clsx(
                          "tnum shrink-0 text-right",
                          row.emphasis ? "font-semibold text-ink-100" : "text-ink-200",
                        )}
                      >
                        {row.value === null ? "yes" : String(row.value)}
                        {scaleText && <span className="ml-1 text-ink-500">{scaleText}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
