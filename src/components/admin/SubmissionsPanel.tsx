"use client";

import { useEffect, useState } from "react";
import type { Item } from "@/lib/types";
import type { SharedBuild } from "@/lib/buildCode";
import { fmtSouls } from "@/lib/format";
import { ItemIcon } from "../ItemIcon";

interface PendingBuild {
  code: string;
  name: string;
  payload: SharedBuild;
  createdAt: string;
}

export function SubmissionsPanel({ items }: { items: Item[] }) {
  const [pending, setPending] = useState<PendingBuild[] | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const itemsBySlug = new Map(items.map((i) => [i.slug, i]));

  async function load() {
    const response = await fetch("/api/builds/pending");
    if (!response.ok) {
      setMessage("Failed to load submissions.");
      return;
    }
    const body = (await response.json()) as { builds: PendingBuild[] };
    setPending(body.builds);
  }

  useEffect(() => {
    void load();
  }, []);

  async function review(code: string, approve: boolean) {
    setBusyCode(code);
    try {
      const response = await fetch(`/api/builds/${code}/review`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approve }),
      });
      if (!response.ok) {
        setMessage("Review failed.");
        return;
      }
      setPending((current) => current?.filter((b) => b.code !== code) ?? null);
      setMessage(`${approve ? "Approved" : "Rejected"} the submission.`);
    } finally {
      setBusyCode(null);
    }
  }

  if (pending === null) {
    return <p className="py-16 text-center text-sm text-ink-300">Loading submissions…</p>;
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <span>{pending.length} pending submission{pending.length === 1 ? "" : "s"}</span>
        {message && <span className="text-[12px] normal-case tracking-normal text-amber-brand">{message}</span>}
      </header>
      {pending.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-300">Nothing waiting on review.</p>
      ) : (
        <ul className="divide-y divide-ink-800/60">
          {pending.map((build) => {
            const resolved = build.payload.items
              .map((entry) => itemsBySlug.get(entry.slug))
              .filter((item): item is Item => Boolean(item));
            const totalCost = resolved.reduce((sum, item) => sum + item.cost, 0);
            return (
              <li key={build.code} className="flex flex-col gap-2 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14px] font-medium">{build.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="tnum text-[11px] text-ink-500">{fmtSouls(totalCost)}</span>
                    <span className="text-[10px] text-ink-600">
                      {new Date(build.createdAt).toLocaleString()}
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {resolved.map((item, i) => (
                    <ItemIcon key={`${item.slug}-${i}`} item={item} size="sm" />
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    className="btn btn-danger px-2.5 py-1 text-[12px]"
                    disabled={busyCode === build.code}
                    onClick={() => void review(build.code, false)}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary px-2.5 py-1 text-[12px]"
                    disabled={busyCode === build.code}
                    onClick={() => void review(build.code, true)}
                  >
                    Approve
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
