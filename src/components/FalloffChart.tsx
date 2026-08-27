"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { falloffCurve, falloffMultiplier, type CalcResult } from "@/lib/calc/engine";
import { fmtInt } from "@/lib/format";

const axis = { stroke: "#4d4960", fontSize: 11 };

export function FalloffChart({
  result,
  rangeMeters,
  onRangeChange,
}: {
  result: CalcResult;
  rangeMeters: number;
  onRangeChange: (metres: number) => void;
}) {
  const data = falloffCurve(result, 2, 84);
  const multiplier = falloffMultiplier(
    rangeMeters,
    result.falloffMin,
    result.falloffMax,
    result.falloffValue,
  );

  return (
    <section className="panel">
      <header className="panel-header">
        <span>Damage vs distance</span>
        <span className="normal-case tracking-normal text-ink-500">
          full damage to {fmtInt(result.falloffMin)}m, floor at {fmtInt(result.falloffMax)}m
        </span>
      </header>

      {/* The marker doubles as the source for the "DPS at range" readouts and
          the compare view's "DPS at set range" metric. */}
      <label className="flex items-center gap-3 border-b border-ink-800 px-3 py-2">
        <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-300">
          Marker
        </span>
        <input
          type="range"
          min={0}
          max={84}
          step={1}
          value={rangeMeters}
          onChange={(e) => onRangeChange(Number(e.target.value))}
          className="h-1.5 flex-1 accent-[var(--color-amber-brand)]"
        />
        <span className="tnum shrink-0 text-[11px] text-ink-100">{rangeMeters} m</span>
        <span className="tnum shrink-0 text-[11px] text-ink-500">
          {Math.round(multiplier * 100)}% damage · {fmtInt(result.dpsAtRange)} DPS
        </span>
      </label>
      <div className="h-56 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="#272533" strokeDasharray="3 3" />
            <XAxis
              dataKey="distance"
              tick={axis}
              tickLine={false}
              axisLine={{ stroke: "#272533" }}
              unit="m"
            />
            <YAxis
              tick={axis}
              tickLine={false}
              axisLine={{ stroke: "#272533" }}
              width={48}
              tickFormatter={(v: number) => fmtInt(v)}
            />
            <Tooltip
              contentStyle={{
                background: "#16151d",
                border: "1px solid #363347",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => `${v} m`}
              formatter={(v: number, name: string) => [fmtInt(v), name]}
            />
            <ReferenceLine
              x={Math.round(rangeMeters / 2) * 2}
              stroke="#f0a24b"
              strokeDasharray="4 4"
              label={{ value: `${rangeMeters}m`, fill: "#f0a24b", fontSize: 10, position: "top" }}
            />
            <Line
              type="monotone"
              dataKey="ground"
              name="Ground DPS"
              stroke="#e8834a"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="flight"
              name="Flight DPS"
              stroke="#a879e6"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
