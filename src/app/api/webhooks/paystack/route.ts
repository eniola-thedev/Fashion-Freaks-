import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  matchesPaystackTransaction,
  parsePaystackTransaction,
  verifyPaystackSignature,
} from "@/lib/paystack.mjs";

export async function POST(request: Request) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { error: "Payment service is not configured." },
      { status: 503 }
    );
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 1024 * 1024) {
    return NextResponse.json(
      { error: "Webhook payload is too large." },
      { status: 413 }
    );
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 1024 * 1024) {
    return NextResponse.json(
      { error: "Webhook payload is too large." },
      { status: 413 }
    );
  }

  if (
    !verifyPaystackSignature(
      rawBody,
      request.headers.get("x-paystack-signature"),
      secretKey
    )
  ) {
    return NextResponse.json(
      { error: "Invalid signature." },
      { status: 401 }
    );
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook payload." },
      { status: 400 }
    );
  }

  if (typeof event !== "object" || event === null) {
    return NextResponse.json(
      { error: "Invalid webhook payload." },
      { status: 400 }
    );
  }

  const webhook = event as { event?: unknown; data?: unknown };
  if (webhook.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  const transaction = parsePaystackTransaction(webhook.data);
  if (!transaction || transaction.status !== "success") {
    return NextResponse.json(
      { error: "Invalid successful-payment event." },
      { status: 400 }
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: order, error: orderError } = await supabase
      .from("Order")
      .select("*")
      .eq("paymentReference", transaction.reference)
      .maybeSingle();
    if (orderError) throw orderError;

    if (!order) {
      console.warn("Paystack webhook: no matching order found.");
      return NextResponse.json({ received: true });
    }

    if (!matchesPaystackTransaction(transaction, order)) {
      console.error(
        "Paystack webhook: transaction does not match order.",
        order.orderNumber
      );
      return NextResponse.json({ received: true });
    }

    const { error: updateError } = await supabase
      .from("Order")
      .update({ paymentStatus: "PAID", orderStatus: "PROCESSING" })
      .eq("id", order.id)
      .eq("paymentReference", transaction.reference)
      .eq("paymentStatus", "PENDING");
    if (updateError) throw updateError;

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Paystack webhook error:", error);

    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 }
    );
  }
}