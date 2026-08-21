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
  actions,
}: {
  build: DirectoryBuild;
  itemsBySlug: Map<string, Item>;
  busy: boolean;
  actions: React.ReactNode;
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
      <div className="flex justify-end gap-2 pt-1" aria-disabled={busy}>
        {actions}
      </div>
    </li>
  );
}

export function SubmissionsPanel({ items }: { items: Item[] }) {
  const [pending, setPending] = useState<DirectoryBuild[] | null>(null);
  const [approved, setApproved] = useState<DirectoryBuild[] | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const itemsBySlug = new Map(items.map((i) => [i.slug, i]));

  async function load() {
    const [pendingRes, approvedRes] = await Promise.all([
      fetch("/api/builds/pending"),
      fetch("/api/builds/approved"),
    ]);
    if (!pendingRes.ok || !approvedRes.ok) {
      setMessage("Failed to load submissions.");
      setPending((current) => current ?? []);
      setApproved((current) => current ?? []);
      return;
    }
    const pendingBody = (await pendingRes.json()) as { builds: DirectoryBuild[] };
    const approvedBody = (await approvedRes.json()) as { builds: DirectoryBuild[] };
    setPending(pendingBody.builds);
    setApproved(approvedBody.builds);
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
      const build = pending?.find((b) => b.code === code);
      setPending((current) => current?.filter((b) => b.code !== code) ?? null);
      if (approve && build) setApproved((current) => [build, ...(current ?? [])]);
      setMessage(`${approve ? "Approved" : "Rejected"} the submission.`);
    } finally {
      setBusyCode(null);
    }
  }

  async function remove(code: string, name: string) {
    if (!confirm(`Remove "${name}" from the build browser? This deletes its share link too.`)) return;
    setBusyCode(code);
    try {
      const response = await fetch(`/api/builds/${code}`, { method: "DELETE" });
      if (!response.ok) {
        setMessage("Delete failed.");
        return;
      }
      setApproved((current) => current?.filter((b) => b.code !== code) ?? null);
      setMessage(`Removed "${name}".`);
    } finally {
      setBusyCode(null);
    }
  }

  if (pending === null || approved === null) {
    return <p className="py-16 text-center text-sm text-ink-300">Loading submissions…</p>;
  }

  return (
    <div className="space-y-3">
      <section className="panel">
        <header className="panel-header">
          <span>
            {pending.length} pending submission{pending.length === 1 ? "" : "s"}
          </span>
          {message && (
            <span className="text-[12px] normal-case tracking-normal text-amber-brand">{message}</span>
          )}
        </header>
        {pending.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-300">Nothing waiting on review.</p>
        ) : (
          <ul className="divide-y divide-ink-800/60">
            {pending.map((build) => (
              <BuildRow
                key={build.code}
                build={build}
                itemsBySlug={itemsBySlug}
                busy={busyCode === build.code}
                actions={
                  <>
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
                  </>
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <span>
            {approved.length} approved build{approved.length === 1 ? "" : "s"} — live on /browse
          </span>
        </header>
        {approved.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-300">Nothing approved yet.</p>
        ) : (
          <ul className="divide-y divide-ink-800/60">
            {approved.map((build) => (
              <BuildRow
                key={build.code}
                build={build}
                itemsBySlug={itemsBySlug}
                busy={busyCode === build.code}
                actions={
                  <button
                    type="button"
                    className="btn btn-danger px-2.5 py-1 text-[12px]"
                    disabled={busyCode === build.code}
                    onClick={() => void remove(build.code, build.name)}
                    title="People may have improved their build since — this clears the way for a fresher submission."
                  >
                    Delete
                  </button>
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
