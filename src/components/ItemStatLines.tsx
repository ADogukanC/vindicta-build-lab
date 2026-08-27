"use client";

import clsx from "clsx";
import type { Item, InfoRow } from "@/lib/types";
import { formatStat, humaniseGameKey, statLabel } from "@/lib/stats";

export interface StatLine {
  text: string;
  conditional?: boolean;
  perStack?: boolean;
}

/**
 * The build's current spirit power / boons, so a scaled item stat can show
 * both its unscaled rate and what it comes out to right now. Omit either (or
 * the whole object) to fall back to showing just the rate, e.g. in the admin
 * panel where there is no build to scale against.
 */
export interface ScaleContext {
  spiritPower?: number;
  boons?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A stat's `perSpirit`/`perBoon` companion, rendered onto the same line as
 * its base value: just the rate when there is no build to scale it against,
 * or the rate plus what it totals to at the build's current spirit
 * power/boons.
 */
function scaleSuffix(item: Item, key: string, ctx?: ScaleContext): string {
  const perSpirit = item.perSpirit?.[key];
  const perBoon = item.perBoon?.[key];
  if (perSpirit) {
    const rate = `${formatStat(key, perSpirit)}/Spirit`;
    if (ctx?.spiritPower == null) return ` (${rate})`;
    const base = (item.stats?.[key] ?? item.conditionalStats?.[key] ?? 0) as number;
    const total = formatStat(key, base + perSpirit * ctx.spiritPower);
    return ` (${rate} → ${total} at ${Math.round(ctx.spiritPower)} Spirit)`;
  }
  if (perBoon) {
    const rate = `${formatStat(key, perBoon)}/boon`;
    if (ctx?.boons == null) return ` (${rate})`;
    const base = (item.stats?.[key] ?? item.conditionalStats?.[key] ?? 0) as number;
    const total = formatStat(key, base + perBoon * ctx.boons);
    return ` (${rate} → ${total} at ${ctx.boons} boons)`;
  }
  return "";
}

/** The engine-backed stats an item grants, as readable lines. */
export function itemStatLines(item: Item, ctx?: ScaleContext): StatLine[] {
  const lines: StatLine[] = [];
  const scaledKeys = new Set([...Object.keys(item.perSpirit ?? {}), ...Object.keys(item.perBoon ?? {})]);
  for (const [key, value] of Object.entries(item.stats ?? {})) {
    if (value) {
      scaledKeys.delete(key);
      lines.push({ text: `${formatStat(key, value)} ${statLabel(key)}${scaleSuffix(item, key, ctx)}` });
    }
  }
  for (const [key, value] of Object.entries(item.conditionalStats ?? {})) {
    if (value) {
      scaledKeys.delete(key);
      lines.push({
        text: `${formatStat(key, value)} ${statLabel(key)}${scaleSuffix(item, key, ctx)}`,
        conditional: true,
      });
    }
  }
  for (const [key, value] of Object.entries(item.perStack ?? {})) {
    if (value)
      lines.push({ text: `${formatStat(key, value)} ${statLabel(key)} per stack`, perStack: true });
  }
  for (const [key, value] of Object.entries(item.perStackSecondary ?? {})) {
    if (value) {
      // Singularise "Non-hero stacks" -> "non-hero stack" so two stack
      // tracks on one item (Ballistic Enchantment) read as distinct lines
      // rather than both saying the ambiguous "per stack".
      const label = item.stackLabelSecondary
        ? item.stackLabelSecondary.toLowerCase().replace(/s$/, "")
        : "stack";
      lines.push({ text: `${formatStat(key, value)} ${statLabel(key)} per ${label}`, perStack: true });
    }
  }
  // A perBoon/perSpirit key normally rides on a stats/conditionalStats line
  // above (its base value lives there); only shown standalone here if it
  // somehow has no base to attach to.
  for (const key of scaledKeys) {
    const perSpirit = item.perSpirit?.[key];
    if (perSpirit) lines.push({ text: `${formatStat(key, perSpirit)} ${statLabel(key)} per Spirit Power` });
    const perBoon = item.perBoon?.[key];
    if (perBoon) lines.push({ text: `${formatStat(key, perBoon)} ${statLabel(key)} per boon` });
  }
  if (item.shred?.bullet || item.shred?.bulletPerSpirit) {
    const base = item.shred?.bullet ?? 0;
    const perSpirit = item.shred?.bulletPerSpirit;
    const scaled =
      perSpirit && ctx?.spiritPower != null
        ? ` → ${(((base + perSpirit * ctx.spiritPower) * 100)).toFixed(1)}% at ${Math.round(ctx.spiritPower)} Spirit`
        : perSpirit
          ? ` (+${(perSpirit * 100).toFixed(2)}%/Spirit)`
          : "";
    lines.push({ text: `-${(base * 100).toFixed(0)}% enemy Bullet Resist${scaled}` });
  }
  if (item.shred?.spirit || item.shred?.spiritPerSpirit) {
    const base = item.shred?.spirit ?? 0;
    const perSpirit = item.shred?.spiritPerSpirit;
    const scaled =
      perSpirit && ctx?.spiritPower != null
        ? ` → ${(((base + perSpirit * ctx.spiritPower) * 100)).toFixed(1)}% at ${Math.round(ctx.spiritPower)} Spirit`
        : perSpirit
          ? ` (+${(perSpirit * 100).toFixed(2)}%/Spirit)`
          : "";
    lines.push({ text: `-${(base * 100).toFixed(0)}% enemy Spirit Resist${scaled}` });
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

export function ItemStatLines({ item, limit, ctx }: { item: Item; limit?: number; ctx?: ScaleContext }) {
  const lines = itemStatLines(item, ctx);
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

/** Splits a raw game value like "20m" or "1.75m" into its number and unit. */
function parseRowValue(raw: string | number | null): { num: number; unit: string } | null {
  if (raw == null) return null;
  if (typeof raw === "number") return { num: raw, unit: "" };
  const m = raw.trim().match(/^(-?\d+(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  return { num: Number(m[1]), unit: m[2] };
}

/**
 * For an `info` row the engine doesn't model at all (an active item's own
 * nuke damage, a cast range, ...), the scaled reading at the build's current
 * spirit power/boons - or just the flat rate when there is no build to scale
 * against (e.g. the admin panel).
 */
export function infoRowScaleText(row: InfoRow, ctx?: ScaleContext): string | null {
  if (!row.scale) return null;
  const parsed = parseRowValue(row.value);
  if (!parsed) return null;
  const isSpirit = row.scale.kind === "spirit";
  const resource = isSpirit ? ctx?.spiritPower : ctx?.boons;
  if (resource == null) {
    return `+${round2(row.scale.value)}${parsed.unit} per ${isSpirit ? "Spirit Power" : "boon"}`;
  }
  const total = round2(parsed.num + row.scale.value * resource);
  return `→ ${total}${parsed.unit} at ${isSpirit ? Math.round(resource) : resource} ${
    isSpirit ? "Spirit" : "boons"
  }`;
}

/** The numbers the game shows that the calculator does not model. */
export function ItemInfoRows({ item, ctx }: { item: Item; ctx?: ScaleContext }) {
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
            {block.rows.map((row, j) => {
              const scaleText = infoRowScaleText(row, ctx);
              return (
                <li key={j} className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-ink-300">{humaniseGameKey(row.key)}</span>
                  <span className={clsx("tnum shrink-0", row.emphasis ? "text-ink-100" : "text-ink-200")}>
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
  );
}
