"use client";

/**
 * Client-side build library.
 *
 * Builds live in IndexedDB rather than on the server: editing a build is a
 * keystroke-frequency operation and should never wait on a network round trip,
 * and it means the site is fully usable with no account. Publishing a build
 * (see `shareBuild`) is the only time a build touches the database.
 */
import { create } from "zustand";
import { get as idbGet, set as idbSet } from "idb-keyval";
import type { Build, BuildItem, Item } from "../types";
import {
  BUILD_COLORS,
  addItemToBuild,
  createBuild,
  duplicateBuild,
  moveBuildItem,
  normalizeBuild,
  removeItemFromBuild,
  updateBuildItem,
} from "../build";

const STORAGE_KEY = "vindicta-build-lab/builds/v1";

interface PersistedState {
  builds: Build[];
  activeId: string | null;
  compareIds: string[];
}

interface BuildsState extends PersistedState {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  activeBuild: () => Build | null;
  setActive: (id: string) => void;
  addBuild: (build?: Build) => Build;
  updateActive: (patch: Partial<Build>) => void;
  updateBuild: (id: string, patch: Partial<Build>) => void;
  renameBuild: (id: string, name: string) => void;
  recolorBuild: (id: string, color: string) => void;
  deleteBuild: (id: string) => void;
  duplicate: (id: string) => void;
  toggleCompare: (id: string) => void;
  setCompareIds: (ids: string[]) => void;
  // item helpers, all operating on the active build
  addItem: (item: Item) => void;
  moveItem: (from: number, to: number) => void;
  setSouls: (soulsEarned: number) => void;
  setSells: (sellOrder: string[]) => void;
  removeItem: (slug: string) => void;
  patchItem: (slug: string, patch: Partial<BuildItem>) => void;
  importBuilds: (builds: Build[]) => number;
}

function persist(state: PersistedState) {
  void idbSet(STORAGE_KEY, {
    builds: state.builds,
    activeId: state.activeId,
    compareIds: state.compareIds,
  });
}

function nextColor(builds: Build[]): string {
  const used = new Set(builds.map((b) => b.color));
  return BUILD_COLORS.find((c) => !used.has(c)) ?? BUILD_COLORS[builds.length % BUILD_COLORS.length];
}

export const useBuilds = create<BuildsState>((set, get) => ({
  builds: [],
  activeId: null,
  compareIds: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const stored = (await idbGet(STORAGE_KEY)) as PersistedState | undefined;
    if (stored?.builds?.length) {
      const builds = stored.builds.map(normalizeBuild);
      set({
        builds,
        activeId: stored.activeId ?? builds[0].id,
        compareIds: (stored.compareIds ?? []).filter((id) => builds.some((b) => b.id === id)),
        hydrated: true,
      });
    } else {
      const first = createBuild({ name: "Build 1" });
      set({ builds: [first], activeId: first.id, compareIds: [], hydrated: true });
      persist({ builds: [first], activeId: first.id, compareIds: [] });
    }
  },

  activeBuild: () => {
    const { builds, activeId } = get();
    return builds.find((b) => b.id === activeId) ?? builds[0] ?? null;
  },

  setActive: (id) => {
    set({ activeId: id });
    persist({ ...get(), activeId: id });
  },

  addBuild: (build) => {
    const builds = get().builds;
    const created =
      build ??
      createBuild({ name: `Build ${builds.length + 1}`, color: nextColor(builds) });
    const next = [...builds, created];
    set({ builds: next, activeId: created.id });
    persist({ ...get(), builds: next, activeId: created.id });
    return created;
  },

  updateBuild: (id, patch) => {
    const next = get().builds.map((b) =>
      b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b,
    );
    set({ builds: next });
    persist({ ...get(), builds: next });
  },

  updateActive: (patch) => {
    const id = get().activeBuild()?.id;
    if (id) get().updateBuild(id, patch);
  },

  renameBuild: (id, name) => get().updateBuild(id, { name }),

  recolorBuild: (id, color) => get().updateBuild(id, { color }),

  deleteBuild: (id) => {
    const builds = get().builds.filter((b) => b.id !== id);
    const compareIds = get().compareIds.filter((c) => c !== id);
    const activeId = get().activeId === id ? (builds[0]?.id ?? null) : get().activeId;
    if (builds.length === 0) {
      const fresh = createBuild({ name: "Build 1" });
      set({ builds: [fresh], activeId: fresh.id, compareIds: [] });
      persist({ builds: [fresh], activeId: fresh.id, compareIds: [] });
      return;
    }
    set({ builds, activeId, compareIds });
    persist({ builds, activeId, compareIds });
  },

  duplicate: (id) => {
    const source = get().builds.find((b) => b.id === id);
    if (!source) return;
    const copy = duplicateBuild(source);
    copy.color = nextColor(get().builds);
    const builds = [...get().builds, copy];
    set({ builds, activeId: copy.id });
    persist({ ...get(), builds, activeId: copy.id });
  },

  toggleCompare: (id) => {
    const current = get().compareIds;
    const compareIds = current.includes(id)
      ? current.filter((c) => c !== id)
      : [...current, id];
    set({ compareIds });
    persist({ ...get(), compareIds });
  },

  setCompareIds: (ids) => {
    set({ compareIds: ids });
    persist({ ...get(), compareIds: ids });
  },

  addItem: (item) => {
    const build = get().activeBuild();
    if (!build) return;
    const next = addItemToBuild(build, item);
    if (next === build) return;
    get().updateBuild(build.id, { items: next.items });
  },

  moveItem: (from, to) => {
    const build = get().activeBuild();
    if (!build) return;
    get().updateBuild(build.id, { items: moveBuildItem(build, from, to).items });
  },

  setSouls: (soulsEarned) => {
    const build = get().activeBuild();
    if (!build) return;
    get().updateBuild(build.id, { soulsEarned });
  },

  setSells: (sellOrder) => {
    const build = get().activeBuild();
    if (!build) return;
    get().updateBuild(build.id, { sellOrder });
  },

  removeItem: (slug) => {
    const build = get().activeBuild();
    if (!build) return;
    get().updateBuild(build.id, { items: removeItemFromBuild(build, slug).items });
  },

  patchItem: (slug, patch) => {
    const build = get().activeBuild();
    if (!build) return;
    get().updateBuild(build.id, { items: updateBuildItem(build, slug, patch).items });
  },

  importBuilds: (incoming) => {
    const normalized = incoming.map((b) => normalizeBuild({ ...b, id: undefined }));
    const builds = [...get().builds, ...normalized];
    set({ builds });
    persist({ ...get(), builds });
    return normalized.length;
  },
}));
