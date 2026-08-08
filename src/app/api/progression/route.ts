import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/data/store";
import type { Progression } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getStore().getProgression());
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
  } catch (response) {
    return response as Response;
  }
  const progression = (await request.json()) as Progression;
  if (!Array.isArray(progression?.investment) || !Array.isArray(progression?.boons)) {
    return NextResponse.json({ error: "invalid progression payload" }, { status: 400 });
  }
  return NextResponse.json(await getStore().saveProgression(progression));
}
