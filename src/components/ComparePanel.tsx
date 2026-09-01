"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";
import { useBuilds } from "@/lib/store/useBuilds";
import { calculateBuild, falloffCurve } from "@/lib/calc/engine";
import {
  METRICS,
  formatMetric,
  itemContributions,
  purchaseCandidates,
  type PurchaseRanking,
  type StackAssumption,
} from "@/lib/calc/metrics";
import type { CalcContext } from "@/lib/types";
import { fmtDelta, fmtInt, fmtPct } from "@/lib/format";
import { ItemIcon } from "./ItemIcon";
import { buildBreakpoints, MAX_SOULS, NetWorthSlider } from "./NetWorthSlider";

const CHART_TOOLTIP = {
  background: "#16151d",
  border: "1px solid #363347",
  borderRadius: 8,
  fontSize: 12,
} as const;

const axis = { stroke: "#4d4960", fontSize: 11 };
// The DPS comparison charts are the main event on this page, so their ticks
// read a size up from every other chart's.
const bigAxis = { stroke: "#4d4960", fontSize: 12 };

export function ComparePanel({ ctx }: { ctx: CalcContext }) {
  const store = useBuilds();
  const [metricKey, setMetricKey] = useState("flightDps");
  const [valueBuildId, setValueBuildId] = useState<string | null>(null);
  // One souls-earned figure drives every build here, so the comparison is
  // always at an equal point in the match rather than each build's own.
  const [souls, setSouls] = useState(MAX_SOULS);
  // Headshot rate is an assumption about play, so it has to be the same for
  // every build or the comparison is measuring two different players.
  const [headshotRate, setHeadshotRate] = useState(10);
  // Same reasoning for snipe stacks: how many kills you've banked is a
  // playstyle/match assumption, not something one build "has" and another
  // doesn't, so every build is measured holding the same count.
  const [snipeStacks, setSnipeStacks] = useState(10);
  // Same reasoning for the target's resist: it describes who you're fighting,
  // not any one build, so every build has to be measured against the same one.
  const [enemyBulletResistPct, setEnemyBulletResistPct] = useState(0);
  const [enemySpiritResistPct, setEnemySpiritResistPct] = useState(0);
  // How hard to assume stacking items are stacked in the value-per-soul
  // section below. Real uptime varies build to build, so this is a toggle
  // rather than a silent guess; conditional items' situational bonuses are
  // always assumed active there regardless (see metrics.ts).
  const [stackAssumption, setStackAssumption] = useState<StackAssumption>("full");
  // Whether both halves of the value-per-soul section rank by raw metric
  // gain ("which item moves the needle most") or by value per soul ("which
  // item is worth its cost"). Shared across both, since it's the same
  // question either way.
  const [purchaseRanking, setPurchaseRanking] = useState<PurchaseRanking>("value");

  useEffect(() => {
    void store.hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];

  const selected = useMemo(() => {
    const ids = store.compareIds.length
      ? store.compareIds
      : store.builds.slice(0, 3).map((b) => b.id);
    return store.builds.filter((b) => ids.includes(b.id));
  }, [store.builds, store.compareIds]);

  const rows = useMemo(
    () =>
      selected.map((build) => {
        const at = {
          ...build,
          soulsEarned: souls,
          headshotRate,
          enemyBulletResistPct,
          enemySpiritResistPct,
          snipeStacks,
        };
        return { build: at, result: calculateBuild(at, ctx) };
      }),
    [selected, ctx, souls, headshotRate, enemyBulletResistPct, enemySpiritResistPct, snipeStacks],
  );

  /**
   * Each build's metric swept across the whole soul range. A single slider
   * position tells you who is ahead right now; the curve tells you where they
   * trade places, which is the question underneath.
   */
  const progression = useMemo(() => {
    const step = 1000;
    const points: Record<string, number>[] = [];
    for (let s = 0; s <= MAX_SOULS; s += step) {
      const row: Record<string, number> = { souls: s };
      for (const build of selected) {
        row[build.name] = metric.get(
          calculateBuild(
            {
              ...build,
              soulsEarned: s,
              headshotRate,
              enemyBulletResistPct,
              enemySpiritResistPct,
              snipeStacks,
            },
            ctx,
          ),
        );
      }
      points.push(row);
    }
    return points;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, ctx, metricKey, headshotRate, enemyBulletResistPct, enemySpiritResistPct, snipeStacks]);

  const itemsBySlug = useMemo(() => new Map(ctx.items.map((i) => [i.slug, i])), [ctx.items]);

  const allBreakpoints = useMemo(
    () =>
      buildBreakpoints(
        selected.flatMap(
          (b) => calculateBuild({ ...b, soulsEarned: 0 }, ctx).timeline.transactions,
        ),
        itemsBySlug,
      ),
    [selected, ctx, itemsBySlug],
  );

  const valueBuildRaw =
    store.builds.find((b) => b.id === valueBuildId) ?? selected[0] ?? store.builds[0] ?? null;
  // Measured at the same souls/headshot/resist figures as every other section
  // on this page, so "best next purchase" answers the same question the
  // charts above are already showing, not whatever this build was last saved at.
  const valueBuild = useMemo(
    () =>
      valueBuildRaw
        ? {
            ...valueBuildRaw,
            soulsEarned: souls,
            headshotRate,
            enemyBulletResistPct,
            enemySpiritResistPct,
            snipeStacks,
          }
        : null,
    [valueBuildRaw, souls, headshotRate, enemyBulletResistPct, enemySpiritResistPct, snipeStacks],
  );

  const contributions = useMemo(
    () =>
      valueBuild ? itemContributions(valueBuild, ctx, metricKey, stackAssumption, purchaseRanking) : [],
    [valueBuild, ctx, metricKey, stackAssumption, purchaseRanking],
  );
  const candidates = useMemo(
    () =>
      valueBuild ? purchaseCandidates(valueBuild, ctx, metricKey, 10, stackAssumption, purchaseRanking) : [],
    [valueBuild, ctx, metricKey, stackAssumption, purchaseRanking],
  );

  if (!store.hydrated) {
    return <div className="py-20 text-center text-sm text-ink-300">Loading builds…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="panel p-8 text-center text-sm text-ink-300">
        No builds yet. <Link className="text-amber-brand underline" href="/">Create one</Link> and
        tick its dot to compare it here.
      </div>
    );
  }

  const baseline = rows[0];
  const barData = rows.map(({ build, result }) => ({
    name: build.name,
    value: metric.get(result),
    color: build.color,
  }));
  // Two falloff series per build (ground + flight), joined on distance.
  const falloffData = (() => {
    const perBuild = rows.map(({ build, result }) => ({
      name: build.name,
      points: falloffCurve(result, 4, 84),
    }));
    const distances = perBuild[0]?.points.map((p) => p.distance) ?? [];
    return distances.map((distance, i) => {
      const row: Record<string, number> = { distance };
      for (const b of perBuild) {
        row[`${b.name} (Ground)`] = b.points[i]?.ground ?? 0;
        row[`${b.name} (Flight)`] = b.points[i]?.flight ?? 0;
      }
      return row;
    });
  })();

  const groups = [...new Set(METRICS.map((m) => m.group))];

  return (
    <div className="space-y-3">
      <section className="panel">
        <header className="panel-header">
          <span>Builds in this comparison</span>
          <span className="normal-case tracking-normal text-ink-500">
            Click to include or exclude
          </span>
        </header>
        <div className="flex flex-wrap gap-2 p-3">
          {store.builds.map((build) => {
            const on = selected.some((s) => s.id === build.id);
            return (
              <button
                key={build.id}
                type="button"
                onClick={() => store.toggleCompare(build.id)}
                className={clsx(
                  "flex items-center gap-2.5 overflow-hidden rounded-lg border py-2 pl-0 pr-3 text-[13px] font-medium transition",
                  on
                    ? "border-ink-500 bg-ink-800 text-ink-100"
                    : "border-ink-700 bg-ink-900 text-ink-400 hover:border-ink-600 hover:bg-ink-850 hover:text-ink-200",
                )}
              >
                <span
                  className="h-full w-1.5 shrink-0 self-stretch"
                  style={{ background: on ? build.color : "#272533" }}
                />
                <span
                  className="h-3 w-3 shrink-0 rounded-full border-2 transition"
                  style={{
                    background: on ? build.color : "transparent",
                    borderColor: on ? build.color : "#4d4960",
                  }}
                />
                {build.name}
                <span className="tnum text-[11px] text-ink-500">
                  {fmtInt(calculateBuild({ ...build, soulsEarned: souls }, ctx).timeline.itemValue)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel grid gap-4 px-3 py-2 lg:grid-cols-[2fr_1fr]">
        <NetWorthSlider
          value={souls}
          onChange={setSouls}
          breakpoints={allBreakpoints}
          label="Souls earned (all builds)"
          detail={
            <span className="tnum mr-2 text-[10px] text-ink-500">
              every build below is measured here
            </span>
          }
        />

        <div className="flex flex-col justify-center gap-3">
          <label className="block">
            <span className="mb-1 flex items-baseline justify-between text-[10px] uppercase tracking-wider text-ink-300">
              <span>Assassinate stacks</span>
              <span className="normal-case tracking-normal text-ink-500">all builds</span>
            </span>
            <input
              type="number"
              min={0}
              step={1}
              value={snipeStacks}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isNaN(next)) return;
                setSnipeStacks(Math.max(0, next));
              }}
              className="input tnum max-w-32"
            />
          </label>

          <label className="block">
            <span className="mb-1 flex items-baseline justify-between text-[10px] uppercase tracking-wider text-ink-300">
              <span>
                Headshots{" "}
                <span className="tnum ml-1 text-[13px] font-semibold text-ink-100">
                  {headshotRate}%
                </span>
              </span>
              <span className="normal-case tracking-normal text-ink-500">all builds</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={headshotRate}
              onChange={(e) => setHeadshotRate(Number(e.target.value))}
              className="h-1.5 w-full accent-[var(--color-amber-brand)]"
            />
            <span className="mt-1 flex justify-between text-[9px] text-ink-600">
              <span>body only</span>
              <span>every shot</span>
            </span>
          </label>

          <div
            className="grid grid-cols-2 gap-3"
            title="The target's own resist before your shred (deadlock.wiki/Damage Resistance)."
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
                onChange={(e) => setEnemyBulletResistPct(Number(e.target.value))}
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
                onChange={(e) => setEnemySpiritResistPct(Number(e.target.value))}
                className="h-1.5 w-full accent-[var(--color-spirit)]"
              />
            </label>
          </div>

          <div
            className="grid grid-cols-2 gap-3 text-[10px] uppercase tracking-wider text-ink-400"
            title="Each build's own resist shred subtracted from the enemy resist above, per build since shred differs build to build (deadlock.wiki/Damage_Resistance)."
          >
            <div className="space-y-1">
              {rows.map(({ build, result }) => (
                <div key={build.id} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: build.color }}
                  />
                  <span className="truncate">{build.name}</span>
                  <span className="tnum ml-auto font-semibold text-ink-100">
                    {fmtPct(Math.min(1, enemyBulletResistPct / 100 - result.bulletResistShred), 0)}
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              {rows.map(({ build, result }) => (
                <div key={build.id} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: build.color }}
                  />
                  <span className="truncate">{build.name}</span>
                  <span className="tnum ml-auto font-semibold text-ink-100">
                    {fmtPct(Math.min(1, enemySpiritResistPct / 100 - result.spiritResistShred), 0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="flex flex-wrap items-center gap-3 rounded-t-xl border border-amber-brand/30 bg-amber-brand/10 px-4 py-3">
          <label htmlFor="focus-metric" className="text-[12px] font-bold uppercase tracking-widest text-amber-brand">
            Focus metric
          </label>
          <select
            id="focus-metric"
            className="input flex-1 min-w-[220px] max-w-sm border-amber-brand/50 bg-ink-900 py-2 text-[14px] font-semibold normal-case tracking-normal text-ink-100 shadow-[0_0_0_1px_rgba(240,162,75,0.15)] focus:outline-2 focus:outline-amber-brand"
            value={metricKey}
            onChange={(e) => setMetricKey(e.target.value)}
          >
            {groups.map((group) => (
              <optgroup key={group} label={group}>
                {METRICS.filter((m) => m.group === group).map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="text-[11px] text-ink-400">
            Drives the charts below and the value-per-soul section further down the page.
          </span>
        </div>
        <div className="flex flex-col gap-6 p-4">
          <div>
            <h3 className="mb-2 text-[12px] uppercase tracking-wider text-ink-300">
              {metric.label} by build
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 32 }}>
                  <CartesianGrid stroke="#272533" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={bigAxis} tickLine={false} axisLine={{ stroke: "#272533" }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={bigAxis}
                    tickLine={false}
                    axisLine={{ stroke: "#272533" }}
                    width={130}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP}
                    cursor={{ fill: "#ffffff08" }}
                    formatter={(v: number) => [formatMetric(metric, v), metric.label]}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {barData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="right"
                      formatter={(v: number) => formatMetric(metric, v)}
                      fill="#e6e3ef"
                      fontSize={12}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-[12px] uppercase tracking-wider text-ink-300">
              {metric.label} across the whole game
            </h3>
            <div className="h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progression} margin={{ left: 8, right: 24, top: 8, bottom: 4 }}>
                  <CartesianGrid stroke="#272533" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="souls"
                    type="number"
                    domain={[0, MAX_SOULS]}
                    tick={bigAxis}
                    tickLine={false}
                    axisLine={{ stroke: "#272533" }}
                    tickCount={17}
                    tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                  />
                  <YAxis
                    tick={bigAxis}
                    tickLine={false}
                    axisLine={{ stroke: "#272533" }}
                    width={64}
                    tickCount={10}
                    tickFormatter={(v: number) => fmtInt(v)}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP}
                    labelFormatter={(v) => `${fmtInt(Number(v))} souls earned`}
                    formatter={(v: number, name: string) => [formatMetric(metric, v), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine
                    x={souls}
                    stroke="#f0a24b"
                    strokeDasharray="4 4"
                    label={{ value: "now", fill: "#f0a24b", fontSize: 11, position: "top" }}
                  />
                  {rows.map(({ build }) => (
                    <Line
                      key={build.id}
                      type="stepAfter"
                      dataKey={build.name}
                      stroke={build.color}
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[11px] text-ink-500">
              Every build re-bought from scratch at each point, so crossovers show exactly
              where one plan overtakes another.
            </p>
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <span>DPS vs distance</span>
          <span className="normal-case tracking-normal text-ink-500">
            solid = ground, dashed = flight
          </span>
        </header>
        <div className="h-96 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={falloffData} margin={{ top: 8, right: 24, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="#272533" strokeDasharray="3 3" />
              <XAxis dataKey="distance" unit="m" tick={bigAxis} tickLine={false} axisLine={{ stroke: "#272533" }} />
              <YAxis tick={bigAxis} tickLine={false} axisLine={{ stroke: "#272533" }} width={64} tickCount={10} />
              <Tooltip contentStyle={CHART_TOOLTIP} labelFormatter={(v) => `${v} m`} formatter={(v: number) => fmtInt(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {rows.map(({ build }) => (
                <Line
                  key={`${build.id}-ground`}
                  type="monotone"
                  dataKey={`${build.name} (Ground)`}
                  stroke={build.color}
                  strokeWidth={2.5}
                  dot={false}
                />
              ))}
              {rows.map(({ build }) => (
                <Line
                  key={`${build.id}-flight`}
                  type="monotone"
                  dataKey={`${build.name} (Flight)`}
                  stroke={build.color}
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <span>Full comparison</span>
          <span className="normal-case tracking-normal text-ink-500">
            deltas are against "{baseline.build.name}"
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-ink-700 text-left">
                <th className="px-3 py-2.5 font-medium text-ink-400">Metric</th>
                {rows.map(({ build }) => (
                  <th key={build.id} className="px-3 py-2.5 font-semibold">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: build.color }}
                      />
                      {build.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group}>
                  <tr className="bg-ink-900">
                    <td
                      colSpan={rows.length + 1}
                      className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-ink-500"
                    >
                      {group}
                    </td>
                  </tr>
                  {METRICS.filter((m) => m.group === group).map((m) => {
                    const baseValue = m.get(baseline.result);
                    return (
                      <tr key={m.key} className="border-b border-ink-800 last:border-0">
                        <td className="px-3 py-1.5 text-ink-300">{m.label}</td>
                        {rows.map(({ build, result }, index) => {
                          const value = m.get(result);
                          const delta = value - baseValue;
                          const better = m.higherIsBetter ? delta > 0 : delta < 0;
                          return (
                            <td key={build.id} className="tnum px-3 py-1.5">
                              {formatMetric(m, value)}
                              {index > 0 && Math.abs(delta) > 1e-9 && (
                                <span
                                  className={clsx(
                                    "ml-1.5 text-[11px]",
                                    better ? "text-emerald-400" : "text-red-400",
                                  )}
                                >
                                  {m.unit === "percent"
                                    ? `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}pp`
                                    : fmtDelta(delta, m.digits)}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {valueBuild && (
        <section className="panel">
          <header className="panel-header">
            <span className="flex items-baseline gap-2">
              Value per soul
              <span className="normal-case tracking-normal text-ink-500">
                at {fmtInt(souls)} souls earned, {headshotRate}% headshots, {snipeStacks} snipe{" "}
                {snipeStacks === 1 ? "stack" : "stacks"}
              </span>
            </span>
            <select
              className="input max-w-52 py-1 text-xs normal-case tracking-normal"
              value={valueBuild.id}
              onChange={(e) => setValueBuildId(e.target.value)}
            >
              {store.builds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </header>
          <div className="flex flex-wrap items-center gap-3 border-b border-ink-800 bg-ink-900/60 px-4 py-2.5">
            <span className="text-[10px] uppercase tracking-wider text-ink-400">DPS metric</span>
            <div className="flex overflow-hidden rounded-lg border border-ink-700">
              {(
                [
                  { key: "groundDps", label: "Ground DPS" },
                  { key: "flightDps", label: "Flight DPS" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setMetricKey(opt.key)}
                  className={clsx(
                    "px-3 py-1 text-[11px] font-medium transition",
                    metricKey === opt.key
                      ? "bg-amber-brand text-ink-950"
                      : "bg-ink-900 text-ink-400 hover:bg-ink-850 hover:text-ink-200",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="text-[10px] uppercase tracking-wider text-ink-400">
              Stack assumption
            </span>
            <div className="flex overflow-hidden rounded-lg border border-ink-700">
              {(
                [
                  { key: "none", label: "No stacks" },
                  { key: "half", label: "Half stacks" },
                  { key: "full", label: "Full stacks" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setStackAssumption(opt.key)}
                  className={clsx(
                    "px-3 py-1 text-[11px] font-medium transition",
                    stackAssumption === opt.key
                      ? "bg-amber-brand text-ink-950"
                      : "bg-ink-900 text-ink-400 hover:bg-ink-850 hover:text-ink-200",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-ink-500">
              How stacked items like Glass Cannon or Spirit Rend are assumed to be below.
              Situational bonuses (procs, buff windows) are always assumed active — see how
              much each item is worth when you actually get to use it.
            </span>
          </div>
          <div className="grid gap-4 p-3 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[11px] uppercase tracking-wider text-ink-300">
                  What each owned item is worth
                </h3>
                <div className="flex overflow-hidden rounded-lg border border-ink-700">
                  {(
                    [
                      { key: "value", label: "By value" },
                      { key: "raw", label: "By raw gain" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setPurchaseRanking(opt.key)}
                      className={clsx(
                        "px-2.5 py-1 text-[10px] font-medium transition",
                        purchaseRanking === opt.key
                          ? "bg-amber-brand text-ink-950"
                          : "bg-ink-900 text-ink-400 hover:bg-ink-850 hover:text-ink-200",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mb-2 text-[11px] text-ink-500">
                {metric.label} lost if that item alone is removed, including any category
                investment bonus that would drop with it.
              </p>
              <ul className="space-y-1.5">
                {contributions.length === 0 && (
                  <li className="text-[13px] text-ink-500">This build has no items yet.</li>
                )}
                {contributions.map((c) => (
                  <li
                    key={c.item.slug}
                    className="flex items-center gap-2.5 rounded-lg border border-ink-800 bg-ink-850 p-2"
                  >
                    <ItemIcon item={c.item} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{c.item.name}</span>
                    <span
                      className={clsx(
                        "tnum text-[12px]",
                        purchaseRanking === "raw" ? "font-semibold text-amber-brand" : "text-ink-400",
                      )}
                    >
                      {formatMetric(metric, c.delta)}
                    </span>
                    <span
                      className={clsx(
                        "tnum w-24 text-right text-[12px]",
                        purchaseRanking === "value" ? "font-semibold text-amber-brand" : "text-ink-400",
                      )}
                    >
                      {formatMetric(metric, c.deltaPer1kSouls)}
                      <span className="text-[10px] font-normal text-ink-500"> /1k</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[11px] uppercase tracking-widest text-ink-400">
                  Best next purchase
                </h3>
                <div className="flex overflow-hidden rounded-lg border border-ink-700">
                  {(
                    [
                      { key: "value", label: "By value" },
                      { key: "raw", label: "By raw gain" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setPurchaseRanking(opt.key)}
                      className={clsx(
                        "px-2.5 py-1 text-[10px] font-medium transition",
                        purchaseRanking === opt.key
                          ? "bg-amber-brand text-ink-950"
                          : "bg-ink-900 text-ink-400 hover:bg-ink-850 hover:text-ink-200",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mb-2 text-[11px] text-ink-500">
                {purchaseRanking === "value" ? (
                  <>
                    Top 10 unowned items simulated on top of this build, ranked by raw{" "}
                    {metric.label.toLowerCase()} gained per 1,000 souls.
                  </>
                ) : (
                  <>
                    Top 10 unowned items simulated on top of this build, ranked by raw{" "}
                    {metric.label.toLowerCase()} gained — the biggest gain, cost aside.
                  </>
                )}
              </p>
              <ul className="space-y-1.5">
                {candidates.map((c, i) => (
                  <li
                    key={c.item.slug}
                    className={clsx(
                      "flex items-center gap-2.5 rounded-lg border p-2 transition",
                      i === 0
                        ? "border-amber-brand/30 bg-amber-brand/5"
                        : "border-ink-800 bg-ink-850",
                    )}
                  >
                    <ItemIcon item={c.item} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{c.item.name}</span>
                    <span
                      className={clsx(
                        "tnum text-[12px]",
                        purchaseRanking === "raw" ? "font-semibold text-amber-brand" : "text-ink-400",
                      )}
                    >
                      {formatMetric(metric, c.delta)}
                    </span>
                    <span
                      className={clsx(
                        "tnum w-24 text-right text-[12px]",
                        purchaseRanking === "value" ? "font-semibold text-amber-brand" : "text-ink-400",
                      )}
                    >
                      {formatMetric(metric, c.deltaPer1kSouls)}
                      <span className="text-[10px] font-normal text-ink-500"> /1k</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
