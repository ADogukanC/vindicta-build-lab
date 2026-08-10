"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { Build } from "@/lib/types";
import { BUILD_COLORS, normalizeBuild } from "@/lib/build";
import { decodeBuildCode, extractBuildCode } from "@/lib/buildCode";
import { fmtSouls } from "@/lib/format";

export function BuildTabs({
  builds,
  activeId,
  compareIds,
  onSelect,
  onAdd,
  onRename,
  onRecolor,
  onDuplicate,
  onDelete,
  onToggleCompare,
  onImport,
  onShare,
  soulsFor,
}: {
  builds: Build[];
  activeId: string | null;
  compareIds: string[];
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleCompare: (id: string) => void;
  onImport: (builds: Build[]) => void;
  onShare: () => void;
  soulsFor: (build: Build) => number;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [importingCode, setImportingCode] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!colorPickerId) return;
    function onClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setColorPickerId(null);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [colorPickerId]);

  async function importCode() {
    const code = extractBuildCode(codeInput);
    if (!code) return;
    setImportingCode(true);
    try {
      const decoded = await decodeBuildCode(code);
      onImport([normalizeBuild(decoded as Partial<Build>)]);
      setCodeInput("");
    } catch {
      alert("That doesn't look like a valid build code.");
    } finally {
      setImportingCode(false);
    }
  }

  function exportAll() {
    const blob = new Blob([JSON.stringify({ version: 1, builds }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vindicta-builds.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as { builds?: Build[] } | Build[];
      const list = Array.isArray(parsed) ? parsed : (parsed.builds ?? []);
      if (!list.length) throw new Error("no builds found");
      onImport(list.map((b) => normalizeBuild(b)));
    } catch {
      alert("That file does not look like a Vindicta Build Lab export.");
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {builds.map((build) => {
          const active = build.id === activeId;
          const inCompare = compareIds.includes(build.id);
          return (
            <div
              key={build.id}
              className={clsx(
                "group relative flex items-center gap-2 rounded-lg border px-3 py-2 transition",
                active
                  ? "border-ink-500 bg-ink-800"
                  : "border-ink-700 bg-ink-900 hover:border-ink-600 hover:bg-ink-850",
              )}
              style={active ? { borderTopColor: build.color, borderTopWidth: "2px" } : undefined}
            >
              <button
                type="button"
                onClick={() => onToggleCompare(build.id)}
                className={clsx(
                  "flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide transition",
                  inCompare
                    ? "text-ink-100"
                    : "text-ink-600 hover:bg-ink-700 hover:text-ink-300",
                )}
                style={inCompare ? { color: build.color } : undefined}
                title={inCompare ? "Remove from comparison" : "Add to comparison"}
                aria-label={inCompare ? "Remove from comparison" : "Add to comparison"}
              >
                <span
                  className={clsx(
                    "h-2 w-2 shrink-0 rounded-full border-2 transition",
                    inCompare ? "border-transparent" : "border-ink-600",
                  )}
                  style={inCompare ? { background: build.color } : undefined}
                />
                {inCompare ? "vs" : "vs?"}
              </button>

              <div className="mx-0.5 h-3.5 w-px bg-ink-700" />

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setColorPickerId(colorPickerId === build.id ? null : build.id)}
                  className="h-3.5 w-3.5 shrink-0 rounded-full border border-ink-950/40 transition hover:scale-110"
                  style={{ background: build.color }}
                  title="Change build color"
                  aria-label="Change build color"
                />
                {colorPickerId === build.id && (
                  <div
                    ref={pickerRef}
                    className="absolute left-0 top-full z-20 mt-2 flex w-max items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 p-2 shadow-lg"
                  >
                    {BUILD_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => {
                          onRecolor(build.id, color);
                          setColorPickerId(null);
                        }}
                        className={clsx(
                          "h-5 w-5 shrink-0 rounded-full border-2 transition hover:scale-110",
                          build.color === color ? "border-ink-100" : "border-transparent",
                        )}
                        style={{ background: color }}
                        title={color}
                        aria-label={`Use ${color}`}
                      />
                    ))}
                    <div className="mx-0.5 h-5 w-px bg-ink-700" />
                    <input
                      type="color"
                      value={build.color}
                      onChange={(e) => onRecolor(build.id, e.target.value)}
                      className="h-5 w-6 cursor-pointer rounded border border-ink-700 bg-transparent p-0"
                      title="Custom color"
                      aria-label="Custom build color"
                    />
                  </div>
                )}
              </div>

              {editingId === build.id ? (
                <input
                  autoFocus
                  defaultValue={build.name}
                  className="w-32 bg-transparent text-[13px] outline-none"
                  onBlur={(e) => {
                    onRename(build.id, e.target.value.trim() || build.name);
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => (active ? setEditingId(build.id) : onSelect(build.id))}
                  className={clsx(
                    "max-w-40 truncate text-[13px] font-medium",
                    active ? "text-ink-100" : "text-ink-300",
                  )}
                  title={active ? "Click to rename" : "Switch to this build"}
                >
                  {build.name}
                </button>
              )}
              <span
                className="tnum text-[11px] text-ink-500"
                title={`${soulsFor(build).toLocaleString()} souls spent on items`}
              >
                {fmtSouls(soulsFor(build))}
              </span>
              {active && (
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => onDuplicate(build.id)}
                    className="rounded px-1 text-[11px] text-ink-500 hover:bg-ink-700 hover:text-ink-100"
                    title="Duplicate build"
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete "${build.name}"?`)) onDelete(build.id);
                    }}
                    className="rounded px-1 text-[11px] text-ink-500 hover:bg-ink-700 hover:text-red-300"
                    title="Delete build"
                  >
                    ✕
                  </button>
                </span>
              )}
            </div>
          );
        })}
        <button type="button" className="btn px-3 py-2" onClick={onAdd} title="New build">
          + Build
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="btn"
          onClick={onShare}
          title="Copy a shareable code/link for this build — nothing leaves your browser"
        >
          Share
        </button>
        <input
          type="text"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void importCode();
          }}
          placeholder="Paste a build code or link…"
          className="input w-44 py-1.5 text-[12px]"
        />
        <button
          type="button"
          className="btn"
          onClick={() => void importCode()}
          disabled={!codeInput.trim() || importingCode}
        >
          Import code
        </button>
        <div className="mx-0.5 h-5 w-px bg-ink-700" />
        <button type="button" className="btn" onClick={exportAll} title="Download every build as a JSON file">
          Export all
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => fileRef.current?.click()}
          title="Restore builds from a previously exported JSON file"
        >
          Import file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
