"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import type { Item, ItemCategory } from "@/lib/types";
import { ITEM_CATEGORIES } from "@/lib/types";
import { STAT_DEFS, STAT_GROUP_LABELS, type StatGroup } from "@/lib/stats";
import { fileToIconDataUrl } from "@/lib/image";
import { ItemIcon } from "../ItemIcon";

const STAT_GROUPS: StatGroup[] = ["weapon", "vitality", "spirit", "utility"];

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wider text-ink-300">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[10px] text-ink-500">{hint}</span>}
    </label>
  );
}

/** A grid of every stat in the registry; blank means the item does not grant it. */
function StatGrid({
  values,
  onChange,
  title,
  hint,
}: {
  values: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  title: string;
  hint?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const set = (key: string, raw: string) => {
    const next = { ...values };
    if (raw === "" || Number.isNaN(Number(raw))) delete next[key];
    else next[key] = Number(raw);
    onChange(next);
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-300">{title}</h4>
        <button
          type="button"
          className="text-[11px] text-ink-500 hover:text-ink-100"
          onClick={() => setShowAll((s) => !s)}
        >
          {showAll ? "show only set" : "show all stats"}
        </button>
      </div>
      {hint && <p className="mb-2 text-[11px] text-ink-500">{hint}</p>}
      <div className="space-y-3">
        {STAT_GROUPS.map((group) => {
          const defs = STAT_DEFS.filter(
            (d) => d.group === group && (showAll || values[d.key] !== undefined),
          );
          if (defs.length === 0) return null;
          return (
            <div key={group}>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-500">
                {STAT_GROUP_LABELS[group]}
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {defs.map((def) => (
                  <label key={def.key} className="flex items-center gap-1.5" title={def.hint}>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-ink-200">
                      {def.label}
                    </span>
                    <span className="relative">
                      <input
                        type="number"
                        step="any"
                        className="input tnum w-24 py-1 pr-6 text-right"
                        value={values[def.key] ?? ""}
                        onChange={(e) => set(def.key, e.target.value)}
                      />
                      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-ink-500">
                        {def.kind === "percent" ? "%" : def.kind === "mps" ? "m/s" : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ItemEditor({
  item,
  onChange,
  onSave,
  onDelete,
  saving,
  dirty,
}: {
  item: Item;
  onChange: (next: Item) => void;
  onSave: () => void;
  onDelete: () => void;
  saving: boolean;
  dirty: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [iconError, setIconError] = useState<string | null>(null);
  const patch = (p: Partial<Item>) => onChange({ ...item, ...p });

  async function uploadIcon(file: File) {
    setIconError(null);
    try {
      patch({ iconUrl: await fileToIconDataUrl(file) });
    } catch (error) {
      setIconError(error instanceof Error ? error.message : "Could not read that image.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="text-center">
          <ItemIcon item={item} size="lg" />
          <button
            type="button"
            className="btn mt-1.5 px-2 py-0.5 text-[10px]"
            onClick={() => fileRef.current?.click()}
          >
            Icon
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadIcon(file);
              e.target.value = "";
            }}
          />
        </div>
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          <Field label="Name">
            <input
              className="input"
              value={item.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <Field label="Slug" hint="Used in URLs and by the engine's special hooks. Keep it stable.">
            <input
              className="input font-mono text-xs"
              value={item.slug}
              onChange={(e) =>
                patch({
                  slug: e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, ""),
                })
              }
            />
          </Field>
          <Field label="Category">
            <select
              className="input"
              value={item.category}
              onChange={(e) => patch({ category: e.target.value as ItemCategory })}
            >
              {ITEM_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Soul cost">
            <input
              type="number"
              className="input tnum"
              value={item.cost}
              onChange={(e) => {
                const cost = Number(e.target.value) || 0;
                const tier = { 800: 1, 1600: 2, 3200: 3, 6400: 4, 9999: 5 }[cost] ?? item.tier;
                patch({ cost, tier });
              }}
            />
          </Field>
          <Field label="Activation">
            <select
              className="input"
              value={item.activation}
              onChange={(e) => patch({ activation: e.target.value as Item["activation"] })}
            >
              <option value="Passive">Passive</option>
              <option value="InstantCast">Active (instant cast)</option>
              <option value="Press">Active (press)</option>
              <option value="InstantCastToggle">Toggle</option>
            </select>
          </Field>
          <Field label="Tier">
            <input
              type="number"
              className="input tnum"
              min={1}
              max={5}
              value={item.tier}
              onChange={(e) => patch({ tier: Number(e.target.value) || 1 })}
            />
          </Field>
        </div>
      </div>
      {iconError && <p className="text-[12px] text-red-400">{iconError}</p>}

      <Field label="Description" hint="The wording shown on the item card.">
        <textarea
          className="input min-h-14"
          value={item.description ?? ""}
          onChange={(e) => patch({ description: e.target.value || null })}
        />
      </Field>

      <StatGrid
        title="Stats — always active"
        values={item.stats ?? {}}
        onChange={(stats) => patch({ stats })}
        hint="Percentages are entered as whole numbers: 25 means +25%."
      />

      <StatGrid
        title="Stats — only when the condition is met"
        values={item.conditionalStats ?? {}}
        onChange={(conditionalStats) =>
          patch({
            conditionalStats: Object.keys(conditionalStats).length ? conditionalStats : undefined,
          })
        }
        hint="These are gated behind the item's toggle in a build. Give the item a conditional label below so the toggle has a name."
      />

      {item.components.length > 0 && (
        <div className="rounded-md border border-ink-700 bg-ink-850 p-2 text-[11px] text-ink-300">
          <span className="text-ink-500">Builds from: </span>
          {item.components.join(", ")}
          <span className="mt-1 block text-ink-500">
            Components are consumed when this item is bought, so this item&apos;s stats should
            already include theirs.
          </span>
        </div>
      )}

      <details className="rounded-md border border-ink-700 bg-ink-850">
        <summary className="cursor-pointer px-3 py-2 text-[12px] text-ink-300">
          Conditional, stacking and scaling
        </summary>
        <div className="space-y-4 border-t border-ink-700 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field
              label="Conditional label"
              hint="Leave blank if the bonus is always on. Otherwise the build gets an on/off switch with this label."
            >
              <input
                className="input"
                placeholder="e.g. Recently dashed"
                value={item.conditional?.label ?? ""}
                onChange={(e) =>
                  patch({
                    conditional: e.target.value
                      ? { label: e.target.value, defaultActive: item.conditional?.defaultActive ?? true }
                      : undefined,
                  })
                }
              />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-[12px] text-ink-200">
              <input
                type="checkbox"
                className="accent-[var(--color-amber-brand)]"
                disabled={!item.conditional}
                checked={item.conditional?.defaultActive ?? true}
                onChange={(e) =>
                  item.conditional &&
                  patch({ conditional: { ...item.conditional, defaultActive: e.target.checked } })
                }
              />
              Active by default
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Max stacks">
              <input
                type="number"
                className="input tnum"
                value={item.maxStacks ?? ""}
                onChange={(e) =>
                  patch({ maxStacks: e.target.value === "" ? undefined : Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Default stacks">
              <input
                type="number"
                className="input tnum"
                value={item.defaultStacks ?? ""}
                onChange={(e) =>
                  patch({
                    defaultStacks: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Stack label">
              <input
                className="input"
                placeholder="Stacks"
                value={item.stackLabel ?? ""}
                onChange={(e) => patch({ stackLabel: e.target.value || undefined })}
              />
            </Field>
          </div>

          <StatGrid
            title="Per stack"
            values={item.perStack ?? {}}
            onChange={(perStack) =>
              patch({ perStack: Object.keys(perStack).length ? perStack : undefined })
            }
          />
          <StatGrid
            title="Per hero boon"
            values={item.perBoon ?? {}}
            onChange={(perBoon) =>
              patch({ perBoon: Object.keys(perBoon).length ? perBoon : undefined })
            }
          />
          <StatGrid
            title="Per point of spirit power"
            values={item.perSpirit ?? {}}
            onChange={(perSpirit) =>
              patch({ perSpirit: Object.keys(perSpirit).length ? perSpirit : undefined })
            }
          />
        </div>
      </details>

      <details className="rounded-md border border-ink-700 bg-ink-850">
        <summary className="cursor-pointer px-3 py-2 text-[12px] text-ink-300">
          Resist shred and damage multiplier
        </summary>
        <div className="grid gap-2 border-t border-ink-700 p-3 sm:grid-cols-3">
          {(
            [
              ["bullet", "Bullet shred"],
              ["spirit", "Spirit shred"],
              ["perStackBullet", "Bullet shred per stack"],
              ["perStackSpirit", "Spirit shred per stack"],
              ["bulletPerSpirit", "Bullet shred per spirit"],
              ["spiritPerSpirit", "Spirit shred per spirit"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label} hint="As a fraction: 0.16 means 16%.">
              <input
                type="number"
                step="any"
                className="input tnum"
                value={item.shred?.[key] ?? ""}
                onChange={(e) => {
                  const shred = { ...(item.shred ?? {}) };
                  if (e.target.value === "") delete shred[key];
                  else shred[key] = Number(e.target.value);
                  patch({ shred: Object.keys(shred).length ? shred : undefined });
                }}
              />
            </Field>
          ))}
          <Field
            label="Damage multiplier"
            hint="Below 1 means the item costs you damage, e.g. 0.86 for Cursed Relic."
          >
            <input
              type="number"
              step="any"
              className="input tnum"
              value={item.damageMultiplier ?? ""}
              onChange={(e) =>
                patch({
                  damageMultiplier: e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </Field>
        </div>
      </details>

      <Field label="Notes">
        <textarea
          className="input min-h-16"
          value={item.notes ?? ""}
          onChange={(e) => patch({ notes: e.target.value || undefined })}
        />
      </Field>

      <div className="flex items-center gap-2 border-t border-ink-800 pt-3">
        <label className="flex items-center gap-1.5 text-[12px] text-ink-200">
          <input
            type="checkbox"
            className="accent-[var(--color-amber-brand)]"
            checked={item.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
          Shown in the shop
        </label>
        <span className="flex-1" />
        <button type="button" className="btn btn-danger" onClick={onDelete}>
          Delete
        </button>
        <button
          type="button"
          className={clsx("btn", dirty && "btn-primary")}
          onClick={onSave}
          disabled={saving || !dirty}
        >
          {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
      </div>
    </div>
  );
}
