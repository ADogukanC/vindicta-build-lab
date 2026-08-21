import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listPendingBuilds } from "@/lib/data/db/sharedBuilds";

export const dynamic = "force-dynamic";

/** Submissions waiting on admin review. */
export async function GET() {
  try {
    await requireAdmin();
  } catch (response) {
    return response as Response;
  }
  const builds = await listPendingBuilds();
  return NextResponse.json({ builds });
}
