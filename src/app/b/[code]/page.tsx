import { BuildLab } from "@/components/BuildLab";
import { getCalcContext } from "@/lib/data/store";

export const dynamic = "force-dynamic";

/**
 * A shared build. `BuildLab` resolves the `code` segment client-side —
 * `resolveBuildCode` looks it up in the database first, falling back to
 * decoding it directly for links made before the database existed — so this
 * page itself never has to look anything up. There is nothing here to 404:
 * an invalid code just shows an error banner once resolution fails
 * client-side.
 */
export default async function SharedBuildPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const ctx = await getCalcContext();
  return <BuildLab ctx={ctx} sharedCode={code} />;
}
