import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

    const [
      totalProducts,
      activeProducts,
      orders,
      variants,
      orderItems,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({
        where: { isActive: true },
      }),
      prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        include: { items: true },
      }),
      prisma.productVariant.findMany({
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
            },
          },
        },
      }),
      prisma.orderItem.findMany({
        where: {
          order: {
            paymentStatus: "PAID",
          },
        },
      }),
    ]);

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

    const lowStockVariants = variants
      .filter(
        (variant) =>
          variant.product.isActive && variant.stock <= 5
      )
      .map((variant) => ({
        id: variant.id,
        productId: variant.productId,
        productName: variant.product.name,
        slug: variant.product.slug,
        colour: variant.colour,
        size: variant.size,
        stock: variant.stock,
      }))
      .sort((a, b) => a.stock - b.stock);

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
      lowStockVariants,
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