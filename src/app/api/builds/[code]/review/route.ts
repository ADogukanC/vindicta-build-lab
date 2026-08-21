import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { reviewSubmission } from "@/lib/data/db/sharedBuilds";

/** Admin approve/reject of a pending submission. */
export async function PATCH(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    await requireAdmin();
  } catch (response) {
    return response as Response;
  }
  const { code } = await params;
  const body = (await request.json().catch(() => ({}))) as { approve?: boolean };
  if (typeof body.approve !== "boolean") {
    return NextResponse.json({ error: "Expected { approve: boolean }" }, { status: 400 });
  }
  const ok = await reviewSubmission(code, body.approve);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, status: body.approve ? "approved" : "rejected" });
}
