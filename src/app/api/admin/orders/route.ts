
import { connection, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth";

export async function GET() {
  await connection();

  try {
    const session = await getAdminSession();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in as admin." },
        { status: 401 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const { data: orders, error } = await supabase
      .from("Order")
      .select(
        "*, items:OrderItem(id, productId, productName, colour, size, unitPrice, quantity, lineTotal)"
      )
      .order("createdAt", { ascending: false });
    if (error) throw error;
    const orderRows = orders ?? [];

    const stats = {
      totalOrders: orderRows.length,
      pendingPayment: orderRows.filter(
        (order) => order.paymentStatus === "PENDING"
      ).length,
      paidOrders: orderRows.filter(
        (order) => order.paymentStatus === "PAID"
      ).length,
      processingOrders: orderRows.filter(
        (order) => order.orderStatus === "PROCESSING"
      ).length,
      shippedOrders: orderRows.filter(
        (order) => order.orderStatus === "SHIPPED"
      ).length,
      deliveredOrders: orderRows.filter(
        (order) => order.orderStatus === "DELIVERED"
      ).length,
      paidRevenue: orderRows
        .filter((order) => order.paymentStatus === "PAID")
        .reduce((sum, order) => sum + order.total, 0),
    };

    return NextResponse.json({ orders, stats });
  } catch (error) {
    console.error("Admin orders GET error:", error);

    return NextResponse.json(
      { error: "Unable to retrieve orders." },
      { status: 500 }
    );
  }
}
