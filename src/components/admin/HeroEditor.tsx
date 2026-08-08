"use client";

import { useState } from "react";
import clsx from "clsx";
import type { Ability, AbilityEffects, AbilityUpgrade, HeroBaseStats, HeroConfig } from "@/lib/types";

/**
 * The hero editor shows a field only when it applies.
 *
 * Every ability used to render the same fixed grid, so Stake carried a "Flight
 * magazine multiplier" box and Flight carried DoT boxes. Now each ability shows
 * its own numbers plus whatever effects it actually declares, and anything else
 * is one click away behind an explicit "add" control.
 */

const BASE_GROUPS: { title: string; fields: { key: keyof HeroBaseStats; label: string; hint?: string }[] }[] = [
  {
    title: "Weapon",
    fields: [
      { key: "gunDamage", label: "Bullet damage" },
      { key: "bulletsPerSecond", label: "Bullets per second" },
      { key: "ammo", label: "Magazine size" },
      { key: "reloadTime", label: "Reload time (s)" },
      { key: "bulletVelocity", label: "Bullet velocity (m/s)" },
      { key: "lightMelee", label: "Light melee" },
      { key: "heavyMelee", label: "Heavy melee" },
    ],
  },
  {
    title: "Vitality",
    fields: [
      { key: "health", label: "Health" },
      { key: "healthRegen", label: "Health regen (/s)" },
      { key: "moveSpeed", label: "Move speed (m/s)" },
      { key: "sprintSpeed", label: "Sprint bonus (m/s)" },
      { key: "dashSpeed", label: "Dash speed (m/s)" },
      { key: "stamina", label: "Stamina" },
      { key: "staminaCooldown", label: "Stamina cooldown (s)" },
    ],
  },
  {
    title: "Spirit & falloff",
    fields: [
      { key: "spiritPower", label: "Base spirit power" },
      { key: "falloffMin", label: "Falloff start (m)" },
      { key: "falloffMax", label: "Falloff end (m)" },
      {
        key: "falloffValue",
        label: "Falloff amount",
        hint: "0.9 means damage drops to 10% beyond the far edge.",
      },
    ],
  },
];

const EFFECT_FIELDS: { key: keyof AbilityEffects; label: string; hint: string }[] = [
  {
    key: "bulletResistShred",
    label: "Bullet resist shred",
    hint: "As a fraction: 0.06 strips 6% bullet resist.",
  },
  {
    key: "spiritResistShred",
    label: "Spirit resist shred",
    hint: "As a fraction: 0.06 strips 6% spirit resist.",
  },
  {
    key: "gunDamagePerStack",
    label: "Gun damage per stack",
    hint: "As a fraction: 0.06 is +6% bullet damage per stack held.",
  },
  {
    key: "flightBaseDamage",
    label: "Flight bonus damage",
    hint: "Flat spirit damage added to each bullet while the ability is active.",
  },
  {
    key: "flightSpiritScaling",
    label: "Flight spirit scaling",
    hint: "Extra bonus damage per point of spirit power.",
  },
  {
    key: "flightAmmoMultiplier",
    label: "Flight magazine multiplier",
    hint: "1.5 adds 50% of the base magazine while flying.",
  },
];

function Num({
  label,
  value,
  onChange,
  hint,
  onRemove,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  hint?: string;
  onRemove?: () => void;
}) {
  return (
    <label className="block" title={hint}>
      <span className="mb-1 flex items-center justify-between gap-1 text-[10px] uppercase tracking-wider text-ink-300">
        <span className="truncate">{label}</span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 text-ink-600 hover:text-red-300"
            title="Remove this field"
          >
            ✕
          </button>
        )}
      </span>
      <input
        type="number"
        step="any"
        className="input tnum"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    </label>
  );
}

function AddFieldMenu({
  options,
  onAdd,
  label = "Add field",
}: {
  options: { key: string; label: string }[];
  onAdd: (key: string) => void;
  label?: string;
}) {
  if (options.length === 0) return null;
  return (
    <label className="flex items-end">
      <select
        className="input py-1 text-[11px]"
        value=""
        onChange={(e) => {
          if (e.target.value) onAdd(e.target.value);
        }}
      >
        <option value="">+ {label}…</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function EffectGrid({
  effects,
  onChange,
  title,
}: {
  effects: AbilityEffects | undefined;
  onChange: (next: AbilityEffects | undefined) => void;
  title: string;
}) {
  const present = EFFECT_FIELDS.filter((f) => effects?.[f.key] !== undefined);
  const absent = EFFECT_FIELDS.filter((f) => effects?.[f.key] === undefined);

  const set = (key: keyof AbilityEffects, value: number | undefined) => {
    const next: AbilityEffects = { ...(effects ?? {}) };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(Object.keys(next).length ? next : undefined);
  };

  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-500">{title}</div>
      <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {present.map((f) => (
          <Num
            key={f.key}
            label={f.label}
            hint={f.hint}
            value={effects?.[f.key]}
            onChange={(v) => set(f.key, v)}
            onRemove={() => set(f.key, undefined)}
          />
        ))}
        <AddFieldMenu
          options={absent.map((f) => ({ key: f.key, label: f.label }))}
          onAdd={(key) => set(key as keyof AbilityEffects, 0)}
          label="effect"
        />
      </div>
    </div>
  );
}

function UpgradeEditor({
  upgrade,
  onChange,
}: {
  upgrade: AbilityUpgrade;
  onChange: (next: AbilityUpgrade) => void;
}) {
  const deltas = [
    { key: "damageDelta" as const, label: "Damage change" },
    { key: "cooldownDelta" as const, label: "Cooldown change (s)" },
    { key: "chargesDelta" as const, label: "Charges change" },
  ];
  const present = deltas.filter((d) => upgrade[d.key] !== undefined);
  const absent = deltas.filter((d) => upgrade[d.key] === undefined);

  return (
    <div className="rounded border border-ink-700 bg-ink-900 p-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded bg-spirit/25 text-[10px] font-semibold text-spirit">
          T{upgrade.tier}
        </span>
        <label className="flex items-center gap-1 text-[10px] text-ink-400">
          <span>AP</span>
          <input
            type="number"
            className="input tnum w-14 py-0.5 text-right"
            value={upgrade.cost}
            onChange={(e) => onChange({ ...upgrade, cost: Number(e.target.value) || 0 })}
          />
        </label>
        <input
          className="input flex-1 py-0.5 text-[12px]"
          placeholder="What the upgrade says in game"
          value={upgrade.description}
          onChange={(e) => onChange({ ...upgrade, description: e.target.value })}
        />
      </div>
      <div className="grid gap-1.5 sm:grid-cols-3">
        {present.map((d) => (
          <Num
            key={d.key}
            label={d.label}
            value={upgrade[d.key]}
            onChange={(v) => onChange({ ...upgrade, [d.key]: v })}
            onRemove={() => {
              const next = { ...upgrade };
              delete next[d.key];
              onChange(next);
            }}
          />
        ))}
        <AddFieldMenu
          options={absent.map((d) => ({ key: d.key, label: d.label }))}
          onAdd={(key) => onChange({ ...upgrade, [key]: 0 })}
          label="change"
        />
      </div>
      <div className="mt-2">
        <EffectGrid
          title="Effects granted"
          effects={upgrade.effects}
          onChange={(effects) => onChange({ ...upgrade, effects })}
        />
      </div>
    </div>
  );
}

function AbilityEditor({
  ability,
  onChange,
}: {
  ability: Ability;
  onChange: (next: Ability) => void;
}) {
  const dealsDamage = (ability.damageType ?? "spirit") !== "none";
  const hasDot =
    ability.dotDamage !== undefined ||
    ability.dotSpiritScaling !== undefined ||
    ability.dotDuration !== undefined ||
    ability.dotTargetHealthPctPerSecond !== undefined;

  const patch = (p: Partial<Ability>) => onChange({ ...ability, ...p });
  const drop = (key: keyof Ability) => {
    const next = { ...ability };
    delete next[key];
    onChange(next);
  };

  return (
    <div className="space-y-3 border-t border-ink-700 p-3">
      {ability.notes && <p className="text-[11px] text-ink-500">{ability.notes}</p>}

      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-ink-300">Name</span>
          <input
            className="input"
            value={ability.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-ink-300">
            Damage type
          </span>
          <select
            className="input"
            value={ability.damageType ?? "spirit"}
            onChange={(e) => patch({ damageType: e.target.value as Ability["damageType"] })}
          >
            <option value="spirit">Spirit</option>
            <option value="weapon">Weapon</option>
            <option value="none">No direct damage</option>
          </select>
        </label>
        <Num
          label="Cooldown (s)"
          value={ability.cooldown}
          onChange={(v) => patch({ cooldown: v ?? 0 })}
        />
        <Num label="Charges" value={ability.charges} onChange={(v) => patch({ charges: v })} />
        {ability.castTime !== undefined && (
          <Num
            label="Cast time (s)"
            value={ability.castTime}
            onChange={(v) => patch({ castTime: v })}
            onRemove={() => drop("castTime")}
          />
        )}
        {ability.duration !== undefined && (
          <Num
            label="Duration (s)"
            value={ability.duration}
            onChange={(v) => patch({ duration: v })}
            onRemove={() => drop("duration")}
          />
        )}
        {dealsDamage && (
          <>
            <Num
              label="Base damage"
              value={ability.baseDamage}
              onChange={(v) => patch({ baseDamage: v ?? 0 })}
            />
            <Num
              label="Spirit scaling"
              hint="Damage added per point of spirit power."
              value={ability.spiritScaling}
              onChange={(v) => patch({ spiritScaling: v ?? 0 })}
            />
          </>
        )}
        <AddFieldMenu
          options={[
            ...(ability.castTime === undefined ? [{ key: "castTime", label: "Cast time" }] : []),
            ...(ability.duration === undefined ? [{ key: "duration", label: "Duration" }] : []),
          ]}
          onAdd={(key) => patch({ [key]: 0 } as Partial<Ability>)}
        />
      </div>

      {hasDot ? (
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-ink-500">
              Damage over time
            </span>
            <button
              type="button"
              className="text-[10px] text-ink-600 hover:text-red-300"
              onClick={() =>
                onChange({
                  ...ability,
                  dotDamage: undefined,
                  dotSpiritScaling: undefined,
                  dotDuration: undefined,
                  dotTargetHealthPctPerSecond: undefined,
                })
              }
            >
              remove
            </button>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-4">
            <Num
              label="DoT damage"
              value={ability.dotDamage}
              onChange={(v) => patch({ dotDamage: v })}
            />
            <Num
              label="DoT spirit scaling"
              value={ability.dotSpiritScaling}
              onChange={(v) => patch({ dotSpiritScaling: v })}
            />
            <Num
              label="DoT duration (s)"
              value={ability.dotDuration}
              onChange={(v) => patch({ dotDuration: v })}
            />
            <Num
              label="% target HP / sec"
              hint="Bleed dealing a share of the target's current health. Shown but not added to DPS, since it depends on the target."
              value={ability.dotTargetHealthPctPerSecond}
              onChange={(v) => patch({ dotTargetHealthPctPerSecond: v })}
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn px-2 py-0.5 text-[11px]"
          onClick={() => patch({ dotDamage: 0, dotDuration: 0 })}
        >
          + Damage over time
        </button>
      )}

      <EffectGrid
        title="Effects while unlocked"
        effects={ability.effects}
        onChange={(effects) => patch({ effects })}
      />

      <div>
        <div className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-500">Upgrades</div>
        <div className="space-y-2">
          {(ability.upgrades ?? []).map((upgrade, index) => (
            <UpgradeEditor
              key={upgrade.tier}
              upgrade={upgrade}
              onChange={(next) =>
                patch({
                  upgrades: (ability.upgrades ?? []).map((u, i) => (i === index ? next : u)),
                })
              }
            />
          ))}
        </div>
      </div>

      <label className="flex items-center gap-1.5 text-[12px] text-ink-200">
        <input
          type="checkbox"
          className="accent-[var(--color-amber-brand)]"
          checked={Boolean(ability.needsVerification)}
          onChange={(e) => patch({ needsVerification: e.target.checked })}
        />
        Still using placeholder values
      </label>
    </div>
  );
}

export function HeroEditor({
  hero,
  onChange,
  onSave,
  saving,
  dirty,
}: {
  hero: HeroConfig;
  onChange: (next: HeroConfig) => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
}) {
  const [openAbility, setOpenAbility] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-300">
          Base stats
        </h3>
        <div className="space-y-3">
          {BASE_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-500">
                {group.title}
              </div>
              <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {group.fields.map((f) => (
                  <Num
                    key={String(f.key)}
                    label={f.label}
                    hint={f.hint}
                    value={hero.base[f.key]}
                    onChange={(v) => onChange({ ...hero, base: { ...hero.base, [f.key]: v ?? 0 } })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-300">
          Per boon
        </h3>
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {(
            [
              ["gunDamage", "Bullet damage"],
              ["spiritPower", "Spirit power"],
              ["health", "Health"],
              ["lightMelee", "Light melee"],
              ["heavyMelee", "Heavy melee"],
            ] as const
          ).map(([key, label]) => (
            <Num
              key={key}
              label={label}
              value={hero.perBoon[key]}
              onChange={(v) => onChange({ ...hero, perBoon: { ...hero.perBoon, [key]: v ?? 0 } })}
            />
          ))}
          <Num
            label="Max boons"
            value={hero.maxBoons}
            onChange={(v) => onChange({ ...hero, maxBoons: v ?? 35 })}
          />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3 xl:grid-cols-4">
          <Num
            label="Bullet damage per spirit"
            hint="Vindicta's gun damage scales with spirit power at this rate."
            value={hero.gunDamageSpiritScaling}
            onChange={(v) => onChange({ ...hero, gunDamageSpiritScaling: v ?? 0 })}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-300">
          Abilities
        </h3>
        <div className="space-y-2">
          {hero.abilities
            .slice()
            .sort((a, b) => a.slot - b.slot)
            .map((ability) => {
              const open = openAbility === ability.key;
              return (
                <div key={ability.key} className="rounded-md border border-ink-700 bg-ink-850">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left"
                    onClick={() => setOpenAbility(open ? null : ability.key)}
                  >
                    <span className="grid h-5 w-5 place-items-center rounded bg-ink-700 text-[10px]">
                      {ability.slot}
                    </span>
                    <span className="text-[13px]">{ability.name}</span>
                    <span className="text-[10px] text-ink-500">
                      {ability.cooldown}s
                      {(ability.charges ?? 1) > 1 && ` · ${ability.charges} charges`}
                    </span>
                    {ability.needsVerification && (
                      <span className="rounded bg-amber-brand/20 px-1.5 py-0.5 text-[10px] text-amber-brand">
                        placeholder values
                      </span>
                    )}
                    <span className="ml-auto text-ink-500">{open ? "▾" : "▸"}</span>
                  </button>
                  {open && (
                    <AbilityEditor
                      ability={ability}
                      onChange={(next) =>
                        onChange({
                          ...hero,
                          abilities: hero.abilities.map((a) =>
                            a.key === ability.key ? next : a,
                          ),
                        })
                      }
                    />
                  )}
                </div>
              );
            })}
        </div>
      </section>

      <div className="flex justify-end border-t border-ink-800 pt-3">
        <button
          type="button"
          className={clsx("btn", dirty && "btn-primary")}
          onClick={onSave}
          disabled={saving || !dirty}
        >
          {saving ? "Saving…" : dirty ? "Save hero" : "Saved"}
        </button>
      </div>
    </div>
  );
}
