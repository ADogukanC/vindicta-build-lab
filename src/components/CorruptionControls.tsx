"use client";

import clsx from "clsx";
import type { BuildItem, CorruptionRoll, Item } from "@/lib/types";
import {
  CORRUPTION_ROLLS,
  DOWNSIDE_ROLL_MULTIPLIER,
  availableDownsides,
  corruptedMaxStacks,
  corruptedMaxStacksSecondary,
  corruptedRowValue,
  downsideStats,
  CORRUPTION_PENALTY_BY_ID,
} from "@/lib/corruption";
import { formatStat, statLabel } from "@/lib/stats";

const ROLL_LABEL: Record<CorruptionRoll, string> = { low: "Low", average: "Avg", high: "High" };

function RollPicker({
  label,
  value,
  onChange,
  title,
}: {
  label: string;
  value: CorruptionRoll;
  onChange: (roll: CorruptionRoll) => void;
  title: string;
}) {
  return (
    <span className="flex items-center gap-1" title={title}>
      <span className="text-ink-400">{label}</span>
      <span className="flex overflow-hidden rounded border border-fuchsia-500/40">
        {CORRUPTION_ROLLS.map((roll) => (
          <button
            key={roll}
            type="button"
            onClick={() => onChange(roll)}
            className={clsx(
              "px-1.5 py-px",
              value === roll ? "bg-fuchsia-500/30 text-fuchsia-100" : "text-ink-400 hover:text-ink-100",
            )}
          >
            {ROLL_LABEL[roll]}
          </button>
        ))}
      </span>
    </span>
  );
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/**
 * The Broker's corruption for one held Tier 3/4 item: whether it's
 * corrupted, where each of its two independent ±15% rolls landed, and which
 * downside it drew (uniformly, from the pool the item doesn't exclude).
 */
export function CorruptionControls({
  item,
  entry,
  onPatch,
}: {
  item: Item;
  entry: BuildItem;
  onPatch: (patch: Partial<BuildItem>) => void;
}) {
  const downsides = availableDownsides(item);
  const oddsPct = downsides.length ? Math.round(1000 / downsides.length) / 10 : 0;
  const penalty = entry.corruptionDownsideId
    ? CORRUPTION_PENALTY_BY_ID[entry.corruptionDownsideId]
    : undefined;

  function toggle(corrupted: boolean) {
    // A slider sitting at the cap (the default) should stay at the cap as
    // the cap moves, rather than suddenly reading "6/8".
    const next = { ...entry, corrupted };
    const patch: Partial<BuildItem> = {
      corrupted,
      corruptionDownsideId: corrupted ? (entry.corruptionDownsideId ?? downsides[0]?.id ?? null) : null,
    };
    const cap = corruptedMaxStacks(item, entry);
    if (entry.stacks >= cap) patch.stacks = corruptedMaxStacks(item, next);
    const cap2 = corruptedMaxStacksSecondary(item, entry);
    if (entry.stacksSecondary >= cap2) patch.stacksSecondary = corruptedMaxStacksSecondary(item, next);
    onPatch(patch);
  }

  function setUpgradeRoll(roll: CorruptionRoll) {
    const next = { ...entry, corruptionUpgradeRoll: roll };
    const patch: Partial<BuildItem> = { corruptionUpgradeRoll: roll };
    if (entry.stacks >= corruptedMaxStacks(item, entry)) patch.stacks = corruptedMaxStacks(item, next);
    if (entry.stacksSecondary >= corruptedMaxStacksSecondary(item, entry)) {
      patch.stacksSecondary = corruptedMaxStacksSecondary(item, next);
    }
    onPatch(patch);
  }

  return (
    <div
      className={clsx(
        "mt-1 rounded-md border px-1.5 py-1 text-[10px]",
        entry.corrupted ? "border-fuchsia-500/40 bg-fuchsia-500/5" : "border-transparent",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <label
          className={clsx(
            "flex cursor-pointer items-center gap-1 rounded-full border px-1.5 py-0.5",
            entry.corrupted
              ? "border-fuchsia-500/60 bg-fuchsia-500/15 text-fuchsia-200"
              : "border-ink-600 bg-ink-850 text-ink-400 hover:text-ink-100",
          )}
          title="The Broker: arrives 30:00±2:00, restocks every 15:00, corrupts one Tier 3/4 item for free — much stronger stats plus one random downside"
        >
          <input
            type="checkbox"
            className="h-3 w-3 accent-fuchsia-500"
            checked={entry.corrupted}
            onChange={(e) => toggle(e.target.checked)}
          />
          <span>{entry.corrupted ? "Corrupted" : "Corrupt"}</span>
        </label>

        {entry.corrupted && (
          <>
            <RollPicker
              label="Upgrade"
              value={entry.corruptionUpgradeRoll}
              onChange={setUpgradeRoll}
              title="Each corrupted bonus rolls ±15% per match. Low = the weakest upgrade the game can give, High = the strongest."
            />
            <span className="flex items-center gap-1">
              <span className="text-ink-400">Downside</span>
              <select
                className="rounded border border-fuchsia-500/40 bg-ink-900 px-1 py-px text-ink-100 outline-none"
                value={entry.corruptionDownsideId ?? ""}
                onChange={(e) => onPatch({ corruptionDownsideId: e.target.value || null })}
              >
                {downsides.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <span
                className="text-ink-500"
                title="Every downside in the item's pool is equally likely; some items can't roll certain downsides at all"
              >
                1 of {downsides.length} · {oddsPct}% each
              </span>
            </span>
            <RollPicker
              label="Downside roll"
              value={entry.corruptionDownsideRoll}
              onChange={(roll) => onPatch({ corruptionDownsideRoll: roll })}
              title="The downside rolls ±15% of its own value, independently of the upgrade. Low = the mildest penalty, High = the harshest."
            />
          </>
        )}
      </div>

      {entry.corrupted && (
        <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 leading-snug">
          {(item.corruption?.rows ?? []).map((row, i) => (
            <span key={`${row.key}-${i}`} className="text-ink-400">
              {row.label}{" "}
              <span className="tnum text-ink-500">
                {row.base !== null ? `${fmt(row.base)}${row.unit} → ` : ""}
              </span>
              <span className="tnum text-fuchsia-200">
                {fmt(corruptedRowValue(row, entry.corruptionUpgradeRoll))}
                {row.unit}
              </span>
            </span>
          ))}
          {penalty &&
            Object.entries(downsideStats(item, penalty)).map(([key, value]) => (
              <span key={key} className="text-red-300">
                <span className="tnum">
                  {formatStat(key, (value ?? 0) * DOWNSIDE_ROLL_MULTIPLIER[entry.corruptionDownsideRoll])}
                </span>{" "}
                {statLabel(key)}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
