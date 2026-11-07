import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";
import { getCustomerSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      console.error("PAYSTACK_SECRET_KEY is not configured.");
      return NextResponse.json(
        { error: "Payment service is not configured." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const orderNumber =
      typeof body.orderNumber === "string"
        ? body.orderNumber.trim()
        : "";

    if (!orderNumber || orderNumber.length > 100) {
      return NextResponse.json(
        { error: "A valid order reference is required." },
        { status: 400 }
      );
    }

    const customer = await getCustomerSession();
    if (!customer) {
      return NextResponse.json(
        { error: "Sign in to your account before paying for this order." },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const supabase = createSupabaseAdminClient();
    const { data: order, error: orderError } = await supabase
      .from("Order")
      .select("*")
      .eq("orderNumber", orderNumber)
      .eq("customerId", customer.id)
      .maybeSingle();
    if (orderError) throw orderError;

    if (!order) {
      return NextResponse.json(
        { error: "Order not found." },
        { status: 404 }
      );
    }

    if (
  order.paymentStatus !== "PENDING" ||
  order.total <= 0
) {
  return NextResponse.json(
    { error: "This order cannot be paid for." },
    { status: 409 }
  );
}
    const configuredAppUrl = process.env.APP_URL;
    if (process.env.NODE_ENV === "production" && !configuredAppUrl) {
      return NextResponse.json(
        { error: "The public application URL is not configured." },
        { status: 500 }
      );
    }

    const appUrl = new URL(configuredAppUrl ?? request.url);
    if (
      process.env.NODE_ENV === "production" &&
      appUrl.protocol !== "https:"
    ) {
      return NextResponse.json(
        { error: "APP_URL must use HTTPS in production." },
        { status: 500 }
      );
    }

    const now = new Date();
    if (
      order.paymentReference ||
      !order.paymentExpiresAt ||
      new Date(order.paymentExpiresAt) <= now
    ) {
      return NextResponse.json(
        {
          error:
            "This order already has a payment attempt or its reservation expired. Check the payment status before retrying.",
        },
        { status: 409 }
      );
    }

    const reference = `FF-${randomUUID()}`;
    const { data: claim, error: claimError } = await supabase
      .from("Order")
      .update({ paymentReference: reference })
      .eq("id", order.id)
      .eq("paymentStatus", "PENDING")
      .is("paymentReference", null)
      .gt("paymentExpiresAt", now.toISOString())
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;

    if (!claim) {
      return NextResponse.json(
        {
          error:
            "A payment attempt is already being prepared. Check the order status before trying again.",
        },
        { status: 409 }
      );
    }

    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: order.customerEmail,
          amount: String(order.total * 100),
          currency: "NGN",
          reference,
          callback_url: `${appUrl.origin}/checkout/verify`,
          metadata: {
            orderNumber: order.orderNumber,
          },
        }),
        cache: "no-store",
      }
    );

    const result: unknown = await paystackResponse.json();
    const responseBody =
      typeof result === "object" && result !== null
        ? (result as {
            status?: unknown;
            message?: unknown;
            data?: { authorization_url?: unknown };
          })
        : null;

    if (!paystackResponse.ok || responseBody?.status !== true) {
      if (responseBody?.status === false) {
        const { error: releaseError } = await supabase
          .from("Order")
          .update({ paymentReference: null })
          .eq("id", order.id)
          .eq("paymentStatus", "PENDING")
          .eq("paymentReference", reference);
        if (releaseError) throw releaseError;
      }

      console.error(
        "Paystack initialization failed:",
        responseBody?.message
      );

      return NextResponse.json(
        { error: "Could not start payment. Please try again." },
        { status: 502 }
      );
    }

    const authorizationUrl = responseBody.data?.authorization_url;
    if (typeof authorizationUrl !== "string") {
      return NextResponse.json(
        { error: "Paystack returned an invalid payment link." },
        { status: 502 }
      );
    }

    const paymentUrl = new URL(authorizationUrl);
    if (
      paymentUrl.protocol !== "https:" ||
      paymentUrl.hostname !== "checkout.paystack.com"
    ) {
      console.error("Paystack returned an unexpected checkout URL.");
      return NextResponse.json(
        { error: "Paystack returned an invalid payment link." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      authorizationUrl: paymentUrl.toString(),
    });
  } catch (error) {
    console.error("Payment initialization error:", error);

    return NextResponse.json(
      { error: "Unable to start payment right now." },
      { status: 500 }
    );
  }
}