import { BrowsePanel } from "@/components/BrowsePanel";
import { getCalcContext } from "@/lib/data/store";
import { listPublicBuilds } from "@/lib/data/db/sharedBuilds";

export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  const [ctx, builds] = await Promise.all([getCalcContext(), listPublicBuilds()]);
  return <BrowsePanel items={ctx.items} initialBuilds={builds} />;
}
