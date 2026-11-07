import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import OrdersClient from "./OrdersClient";

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<p role="status">Loading orders...</p>}>
      <AdminOrders />
    </Suspense>
  );
}

async function AdminOrders() {
  const session = await getAdminSession();

  if (!session) {
    redirect("/admin/login");
  }

  return <OrdersClient />;
}
