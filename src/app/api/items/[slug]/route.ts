import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/data/store";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    await requireAdmin();
  } catch (response) {
    return response as Response;
  }
  const { slug } = await ctx.params;
  await getStore().deleteItem(slug);
  return NextResponse.json({ ok: true });
}
