import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/data/store";
import type { HeroConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getStore().getHero());
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
  } catch (response) {
    return response as Response;
  }
  const hero = (await request.json()) as HeroConfig;
  if (!hero?.slug || !hero?.base) {
    return NextResponse.json({ error: "invalid hero payload" }, { status: 400 });
  }
  return NextResponse.json(await getStore().saveHero(hero));
}
