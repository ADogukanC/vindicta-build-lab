import { NextResponse } from "next/server";
import { checkPassword, createSession, destroySession } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  if (!body.password || !checkPassword(body.password)) {
    // A small delay blunts brute-forcing without needing a rate-limit store.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  await createSession();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
