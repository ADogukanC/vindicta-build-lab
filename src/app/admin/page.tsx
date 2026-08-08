import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { isAdmin } from "@/lib/auth";
import { getStore } from "@/lib/data/store";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdmin())) return <AdminLogin />;

  const store = getStore();
  const [items, hero] = await Promise.all([store.getItems(), store.getHero()]);

  return <AdminPanel initialItems={items} initialHero={hero} />;
}
