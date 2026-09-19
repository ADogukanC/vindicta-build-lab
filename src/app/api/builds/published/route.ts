import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listAllPublicBuilds } from "@/lib/data/db/sharedBuilds";

export const dynamic = "force-dynamic";

/** Every public build, for the admin's management view (unlike /api/builds/directory, not paginated or public). */
export async function GET() {
  try {
    await requireAdmin();
  } catch (response) {
    return response as Response;
  }
  const builds = await listAllPublicBuilds();
  return NextResponse.json({ builds });
}
