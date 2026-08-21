"use client";

import { useState } from "react";
import clsx from "clsx";
import type { Build, HeroConfig, Progression } from "@/lib/types";
import type { CalcResult } from "@/lib/calc/engine";
import { ABILITY_UNLOCK_BOONS } from "@/lib/calc/engine";
import { setUpgradeTier } from "@/lib/build";
import { fmtInt, fmtSouls } from "@/lib/format";

/** Lowest souls-earned figure at which at least `apNeeded` ability points are available. */
function soulsForAbilityPoints(progression: Progression, apNeeded: number): number | null {
  if (apNeeded <= 0) return 0;
  return progression.boons.find((b) => b.abilityPoints >= apNeeded)?.souls ?? null;
}

/** Souls-earned figure at which a given ability slot (1-4) unlocks. */
function soulsForAbilityUnlock(progression: Progression, slot: number): number {
  const unlockBoons = ABILITY_UNLOCK_BOONS[slot - 1] ?? 0;
  return progression.boons.find((b) => b.boons === unlockBoons)?.souls ?? 0;
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  disabled,
}: {
  label: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wider text-ink-300">{label}</span>
      <span className="relative block">
        <input
          type="number"
          className="input tnum disabled:opacity-60"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isNaN(next)) return;
            onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next)));
          }}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-500">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * The three purchasable upgrades for one ability.
 *
 * Upgrades are bought in order, so this behaves like a progress track rather
 * than three switches: clicking a tier takes every tier up to it, and clearing
 * one drops everything above it too. `taken` is always the *effective* state —
 * from `build.abilityUpgrades` normally, but from the AP order below whenever
 * one is set, in which case the row is `locked` and just displays it.
 */
function AbilityRow({
  hero,
  build,
  abilityKey,
  taken,
  locked,
  onChange,
}: {
  hero: HeroConfig;
  build: Build;
  abilityKey: string;
  taken: boolean[];
  locked: boolean;
  onChange: (patch: Partial<Build>) => void;
}) {
  const ability = hero.abilities.find((a) => a.key === abilityKey);
  if (!ability) return null;
  const upgrades = ability.upgrades ?? [];
  const spent = upgrades.reduce((sum, u, i) => sum + (taken[i] ? u.cost : 0), 0);

  const select = (index: number) => {
    if (locked) return;
    onChange({
      abilityUpgrades: {
        ...build.abilityUpgrades,
        [abilityKey]: setUpgradeTier(taken, index),
      },
    });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-ink-700 text-[10px] text-ink-200">
        {ability.slot}
      </span>
      <span className="w-28 shrink-0 truncate text-[12px]">{ability.name}</span>
      <span className="flex items-center">
        {upgrades.map((upgrade, index) => {
          const isTaken = taken[index];
          const isNext = !isTaken && (index === 0 || taken[index - 1]);
          return (
            <span key={upgrade.tier} className="flex items-center">
              {index > 0 && (
                <span
                  className={clsx(
                    "h-px w-2",
                    isTaken ? "bg-amber-brand" : "bg-ink-600",
                  )}
                />
              )}
              <button
                type="button"
                aria-pressed={isTaken}
                disabled={locked}
                title={
                  `${upgrade.cost} AP — ${upgrade.description}` +
                  (locked
                    ? "\nSet by the AP order below."
                    : isTaken
                      ? "\nClick to refund this and every later tier."
                      : `\nClick to buy every tier up to T${upgrade.tier}.`)
                }
                onClick={() => select(index)}
                className={clsx(
                  "rounded border px-1.5 py-0.5 text-[10px] transition",
                  locked && "cursor-default opacity-70",
                  isTaken
                    ? "border-amber-brand bg-amber-brand/15 text-amber-brand"
                    : isNext && !locked
                      ? "border-ink-500 bg-ink-850 text-ink-200 hover:text-ink-100"
                      : "border-ink-700 bg-ink-900 text-ink-600 hover:text-ink-300",
                )}
              >
                T{upgrade.tier}
                <span className="ml-1 text-[9px] opacity-70">{upgrade.cost}</span>
              </button>
            </span>
          );
        })}
      </span>
      <span className="tnum w-10 shrink-0 text-right text-[10px] text-ink-500">
        {spent > 0 ? `${spent} AP` : ""}
      </span>
      <span className="min-w-0 flex-1 truncate text-[10px] text-ink-500">
        {upgrades
          .filter((_, i) => taken[i])
          .map((u) => u.description)
          .join(" · ")}
      </span>
    </div>
  );
}

/**
 * The order to spend ability points in, if the build wants souls-earned to
 * drive tier upgrades the same way it drives the item buy order. Optional —
 * cleared back to an empty list, `AbilityRow` above reverts to manual toggles.
 */
function ApOrderEditor({
  hero,
  apOrder,
  progression,
  resolvedByKey,
  onChange,
}: {
  hero: HeroConfig;
  apOrder: string[];
  progression: Progression;
  resolvedByKey: Map<string, boolean[]>;
  onChange: (next: string[]) => void;
}) {
  const abilities = hero.abilities.slice().sort((a, b) => a.slot - b.slot);
  const abilityByKey = new Map(abilities.map((a) => [a.key, a]));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= apOrder.length) return;
    const next = apOrder.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  // Walk the order once to know each entry's tier (its Nth occurrence of that
  // key), whether the engine actually reached it yet, and the souls figure it
  // would need — the later of "AP budget catches up" and "the slot unlocks",
  // same two conditions `deriveAbilityUpgradesFromApOrder` gates on. This sum
  // is hypothetical (unconditional on earlier entries actually being reached)
  // since it's answering "when would this entry clear on its own", not
  // reproducing the engine's real stop-at-the-first-block cutoff — `reached`,
  // sourced from the engine itself, is what actually drives the row's styling.
  const occurrence: Record<string, number> = {};
  let cumulativeAp = 0;
  const rows = apOrder.map((key, index) => {
    const ability = abilityByKey.get(key);
    const tierIndex = occurrence[key] ?? 0;
    occurrence[key] = tierIndex + 1;
    const upgrade = ability?.upgrades?.[tierIndex];
    const reached = Boolean(resolvedByKey.get(key)?.[tierIndex]);
    let soulsNeeded: number | null = null;
    if (upgrade) {
      cumulativeAp += upgrade.cost;
      const budgetSouls = soulsForAbilityPoints(progression, cumulativeAp);
      const unlockSouls = ability ? soulsForAbilityUnlock(progression, ability.slot) : 0;
      soulsNeeded = budgetSouls === null ? null : Math.max(budgetSouls, unlockSouls);
    }
    return { index, key, ability, tierIndex, upgrade, reached, soulsNeeded };
  });

  return (
    <div className="space-y-1.5 rounded-md border border-ink-700 bg-ink-850 p-2.5">
      <p className="text-[11px] text-ink-500">
        Ability points are spent in this order as souls-earned grows, exactly like the item
        buy order. Doesn&apos;t have to be complete — it just stops wherever the AP budget runs
        out, or at an ability that hasn&apos;t unlocked yet (the ultimate unlocks last).
      </p>
      {apOrder.length === 0 && (
        <p className="text-[11px] text-ink-600">Nothing queued — tiers are set by hand above.</p>
      )}
      <ol className="space-y-1">
        {rows.map(({ index, key, ability, upgrade, reached, soulsNeeded }) => (
          <li
            key={index}
            className={clsx(
              "flex items-center gap-2 rounded border border-ink-800 bg-ink-900 px-1.5 py-1",
              !reached && "opacity-50",
            )}
          >
            <span className="tnum w-4 text-[10px] text-ink-500">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate text-[12px]">
              {ability?.name ?? key} {upgrade ? `T${upgrade.tier}` : ""}
            </span>
            <span className="tnum text-[10px] text-ink-400">{upgrade?.cost ?? "?"} AP</span>
            <span className="tnum w-20 shrink-0 text-right text-[10px] text-ink-500">
              {soulsNeeded !== null ? `at ${fmtSouls(soulsNeeded)}` : ""}
            </span>
            <button
              type="button"
              className="rounded px-1 text-[10px] text-ink-500 hover:text-ink-100 disabled:opacity-30"
              disabled={index === 0}
              onClick={() => move(index, index - 1)}
              title="Earlier"
            >
              ▲
            </button>
            <button
              type="button"
              className="rounded px-1 text-[10px] text-ink-500 hover:text-ink-100 disabled:opacity-30"
              disabled={index === apOrder.length - 1}
              onClick={() => move(index, index + 1)}
              title="Later"
            >
              ▼
            </button>
            <button
              type="button"
              className="rounded px-1 text-[10px] text-ink-500 hover:text-red-300"
              onClick={() => onChange(apOrder.filter((_, i) => i !== index))}
              title="Remove from AP order"
            >
              ✕
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-1.5">
        {abilities.map((a) => {
          const count = apOrder.filter((k) => k === a.key).length;
          const maxed = count >= (a.upgrades?.length ?? 0);
          return (
            <button
              key={a.key}
              type="button"
              disabled={maxed}
              onClick={() => onChange([...apOrder, a.key])}
              className="btn px-2 py-0.5 text-[10px] disabled:opacity-30"
              title={maxed ? `${a.name} is fully queued` : `Queue the next ${a.name} tier`}
            >
              + {a.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function HeroControls({
  build,
  hero,
  progression,
  result,
  onChange,
}: {
  build: Build;
  hero: HeroConfig;
  progression: Progression;
  result: CalcResult;
  onChange: (patch: Partial<Build>) => void;
}) {
  const [showApOrder, setShowApOrder] = useState(false);
  const overspent = result.abilityPointsSpent > result.abilityPoints;
  const apOrder = build.apOrder ?? [];
  const apOrderActive = apOrder.length > 0;
  const resolvedByKey = new Map(
    result.resolvedAbilities.map((r) => [r.ability.key, r.upgradesTaken]),
  );

  return (
    <section className="panel">
      <header className="panel-header">
        <span>{hero.name} setup</span>
        <span className="tnum normal-case tracking-normal text-ink-300">
          {fmtInt(result.timeline.itemValue)} in items ·{" "}
          <span className={clsx(overspent && "text-red-400")}>
            {result.abilityPointsSpent}/{result.abilityPoints} AP
          </span>
        </span>
      </header>

      <div className="space-y-3 p-3">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1.5fr_1fr]">
          <label className="block">
            <span className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-ink-300">
              <span>
                Boons{" "}
                <span className="tnum ml-1 text-[13px] font-semibold text-ink-100">
                  {result.boons}
                </span>
                <span className="text-ink-600"> / {hero.maxBoons}</span>
              </span>
              <button
                type="button"
                onClick={() => onChange({ boonsFromSouls: !build.boonsFromSouls })}
                className={clsx(
                  "rounded px-1 text-[9px] normal-case tracking-normal",
                  build.boonsFromSouls
                    ? "bg-amber-brand/20 text-amber-brand"
                    : "text-ink-500 hover:text-ink-200",
                )}
                title="Read boons from the souls-earned slider. Turn off to pin them by hand."
              >
                {build.boonsFromSouls ? "from souls" : "manual"}
              </button>
            </span>
            <input
              type="range"
              min={0}
              max={hero.maxBoons}
              step={1}
              value={result.boons}
              disabled={build.boonsFromSouls}
              onChange={(e) => onChange({ boons: Number(e.target.value) })}
              className="h-1.5 w-full accent-[var(--color-amber-brand)] disabled:opacity-40"
            />
            <span className="mt-0.5 flex justify-between text-[9px] text-ink-600">
              <span>0</span>
              <span className="tnum">{result.abilityPoints} AP available</span>
              <span>{hero.maxBoons}</span>
            </span>
          </label>
          <NumberField
            label="Assassinate stacks"
            value={build.snipeStacks}
            min={0}
            onChange={(v) => onChange({ snipeStacks: v })}
          />
          <label className="block">
            <span className="mb-1 flex items-baseline justify-between text-[10px] uppercase tracking-wider text-ink-300">
              <span>
                Headshots{" "}
                <span className="tnum ml-1 text-[13px] font-semibold text-ink-100">
                  {build.headshotRate}%
                </span>
              </span>
              <span
                className="tnum normal-case tracking-normal text-ink-500"
                title={`A headshot adds ${Math.round(
                  result.headshotBonus * 100,
                )}% weapon damage. Spirit damage on a bullet gains nothing.`}
              >
                ×{result.headshotMultiplier.toFixed(2)}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={build.headshotRate}
              onChange={(e) => onChange({ headshotRate: Number(e.target.value) })}
              className="h-1.5 w-full accent-[var(--color-amber-brand)]"
            />
          </label>
          <div className="flex items-end">
            <div className="w-full rounded-md border border-ink-700 bg-ink-850 px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wider text-ink-300">Spirit power</div>
              <div className="tnum text-sm font-semibold">{fmtInt(result.spiritPower)}</div>
            </div>
          </div>
        </div>

        <div className="space-y-1.5 rounded-md border border-ink-700 bg-ink-850 p-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-ink-300">
              Ability upgrades
            </span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                className={clsx("btn px-2 py-0.5 text-[10px]", showApOrder && "btn-primary")}
                onClick={() => setShowApOrder((s) => !s)}
              >
                AP order {apOrder.length > 0 && `(${apOrder.length})`}
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={build.crowShredActive}
                onClick={() => onChange({ crowShredActive: !build.crowShredActive })}
                title="Whether Crow's resist shred is currently on the target"
                className={clsx(
                  "rounded border px-2 py-0.5 text-[10px] transition",
                  build.crowShredActive
                    ? "border-amber-brand bg-amber-brand/15 text-amber-brand"
                    : "border-ink-600 text-ink-400 hover:text-ink-100",
                )}
              >
                Crow shred applied
              </button>
            </span>
          </div>
          {hero.abilities
            .slice()
            .sort((a, b) => a.slot - b.slot)
            .map((a) => (
              <AbilityRow
                key={a.key}
                hero={hero}
                build={build}
                abilityKey={a.key}
                taken={resolvedByKey.get(a.key) ?? [false, false, false]}
                locked={apOrderActive}
                onChange={onChange}
              />
            ))}
        </div>

        {showApOrder && (
          <ApOrderEditor
            hero={hero}
            apOrder={apOrder}
            progression={progression}
            resolvedByKey={resolvedByKey}
            onChange={(next) => onChange({ apOrder: next })}
          />
        )}

        <details className="group rounded-md border border-ink-700 bg-ink-850">
          <summary className="cursor-pointer list-none px-2.5 py-1.5 text-[11px] text-ink-300 hover:text-ink-100">
            <span className="inline-block transition group-open:rotate-90">▸</span> Statue buffs &
            model options
          </summary>
          <div className="border-t border-ink-700 p-2.5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <NumberField
                label="Fire rate"
                value={build.adjustables.fireRatePct}
                suffix="%"
                onChange={(v) => onChange({ adjustables: { ...build.adjustables, fireRatePct: v } })}
              />
              <NumberField
                label="Bullet damage"
                value={build.adjustables.bulletDamagePct}
                suffix="%"
                onChange={(v) =>
                  onChange({ adjustables: { ...build.adjustables, bulletDamagePct: v } })
                }
              />
              <NumberField
                label="Spirit power"
                value={build.adjustables.spiritPowerFlat}
                onChange={(v) =>
                  onChange({ adjustables: { ...build.adjustables, spiritPowerFlat: v } })
                }
              />
              <NumberField
                label="Max ammo"
                value={build.adjustables.ammoPct}
                suffix="%"
                onChange={(v) => onChange({ adjustables: { ...build.adjustables, ammoPct: v } })}
              />
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
