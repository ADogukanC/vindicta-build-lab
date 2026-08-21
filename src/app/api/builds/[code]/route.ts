import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteSharedBuild, getSharedBuildByCode } from "@/lib/data/db/sharedBuilds";

export const dynamic = "force-dynamic";

/** Fetches a shared build by its short code — works regardless of status, same as the old client-only codes always did. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const row = await getSharedBuildByCode(code);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...row.payload, status: row.status });
}

/** Admin-only: removes a shared build outright, e.g. a stale approved listing its owner has replaced. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    await requireAdmin();
  } catch (response) {
    return response as Response;
  }
  const { code } = await params;
  const ok = await deleteSharedBuild(code);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
