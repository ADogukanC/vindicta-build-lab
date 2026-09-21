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
  renaming,
  renameValue,
  renameBusy,
  onDelete,
  onStartRename,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
}: {
  build: DirectoryBuild;
  itemsBySlug: Map<string, Item>;
  busy: boolean;
  renaming: boolean;
  renameValue: string;
  renameBusy: boolean;
  onDelete: () => void;
  onStartRename: () => void;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
}) {
  const resolved = build.payload.items
    .map((entry) => itemsBySlug.get(entry.slug))
    .filter((item): item is Item => Boolean(item));
  const totalCost = resolved.reduce((sum, item) => sum + item.cost, 0);

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        {renaming ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              onRenameSubmit();
            }}
          >
            <input
              autoFocus
              className="input min-w-0 flex-1 py-0.5 text-[13px]"
              value={renameValue}
              maxLength={200}
              disabled={renameBusy}
              onChange={(e) => onRenameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onRenameCancel();
              }}
            />
            <button type="submit" className="btn btn-primary px-2 py-0.5 text-[11px]" disabled={renameBusy}>
              {renameBusy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="btn px-2 py-0.5 text-[11px]"
              disabled={renameBusy}
              onClick={onRenameCancel}
            >
              Cancel
            </button>
          </form>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[14px] font-medium">{build.name}</span>
            <button
              type="button"
              className="shrink-0 text-[11px] text-ink-500 underline decoration-dotted hover:text-ink-300"
              onClick={onStartRename}
            >
              Rename
            </button>
          </span>
        )}
        <span className="flex shrink-0 items-center gap-3">
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
 * queue any more, so the admin's own actions here are pruning a stale
 * listing (Delete) and cleaning up a name (Rename) — e.g. undoing the
 * automatic "(2)" suffix a colliding submission got, or fixing a typo,
 * without having to delete and wait for a fresh, correctly-named share.
 */
export function PublishedBuildsPanel({ items }: { items: Item[] }) {
  const [builds, setBuilds] = useState<DirectoryBuild[] | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [renameCode, setRenameCode] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
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

  function startRename(build: DirectoryBuild) {
    setRenameCode(build.code);
    setRenameValue(build.name);
    setMessage(null);
  }

  function cancelRename() {
    setRenameCode(null);
    setRenameValue("");
  }

  async function submitRename(code: string) {
    const name = renameValue.trim();
    if (!name) return;
    setRenameBusy(true);
    try {
      const response = await fetch(`/api/builds/${code}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        setMessage("Rename failed.");
        return;
      }
      const body = (await response.json()) as { name: string };
      setBuilds((current) => current?.map((b) => (b.code === code ? { ...b, name: body.name } : b)) ?? null);
      setMessage(`Renamed to "${body.name}".`);
      setRenameCode(null);
      setRenameValue("");
    } finally {
      setRenameBusy(false);
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
              renaming={renameCode === build.code}
              renameValue={renameValue}
              renameBusy={renameBusy && renameCode === build.code}
              onDelete={() => void remove(build.code, build.name)}
              onStartRename={() => startRename(build)}
              onRenameChange={setRenameValue}
              onRenameSubmit={() => void submitRename(build.code)}
              onRenameCancel={cancelRename}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
