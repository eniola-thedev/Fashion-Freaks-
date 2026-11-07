import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  matchesPaystackTransaction,
  parsePaystackTransaction,
} from "@/lib/paystack.mjs";

export async function POST(request: Request) {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      return NextResponse.json(
        { error: "Payment service is not configured." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const reference =
      typeof body.reference === "string"
        ? body.reference.trim()
        : "";

    if (!reference || reference.length > 150) {
      return NextResponse.json(
        { error: "A valid payment reference is required." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const { data: order, error: orderError } = await supabase
      .from("Order")
      .select("*")
      .eq("paymentReference", reference)
      .maybeSingle();
    if (orderError) throw orderError;

    if (!order) {
      return NextResponse.json(
        { error: "No order was found for this payment reference." },
        { status: 404 }
      );
    }

    // Allow a refresh after a payment has already been confirmed.
    if (order.paymentStatus === "PAID") {
      return NextResponse.json({
        verified: true,
        orderNumber: order.orderNumber,
      });
    }

    if (order.paymentStatus !== "PENDING") {
      return NextResponse.json(
        { error: "This order is not awaiting payment." },
        { status: 409 }
      );
    }

    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
        cache: "no-store",
      }
    );

    const result = await paystackResponse.json();

    if (
      !paystackResponse.ok ||
      result.status !== true ||
      !result.data
    ) {
      return NextResponse.json(
        { error: "Could not verify this payment. Please try again." },
        { status: 502 }
      );
    }

    const transaction = parsePaystackTransaction(result.data);

    if (
      !transaction ||
      transaction.reference !== reference ||
      !matchesPaystackTransaction(transaction, order)
    ) {
      return NextResponse.json(
        {
          verified: false,
          outcome: "unconfirmed",
          orderNumber: order.orderNumber,
          error:
            "Payment has not been confirmed. Do not start another payment yet; contact support if you were charged.",
        },
        { status: 409 }
      );
    }

    if (
      transaction.status === "failed" ||
      transaction.status === "abandoned"
    ) {
      return NextResponse.json(
        {
          verified: false,
          outcome: "declined",
          orderNumber: order.orderNumber,
          error:
            "Paystack confirms that this payment attempt did not complete. Your order has not been marked as paid.",
        },
        { status: 409 }
      );
    }

    if (transaction.status !== "success") {
      return NextResponse.json(
        {
          verified: false,
          outcome: "unconfirmed",
          orderNumber: order.orderNumber,
          error:
            "This payment is still processing or its status is not final. Check again before trying another payment.",
        },
        { status: 409 }
      );
    }

    // Only one request can change a pending order to paid.
    const { data: updatedOrder, error: updateError } = await supabase
      .from("Order")
      .update({ paymentStatus: "PAID", orderStatus: "PROCESSING" })
      .eq("id", order.id)
      .eq("paymentReference", reference)
      .eq("paymentStatus", "PENDING")
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;

    if (!updatedOrder) {
      const { data: latestOrder, error: latestError } = await supabase
        .from("Order")
        .select("paymentStatus")
        .eq("id", order.id)
        .maybeSingle();
      if (latestError) throw latestError;

      if (latestOrder?.paymentStatus !== "PAID") {
        return NextResponse.json(
          { error: "Order status changed. Please check your order." },
          { status: 409 }
        );
      }
    }

    return NextResponse.json({
      verified: true,
      orderNumber: order.orderNumber,
    });
  } catch (error) {
    console.error("Payment verification failed:", error);

    return NextResponse.json(
      { error: "Unable to verify payment right now." },
      { status: 500 }
    );
  }
}