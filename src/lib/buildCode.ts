/**
 * Build codes: a build round-tripped as a compact, copy-pasteable string —
 * gzip the JSON, then base64url-encode it. No server, no database: the code
 * *is* the build, so pasting it (or its URL, `/b/<code>`) into another
 * browser is the entire "share" flow.
 *
 * Decoding only ever returns a plain object; callers must still run it
 * through `normalizeBuild` to get a real `Build`; that is also what makes an
 * old code readable after the build schema grows a field.
 */
import type { Build } from "./types";

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
  const bytes = new TextEncoder().encode(JSON.stringify(build));
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
