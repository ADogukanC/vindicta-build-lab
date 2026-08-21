/**
 * Build codes: a build round-tripped as a compact, copy-pasteable string —
 * gzip the JSON, then base64url-encode it.
 *
 * Sharing now goes through `POST /api/builds` instead (a short, database-
 * backed code — see `lib/data/db/sharedBuilds.ts`), so the encode/decode pair
 * here is the fallback: `encodeBuildCode` when that request fails (offline,
 * DB down), and `decodeBuildCode` for links made before the database existed.
 * `resolveBuildCode` below is what callers actually use to open a `/b/<code>`
 * link — it tries the database first and only falls back to `decodeBuildCode`
 * if that misses.
 *
 * Only `name`, `items` (the buy order), `sellOrder`, `imbueTargets` and
 * `apOrder` go in a build code — the rest of `Build` (souls earned, boons,
 * headshot rate, enemy resist, adjustables, manual ability upgrades, notes,
 * color, id/timestamps, ...) is the sender's local viewing state, not part
 * of the shared build, and would otherwise dominate the code's length for no
 * benefit to the recipient. `normalizeBuild` fills all of it back in with
 * defaults.
 *
 * Decoding only ever returns a plain object; callers must still run it
 * through `normalizeBuild` to get a real `Build`; that is also what makes an
 * old code readable after the build schema grows a field.
 */
import type { Build, BuildItem } from "./types";

/**
 * The subset of a `Build` that actually gets shared — the same shape both the
 * client-side code (below) and the server-side `shared_builds` table
 * (`lib/data/db/schema.ts`) store, so there is exactly one definition of
 * "what a shared build contains."
 */
export interface SharedBuild {
  name: string;
  items: BuildItem[];
  sellOrder: string[];
  imbueTargets: Record<string, string>;
  apOrder: string[];
}

export function toSharedBuild(build: Build): SharedBuild {
  return {
    name: build.name,
    items: build.items,
    sellOrder: build.sellOrder,
    imbueTargets: build.imbueTargets,
    apOrder: build.apOrder,
  };
}

const CAN_COMPRESS = typeof CompressionStream !== "undefined";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): Uint8Array {
  const base64 = code.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  // A fresh Uint8Array is always backed by a plain ArrayBuffer, which is what
  // BlobPart wants — `bytes` itself may be typed over the wider
  // ArrayBufferLike (it could in principle back onto a SharedArrayBuffer).
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Encodes a build into a copy-pasteable code. */
export async function encodeBuildCode(build: Build): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(toSharedBuild(build)));
  const payload = CAN_COMPRESS ? await gzip(bytes) : bytes;
  return toBase64Url(payload);
}

/**
 * Decodes a build code back into a plain object. Falls back to reading the
 * payload as uncompressed JSON, which covers codes made on a browser without
 * `CompressionStream` as well as any future format that stays JSON-based.
 */
export async function decodeBuildCode(code: string): Promise<unknown> {
  const bytes = fromBase64Url(code.trim());
  let json: string;
  try {
    json = new TextDecoder().decode(await gunzip(bytes));
  } catch {
    json = new TextDecoder().decode(bytes);
  }
  return JSON.parse(json);
}

/**
 * Resolves a share code to its build payload — the database-backed short
 * codes `POST /api/builds` creates, first. Falls back to the older
 * client-only gzip codes (`decodeBuildCode`) for links shared before the
 * database existed, or whenever the API call itself fails (offline, DB down).
 */
export async function resolveBuildCode(code: string): Promise<unknown> {
  try {
    const response = await fetch(`/api/builds/${encodeURIComponent(code.trim())}`);
    if (response.ok) return await response.json();
  } catch {
    // Network error, DB down, etc. — fall through to the client-side decode.
  }
  return decodeBuildCode(code);
}

/** Pulls a build code out of a pasted share link, or returns the input as-is. */
export function extractBuildCode(input: string): string {
  const trimmed = input.trim();
  try {
    const segments = new URL(trimmed).pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] || trimmed;
  } catch {
    return trimmed;
  }
}
