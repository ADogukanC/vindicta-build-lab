"use client";

import { useState } from "react";

const DISCORD_USERNAME = ".dokhan";

/**
 * Discord has no public deep-link for DMing someone by username alone (that
 * needs a user ID), so the practical version of "reach me" is: show the
 * username and make it one click to copy.
 */
function ContactButton() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(DISCORD_USERNAME).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="chip shrink-0 text-ink-300 transition hover:border-ink-500 hover:text-ink-100"
      title="Bug reports, questions or suggestions — copies the Discord username"
    >
      {copied ? "Copied!" : `Discord: ${DISCORD_USERNAME}`}
    </button>
  );
}

export function Footer() {
  return (
    <footer className="mt-8 border-t border-ink-800">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-2 px-4 py-4 text-[11px] text-ink-500 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl leading-relaxed">
          Vindicta Build Lab is an unofficial fan project and is not affiliated with, endorsed
          by, or sponsored by Valve Corporation. Deadlock, Vindicta, and all associated names,
          images, and data are trademarks and/or copyrighted material of Valve Corporation. Item
          and hero data sourced from{" "}
          <a
            href="https://deadlock.wiki"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-ink-700 hover:text-ink-300"
          >
            deadlock.wiki
          </a>
          .
        </p>
        <ContactButton />
      </div>
    </footer>
  );
}
