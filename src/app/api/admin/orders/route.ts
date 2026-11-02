
import { connection, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          select: {
            id: true,
            productId: true,
            productName: true,
            colour: true,
            size: true,
            unitPrice: true,
            quantity: true,
            lineTotal: true,
          },
        },
      },
    });

    const stats = {
      totalOrders: orders.length,
      pendingPayment: orders.filter(
        (order) => order.paymentStatus === "PENDING"
      ).length,
      paidOrders: orders.filter(
        (order) => order.paymentStatus === "PAID"
      ).length,
      processingOrders: orders.filter(
        (order) => order.orderStatus === "PROCESSING"
      ).length,
      shippedOrders: orders.filter(
        (order) => order.orderStatus === "SHIPPED"
      ).length,
      deliveredOrders: orders.filter(
        (order) => order.orderStatus === "DELIVERED"
      ).length,
      paidRevenue: orders
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
