import { NextResponse } from "next/server";
import { createSharedBuild } from "@/lib/data/db/sharedBuilds";
import type { SharedBuild } from "@/lib/buildCode";
import type { BuildItem } from "@/lib/types";

/** Loose validation — this mirrors what `normalizeBuild` already tolerates client-side, not a strict schema. */
function parseSharedBuild(body: unknown): SharedBuild | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !Array.isArray(b.items)) return null;
  const items = b.items.filter(
    (i): i is BuildItem => Boolean(i) && typeof i === "object" && typeof (i as BuildItem).slug === "string",
  );
  return {
    name: b.name.slice(0, 200),
    items,
    sellOrder: Array.isArray(b.sellOrder) ? b.sellOrder.filter((s) => typeof s === "string") : [],
    imbueTargets:
      b.imbueTargets && typeof b.imbueTargets === "object"
        ? (b.imbueTargets as Record<string, string>)
        : {},
    apOrder: Array.isArray(b.apOrder) ? b.apOrder.filter((s) => typeof s === "string") : [],
  };
}

/** Creates a new short-linked, private-by-default shared build. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const payload = parseSharedBuild(body);
  if (!payload) {
    return NextResponse.json({ error: "Expected a build with at least name and items." }, { status: 400 });
  }
  if (payload.items.length === 0) {
    return NextResponse.json({ error: "Can't share an empty build." }, { status: 400 });
  }
  const code = await createSharedBuild(payload);
  return NextResponse.json({ code });
}
