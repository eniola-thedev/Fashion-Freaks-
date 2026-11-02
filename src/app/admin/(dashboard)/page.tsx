import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAdminSession } from "@/lib/auth";
import DashboardClient from "./DashboardClient";

export default async function AdminPage() {
  await connection();
  const session = await getAdminSession();

  if (!session) {
    redirect("/admin/login");
  }

  return <DashboardClient />;
}
