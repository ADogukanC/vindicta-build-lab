import { NextResponse } from "next/server";
import { submitForReview } from "@/lib/data/db/sharedBuilds";

/** Opts an already-shared build into the public build browser, pending admin approval. */
export async function POST(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = await submitForReview(code);
  if (result === "not-found") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result);
}
