import { NextResponse } from "next/server";
import { listApprovedBuilds } from "@/lib/data/db/sharedBuilds";

export const dynamic = "force-dynamic";

/** Admin-approved builds for the public build browser. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const offset = Number(searchParams.get("offset") ?? 0) || 0;
  const builds = await listApprovedBuilds({ q, offset });
  return NextResponse.json({ builds });
}
