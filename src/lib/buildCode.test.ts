import { describe, expect, it } from "vitest";
import { decodeBuildCode, encodeBuildCode, extractBuildCode } from "./buildCode";
import { addItemToBuild, createBuild } from "./build";
import { SEED_ITEMS } from "./data/seed";

const bySlug = new Map(SEED_ITEMS.map((i) => [i.slug, i]));

function sampleBuild() {
  let build = createBuild({
    name: "Crow ◈ shred build",
    notes: "unicode check: ◇ ▸ ×2.3",
    apOrder: ["stake", "flight", "stake"],
  });
  for (const slug of ["escalating-exposure", "mercurial-magnum", "sharpshooter"]) {
    const item = bySlug.get(slug);
    if (item) build = addItemToBuild(build, item);
  }
  if (build.items.some((i) => i.slug === "mercurial-magnum")) {
    build = { ...build, imbueTargets: { "mercurial-magnum": "flight" } };
  }
  return build;
}

describe("build codes", () => {
  it("round-trips the shared subset of a build through encode/decode", async () => {
    const build = sampleBuild();
    const code = await encodeBuildCode(build);
    const decoded = await decodeBuildCode(code);
    expect(decoded).toEqual({
      name: build.name,
      items: build.items,
      sellOrder: build.sellOrder,
      imbueTargets: build.imbueTargets,
      apOrder: build.apOrder,
    });
  });

  it("drops viewer-local state that isn't part of the shared build", async () => {
    const build = sampleBuild();
    const code = await encodeBuildCode(build);
    const decoded = (await decodeBuildCode(code)) as Record<string, unknown>;
    expect(decoded).not.toHaveProperty("id");
    expect(decoded).not.toHaveProperty("soulsEarned");
    expect(decoded).not.toHaveProperty("notes");
  });

  it("produces a URL-safe, path-segment-safe code", async () => {
    const code = await encodeBuildCode(sampleBuild());
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is meaningfully shorter than the raw JSON, thanks to gzip", async () => {
    const build = sampleBuild();
    const code = await encodeBuildCode(build);
    expect(code.length).toBeLessThan(JSON.stringify(build).length);
  });

  it("pulls the code out of a full share URL, and passes a bare code through", () => {
    expect(extractBuildCode("https://vindicta.example/b/abc123")).toBe("abc123");
    expect(extractBuildCode("  abc123  ")).toBe("abc123");
  });

  it("rejects garbage input instead of silently returning nonsense", async () => {
    await expect(decodeBuildCode("not a valid code")).rejects.toBeTruthy();
  });
});
