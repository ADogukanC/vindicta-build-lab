import { ComparePanel } from "@/components/ComparePanel";
import { getCalcContext } from "@/lib/data/store";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const ctx = await getCalcContext();
  return <ComparePanel ctx={ctx} />;
}
