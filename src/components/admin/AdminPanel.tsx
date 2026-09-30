"use client";

import { useRouter } from "next/navigation";
import type { Item } from "@/lib/types";
import { PublishedBuildsPanel } from "./PublishedBuildsPanel";

export function AdminPanel({ initialItems }: { initialItems: Item[] }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-ink-100">Builds</span>
        <span className="flex-1" />
        <button className="btn" onClick={() => void logout()}>
          Log out
        </button>
      </div>
      <PublishedBuildsPanel items={initialItems} />
    </div>
  );
}
