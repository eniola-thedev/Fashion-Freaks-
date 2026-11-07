import { Suspense } from "react";
import { io } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import DashboardClient from "./DashboardClient";

export default function AdminPage() {
  return (
    <Suspense fallback={<p role="status">Loading dashboard...</p>}>
      <AdminDashboard />
    </Suspense>
  );
}

async function AdminDashboard() {
  await io();
  const session = await getAdminSession();

  if (!session) {
    redirect("/admin/login");
  }

  return <DashboardClient />;
}
