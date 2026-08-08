import { BuildLab } from "@/components/BuildLab";
import { getCalcContext } from "@/lib/data/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const ctx = await getCalcContext();
  return <BuildLab ctx={ctx} />;
}
