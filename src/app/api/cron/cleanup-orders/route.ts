import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
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
    const expiredOrders = await prisma.order.findMany({
      where: {
        paymentStatus: "PENDING",
        paymentExpiresAt: { lte: new Date() },
      },
      include: { items: true },
      take: 100,
      orderBy: { paymentExpiresAt: "asc" },
    });

    let paidConfirmed = 0;
    let failedConfirmed = 0;
    let needsReview = 0;

    for (const order of expiredOrders) {
      const reference = order.paymentReference;

      if (!reference) {
        const restored = await prisma.$transaction(async (tx) => {
          const cancelled = await tx.order.updateMany({
            where: {
              id: order.id,
              paymentStatus: "PENDING",
              paymentReference: null,
              paymentExpiresAt: { lte: new Date() },
            },
            data: {
              paymentStatus: "FAILED",
              orderStatus: "CANCELLED",
            },
          });

          if (cancelled.count !== 1) {
            return false;
          }

          for (const item of order.items) {
            const stockUpdate = await tx.productVariant.updateMany({
              where: {
                id: item.variantId,
                productId: item.productId,
              },
              data: {
                stock: { increment: item.quantity },
              },
            });

            if (stockUpdate.count !== 1) {
              throw new Error(
                `Could not restore stock for variant ${item.variantId}`
              );
            }
          }

          return true;
        });

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
        const updated = await prisma.order.updateMany({
          where: {
            id: order.id,
            paymentStatus: "PENDING",
            paymentReference: reference,
          },
          data: {
            paymentStatus: "PAID",
            orderStatus: "PROCESSING",
          },
        });

        if (updated.count === 1) paidConfirmed++;
        continue;
      }

      // Do not restore stock for transactions that are merely
      // pending, abandoned, unknown, or otherwise inconclusive.
      if (transaction.status !== "failed") {
        needsReview++;
        continue;
      }

      // Restore stock and cancel the order atomically.
      const restored = await prisma.$transaction(async (tx) => {
        const cancelled = await tx.order.updateMany({
          where: {
            id: order.id,
            paymentStatus: "PENDING",
            paymentReference: reference,
            paymentExpiresAt: { lte: new Date() },
          },
          data: {
            paymentStatus: "FAILED",
            orderStatus: "CANCELLED",
          },
        });

        if (cancelled.count !== 1) {
          return false;
        }

        for (const item of order.items) {
          const stockUpdate = await tx.productVariant.updateMany({
            where: {
              id: item.variantId,
              productId: item.productId,
            },
            data: {
              stock: { increment: item.quantity },
            },
          });

          if (stockUpdate.count !== 1) {
            throw new Error(
              `Could not restore stock for variant ${item.variantId}`
            );
          }
        }

        return true;
      });

      if (restored) failedConfirmed++;
    }

    if (needsReview > 0) {
      console.warn(
        "Expired payment reservations require manual review.",
        { needsReview }
      );
    }

    return NextResponse.json({
      checked: expiredOrders.length,
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