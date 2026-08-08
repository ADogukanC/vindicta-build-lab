import clsx from "clsx";
import type { Item } from "@/lib/types";
import { CATEGORY_COLOR } from "@/lib/format";

const SIZES = { xs: 18, sm: 28, md: 40, lg: 56 } as const;

export function ItemIcon({
  item,
  size = "md",
  className,
  dimmed,
}: {
  item: Pick<Item, "name" | "iconUrl" | "category">;
  size?: keyof typeof SIZES;
  className?: string;
  dimmed?: boolean;
}) {
  const px = SIZES[size];
  return (
    <span
      className={clsx(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-md border bg-ink-850",
        dimmed && "opacity-40 grayscale",
        className,
      )}
      style={{ width: px, height: px, borderColor: CATEGORY_COLOR[item.category] ?? "#363347" }}
      title={item.name}
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
    </span>
  );
}
