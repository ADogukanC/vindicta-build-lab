import { NextResponse } from "next/server";
import { publishSharedBuild } from "@/lib/data/db/sharedBuilds";

/** Lists an already-shared build on the public build browser — immediate, no admin approval. */
export async function POST(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = await publishSharedBuild(code);
  if (result === "not-found") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result);
}
