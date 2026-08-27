"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import type { Item, ItemCategory } from "@/lib/types";
import { ACTIVATION_LABELS, ITEM_CATEGORIES, TIER_LABELS } from "@/lib/types";
import { statLabel } from "@/lib/stats";
import { CATEGORY_COLOR, fmtSouls } from "@/lib/format";
import { ItemIcon } from "./ItemIcon";
import { ItemInfoRows, ItemStatLines, itemStatLines, type ScaleContext } from "./ItemStatLines";
import { ITEM_PREVIEW_WIDTH, ItemPreviewCard } from "./ItemPreviewCard";

/**
 * Hovering (or focusing) the "details" link floats a wiki-styled preview
 * near it. Positioned in a portal at `fixed` coordinates measured from the
 * link itself, rather than as a plain CSS-hover popover, so it always
 * escapes the shop list's `overflow-y-auto` clipping instead of being cut off
 * mid-card. The card shows every effect an item has (not just the sliver the
 * calculator doesn't model), so it can run tall — leaves a generous margin
 * and lets `ItemPreviewCard`'s own `max-h-[80vh]` scroll take over past that.
 */
interface PreviewPos {
  left: number;
  maxHeight: number;
  /** Anchored from whichever edge has more room — never both. */
  top?: number;
  bottom?: number;
}

function DetailsHoverLink({
  item,
  ctx,
  onClick,
}: {
  item: Item;
  ctx?: ScaleContext;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<PreviewPos | null>(null);

  const show = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    const left = Math.min(Math.max(margin, rect.left), window.innerWidth - ITEM_PREVIEW_WIDTH - margin);
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    // Whichever side has more room, so the card gets as much height as the
    // viewport can actually give it. Anchoring from that same edge (`top`
    // below the link, `bottom` above it) means a short card hugs the link
    // either way, instead of a `top`-only card floating away from it when
    // its content turns out shorter than the space it was budgeted.
    if (spaceBelow >= spaceAbove) {
      setPos({ top: rect.bottom + 6, left, maxHeight: spaceBelow - 6 });
    } else {
      setPos({ bottom: window.innerHeight - rect.top + 6, left, maxHeight: spaceAbove - 6 });
    }
  };
  const hide = () => setPos(null);

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="rounded px-1.5 py-0.5 text-[10px] text-ink-500 hover:bg-ink-700 hover:text-ink-100"
        title="Hover to preview, click to pin full details"
      >
        details
      </button>
      {pos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50"
            style={{ top: pos.top, bottom: pos.bottom, left: pos.left }}
          >
            <ItemPreviewCard item={item} maxHeight={pos.maxHeight} ctx={ctx} />
          </div>,
          document.body,
        )}
    </>
  );
}

/** Readable names for the game's own shop filter tags. */
function filterLabel(tag: string): string {
  return tag.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/\bTech\b/g, "Spirit");
}

function ActivationBadge({ item }: { item: Item }) {
  if (item.activation === "Passive" && !item.isImbue) return null;
  const cooldown = item.info?.find((b) => b.cooldown != null)?.cooldown;
  const label = item.isImbue ? "Imbue" : ACTIVATION_LABELS[item.activation];
  return (
    <span
      className={clsx(
        "shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide",
        item.isImbue ? "bg-spirit/25 text-spirit" : "bg-amber-brand/20 text-amber-brand",
      )}
      title={item.isImbue ? "Imbues one of your abilities" : "Has an active effect you trigger"}
    >
      {label}
      {cooldown != null && ` ${cooldown}s`}
    </span>
  );
}

function ItemCard({
  item,
  owned,
  componentsOwned,
  ctx,
  onToggle,
  onInspect,
  itemsBySlug,
}: {
  item: Item;
  owned: boolean;
  componentsOwned: string[];
  ctx?: ScaleContext;
  onToggle: () => void;
  onInspect: () => void;
  itemsBySlug: Map<string, Item>;
}) {
  return (
    <div
      className={clsx(
        "group relative flex flex-col rounded-lg border p-2 transition",
        owned
          ? "border-amber-brand/70 bg-amber-brand/10"
          : "border-ink-700 bg-ink-850 hover:border-ink-500",
      )}
    >
      <button type="button" onClick={onToggle} className="flex items-start gap-2 text-left">
        <ItemIcon item={item} size="md" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-1.5">
            <span className="truncate text-[13px] font-medium">{item.name}</span>
            <span className="tnum shrink-0 text-[11px] text-ink-300">
              {item.cost >= 9999 ? "—" : fmtSouls(item.cost)}
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1">
            <ActivationBadge item={item} />
            {item.conditional && (
              <span className="rounded bg-ink-700 px-1 py-px text-[9px] text-ink-200">
                {item.conditional.label}
              </span>
            )}
          </span>
          <span className="mt-1 block">
            <ItemStatLines item={item} limit={4} ctx={ctx} />
          </span>
        </span>
      </button>

      <div className="mt-1.5 flex items-center gap-1.5">
        {item.components.length > 0 && (
          <span className="flex items-center gap-1" title="Built from these items, which are consumed">
            <span className="text-[10px] text-ink-500">from</span>
            {item.components.map((slug) => {
              const component = itemsBySlug.get(slug);
              if (!component) return null;
              return (
                <ItemIcon
                  key={slug}
                  item={component}
                  size="sm"
                  className={clsx(
                    "!h-5 !w-5",
                    componentsOwned.includes(slug) && "ring-1 ring-amber-brand",
                  )}
                />
              );
            })}
          </span>
        )}
        <span className="flex-1" />
        <DetailsHoverLink item={item} ctx={ctx} onClick={onInspect} />
      </div>

      {owned && (
        <span className="pointer-events-none absolute right-1.5 top-1.5 text-[10px] font-semibold text-amber-brand">
          ✓
        </span>
      )}
    </div>
  );
}

function DetailPanel({
  item,
  itemsBySlug,
  ctx,
  onClose,
}: {
  item: Item;
  itemsBySlug: Map<string, Item>;
  ctx?: ScaleContext;
  onClose: () => void;
}) {
  const usedBy = [...itemsBySlug.values()].filter((i) => i.components.includes(item.slug));
  return (
    <div className="border-b border-ink-700 bg-ink-900 p-3">
      <div className="flex items-start gap-3">
        <ItemIcon item={item} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{item.name}</h3>
            <span className="chip" style={{ borderColor: CATEGORY_COLOR[item.category] }}>
              {item.category}
            </span>
            <span className="chip">{TIER_LABELS[item.tier] ?? `Tier ${item.tier}`}</span>
            {item.cost < 9999 && <span className="chip tnum">{item.cost.toLocaleString()} souls</span>}
            <ActivationBadge item={item} />
          </div>
          {item.description && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-200">{item.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-ink-500 hover:bg-ink-700 hover:text-ink-100"
          aria-label="Close details"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div>
          <h4 className="mb-1 text-[10px] uppercase tracking-wider text-ink-500">
            Modelled by the calculator
          </h4>
          <ItemStatLines item={item} ctx={ctx} />
        </div>
        <div>
          <h4 className="mb-1 text-[10px] uppercase tracking-wider text-ink-500">
            Everything the game shows
          </h4>
          <ItemInfoRows item={item} ctx={ctx} />
        </div>
      </div>

      {(item.components.length > 0 || usedBy.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-4 border-t border-ink-800 pt-2">
          {item.components.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-500">Builds from</div>
              <div className="flex gap-1">
                {item.components.map((slug) => {
                  const c = itemsBySlug.get(slug);
                  return c ? <ItemIcon key={slug} item={c} size="sm" /> : null;
                })}
              </div>
            </div>
          )}
          {usedBy.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-500">Builds into</div>
              <div className="flex gap-1">
                {usedBy.map((c) => (
                  <ItemIcon key={c.slug} item={c} size="sm" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ItemShop({
  items,
  ownedSlugs,
  ctx,
  onAdd,
  onRemove,
}: {
  items: Item[];
  ownedSlugs: Set<string>;
  /** Current build's spirit power/boons, to show item stats that scale with either as both their base and scaled value. */
  ctx?: ScaleContext;
  onAdd: (item: Item) => void;
  onRemove: (slug: string) => void;
}) {
  const [category, setCategory] = useState<ItemCategory>("Weapon");
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [onlyActives, setOnlyActives] = useState(false);
  const [inspected, setInspected] = useState<string | null>(null);

  const itemsBySlug = useMemo(() => new Map(items.map((i) => [i.slug, i])), [items]);

  const filterTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      if (item.category !== category) continue;
      for (const tag of item.shopFilters) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [items, category]);

  const tiers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (q) {
        const haystack = [
          item.name,
          item.description ?? "",
          ...Object.keys(item.stats ?? {}).map(statLabel),
          ...Object.keys(item.conditionalStats ?? {}).map(statLabel),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      } else if (item.category !== category) {
        return false;
      }
      if (onlyActives && item.activation === "Passive") return false;
      if (activeFilters.length && !activeFilters.every((f) => item.shopFilters.includes(f))) {
        return false;
      }
      return true;
    });

    const byTier = new Map<number, Item[]>();
    for (const item of filtered) {
      const list = byTier.get(item.tier) ?? [];
      list.push(item);
      byTier.set(item.tier, list);
    }
    return [...byTier.entries()].sort((a, b) => a[0] - b[0]);
  }, [items, category, query, activeFilters, onlyActives]);

  const total = tiers.reduce((s, [, list]) => s + list.length, 0);
  const inspectedItem = inspected ? itemsBySlug.get(inspected) : null;

  return (
    <section className="panel flex min-h-0 flex-col">
      <header className="panel-header">
        <span>
          Item shop <span className="text-ink-500">· {total} shown</span>
        </span>
        <input
          className="input max-w-56 py-1 text-xs normal-case tracking-normal"
          placeholder="Search all items…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>

      <div className="space-y-2 border-b border-ink-700 p-2">
        {!query.trim() && (
          <div className="flex gap-1">
            {ITEM_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCategory(c);
                  setActiveFilters([]);
                }}
                className={clsx(
                  "flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition",
                  category === c
                    ? "border-transparent text-ink-950"
                    : clsx("bg-ink-850 hover:bg-ink-800", {
                        "border-weapon/40 text-weapon": c === "Weapon",
                        "border-vitality/40 text-vitality": c === "Vitality",
                        "border-spirit/40 text-spirit": c === "Spirit",
                      }),
                )}
                style={category === c ? { background: CATEGORY_COLOR[c] } : undefined}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setOnlyActives((v) => !v)}
            className={clsx(
              "rounded-full border px-2 py-0.5 text-[10px] transition",
              onlyActives
                ? "border-amber-brand bg-amber-brand/15 text-amber-brand"
                : "border-ink-600 text-ink-300 hover:text-ink-100",
            )}
          >
            Actives only
          </button>
          {filterTags.map(([tag, count]) => {
            const on = activeFilters.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  setActiveFilters((current) =>
                    on ? current.filter((f) => f !== tag) : [...current, tag],
                  )
                }
                className={clsx(
                  "rounded-full border px-2 py-0.5 text-[10px] transition",
                  on
                    ? "border-amber-brand bg-amber-brand/15 text-amber-brand"
                    : "border-ink-600 text-ink-300 hover:text-ink-100",
                )}
              >
                {filterLabel(tag)} <span className="text-ink-500">{count}</span>
              </button>
            );
          })}
          {(activeFilters.length > 0 || onlyActives) && (
            <button
              type="button"
              onClick={() => {
                setActiveFilters([]);
                setOnlyActives(false);
              }}
              className="rounded-full px-2 py-0.5 text-[10px] text-ink-500 hover:text-ink-100"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {inspectedItem && (
        <DetailPanel
          item={inspectedItem}
          itemsBySlug={itemsBySlug}
          ctx={ctx}
          onClose={() => setInspected(null)}
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {total === 0 && (
          <p className="px-2 py-8 text-center text-sm text-ink-300">
            Nothing matches those filters.
          </p>
        )}
        {tiers.map(([tier, list]) => (
          <div key={tier} className="mb-4 last:mb-0">
            <h3 className="mb-1.5 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-300">
              <span>{TIER_LABELS[tier] ?? `Tier ${tier}`}</span>
              {list[0]?.cost < 9999 && (
                <span className="tnum text-ink-500">{fmtSouls(list[0].cost)}</span>
              )}
              <span className="h-px flex-1 bg-ink-700" />
              <span className="tnum text-ink-500">{list.length}</span>
            </h3>
            <div className="grid gap-1.5 sm:grid-cols-2 2xl:grid-cols-3">
              {list.map((item) => {
                const owned = ownedSlugs.has(item.slug);
                return (
                  <ItemCard
                    key={item.slug}
                    item={item}
                    owned={owned}
                    componentsOwned={item.components.filter((c) => ownedSlugs.has(c))}
                    ctx={ctx}
                    itemsBySlug={itemsBySlug}
                    onToggle={() => (owned ? onRemove(item.slug) : onAdd(item))}
                    onInspect={() => setInspected(inspected === item.slug ? null : item.slug)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
