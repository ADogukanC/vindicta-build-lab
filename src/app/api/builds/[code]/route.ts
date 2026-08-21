import { NextResponse } from "next/server";
import { getSharedBuildByCode } from "@/lib/data/db/sharedBuilds";

export const dynamic = "force-dynamic";

/** Fetches a shared build by its short code — works regardless of status, same as the old client-only codes always did. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const row = await getSharedBuildByCode(code);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...row.payload, status: row.status });
}
