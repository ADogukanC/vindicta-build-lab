"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "@/lib/types";
import type { SharedBuild } from "@/lib/buildCode";
import { normalizeBuild } from "@/lib/build";
import { useBuilds } from "@/lib/store/useBuilds";
import { fmtSouls } from "@/lib/format";
import { ItemIcon } from "./ItemIcon";

interface DirectoryBuild {
  code: string;
  name: string;
  payload: SharedBuild;
  createdAt: string | Date;
}

function BuildCard({
  build,
  itemsBySlug,
}: {
  build: DirectoryBuild;
  itemsBySlug: Map<string, Item>;
}) {
  const store = useBuilds();
  const [imported, setImported] = useState(false);
  const resolved = build.payload.items
    .map((entry) => itemsBySlug.get(entry.slug))
    .filter((item): item is Item => Boolean(item));
  const totalCost = resolved.reduce((sum, item) => sum + item.cost, 0);

  function importBuild() {
    const next = normalizeBuild({ ...build.payload, id: undefined, name: build.name });
    store.importBuilds([next]);
    setImported(true);
  }

  return (
    <div className="panel flex flex-col gap-2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[14px] font-medium">{build.name}</span>
        <span className="tnum shrink-0 text-[11px] text-ink-500">{fmtSouls(totalCost)}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {resolved.slice(0, 12).map((item, i) => (
          <ItemIcon key={`${item.slug}-${i}`} item={item} size="sm" />
        ))}
        {build.payload.items.length > 12 && (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-ink-700 bg-ink-850 text-[10px] text-ink-400">
            +{build.payload.items.length - 12}
          </span>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between pt-1">
        <span className="text-[10px] text-ink-600">
          {new Date(build.createdAt).toLocaleDateString()}
        </span>
        <button
          type="button"
          className="btn px-2 py-0.5 text-[11px]"
          disabled={imported}
          onClick={importBuild}
        >
          {imported ? "Added to your builds" : "Import"}
        </button>
      </div>
    </div>
  );
}

export function BrowsePanel({
  items,
  initialBuilds,
}: {
  items: Item[];
  initialBuilds: DirectoryBuild[];
}) {
  const [builds, setBuilds] = useState(initialBuilds);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialBuilds.length >= 30);
  const itemsBySlug = useMemo(() => new Map(items.map((i) => [i.slug, i])), [items]);
  // Guards against an earlier, slower request overwriting a later one's result.
  const requestId = useRef(0);
  // The server already fetched the unfiltered first page — skip re-fetching
  // it the moment this effect mounts with the initial, empty query.
  const skipNextFetch = useRef(true);

  // Debounced: search-as-you-type without hitting the database on every keystroke.
  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/builds/directory?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((body: { builds: DirectoryBuild[] }) => {
          if (id !== requestId.current) return;
          setBuilds(body.builds);
          setHasMore(body.builds.length >= 30);
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function loadMore() {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/builds/directory?q=${encodeURIComponent(query)}&offset=${builds.length}`,
      );
      const body = (await response.json()) as { builds: DirectoryBuild[] };
      setBuilds((current) => [...current, ...body.builds]);
      setHasMore(body.builds.length >= 30);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-[15px] font-semibold">Build browser</h1>
        <span className="text-[12px] text-ink-500">
          Community builds, approved by an admin before they show up here.
        </span>
        <span className="flex-1" />
        <input
          className="input w-64 py-1 text-[13px]"
          placeholder="Search by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {builds.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-300">
          {loading ? "Loading…" : "No approved builds yet — be the first to submit one from the Share panel."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {builds.map((b) => (
            <BuildCard key={b.code} build={b} itemsBySlug={itemsBySlug} />
          ))}
        </div>
      )}

      {hasMore && builds.length > 0 && (
        <div className="flex justify-center pt-2">
          <button className="btn px-3 py-1 text-[12px]" disabled={loading} onClick={() => void loadMore()}>
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
