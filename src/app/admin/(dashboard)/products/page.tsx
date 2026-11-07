import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import ProductsClient from "./ProductsClient";

export default function AdminProductsPage() {
  return (
    <Suspense fallback={<p role="status">Loading products...</p>}>
      <AdminProducts />
    </Suspense>
  );
}

async function AdminProducts() {
  const session = await getAdminSession();

  if (!session) {
    redirect("/admin/login");
  }

  return <ProductsClient />;
}
