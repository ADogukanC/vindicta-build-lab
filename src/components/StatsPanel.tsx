"use client";

import clsx from "clsx";
import type { CalcResult, DamageSet } from "@/lib/calc/engine";
import { fmt, fmtInt, fmtPct } from "@/lib/format";

function Row({
  label,
  value,
  hint,
  strong,
  indent,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  strong?: boolean;
  /** Renders the row as a component of the one above it. */
  indent?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex items-baseline justify-between gap-3 py-1 pr-3",
        indent ? "ml-6 border-l border-ink-800 pl-3" : "px-3",
      )}
      title={hint}
    >
      <span
        className={clsx(
          indent ? "text-[11px] text-ink-400" : "text-[12px]",
          !indent && (strong ? "text-ink-100" : "text-ink-300"),
        )}
      >
        {label}
      </span>
      <span
        className={clsx(
          "tnum",
          indent ? "text-[11px] text-ink-200" : "text-[13px]",
          !indent && (strong ? "font-semibold" : "text-ink-100"),
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-ink-800 py-1.5 first:border-t-0">
      <h3 className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-widest text-ink-500">
        {title}
      </h3>
      {children}
    </div>
  );
}

/**
 * A top-level, collapsible group of sections. The panel has grown a lot of
 * stats over time; grouping them by category and letting each group fold
 * away is what keeps it scannable instead of one long scroll.
 */
function Category({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group border-t border-ink-800 first:border-t-0">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[12px] font-semibold uppercase tracking-widest text-ink-200 hover:bg-ink-850">
        <span className="inline-block text-ink-500 transition group-open:rotate-90">▸</span>
        {title}
      </summary>
      <div className="pb-1">{children}</div>
    </details>
  );
}

function Headline({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5"
      style={color ? { borderTopColor: color, borderTopWidth: "2px" } : undefined}
    >
      <div className="text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className="tnum text-2xl font-bold leading-tight" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="tnum mt-0.5 text-[11px] text-ink-500">{sub}</div>}
    </div>
  );
}

/**
 * The full damage spread for a charged shot with a conditional bonus.
 * The headline is base + bonus, since that is the number that decides whether
 * a target dies.
 */
function DamageProfile({
  profile,
  pick,
}: {
  profile: CalcResult["damageProfiles"][number];
  pick: (set: DamageSet) => number;
}) {
  return (
    <div className="border-t border-ink-800 py-1.5">
      <h3 className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
        {profile.name}
      </h3>

      <div className="mx-3 mb-1.5 rounded-lg border border-spirit/40 bg-spirit/10 px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-ink-300">Max damage</span>
          <span className="text-[10px] text-ink-500">headshot</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="tnum text-2xl font-semibold text-spirit">{fmtInt(pick(profile.max))}</span>
          <span className="tnum text-sm text-ink-100">{fmtInt(pick(profile.maxHeadshot))}</span>
        </div>
        <div className="mt-0.5 text-[10px] text-ink-500">
          {fmtInt(pick(profile.base))} base + {fmtInt(pick(profile.bonus))} vs{" "}
          {profile.bonusLabel.toLowerCase()}
        </div>
      </div>

      <Row label="Body shot" value={fmtInt(pick(profile.base))} />
      <Row
        label={`Headshot (+${profile.headshotBonusPct}%)`}
        value={fmtInt(pick(profile.headshot))}
      />
      <Row
        label={profile.bonusLabel}
        value={`+${fmtInt(pick(profile.bonus))}`}
        hint="Added on top of the body or headshot damage"
      />
      <Row
        label={`Uncharged (${profile.noChargeDamagePct}%)`}
        value={`${fmtInt(pick(profile.uncharged))} · max ${fmtInt(pick(profile.unchargedMax))}`}
        hint={`Fires before the ${profile.chargeTime}s charge completes`}
      />
    </div>
  );
}

export function StatsPanel({
  result,
  enemyBulletResistPct,
  enemySpiritResistPct,
  onEnemyResistChange,
  shred,
  onShredChange,
}: {
  result: CalcResult;
  enemyBulletResistPct: number;
  enemySpiritResistPct: number;
  onEnemyResistChange: (patch: { enemyBulletResistPct?: number; enemySpiritResistPct?: number }) => void;
  /** Whether the target's resists are being shredded by this build. Lifted so the falloff chart can share it. */
  shred: boolean;
  onShredChange: (shred: boolean) => void;
}) {
  const pick = (set: DamageSet) => (shred ? set.shredded : set.raw);
  const procTotal = result.expectedProcDps.reduce((s, p) => s + p.dps, 0);

  // Name the spirit half after whatever is producing it, so the split reads as
  // an explanation rather than a bare number.
  const hasSpiritOnBullet = result.bulletSpiritDamage > 0;
  const spiritSources = result.bulletSpiritDamageSources;
  const groundSpiritLabel = spiritSources.length
    ? `Spirit damage (${spiritSources.join(", ")})`
    : "Spirit damage";
  const flightSpiritLabel = `Spirit damage (${["Flight", ...spiritSources].join(", ")})`;
  const hasProcs = result.expectedProcDps.length > 0;
  const procLabel = `Expected procs (${result.expectedProcDps.map((p) => p.label).join(", ")})`;

  // Effective resist = the target's resist and this build's shred, combined
  // per deadlock.wiki/Damage_Resistance: they each stack multiplicatively on
  // their own side, then shred subtracts from resist. Capped at 100% (matches
  // bulletResistMul/spiritResistMul's floor at 0 in engine.ts) but not floored
  // at 0 — enough shred against low resist reads as negative, i.e. the target
  // takes more than raw damage. Follows the "with/no shred" toggle so it
  // matches whatever the damage numbers below are showing.
  const effectiveBulletResist = shred
    ? Math.min(1, enemyBulletResistPct / 100 - result.bulletResistShred)
    : enemyBulletResistPct / 100;
  const effectiveSpiritResist = shred
    ? Math.min(1, enemySpiritResistPct / 100 - result.spiritResistShred)
    : enemySpiritResistPct / 100;

  return (
    <aside className="panel flex flex-col">
      <header className="panel-header">
        <span>Output</span>
        <button
          type="button"
          onClick={() => onShredChange(!shred)}
          className={clsx(
            "rounded px-2 py-0.5 text-[10px] normal-case tracking-normal transition",
            shred ? "bg-amber-brand/20 text-amber-brand" : "bg-ink-800 text-ink-300 hover:text-ink-100",
          )}
          title="Toggle whether the target's resists are being shredded by this build"
        >
          {shred ? "with shred" : "no shred"}
        </button>
      </header>

      <div
        className="grid grid-cols-2 gap-3 px-3 pt-2"
        title="The target's own resist before your shred. Resist and shred each stack multiplicatively, then shred subtracts from resist (deadlock.wiki/Damage Resistance)."
      >
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-[10px] uppercase tracking-wider text-ink-300">
            <span>
              Enemy bullet resist{" "}
              <span className="tnum ml-1 text-[13px] font-semibold text-ink-100">
                {enemyBulletResistPct}%
              </span>
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={enemyBulletResistPct}
            onChange={(e) => onEnemyResistChange({ enemyBulletResistPct: Number(e.target.value) })}
            className="h-1.5 w-full accent-[var(--color-weapon)]"
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-[10px] uppercase tracking-wider text-ink-300">
            <span>
              Enemy spirit resist{" "}
              <span className="tnum ml-1 text-[13px] font-semibold text-ink-100">
                {enemySpiritResistPct}%
              </span>
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={enemySpiritResistPct}
            onChange={(e) => onEnemyResistChange({ enemySpiritResistPct: Number(e.target.value) })}
            className="h-1.5 w-full accent-[var(--color-spirit)]"
          />
        </label>
      </div>

      <div
        className="grid grid-cols-2 gap-3 px-3 pt-1 text-[10px] uppercase tracking-wider text-ink-400"
        title="Resist and shred each stack multiplicatively on their own, then shred subtracts from resist: damage taken = raw × (1 − (resist − shred)) (deadlock.wiki/Damage_Resistance)."
      >
        <div>
          Effective resist{" "}
          <span className="tnum font-semibold text-ink-100">{fmtPct(effectiveBulletResist, 0)}</span>
        </div>
        <div>
          Effective resist{" "}
          <span className="tnum font-semibold text-ink-100">{fmtPct(effectiveSpiritResist, 0)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3">
        <Headline
          label="Ground DPS"
          value={fmtInt(pick(result.burstDps.ground))}
          sub={`${fmtInt(pick(result.sustainedDps.ground))} with reloads`}
          color="#e8834a"
        />
        <Headline
          label="Flight DPS"
          value={fmtInt(pick(result.burstDps.flight))}
          sub={`${fmtInt(pick(result.sustainedDps.flight))} with reloads`}
          color="#a879e6"
        />
      </div>

      <div className="max-h-[calc(100vh-22rem)] overflow-y-auto pb-2">
        <Category title="Damage">
          <Section title="Per bullet / magazine">
            <Row label="Bullet damage" value={fmt(pick(result.perBullet.ground))} strong />
            {hasSpiritOnBullet && (
              <>
                <Row
                  label={
                    result.headshotRate > 0
                      ? `Gun damage (${Math.round(result.headshotRate * 100)}% headshots)`
                      : "Gun damage"
                  }
                  value={fmt(pick(result.perBulletParts.ground.weapon))}
                  hint={
                    result.headshotRate > 0
                      ? `A headshot adds ${Math.round(
                          result.headshotBonus * 100,
                        )}% weapon damage, so an average bullet is ×${result.headshotMultiplier.toFixed(
                          2,
                        )}. Reduced by the target's bullet resist.`
                      : "Reduced by the target's bullet resist"
                  }
                  indent
                />
                <Row
                  label={groundSpiritLabel}
                  value={fmt(pick(result.perBulletParts.ground.spirit))}
                  hint="Reduced by the target's spirit resist, not their bullet resist"
                  indent
                />
              </>
            )}
            {hasProcs && (
              <Row
                label={procLabel}
                value={fmt(pick(result.perBulletParts.ground.proc))}
                hint={`Averaged over many shots: ${result.expectedProcDps
                  .map((p) => `${p.label} ${Math.round(p.dps)} DPS`)
                  .join(", ")}`}
                indent
              />
            )}

            <Row label="Bullet damage in flight" value={fmt(pick(result.perBullet.flight))} strong />
            <Row
              label={
                result.headshotRate > 0
                  ? `Gun damage (${Math.round(result.headshotRate * 100)}% headshots)`
                  : "Gun damage"
              }
              value={fmt(pick(result.perBulletParts.flight.weapon))}
              hint="Only the weapon half of a bullet gains from a headshot"
              indent
            />
            <Row
              label={flightSpiritLabel}
              value={fmt(pick(result.perBulletParts.flight.spirit))}
              hint="Reduced by the target's spirit resist, not their bullet resist"
              indent
            />
            {hasProcs && (
              <Row
                label={procLabel}
                value={fmt(pick(result.perBulletParts.flight.proc))}
                indent
              />
            )}

            <Row label="Damage per magazine" value={fmtInt(pick(result.perClip.ground))} />
            <Row label="Damage per magazine in flight" value={fmtInt(pick(result.perClip.flight))} />
          </Section>

          <Section title="Damage per second">
            <Row
              label="Ground"
              value={fmtInt(pick(result.burstDps.ground))}
              hint="Trigger held, reloads ignored — the number Deadlock itself quotes"
              strong
            />
            <Row
              label="Ground, with reloads"
              value={fmtInt(pick(result.sustainedDps.ground))}
              hint={`One magazine divided by a full cycle: ${fmt(
                result.timeToEmpty,
                2,
              )}s firing + ${fmt(result.reloadTime, 2)}s reloading`}
            />
            <Row label="Flight" value={fmtInt(pick(result.burstDps.flight))} strong />
            <Row
              label="Flight, with reloads"
              value={fmtInt(pick(result.sustainedDps.flight))}
            />
            <Row
              label="At the chart marker"
              value={fmtInt(shred ? result.dpsAtRange : result.dpsAtRangeRaw)}
              hint="Ground DPS at the distance set on the damage-vs-distance chart"
            />
            {procTotal > 0 && (
              <>
                <Row
                  label="…of which procs"
                  value={fmtInt(procTotal)}
                  hint="Already counted in the DPS above, shown here so each item's share is visible"
                />
                {result.expectedProcDps.map((p) => (
                  <Row key={p.label} label={p.label} value={fmtInt(p.dps)} indent />
                ))}
              </>
            )}
          </Section>

          {result.ricochet && (
            <Section title={`Ricochet · ${result.ricochet.targets} nearby targets`}>
              <Row
                label="Per bullet, each target"
                value={fmt(pick(result.ricochet.perBullet.ground))}
                hint={`Bullet damage carries at ${result.ricochet.damagePct}%, spirit damage in full`}
                strong
              />
              <Row
                label="DPS, each target"
                value={fmtInt(pick(result.ricochet.dps.ground))}
              />
              <Row
                label={`DPS across all ${result.ricochet.targets}`}
                value={fmtInt(pick(result.ricochet.totalDps.ground))}
              />
              <Row
                label="Per bullet, each target in flight"
                value={fmt(pick(result.ricochet.perBullet.flight))}
                hint={`Bullet damage carries at ${result.ricochet.damagePct}%, Flight's spirit bonus carries in full`}
                strong
              />
              <Row
                label="DPS, each target in flight"
                value={fmtInt(pick(result.ricochet.dps.flight))}
              />
              <Row
                label={`DPS across all ${result.ricochet.targets} in flight`}
                value={fmtInt(pick(result.ricochet.totalDps.flight))}
              />
            </Section>
          )}

          {result.abilities.some(
            (a) => a.totalDamage.shredded > 0 || a.dotTargetHealthPctPerSecond > 0,
          ) && (
            <Section title="Abilities">
              {result.abilities
                .filter((a) => a.totalDamage.shredded > 0 || a.dotTargetHealthPctPerSecond > 0)
                .map((a) => (
                  <Row
                    key={a.key}
                    label={a.imbuedBy.length ? `${a.name} ◈` : a.name}
                    value={
                      a.totalDamage.shredded > 0
                        ? `${fmtInt(pick(a.totalDamage))} · ${fmt(pick(a.dps), 1)}/s`
                        : `${fmt(a.dotTargetHealthPctPerSecond, 1)}%/s`
                    }
                    hint={`${fmt(a.effectiveCooldown, 1)}s cooldown, ${a.charges} charge${
                      a.charges === 1 ? "" : "s"
                    }, ${Math.round(a.spiritPower)} spirit${
                      a.imbuedBy.length ? ` (imbued by ${a.imbuedBy.join(", ")})` : ""
                    }${
                      a.dotTargetHealthPctPerSecond
                        ? `, bleed ${a.dotTargetHealthPctPerSecond}% of current health per second`
                        : ""
                    }`}
                  />
                ))}
            </Section>
          )}

          {result.damageProfiles.map((profile) => (
            <DamageProfile key={profile.key} profile={profile} pick={pick} />
          ))}
        </Category>

        <Category title="Weapon & spirit">
          <Section title="Weapon">
            <Row label="Fire rate" value={`${fmt(result.bulletsPerSecond, 2)} /s`} />
            <Row label="Magazine" value={fmt(result.ammo, 1)} />
            <Row label="Magazine in flight" value={fmt(result.flightAmmo, 1)} />
            <Row label="Reload" value={`${fmt(result.reloadTime, 2)}s`} />
            <Row label="Time to empty" value={`${fmt(result.timeToEmpty, 2)}s`} />
            <Row label="Bullet velocity" value={`${fmtInt(result.bulletVelocity)} m/s`} />
            <Row
              label="Falloff range"
              value={`${fmtInt(result.falloffMin)}–${fmtInt(result.falloffMax)} m`}
              hint={`Beyond the far edge, damage drops to ${fmtPct(1 - result.falloffValue, 0)}`}
            />
            <Row label="Light / heavy melee" value={`${fmtInt(result.lightMelee)} / ${fmtInt(result.heavyMelee)}`} />
          </Section>

          <Section title="Spirit">
            <details className="group">
              <summary className="flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1 hover:bg-ink-850">
                <span className="text-[12px] text-ink-100">
                  <span className="mr-1 inline-block text-ink-500 transition group-open:rotate-90">
                    ▸
                  </span>
                  Spirit power
                </span>
                <span className="tnum text-[13px] font-semibold">{fmtInt(result.spiritPower)}</span>
              </summary>
              <ul className="mb-1 ml-3 border-l border-ink-800 py-1 pl-3 pr-3">
                {result.spiritBreakdown.map((source, i) => (
                  <li
                    key={`${source.label}-${i}`}
                    className="flex items-baseline justify-between gap-3 py-0.5"
                  >
                    <span
                      className={clsx(
                        "text-[11px]",
                        source.conditional ? "text-ink-400" : "text-ink-300",
                      )}
                    >
                      {source.conditional && (
                        <span className="mr-1 text-amber-brand" title="Only counted because this item's toggle is on">
                          ◇
                        </span>
                      )}
                      {source.label}
                    </span>
                    <span className="tnum shrink-0 text-[11px] text-ink-100">
                      {source.multiplier ? `×${(1 + source.value / 100).toFixed(2)}` : `+${fmt(source.value, 1)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
            <Row
              label={
                result.flightImbuedBy.length ? "Flight bonus damage ◈" : "Flight bonus damage"
              }
              value={fmt(result.flightBonusDamage)}
              hint={`Spirit damage added to every bullet while airborne, off ${Math.round(
                result.flightSpiritPower,
              )} spirit${
                result.flightImbuedBy.length ? ` (imbued by ${result.flightImbuedBy.join(", ")})` : ""
              }`}
            />
            {result.spiritAmp > 0 && <Row label="Spirit amp" value={fmtPct(result.spiritAmp)} />}
            <Row label="Bullet resist shred" value={fmtPct(result.bulletResistShred)} />
            <Row label="Spirit resist shred" value={fmtPct(result.spiritResistShred)} />
            {result.cooldownReductionPct !== 0 && (
              <Row label="Cooldown reduction" value={`${fmt(result.cooldownReductionPct, 0)}%`} />
            )}
            {result.damageMultiplier !== 1 && (
              <Row
                label="Damage multiplier"
                value={fmtPct(result.damageMultiplier, 0)}
                hint="From items that cost you outgoing damage, such as Golden Goose Egg"
              />
            )}
          </Section>
        </Category>

        <Category title="Survivability">
          <Row label="Health" value={fmtInt(result.health)} strong />
          {result.combatBarrier > 0 && (
            <Row label="Combat barrier" value={fmtInt(result.combatBarrier)} />
          )}
          {result.bulletResistPct !== 0 && (
            <Row label="Effective HP vs bullets" value={fmtInt(result.effectiveHpBullet)} />
          )}
          {result.spiritResistPct !== 0 && (
            <Row label="Effective HP vs spirit" value={fmtInt(result.effectiveHpSpirit)} />
          )}
          <Row label="Health regen" value={`${fmt(result.healthRegen, 1)} /s`} />
          {result.outOfCombatHealthRegen > 0 && (
            <Row label="Out-of-combat regen" value={`+${fmt(result.outOfCombatHealthRegen, 1)} /s`} />
          )}
          {result.bulletResistPct !== 0 && (
            <Row label="Bullet resist" value={`${fmt(result.bulletResistPct, 0)}%`} />
          )}
          {result.spiritResistPct !== 0 && (
            <Row label="Spirit resist" value={`${fmt(result.spiritResistPct, 0)}%`} />
          )}
          {result.debuffResistPct !== 0 && (
            <Row label="Debuff resist" value={`${fmt(result.debuffResistPct, 0)}%`} />
          )}
          <Row label="Move speed" value={`${fmt(result.moveSpeed, 2)} m/s`} />
          <Row label="Sprint speed" value={`+${fmt(result.sprintSpeed, 2)} m/s`} />
          <Row label="Stamina" value={fmtInt(result.stamina)} />
        </Category>

        <Category title="Economy" defaultOpen={false}>
          <Row label="Spent on items" value={fmtInt(result.itemSouls)} strong />
        </Category>

        {result.warnings.length > 0 && (
          <div className="mx-3 mt-2 space-y-1 rounded-md border border-amber-brand/30 bg-amber-brand/10 p-2 text-[11px] text-amber-brand">
            {result.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
