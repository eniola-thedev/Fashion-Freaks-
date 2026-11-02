import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAdminSession } from "@/lib/auth";
import ProductsClient from "./ProductsClient";

export default async function AdminProductsPage() {
  await connection();
  const session = await getAdminSession();

  if (!session) {
    redirect("/admin/login");
  }

  return <ProductsClient />;
}
