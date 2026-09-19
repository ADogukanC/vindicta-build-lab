"use client";

import { useState } from "react";
import { DISCORD_USERNAME } from "./Footer";

/**
 * Shown the moment "Share" is clicked, before a code is even generated — the
 * choice of whether to also list the build on /browse happens up front,
 * rather than as a follow-up button buried in the result box afterward.
 * Listing is immediate: there is no admin approval queue, just an admin's
 * ability to delete a stale listing later (see the admin panel).
 */
export function SharePrompt({
  buildName,
  submitting,
  onCancel,
  onConfirm,
}: {
  buildName: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (publish: boolean) => void;
}) {
  const [publish, setPublish] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        className="panel w-full max-w-sm p-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Share build"
      >
        <h2 className="mb-1 text-[14px] font-semibold text-ink-100">Share &ldquo;{buildName}&rdquo;</h2>
        <p className="mb-3 text-[12px] leading-relaxed text-ink-400">
          Anyone with the code or link can open a copy of this build.
        </p>
        <label className="mb-4 flex items-start gap-2 text-[13px] text-ink-200">
          <input
            type="checkbox"
            className="mt-0.5 accent-[var(--color-amber-brand)]"
            checked={publish}
            onChange={(e) => setPublish(e.target.checked)}
          />
          <span>
            Also list it on the <strong>Build browser</strong> so other players can find it.
            You can list it later instead, and it can always be taken down after.
          </span>
        </label>
        <p className="mb-4 text-[11px] leading-relaxed text-ink-500">
          If a listed build doesn&apos;t show up, or you want an outdated one taken down, message{" "}
          <span className="text-ink-300">Discord: {DISCORD_USERNAME}</span>.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn px-3 py-1.5 text-[12px]"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary px-3 py-1.5 text-[12px]"
            onClick={() => onConfirm(publish)}
            disabled={submitting}
          >
            {submitting ? "Sharing…" : "Share"}
          </button>
        </div>
      </div>
    </div>
  );
}
