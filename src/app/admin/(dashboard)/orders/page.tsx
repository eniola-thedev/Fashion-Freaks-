import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAdminSession } from "@/lib/auth";
import OrdersClient from "./OrdersClient";

export default async function AdminOrdersPage() {
  await connection();
  const session = await getAdminSession();

  if (!session) {
    redirect("/admin/login");
  }

  return <OrdersClient />;
}
