import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  matchesPaystackTransaction,
  parsePaystackTransaction,
} from "@/lib/paystack.mjs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || cronSecret.length < 32) {
    return NextResponse.json(
      { error: "CRON_SECRET must be configured with at least 32 characters." },
      { status: 500 }
    );
  }

  const authorization = request.headers.get("authorization");
  const expectedAuthorization = Buffer.from(
    `Bearer ${cronSecret}`,
    "utf8"
  );
  const receivedAuthorization = Buffer.from(
    authorization ?? "",
    "utf8"
  );
  if (
    receivedAuthorization.length !== expectedAuthorization.length ||
    !timingSafeEqual(receivedAuthorization, expectedAuthorization)
  ) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    return NextResponse.json(
      { error: "Payment service is not configured." },
      { status: 500 }
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: expiredOrders, error: expiredOrdersError } = await supabase
      .from("Order")
      .select("*")
      .eq("paymentStatus", "PENDING")
      .lte("paymentExpiresAt", new Date().toISOString())
      .order("paymentExpiresAt", { ascending: true })
      .limit(100);
    if (expiredOrdersError) throw expiredOrdersError;

    let paidConfirmed = 0;
    let failedConfirmed = 0;
    let needsReview = 0;

    for (const order of expiredOrders ?? []) {
      const reference = order.paymentReference;

      if (!reference) {
        const { data: restored, error: restoreError } = await supabase.rpc(
          "restore_expired_order",
          { p_order_id: order.id, p_payment_reference: null }
        );
        if (restoreError) throw restoreError;

        if (restored) failedConfirmed++;
        continue;
      }

      const response = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
          },
          cache: "no-store",
        }
      );

      if (!response.ok) {
        needsReview++;
        continue;
      }

      const result: unknown = await response.json();
      const responseBody =
        typeof result === "object" && result !== null
          ? (result as { status?: unknown; data?: unknown })
          : null;
      const transaction = parsePaystackTransaction(
        responseBody?.data
      );

      if (responseBody?.status !== true || !transaction) {
        needsReview++;
        continue;
      }

      if (!matchesPaystackTransaction(transaction, order)) {
        needsReview++;
        continue;
      }

      if (transaction.status === "success") {
        const { data: updated, error: updateError } = await supabase
          .from("Order")
          .update({ paymentStatus: "PAID", orderStatus: "PROCESSING" })
          .eq("id", order.id)
          .eq("paymentStatus", "PENDING")
          .eq("paymentReference", reference)
          .select("id")
          .maybeSingle();
        if (updateError) throw updateError;

        if (updated) paidConfirmed++;
        continue;
      }

      // Do not cancel orders for transactions that are merely pending,
      // abandoned, unknown, or otherwise inconclusive.
      if (transaction.status !== "failed") {
        needsReview++;
        continue;
      }

      // Cancel the expired order atomically.
      const { data: restored, error: restoreError } = await supabase.rpc(
        "restore_expired_order",
        { p_order_id: order.id, p_payment_reference: reference }
      );
      if (restoreError) throw restoreError;

      if (restored) failedConfirmed++;
    }

    if (needsReview > 0) {
      console.warn(
        "Expired orders require manual payment review.",
        { needsReview }
      );
    }

    return NextResponse.json({
      checked: expiredOrders?.length ?? 0,
      paidConfirmed,
      failedConfirmed,
      needsReview,
    });
  } catch (error) {
    console.error("Order cleanup failed:", error);

    return NextResponse.json(
      { error: "Order cleanup failed." },
      { status: 500 }
    );
  }
}