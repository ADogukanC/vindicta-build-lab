import { NextResponse } from "next/server";
import { listPublicBuilds } from "@/lib/data/db/sharedBuilds";

export const dynamic = "force-dynamic";

/** Public builds for the build browser. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const offset = Number(searchParams.get("offset") ?? 0) || 0;
  const builds = await listPublicBuilds({ q, offset });
  return NextResponse.json({ builds });
}
