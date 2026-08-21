"use client";

import { useEffect, useMemo, useState } from "react";
import { useBuilds } from "@/lib/store/useBuilds";
import { calculateBuild } from "@/lib/calc/engine";
import { itemContributions } from "@/lib/calc/metrics";
import { encodeBuildCode, resolveBuildCode, toSharedBuild } from "@/lib/buildCode";
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
  const [shareResult, setShareResult] = useState<
    { code: string; url: string; dbBacked: boolean } | null
  >(null);
  const [sharing, setSharing] = useState(false);
  const [submission, setSubmission] = useState<
    "idle" | "submitting" | "pending" | "already-submitted" | "error"
  >("idle");
  const [sharedBanner, setSharedBanner] = useState<{ name: string } | "error" | null>(null);

  useEffect(() => {
    void store.hydrate();
    // `hydrate` is idempotent and reads the latest state itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A build arriving via /b/<code> is resolved from the database first (or
  // decoded client-side as a fallback — see `resolveBuildCode`) and added
  // once, the first time it is seen.
  useEffect(() => {
    if (!sharedCode || !store.hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const decoded = await resolveBuildCode(sharedCode);
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

  // Ground and Flight DPS lost if each held item alone were removed, shown per
  // row in the purchase order so "is this worth its souls" doesn't require a
  // trip to the compare page.
  const dpsContributions = useMemo(() => {
    const map = new Map<string, { ground: number; flight: number }>();
    if (!build) return map;
    const ground = itemContributions(build, ctx, "groundDps");
    const flight = itemContributions(build, ctx, "flightDps");
    const flightBySlug = new Map(flight.map((c) => [c.item.slug, c.delta]));
    for (const c of ground) {
      map.set(c.item.slug, { ground: c.delta, flight: flightBySlug.get(c.item.slug) ?? 0 });
    }
    return map;
  }, [build, ctx]);

  async function share() {
    if (!build) return;
    setSharing(true);
    setSubmission("idle");
    try {
      let code: string;
      let dbBacked = true;
      try {
        const response = await fetch("/api/builds", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(toSharedBuild(build)),
        });
        if (!response.ok) throw new Error("share API failed");
        ({ code } = (await response.json()) as { code: string });
      } catch {
        // Offline, or the database is down — fall back to the old
        // client-only code so sharing still works, just longer (and without
        // a "submit to browser" option, since there's no row to submit).
        code = await encodeBuildCode(build);
        dbBacked = false;
      }
      const url = `${window.location.origin}/b/${code}`;
      setShareResult({ code, url, dbBacked });
      await navigator.clipboard.writeText(code).catch(() => {});
    } catch {
      alert("Could not generate a share code for this build.");
    } finally {
      setSharing(false);
    }
  }

  async function submitToDirectory() {
    if (!shareResult) return;
    setSubmission("submitting");
    try {
      const response = await fetch(`/api/builds/${shareResult.code}/submit`, { method: "POST" });
      if (!response.ok) throw new Error("submit failed");
      const body = (await response.json()) as { status: string; changed: boolean };
      setSubmission(body.changed ? "pending" : "already-submitted");
    } catch {
      setSubmission("error");
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
          {shareResult.dbBacked && (
            <div className="mt-1.5 flex items-center gap-2 border-t border-amber-brand/20 pt-1.5 text-[11px]">
              {submission === "pending" ? (
                <span className="text-amber-brand">
                  Submitted — visible in the build browser once an admin approves it.
                </span>
              ) : submission === "already-submitted" ? (
                <span className="text-ink-400">Already submitted for review.</span>
              ) : (
                <>
                  <span className="text-ink-500">
                    Want this listed in the build browser for others to find?
                  </span>
                  <button
                    className="btn shrink-0 px-2 py-0.5 text-[10px]"
                    disabled={submission === "submitting"}
                    onClick={() => void submitToDirectory()}
                  >
                    {submission === "submitting" ? "Submitting…" : "Submit for review"}
                  </button>
                  {submission === "error" && (
                    <span className="text-red-300">Submission failed — try again.</span>
                  )}
                </>
              )}
            </div>
          )}
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
            progression={ctx.progression}
            result={result}
            onChange={(patch) => store.updateActive(patch)}
          />
          <LoadoutPanel
            rows={loadoutRows}
            result={result}
            dpsContributions={dpsContributions}
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
              ctx={result ? { spiritPower: result.spiritPower, boons: result.boons } : undefined}
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
