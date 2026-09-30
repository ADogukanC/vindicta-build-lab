import clsx from "clsx";
import type { Item } from "@/lib/types";
import { CATEGORY_COLOR } from "@/lib/format";

const SIZES = { xs: 18, sm: 28, md: 40, lg: 56 } as const;

export function ItemIcon({
  item,
  size = "md",
  className,
  dimmed,
  corrupted,
}: {
  item: Pick<Item, "name" | "iconUrl" | "category">;
  size?: keyof typeof SIZES;
  className?: string;
  dimmed?: boolean;
  /**
   * The Broker doesn't give a corrupted item its own icon — in-game it's the
   * same texture wearing a shared cracked-glass frame (`citadel_corrupted_item_shop`'s
   * own UI, `frame-corrupted.webp`), so that's what this overlays rather than
   * faking 90 distinct corrupted icons that don't exist.
   */
  corrupted?: boolean;
}) {
  const px = SIZES[size];
  return (
    <span
      className={clsx(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-md border bg-ink-850",
        dimmed && "opacity-40 grayscale",
        corrupted && "border-fuchsia-500/70 shadow-[0_0_6px_rgba(217,70,239,0.55)]",
        className,
      )}
      style={{ width: px, height: px, borderColor: corrupted ? undefined : (CATEGORY_COLOR[item.category] ?? "#363347") }}
      title={corrupted ? `${item.name} (Corrupted)` : item.name}
    >
      {item.iconUrl ? (
        // Icons are either static files under /public or admin-uploaded data
        // URLs, so the plain <img> is intentional.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.iconUrl} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span className="text-[10px] font-semibold text-ink-300">
          {item.name.slice(0, 2).toUpperCase()}
        </span>
      )}
      {corrupted && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/corruption/frame-corrupted.webp"
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full mix-blend-screen"
          draggable={false}
        />
      )}
    </span>
  );
}
