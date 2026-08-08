import { BuildLab } from "@/components/BuildLab";
import { getCalcContext } from "@/lib/data/store";

export const dynamic = "force-dynamic";

/**
 * A shared build. The `code` segment *is* the build — gzipped and
 * base64url-encoded, decoded entirely client-side by `BuildLab` — so this
 * page never has to look anything up. There is nothing here to 404: an
 * invalid code just shows an error banner once decoding fails client-side.
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
