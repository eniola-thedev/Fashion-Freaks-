
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

const allowedStatuses = [
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
] as const;

type AllowedStatus = (typeof allowedStatuses)[number];

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminSession();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in as admin." },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const body = await request.json();
    const status = body.status;

    if (
      typeof status !== "string" ||
      !allowedStatuses.includes(status as AllowedStatus)
    ) {
      return NextResponse.json(
        { error: "Invalid order status." },
        { status: 400 }
      );
    }

    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        paymentStatus: true,
        orderStatus: true,
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: "Order not found." },
        { status: 404 }
      );
    }

    if (order.paymentStatus !== "PAID") {
      return NextResponse.json(
        {
          error:
            "Only paid orders can be processed, shipped, or delivered.",
        },
        { status: 409 }
      );
    }

    if (
      order.orderStatus === "DELIVERED" &&
      status !== "DELIVERED"
    ) {
      return NextResponse.json(
        {
          error:
            "A delivered order cannot be moved back to an earlier status here.",
        },
        { status: 409 }
      );
    }

    const nextStatuses: Record<string, string[]> = {
      PENDING: ["PROCESSING"],
      PROCESSING: ["PROCESSING", "SHIPPED"],
      SHIPPED: ["SHIPPED", "DELIVERED"],
      DELIVERED: ["DELIVERED"],
    };

    if (!nextStatuses[order.orderStatus]?.includes(status)) {
      return NextResponse.json(
        { error: "Order status cannot move backwards or skip a fulfilment step." },
        { status: 409 }
      );
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { orderStatus: status },
      select: {
        id: true,
        orderNumber: true,
        orderStatus: true,
        paymentStatus: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      message: "Order status updated successfully.",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Admin order PATCH error:", error);

    return NextResponse.json(
      { error: "Unable to update order status." },
      { status: 500 }
    );
  }
}
