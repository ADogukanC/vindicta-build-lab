import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listAllApprovedBuilds } from "@/lib/data/db/sharedBuilds";

export const dynamic = "force-dynamic";

/** Every approved build, for the admin's management view (unlike /api/builds/directory, not paginated or public). */
export async function GET() {
  try {
    await requireAdmin();
  } catch (response) {
    return response as Response;
  }
  const builds = await listAllApprovedBuilds();
  return NextResponse.json({ builds });
}
