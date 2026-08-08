"use client";

import clsx from "clsx";
import type { Item } from "@/lib/types";
import { formatStat, humaniseGameKey, statLabel } from "@/lib/stats";

export interface StatLine {
  text: string;
  conditional?: boolean;
  perStack?: boolean;
}

/** The engine-backed stats an item grants, as readable lines. */
export function itemStatLines(item: Item): StatLine[] {
  const lines: StatLine[] = [];
  for (const [key, value] of Object.entries(item.stats ?? {})) {
    if (value) lines.push({ text: `${formatStat(key, value)} ${statLabel(key)}` });
  }
  for (const [key, value] of Object.entries(item.conditionalStats ?? {})) {
    if (value) lines.push({ text: `${formatStat(key, value)} ${statLabel(key)}`, conditional: true });
  }
  for (const [key, value] of Object.entries(item.perStack ?? {})) {
    if (value)
      lines.push({ text: `${formatStat(key, value)} ${statLabel(key)} per stack`, perStack: true });
  }
  for (const [key, value] of Object.entries(item.perBoon ?? {})) {
    if (value) lines.push({ text: `${formatStat(key, value)} ${statLabel(key)} per boon` });
  }
  if (item.shred?.bullet) {
    lines.push({ text: `-${(item.shred.bullet * 100).toFixed(0)}% enemy Bullet Resist` });
  }
  if (item.shred?.spirit) {
    lines.push({ text: `-${(item.shred.spirit * 100).toFixed(0)}% enemy Spirit Resist` });
  }
  if (item.shred?.perStackBullet) {
    lines.push({
      text: `-${(item.shred.perStackBullet * 100).toFixed(0)}% enemy Bullet Resist per stack`,
      perStack: true,
    });
  }
  if (item.shred?.perStackSpirit) {
    lines.push({
      text: `-${(item.shred.perStackSpirit * 100).toFixed(0)}% enemy Spirit Resist per stack`,
      perStack: true,
    });
  }
  if (item.damageMultiplier != null && item.damageMultiplier !== 1) {
    lines.push({ text: `${((1 - item.damageMultiplier) * -100).toFixed(0)}% damage dealt` });
  }
  return lines;
}

export function ItemStatLines({ item, limit }: { item: Item; limit?: number }) {
  const lines = itemStatLines(item);
  if (lines.length === 0) {
    return <p className="text-[11px] text-ink-500">No stats the calculator models</p>;
  }
  const shown = limit ? lines.slice(0, limit) : lines;
  return (
    <ul className="space-y-0.5 text-[11px]">
      {shown.map((line, i) => (
        <li
          key={`${line.text}-${i}`}
          className={clsx(
            line.conditional || line.perStack ? "text-ink-300" : "text-ink-100",
          )}
        >
          {(line.conditional || line.perStack) && (
            <span className="mr-1 text-amber-brand" title="Only counts when the item's condition is met">
              ◇
            </span>
          )}
          {line.text}
        </li>
      ))}
      {limit && lines.length > limit && (
        <li className="text-[10px] text-ink-500">+{lines.length - limit} more</li>
      )}
    </ul>
  );
}

/** The numbers the game shows that the calculator does not model. */
export function ItemInfoRows({ item }: { item: Item }) {
  const blocks = (item.info ?? []).filter((b) => b.rows.length > 0 || b.cooldown);
  if (blocks.length === 0) return null;
  return (
    <div className="space-y-2">
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
          <ul className="grid gap-x-3 gap-y-0.5 text-[11px] sm:grid-cols-2">
            {block.rows.map((row, j) => (
              <li key={j} className="flex items-baseline justify-between gap-2">
                <span className="truncate text-ink-300">{humaniseGameKey(row.key)}</span>
                <span className={clsx("tnum shrink-0", row.emphasis ? "text-ink-100" : "text-ink-200")}>
                  {row.value === null ? "yes" : String(row.value)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
