"use client";

import { useEffect, useState } from "react";
import type { Item } from "@/lib/types";
import type { SharedBuild } from "@/lib/buildCode";
import { fmtSouls } from "@/lib/format";
import { ItemIcon } from "../ItemIcon";

interface DirectoryBuild {
  code: string;
  name: string;
  payload: SharedBuild;
  createdAt: string;
}

function BuildRow({
  build,
  itemsBySlug,
  busy,
  onDelete,
}: {
  build: DirectoryBuild;
  itemsBySlug: Map<string, Item>;
  busy: boolean;
  onDelete: () => void;
}) {
  const resolved = build.payload.items
    .map((entry) => itemsBySlug.get(entry.slug))
    .filter((item): item is Item => Boolean(item));
  const totalCost = resolved.reduce((sum, item) => sum + item.cost, 0);

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-medium">{build.name}</span>
        <span className="flex items-center gap-3">
          <span className="tnum text-[11px] text-ink-500">{fmtSouls(totalCost)}</span>
          <span className="text-[10px] text-ink-600">{new Date(build.createdAt).toLocaleString()}</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {resolved.map((item, i) => (
          <ItemIcon key={`${item.slug}-${i}`} item={item} size="sm" />
        ))}
      </div>
      <div className="flex justify-end pt-1" aria-disabled={busy}>
        <button
          type="button"
          className="btn btn-danger px-2.5 py-1 text-[12px]"
          disabled={busy}
          onClick={onDelete}
          title="Someone may have shared an improved version since — this clears the way for it."
        >
          Delete
        </button>
      </div>
    </li>
  );
}

/**
 * Builds anyone opted into the public browser at share time — no approval
 * queue any more, so the only admin action left is pruning a stale listing.
 */
export function PublishedBuildsPanel({ items }: { items: Item[] }) {
  const [builds, setBuilds] = useState<DirectoryBuild[] | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const itemsBySlug = new Map(items.map((i) => [i.slug, i]));

  async function load() {
    const response = await fetch("/api/builds/published");
    if (!response.ok) {
      setMessage("Failed to load published builds.");
      setBuilds((current) => current ?? []);
      return;
    }
    const body = (await response.json()) as { builds: DirectoryBuild[] };
    setBuilds(body.builds);
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(code: string, name: string) {
    if (!confirm(`Remove "${name}" from the build browser? This deletes its share link too.`)) return;
    setBusyCode(code);
    try {
      const response = await fetch(`/api/builds/${code}`, { method: "DELETE" });
      if (!response.ok) {
        setMessage("Delete failed.");
        return;
      }
      setBuilds((current) => current?.filter((b) => b.code !== code) ?? null);
      setMessage(`Removed "${name}".`);
    } finally {
      setBusyCode(null);
    }
  }

  if (builds === null) {
    return <p className="py-16 text-center text-sm text-ink-300">Loading published builds…</p>;
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <span>
          {builds.length} build{builds.length === 1 ? "" : "s"} live on /browse
        </span>
        {message && (
          <span className="text-[12px] normal-case tracking-normal text-amber-brand">{message}</span>
        )}
      </header>
      {builds.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-300">
          Nothing published yet — sharers opt into /browse themselves from the Share panel.
        </p>
      ) : (
        <ul className="divide-y divide-ink-800/60">
          {builds.map((build) => (
            <BuildRow
              key={build.code}
              build={build}
              itemsBySlug={itemsBySlug}
              busy={busyCode === build.code}
              onDelete={() => void remove(build.code, build.name)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
