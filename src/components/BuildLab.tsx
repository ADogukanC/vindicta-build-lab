"use client";

import { useEffect, useMemo, useState } from "react";
import { useBuilds } from "@/lib/store/useBuilds";
import { calculateBuild } from "@/lib/calc/engine";
import { decodeBuildCode, encodeBuildCode } from "@/lib/buildCode";
import { normalizeBuild } from "@/lib/build";
import type { Build, CalcContext } from "@/lib/types";
import { BuildTabs } from "./BuildTabs";
import { HeroControls } from "./HeroControls";
import { ItemShop } from "./ItemShop";
import { LoadoutPanel } from "./LoadoutPanel";
import { StatsPanel } from "./StatsPanel";
import { FalloffChart } from "./FalloffChart";
import { buildBreakpoints, NetWorthSlider } from "./NetWorthSlider";

export function BuildLab({ ctx, sharedCode }: { ctx: CalcContext; sharedCode?: string }) {
  const store = useBuilds();
  const [shareResult, setShareResult] = useState<{ code: string; url: string } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [sharedBanner, setSharedBanner] = useState<{ name: string } | "error" | null>(null);

  useEffect(() => {
    void store.hydrate();
    // `hydrate` is idempotent and reads the latest state itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A build arriving via /b/<code> is decoded entirely client-side (the code
  // is the build - there is no server round trip) and added once, the first
  // time it is seen.
  useEffect(() => {
    if (!sharedCode || !store.hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const decoded = await decodeBuildCode(sharedCode);
        const build = normalizeBuild(decoded as Partial<Build>);
        if (cancelled) return;
        if (
          store.builds.some((b) => b.name === build.name && b.createdAt === build.createdAt)
        ) {
          setSharedBanner({ name: build.name });
          return;
        }
        store.addBuild(build);
        setSharedBanner({ name: build.name });
      } catch {
        if (!cancelled) setSharedBanner("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedCode, store.hydrated]);

  const build = store.activeBuild();

  const result = useMemo(() => (build ? calculateBuild(build, ctx) : null), [build, ctx]);

  const itemsBySlug = useMemo(
    () => new Map(ctx.items.map((i) => [i.slug, i])),
    [ctx.items],
  );

  const loadoutRows = useMemo(() => {
    if (!build) return [];
    return build.items
      .map((entry) => {
        const item = itemsBySlug.get(entry.slug);
        return item ? { item, entry } : null;
      })
      .filter((r): r is { item: NonNullable<ReturnType<typeof itemsBySlug.get>>; entry: typeof build.items[number] } =>
        Boolean(r),
      );
  }, [build, itemsBySlug]);

  const ownedSlugs = useMemo(
    () => new Set(build?.items.map((i) => i.slug) ?? []),
    [build],
  );

  async function share() {
    if (!build) return;
    setSharing(true);
    try {
      const code = await encodeBuildCode(build);
      // The code itself is the primary artifact — it works no matter where
      // (or whether) this site is hosted, so it's what goes on the clipboard.
      // The /b/<code> link is a convenience for when both people can reach
      // the same origin, e.g. once this is actually deployed somewhere.
      const url = `${window.location.origin}/b/${code}`;
      setShareResult({ code, url });
      await navigator.clipboard.writeText(code).catch(() => {});
    } catch {
      alert("Could not generate a share code for this build.");
    } finally {
      setSharing(false);
    }
  }

  if (!store.hydrated || !build || !result) {
    return <div className="py-20 text-center text-sm text-ink-300">Loading builds…</div>;
  }

  return (
    <>
      <BuildTabs
        builds={store.builds}
        activeId={store.activeId}
        compareIds={store.compareIds}
        onSelect={store.setActive}
        onAdd={() => store.addBuild()}
        onRename={store.renameBuild}
        onRecolor={store.recolorBuild}
        onDuplicate={store.duplicate}
        onDelete={store.deleteBuild}
        onToggleCompare={store.toggleCompare}
        onImport={(builds) => store.importBuilds(builds)}
        onShare={() => void share()}
        soulsFor={(b) => calculateBuild(b, ctx).timeline.itemValue}
      />

      {sharedBanner && sharedBanner !== "error" && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-brand/40 bg-amber-brand/10 px-3 py-2 text-[13px] text-amber-brand">
          Opened a shared build: <strong>{sharedBanner.name}</strong>. It has been added to your
          library as a copy — edit away, the original is untouched.
          <button className="btn ml-auto px-2 py-0.5 text-[11px]" onClick={() => setSharedBanner(null)}>
            Dismiss
          </button>
        </div>
      )}
      {sharedBanner === "error" && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
          That share link doesn&apos;t look like a valid build code.
          <button className="btn ml-auto px-2 py-0.5 text-[11px]" onClick={() => setSharedBanner(null)}>
            Dismiss
          </button>
        </div>
      )}

      {shareResult && (
        <div className="mb-3 rounded-lg border border-amber-brand/40 bg-amber-brand/10 px-3 py-2 text-[13px]">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-amber-brand">Share code copied:</span>
            <code className="min-w-0 flex-1 truncate text-ink-100">{shareResult.code}</code>
            <button
              className="btn shrink-0 px-2 py-0.5 text-[11px]"
              onClick={() => void navigator.clipboard.writeText(shareResult.code).catch(() => {})}
            >
              Copy code
            </button>
            <button
              className="btn shrink-0 px-2 py-0.5 text-[11px]"
              onClick={() => setShareResult(null)}
            >
              Dismiss
            </button>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-500">
            <span className="shrink-0">
              Paste that into "Import code" on another computer. Or, once this site is hosted
              somewhere you can both reach, send the link instead:
            </span>
            <code className="min-w-0 flex-1 truncate">{shareResult.url}</code>
            <button
              className="btn shrink-0 px-1.5 py-0 text-[10px]"
              onClick={() => void navigator.clipboard.writeText(shareResult.url).catch(() => {})}
            >
              Copy link
            </button>
          </div>
        </div>
      )}
      {sharing && <p className="mb-3 text-[13px] text-ink-300">Generating share code…</p>}

      <section className="panel mb-3 px-3 py-2">
        <NetWorthSlider
          value={build.soulsEarned}
          onChange={store.setSouls}
          breakpoints={buildBreakpoints(result.timeline.transactions, itemsBySlug)}
          detail={
            <span className="tnum mr-2 text-[10px] text-ink-500">
              {result.boons} boons · {result.timeline.heldSlugs.size} items worth{" "}
              {result.timeline.itemValue.toLocaleString()}
            </span>
          }
        />
      </section>

      <div className="grid gap-3 xl:grid-cols-12">
        <div className="flex flex-col gap-3 xl:col-span-8">
          <HeroControls
            build={build}
            hero={ctx.hero}
            result={result}
            onChange={(patch) => store.updateActive(patch)}
          />
          <LoadoutPanel
            rows={loadoutRows}
            result={result}
            sellOrder={build.sellOrder ?? []}
            onRemove={store.removeItem}
            onPatch={store.patchItem}
            onMove={store.moveItem}
            onSetSells={store.setSells}
            onClear={() => store.updateActive({ items: [], sellOrder: [] })}
            onSetAllConditionals={(active) =>
              store.updateActive({
                items: build.items.map((i) =>
                  itemsBySlug.get(i.slug)?.conditional ? { ...i, active } : i,
                ),
              })
            }
            abilities={ctx.hero.abilities
              .slice()
              .sort((a, b) => a.slot - b.slot)
              .map((a) => ({ key: a.key, name: a.name, slot: a.slot }))}
            imbueTargets={build.imbueTargets ?? {}}
            onImbue={(slug, abilityKey) => {
              const next = { ...(build.imbueTargets ?? {}) };
              if (abilityKey) next[slug] = abilityKey;
              else delete next[slug];
              store.updateActive({ imbueTargets: next });
            }}
          />
          <FalloffChart
            result={result}
            rangeMeters={build.rangeMeters}
            onRangeChange={(rangeMeters) => store.updateActive({ rangeMeters })}
          />
          <div className="min-h-[28rem]">
            <ItemShop
              items={ctx.items}
              ownedSlugs={ownedSlugs}
              onAdd={(item) => store.addItem(item)}
              onRemove={store.removeItem}
            />
          </div>
        </div>

        <div className="xl:col-span-4">
          <div className="xl:sticky xl:top-[4.5rem]">
            <StatsPanel
              result={result}
              enemyBulletResistPct={build.enemyBulletResistPct}
              enemySpiritResistPct={build.enemySpiritResistPct}
              onEnemyResistChange={(patch) => store.updateActive(patch)}
            />
          </div>
        </div>
      </div>
    </>
  );
}
