
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

    const supabase = createSupabaseAdminClient();
    const { data: order, error: orderError } = await supabase
      .from("Order")
      .select("id, paymentStatus, orderStatus")
      .eq("id", id)
      .maybeSingle();
    if (orderError) throw orderError;

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

    const { data: updatedOrder, error: updateError } = await supabase
      .from("Order")
      .update({ orderStatus: status })
      .eq("id", id)
      .eq("paymentStatus", "PAID")
      .select("id, orderNumber, orderStatus, paymentStatus, updatedAt")
      .single();
    if (updateError) throw updateError;

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
