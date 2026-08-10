"use client";

import { useState } from "react";
import clsx from "clsx";
import type { BuildItem, Item } from "@/lib/types";
import type { CalcResult } from "@/lib/calc/engine";
import { MAX_ITEM_SLOTS } from "@/lib/calc/timeline";
import { CATEGORY_COLOR, fmtDelta, fmtInt, fmtSouls } from "@/lib/format";
import { ItemIcon } from "./ItemIcon";

interface Row {
  item: Item;
  entry: BuildItem;
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] transition",
        checked
          ? "border-amber-brand/60 bg-amber-brand/15 text-amber-brand"
          : "border-ink-600 bg-ink-850 text-ink-300 hover:text-ink-100",
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", checked ? "bg-amber-brand" : "bg-ink-500")} />
      {label}
    </button>
  );
}

/** Which items the plan sells, and in what order, when a slot is needed. */
function SellOrderEditor({
  rows,
  sellOrder,
  onChange,
}: {
  rows: Row[];
  sellOrder: string[];
  onChange: (next: string[]) => void;
}) {
  const bySlug = new Map(rows.map((r) => [r.item.slug, r.item]));
  const available = rows.filter((r) => !sellOrder.includes(r.item.slug));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= sellOrder.length) return;
    const next = sellOrder.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div className="space-y-1.5 border-t border-ink-800 bg-ink-950/40 p-2.5">
      <p className="text-[11px] text-ink-500">
        When a purchase needs a slot and all {MAX_ITEM_SLOTS} are full, these are sold in
        order. Selling refunds half the price.
      </p>
      {sellOrder.length === 0 && (
        <p className="text-[11px] text-ink-600">Nothing set to sell yet.</p>
      )}
      <ol className="space-y-1">
        {sellOrder.map((slug, index) => {
          const item = bySlug.get(slug);
          return (
            <li
              key={slug}
              className="flex items-center gap-2 rounded border border-ink-800 bg-ink-900 px-1.5 py-1"
            >
              <span className="tnum w-4 text-[10px] text-ink-500">{index + 1}</span>
              {item && <ItemIcon item={item} size="sm" className="!h-5 !w-5" />}
              <span className="min-w-0 flex-1 truncate text-[12px]">{item?.name ?? slug}</span>
              <span className="tnum text-[10px] text-emerald-400">
                +{fmtInt(Math.round((item?.cost ?? 0) / 2))}
              </span>
              <button
                type="button"
                className="rounded px-1 text-[10px] text-ink-500 hover:text-ink-100 disabled:opacity-30"
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
                title="Sell earlier"
              >
                ▲
              </button>
              <button
                type="button"
                className="rounded px-1 text-[10px] text-ink-500 hover:text-ink-100 disabled:opacity-30"
                disabled={index === sellOrder.length - 1}
                onClick={() => move(index, index + 1)}
                title="Sell later"
              >
                ▼
              </button>
              <button
                type="button"
                className="rounded px-1 text-[10px] text-ink-500 hover:text-red-300"
                onClick={() => onChange(sellOrder.filter((s) => s !== slug))}
                title="Remove from sell order"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ol>
      {available.length > 0 && (
        <select
          className="input py-1 text-[11px]"
          value=""
          onChange={(e) => e.target.value && onChange([...sellOrder, e.target.value])}
        >
          <option value="">+ Add an item to sell…</option>
          {available.map((r) => (
            <option key={r.item.slug} value={r.item.slug}>
              {r.item.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function LoadoutPanel({
  rows,
  result,
  dpsContributions,
  sellOrder,
  onRemove,
  onPatch,
  onMove,
  onClear,
  onSetAllConditionals,
  onSetSells,
  abilities,
  imbueTargets,
  onImbue,
}: {
  /** Every purchase in the plan, in buy order. */
  rows: Row[];
  result: CalcResult;
  /** Ground/Flight DPS lost if each held item were removed, keyed by slug. */
  dpsContributions: Map<string, { ground: number; flight: number }>;
  sellOrder: string[];
  onRemove: (slug: string) => void;
  onPatch: (slug: string, patch: Partial<BuildItem>) => void;
  onMove: (from: number, to: number) => void;
  onClear: () => void;
  onSetAllConditionals: (active: boolean) => void;
  onSetSells: (next: string[]) => void;
  abilities: { key: string; name: string; slot: number }[];
  imbueTargets: Record<string, string>;
  onImbue: (slug: string, abilityKey: string) => void;
}) {
  const [showSells, setShowSells] = useState(false);
  // Drag-to-reorder state, kept local since it never outlives this panel.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const { timeline } = result;

  const conditionals = rows.filter((r) => r.item.conditional);
  const activeConditionals = conditionals.filter((r) => r.entry.active).length;
  const thresholdByIndex = new Map(timeline.transactions.map((t) => [t.index, t.threshold]));
  // How each item left the loadout, so a gone item says why rather than guessing.
  const departure = new Map<string, "sold" | "absorbed">();
  for (const transaction of timeline.completed) {
    for (const step of transaction.steps) {
      if (step.kind === "sell") departure.set(step.slug, "sold");
      if (step.kind === "consume") departure.set(step.slug, "absorbed");
    }
  }
  // Steps that happen as part of reaching a purchase, keyed by that purchase.
  const sideEffects = new Map(
    timeline.transactions.map((t) => [t.index, t.steps.filter((s) => s.kind !== "buy")]),
  );

  return (
    <section className="panel">
      <header className="panel-header">
        <span>
          Purchase order{" "}
          <span className="text-ink-500">
            · {timeline.heldSlugs.size}/{MAX_ITEM_SLOTS} held of {rows.length}
          </span>
        </span>
        <span className="flex items-center gap-3">
          {conditionals.length > 0 && (
            <span
              className="flex items-center gap-1 normal-case tracking-normal"
              title="Situational bonuses only count while their condition is met."
            >
              <span className="text-ink-500">
                Conditionals {activeConditionals}/{conditionals.length}
              </span>
              <button
                className="btn px-1.5 py-0 text-[10px]"
                onClick={() => onSetAllConditionals(true)}
                disabled={activeConditionals === conditionals.length}
              >
                all on
              </button>
              <button
                className="btn px-1.5 py-0 text-[10px]"
                onClick={() => onSetAllConditionals(false)}
                disabled={activeConditionals === 0}
              >
                all off
              </button>
            </span>
          )}
          <button
            className={clsx("btn px-2 py-0.5 text-[11px]", showSells && "btn-primary")}
            onClick={() => setShowSells((s) => !s)}
          >
            Sell order {sellOrder.length > 0 && `(${sellOrder.length})`}
          </button>
          <button
            className="btn btn-danger px-2 py-0.5 text-[11px]"
            onClick={onClear}
            disabled={rows.length === 0}
          >
            Clear
          </button>
        </span>
      </header>

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-ink-800 px-3 py-1.5 text-[11px]">
        <span className="text-ink-400">
          Spent <span className="tnum text-ink-100">{fmtInt(timeline.soulsSpent)}</span>
        </span>
        {timeline.soulsRefunded > 0 && (
          <span className="text-ink-400">
            Refunded{" "}
            <span className="tnum text-emerald-400">+{fmtInt(timeline.soulsRefunded)}</span>
          </span>
        )}
        <span className="text-ink-400">
          Loadout worth <span className="tnum text-ink-100">{fmtInt(timeline.itemValue)}</span>
        </span>
        <span className="text-ink-400">
          Unspent <span className="tnum text-ink-100">{fmtInt(timeline.leftover)}</span>
        </span>
      </div>

      {rows.length > MAX_ITEM_SLOTS && sellOrder.length === 0 && (
        <div className="mx-3 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-brand/30 bg-amber-brand/10 px-2.5 py-1.5 text-[11px] text-amber-brand">
          <span>
            {rows.length} items but only {MAX_ITEM_SLOTS} slots and no sell order set — once
            they fill up, the plan will guess what to sell and warn per purchase instead.
          </span>
          <button
            type="button"
            className="btn shrink-0 px-2 py-0.5 text-[10px]"
            onClick={() => setShowSells(true)}
          >
            Set sell order
          </button>
        </div>
      )}

      {showSells && (
        <SellOrderEditor rows={rows} sellOrder={sellOrder} onChange={onSetSells} />
      )}

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-300">
          Click items in the shop below. The order you add them is the order they get bought.
        </p>
      ) : (
        <ol className="divide-y divide-ink-800/60">
          {rows.map(({ item, entry }, index) => {
            const held = timeline.heldSlugs.has(item.slug);
            const threshold = thresholdByIndex.get(index);
            const effects = sideEffects.get(index) ?? [];
            const contribution = dpsContributions.get(item.slug);
            return (
              <li
                key={item.slug}
                draggable
                onDragStart={(e) => {
                  setDragIndex(index);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(index));
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragOver={(e) => {
                  // Always allow the drop (rather than gating on `dragIndex`,
                  // which is component state and can still be reflecting the
                  // previous render on the very first dragover of a drag — an
                  // unconditional `preventDefault` is what tells the browser
                  // this row is a valid drop target at all).
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (overIndex !== index) setOverIndex(index);
                }}
                onDragLeave={() => setOverIndex((cur) => (cur === index ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  // Read the source index off the event itself rather than
                  // `dragIndex` state: dataTransfer is synchronously correct
                  // no matter where React's render is, while state set in
                  // `onDragStart` may not have flushed by the time this fires.
                  const from = Number(e.dataTransfer.getData("text/plain"));
                  if (Number.isInteger(from) && from !== index) onMove(from, index);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                className={clsx(
                  "flex items-start gap-2 p-1.5 transition",
                  !held && "opacity-45",
                  dragIndex === index && "opacity-30",
                  dragIndex !== null &&
                    dragIndex !== index &&
                    overIndex === index &&
                    "bg-amber-brand/10 outline outline-1 -outline-offset-1 outline-amber-brand/50",
                )}
                style={{ borderLeft: `2px solid ${held ? CATEGORY_COLOR[item.category] : "transparent"}` }}
              >
                <span className="flex flex-col items-center gap-0.5 pt-0.5">
                  <span
                    className="cursor-grab select-none text-[11px] leading-none text-ink-600 hover:text-ink-200 active:cursor-grabbing"
                    title="Drag to reorder"
                  >
                    ⠿
                  </span>
                  <button
                    type="button"
                    className="text-[9px] leading-none text-ink-600 hover:text-ink-100 disabled:opacity-20"
                    disabled={index === 0}
                    onClick={() => onMove(index, index - 1)}
                    title="Buy earlier"
                  >
                    ▲
                  </button>
                  <span className="tnum text-[9px] text-ink-500">{index + 1}</span>
                  <button
                    type="button"
                    className="text-[9px] leading-none text-ink-600 hover:text-ink-100 disabled:opacity-20"
                    disabled={index === rows.length - 1}
                    onClick={() => onMove(index, index + 1)}
                    title="Buy later"
                  >
                    ▼
                  </button>
                </span>

                <ItemIcon
                  item={item}
                  size="sm"
                  dimmed={Boolean(item.conditional) && !entry.active}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px]">{item.name}</span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span className="tnum text-[10px] text-ink-500">
                        {threshold !== undefined ? `at ${fmtSouls(threshold)}` : ""}
                      </span>
                      <span className="tnum text-[11px] text-ink-300">
                        {fmtSouls(item.cost)}
                      </span>
                    </span>
                  </div>

                  {effects.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {effects.map((step, i) => (
                        <span
                          key={`${step.slug}-${i}`}
                          className={clsx(
                            "rounded px-1 py-px text-[9px]",
                            step.kind === "sell"
                              ? step.assumed
                                ? "bg-amber-brand/20 text-amber-brand"
                                : "bg-emerald-500/15 text-emerald-300"
                              : "bg-ink-700 text-ink-300",
                          )}
                          title={
                            step.kind === "sell"
                              ? `Sells ${step.name} for ${step.souls} souls${
                                  step.assumed ? " — no sell order entry, so this is assumed" : ""
                                }`
                              : `${step.name} is absorbed into this upgrade`
                          }
                        >
                          {step.kind === "sell" ? "sells" : "absorbs"} {step.name}
                          {step.assumed && " ?"}
                        </span>
                      ))}
                    </div>
                  )}

                  {held && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {contribution && (
                        <span
                          className="tnum rounded-full border border-ink-700 bg-ink-850 px-1.5 py-0.5 text-[10px] text-ink-400"
                          title="DPS lost if this item alone were removed from the build"
                        >
                          <span className="text-ink-500">Ground</span>{" "}
                          {fmtDelta(contribution.ground, 0)}
                          <span className="mx-1 text-ink-700">·</span>
                          <span className="text-ink-500">Flight</span>{" "}
                          {fmtDelta(contribution.flight, 0)}
                        </span>
                      )}
                      {item.isImbue && (
                        <label
                          className={clsx(
                            "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]",
                            imbueTargets[item.slug]
                              ? "border-spirit/60 bg-spirit/15 text-spirit"
                              : "border-amber-brand/60 bg-amber-brand/10 text-amber-brand",
                          )}
                        >
                          <span>Imbue</span>
                          <select
                            className="bg-transparent text-[10px] outline-none"
                            value={imbueTargets[item.slug] ?? ""}
                            onChange={(e) => onImbue(item.slug, e.target.value)}
                          >
                            <option value="">choose…</option>
                            {abilities.map((a) => (
                              <option key={a.key} value={a.key} className="bg-ink-900">
                                {a.slot}. {a.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {item.conditional && (
                        <Toggle
                          checked={entry.active}
                          onChange={(v) => onPatch(item.slug, { active: v })}
                          label={item.conditional.label}
                        />
                      )}
                      {item.shred && (
                        <Toggle
                          checked={entry.shredActive}
                          onChange={(v) => onPatch(item.slug, { shredActive: v })}
                          label="Shred applied"
                        />
                      )}
                      {(item.maxStacks ?? 0) > 1 && (
                        <label className="flex items-center gap-1.5 text-[10px] text-ink-300">
                          <span>{item.stackLabel ?? "Stacks"}</span>
                          <input
                            type="range"
                            min={0}
                            max={item.maxStacks}
                            value={entry.stacks}
                            onChange={(e) => onPatch(item.slug, { stacks: Number(e.target.value) })}
                            className="h-1 w-20 accent-[var(--color-amber-brand)]"
                          />
                          <span className="tnum w-6 text-right text-ink-100">
                            {entry.stacks}/{item.maxStacks}
                          </span>
                        </label>
                      )}
                    </div>
                  )}
                  {!held && departure.has(item.slug) && (
                    <p className="mt-0.5 text-[10px] text-ink-500">
                      {departure.get(item.slug) === "sold"
                        ? "Sold later in the plan"
                        : "Absorbed into an upgrade"}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onRemove(item.slug)}
                  className="rounded p-1 text-ink-500 hover:bg-ink-700 hover:text-ink-100"
                  aria-label={`Remove ${item.name}`}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
