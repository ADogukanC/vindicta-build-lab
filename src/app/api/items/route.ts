import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/data/store";
import type { Item } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getStore().getItems());
}

/** Create or update a single item. */
export async function PUT(request: Request) {
  try {
    await requireAdmin();
  } catch (response) {
    return response as Response;
  }
  const item = (await request.json()) as Item;
  if (!item?.slug || !item?.name) {
    return NextResponse.json({ error: "slug and name are required" }, { status: 400 });
  }
  return NextResponse.json(await getStore().saveItem(item));
}

/** Bulk replace, used by the admin panel's JSON import. */
export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch (response) {
    return response as Response;
  }
  const items = (await request.json()) as Item[];
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "expected an array of items" }, { status: 400 });
  }
  await getStore().replaceAllItems(items);
  return NextResponse.json({ ok: true, count: items.length });
}
