import { connection, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth";

export async function GET() {
  await connection();

  try {
    const session = await getAdminSession();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const [
      totalProductsResult,
      activeProductsResult,
      ordersResult,
    ] = await Promise.all([
      supabase.from("Product").select("id", { count: "exact", head: true }),
      supabase
        .from("Product")
        .select("id", { count: "exact", head: true })
        .eq("isActive", true),
      supabase
        .from("Order")
        .select("*, items:OrderItem(*)")
        .order("createdAt", { ascending: false }),
    ]);
    for (const result of [
      totalProductsResult,
      activeProductsResult,
      ordersResult,
    ]) {
      if (result.error) throw result.error;
    }

    const totalProducts = totalProductsResult.count ?? 0;
    const activeProducts = activeProductsResult.count ?? 0;
    const orders = ordersResult.data ?? [];
    const paidOrderIds = orders
      .filter((order) => order.paymentStatus === "PAID")
      .map((order) => order.id);
    const orderItemsResult = paidOrderIds.length
      ? await supabase
          .from("OrderItem")
          .select("productId, productName, quantity, lineTotal")
          .in("orderId", paidOrderIds)
      : { data: [], error: null };
    if (orderItemsResult.error) throw orderItemsResult.error;
    const orderItems = orderItemsResult.data ?? [];

    const paidOrders = orders.filter(
      (order) => order.paymentStatus === "PAID"
    );

    const revenue = paidOrders.reduce(
      (sum, order) => sum + order.total,
      0
    );

    const pendingPayments = orders.filter(
      (order) => order.paymentStatus === "PENDING"
    ).length;

    const processingOrders = orders.filter(
      (order) => order.orderStatus === "PROCESSING"
    ).length;

    const shippedOrders = orders.filter(
      (order) => order.orderStatus === "SHIPPED"
    ).length;

    const deliveredOrders = orders.filter(
      (order) => order.orderStatus === "DELIVERED"
    ).length;

    const salesByProduct = new Map<
      string,
      {
        productId: string;
        productName: string;
        unitsSold: number;
        revenue: number;
      }
    >();

    for (const item of orderItems) {
      const existing = salesByProduct.get(item.productId);

      if (existing) {
        existing.unitsSold += item.quantity;
        existing.revenue += item.lineTotal;
      } else {
        salesByProduct.set(item.productId, {
          productId: item.productId,
          productName: item.productName,
          unitsSold: item.quantity,
          revenue: item.lineTotal,
        });
      }
    }

    const topProducts = Array.from(salesByProduct.values())
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 5);

    const recentOrders = orders.slice(0, 8).map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      total: order.total,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt,
      itemCount: order.items.reduce(
        (sum, item) => sum + item.quantity,
        0
      ),
    }));

    return NextResponse.json({
      stats: {
        totalProducts,
        activeProducts,
        totalOrders: orders.length,
        paidOrders: paidOrders.length,
        pendingPayments,
        processingOrders,
        shippedOrders,
        deliveredOrders,
        revenue,
      },
      topProducts,
      recentOrders,
    });
  } catch (error) {
    console.error("Admin analytics error:", error);

    return NextResponse.json(
      { error: "Unable to load analytics." },
      { status: 500 }
    );
  }
}