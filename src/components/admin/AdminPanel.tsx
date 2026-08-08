"use client";

import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import type { HeroConfig, Item } from "@/lib/types";
import { ITEM_CATEGORIES } from "@/lib/types";
import { CATEGORY_COLOR, fmtSouls } from "@/lib/format";
import { ItemIcon } from "../ItemIcon";
import { ItemEditor } from "./ItemEditor";
import { HeroEditor } from "./HeroEditor";

function blankItem(sortOrder: number): Item {
  return {
    id: "",
    slug: "",
    name: "New item",
    category: "Weapon",
    cost: 1600,
    tier: 2,
    activation: "Passive",
    iconUrl: null,
    components: [],
    shopFilters: [],
    stats: {},
    enabled: true,
    sortOrder,
  };
}

export function AdminPanel({
  initialItems,
  initialHero,
}: {
  initialItems: Item[];
  initialHero: HeroConfig;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"items" | "hero">("items");
  const [items, setItems] = useState(initialItems);
  const [hero, setHero] = useState(initialHero);
  const [heroDirty, setHeroDirty] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialItems[0]?.slug ?? null);
  const [draft, setDraft] = useState<Item | null>(initialItems[0] ?? null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.slug.includes(q))
      .sort((a, b) => a.category.localeCompare(b.category) || a.cost - b.cost || a.name.localeCompare(b.name));
  }, [items, query]);

  function select(item: Item) {
    if (dirty && !confirm("Discard unsaved changes to this item?")) return;
    setSelectedSlug(item.slug);
    setDraft(item);
    setDirty(false);
  }

  function startNew() {
    if (dirty && !confirm("Discard unsaved changes to this item?")) return;
    const item = blankItem(items.length);
    setSelectedSlug(null);
    setDraft(item);
    setDirty(true);
  }

  async function saveItem() {
    if (!draft) return;
    if (!draft.slug) {
      setMessage("Give the item a slug before saving.");
      return;
    }
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/items", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    if (!response.ok) {
      setMessage(`Save failed: ${(await response.json().catch(() => ({}))).error ?? response.status}`);
      return;
    }
    const saved = (await response.json()) as Item;
    setItems((current) => {
      const index = current.findIndex((i) => i.slug === saved.slug);
      if (index >= 0) {
        const next = current.slice();
        next[index] = saved;
        return next;
      }
      return [...current, saved];
    });
    setSelectedSlug(saved.slug);
    setDraft(saved);
    setDirty(false);
    setMessage(`Saved “${saved.name}”.`);
    router.refresh();
  }

  async function deleteItem() {
    if (!draft?.slug || !selectedSlug) {
      setDraft(null);
      setDirty(false);
      return;
    }
    if (!confirm(`Delete “${draft.name}”? This cannot be undone.`)) return;
    setSaving(true);
    const response = await fetch(`/api/items/${draft.slug}`, { method: "DELETE" });
    setSaving(false);
    if (!response.ok) {
      setMessage("Delete failed.");
      return;
    }
    setItems((current) => current.filter((i) => i.slug !== draft.slug));
    setDraft(null);
    setSelectedSlug(null);
    setMessage(`Deleted “${draft.name}”.`);
    router.refresh();
  }

  async function saveHero() {
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/hero", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(hero),
    });
    setSaving(false);
    if (!response.ok) {
      setMessage("Saving the hero failed.");
      return;
    }
    setHeroDirty(false);
    setMessage("Hero saved.");
    router.refresh();
  }

  function exportItems() {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vindicta-items.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importItems(file: File) {
    let parsed: Item[];
    try {
      parsed = JSON.parse(await file.text()) as Item[];
      if (!Array.isArray(parsed)) throw new Error();
    } catch {
      setMessage("That file is not a JSON array of items.");
      return;
    }
    if (!confirm(`Replace all ${items.length} items with ${parsed.length} from this file?`)) return;
    setSaving(true);
    const response = await fetch("/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed),
    });
    setSaving(false);
    if (!response.ok) {
      setMessage("Import failed.");
      return;
    }
    setItems(parsed);
    setDraft(parsed[0] ?? null);
    setSelectedSlug(parsed[0]?.slug ?? null);
    setMessage(`Imported ${parsed.length} items.`);
    router.refresh();
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(["items", "hero"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={clsx(
                "rounded-md px-3 py-1.5 text-[13px] capitalize",
                tab === t ? "bg-ink-800 text-ink-100" : "text-ink-300 hover:bg-ink-850",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="chip" title="Changes are written to data/local-db.json on this machine.">
          Local file store
        </span>
        <span className="flex-1" />
        {message && <span className="text-[12px] text-amber-brand">{message}</span>}
        <button className="btn" onClick={exportItems}>
          Export items
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Import items
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importItems(file);
            e.target.value = "";
          }}
        />
        <button className="btn" onClick={() => void logout()}>
          Log out
        </button>
      </div>

      {tab === "hero" ? (
        <section className="panel p-4">
          <HeroEditor
            hero={hero}
            onChange={(next) => {
              setHero(next);
              setHeroDirty(true);
            }}
            onSave={() => void saveHero()}
            saving={saving}
            dirty={heroDirty}
          />
        </section>
      ) : (
        <div className="grid gap-3 lg:grid-cols-12">
          <section className="panel flex max-h-[calc(100vh-10rem)] flex-col lg:col-span-4 xl:col-span-3">
            <header className="panel-header">
              <span>{items.length} items</span>
              <button className="btn px-2 py-0.5 text-[11px]" onClick={startNew}>
                + New
              </button>
            </header>
            <div className="border-b border-ink-700 p-2">
              <input
                className="input py-1 text-xs"
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {ITEM_CATEGORIES.map((category) => {
                const list = filtered.filter((i) => i.category === category);
                if (!list.length) return null;
                return (
                  <li key={category} className="mb-2">
                    <div
                      className="px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: CATEGORY_COLOR[category] }}
                    >
                      {category}
                    </div>
                    <ul className="space-y-0.5">
                      {list.map((item) => (
                        <li key={item.slug}>
                          <button
                            type="button"
                            onClick={() => select(item)}
                            className={clsx(
                              "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px]",
                              selectedSlug === item.slug
                                ? "bg-ink-800"
                                : "hover:bg-ink-850",
                              !item.enabled && "opacity-50",
                            )}
                          >
                            <ItemIcon item={item} size="sm" />
                            <span className="min-w-0 flex-1 truncate">{item.name}</span>
                            <span className="tnum text-[10px] text-ink-500">
                              {fmtSouls(item.cost)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="panel p-4 lg:col-span-8 xl:col-span-9">
            {draft ? (
              <ItemEditor
                item={draft}
                onChange={(next) => {
                  setDraft(next);
                  setDirty(true);
                }}
                onSave={() => void saveItem()}
                onDelete={() => void deleteItem()}
                saving={saving}
                dirty={dirty}
              />
            ) : (
              <p className="py-16 text-center text-sm text-ink-300">
                Pick an item on the left, or create a new one.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
