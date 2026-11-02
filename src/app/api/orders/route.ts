
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requestShipbubbleQuote,
  isShippingRateLimited,
  ShippingQuoteError,
  type ShippingQuoteItem,
} from "@/lib/shipping";

type OrderRequest = {
  checkoutKey?: string;
  customer?: {
    fullName?: string;
    email?: string;
    phone?: string;
    state?: string;
    city?: string;
    address?: string;
    deliveryNotes?: string;
  };
  items?: {
    productId?: string;
    variantId?: string;
    quantity?: number;
  }[];
  expectedDeliveryFee?: number;
};

class OrderError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function clean(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function isUniqueConstraintError(
  error: unknown
): error is { code: "P2002" } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function orderResponse(
  order: {
    id: string;
    orderNumber: string;
    total: number;
    deliveryFee: number;
    paymentStatus: string;
    createdAt: Date;
  },
  status: number
) {
  return NextResponse.json(
    {
      message: "Order created and awaiting payment.",
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        deliveryFee: order.deliveryFee,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt,
      },
    },
    { status }
  );
}

export async function POST(request: Request) {
  let checkoutKey = "";

  try {
    let body: OrderRequest;
    try {
      body = (await request.json()) as OrderRequest;
    } catch {
      throw new OrderError("Please submit a valid order request.");
    }

    checkoutKey = clean(body.checkoutKey, 100);
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(checkoutKey)) {
      throw new OrderError("Your checkout session is invalid. Please try again.");
    }

    const existingOrder = await prisma.order.findUnique({
      where: { checkoutKey },
      select: {
        id: true,
        orderNumber: true,
        total: true,
        deliveryFee: true,
        paymentStatus: true,
        createdAt: true,
      },
    });

    if (existingOrder) {
      return orderResponse(existingOrder, 200);
    }
    if (isShippingRateLimited(request)) {
      return NextResponse.json(
        { error: "Too many delivery quote requests. Please wait a moment." },
        { status: 429 }
      );
    }

    const customer = body.customer;
    const items = body.items;

    const fullName = clean(customer?.fullName, 120);
    const email = clean(customer?.email, 254).toLowerCase();
    const phone = clean(customer?.phone, 25);
    const state = clean(customer?.state, 80);
    const city = clean(customer?.city, 100);
    const address = clean(customer?.address, 500);
    const deliveryNotes = clean(customer?.deliveryNotes, 500);

    if (
      !fullName ||
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^[0-9+\s()-]{7,20}$/.test(phone) ||
      !state ||
      !city ||
      !address
    ) {
      throw new OrderError(
        "Please provide valid contact and delivery details."
      );
    }

    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 20
    ) {
      throw new OrderError(
        "Your bag is empty or contains too many different items."
      );
    }

    const quantities = new Map<
      string,
      { productId: string; quantity: number }
    >();

    for (const item of items) {
      const productId = clean(item?.productId, 100);
      const variantId = clean(item?.variantId, 100);
      const quantity = item?.quantity;

      if (
        !productId ||
        !variantId ||
        !Number.isSafeInteger(quantity) ||
        (quantity as number) < 1 ||
        (quantity as number) > 10
      ) {
        throw new OrderError(
          "Each item must have a valid variant and quantity between 1 and 10."
        );
      }

      if (quantities.has(variantId)) {
        throw new OrderError(
          "Your bag contains a duplicate variant. Please review it."
        );
      }

      quantities.set(variantId, {
        productId,
        quantity: quantity as number,
      });
    }

    if (
      !Number.isSafeInteger(body.expectedDeliveryFee) ||
      (body.expectedDeliveryFee as number) < 0
    ) {
      throw new OrderError(
        "Refresh the delivery quote before placing your order."
      );
    }

    const quoteVariants = await prisma.productVariant.findMany({
      where: { id: { in: [...quantities.keys()] } },
      include: { product: true },
    });
    if (quoteVariants.length !== quantities.size) {
      throw new OrderError(
        "A product in your bag is no longer available.",
        409
      );
    }

    const quoteItems: ShippingQuoteItem[] = [];
    for (const [variantId, item] of quantities) {
      const variant = quoteVariants.find(
        (candidate) =>
          candidate.id === variantId &&
          candidate.productId === item.productId
      );
      if (
        !variant ||
        !variant.isActive ||
        !variant.product.isActive ||
        variant.stock < item.quantity
      ) {
        throw new OrderError(
          "A product in your bag is no longer available in the requested quantity.",
          409
        );
      }
      quoteItems.push({
        name: variant.product.name,
        unitAmount:
          variant.product.discountPrice ?? variant.product.price,
        quantity: item.quantity,
      });
    }

    const deliveryQuote = await requestShipbubbleQuote(
      {
        fullName,
        email,
        phone,
        state,
        city,
        address,
        deliveryNotes,
      },
      quoteItems
    );
    if (deliveryQuote.deliveryFee !== body.expectedDeliveryFee) {
      return NextResponse.json(
        {
          error: "The delivery price changed. Review the updated quote before placing your order.",
          deliveryQuote,
        },
        { status: 409 }
      );
    }

    const paymentExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const order = await prisma.$transaction(async (tx) => {
      const orderItems: {
        productId: string;
        variantId: string;
        productName: string;
        colour: string;
        size: string;
        unitPrice: number;
        quantity: number;
        lineTotal: number;
      }[] = [];

      let subtotal = 0;

      for (const [variantId, item] of quantities) {
        const product = await tx.product.findFirst({
          where: {
            id: item.productId,
            isActive: true,
          },
        });

        if (!product) {
          throw new OrderError(
            "A product in your bag is no longer available.",
            409
          );
        }

        const variant = await tx.productVariant.findFirst({
          where: {
            id: variantId,
            productId: item.productId,
          },
        });

        if (!variant) {
          throw new OrderError(
            "A selected option does not belong to its product.",
            409
          );
        }

        // Reserve stock atomically. If stock is insufficient,
        // the transaction fails and all changes are rolled back.
        const reservation = await tx.productVariant.updateMany({
          where: {
            id: variantId,
            productId: item.productId,
            isActive: true,
            stock: { gte: item.quantity },
          },
          data: {
            stock: { decrement: item.quantity },
          },
        });

        if (reservation.count !== 1) {
          throw new OrderError(
            `${product.name} (${variant.colour}, ${variant.size}) does not have enough stock. Please update your bag.`,
            409
          );
        }

        const unitPrice = product.discountPrice ?? product.price;
        const lineTotal = unitPrice * item.quantity;
        subtotal += lineTotal;

        orderItems.push({
          productId: product.id,
          variantId: variant.id,
          productName: product.name,
          colour: variant.colour,
          size: variant.size,
          unitPrice,
          quantity: item.quantity,
          lineTotal,
        });
      }

      const total = subtotal + deliveryQuote.deliveryFee;
      if (!Number.isSafeInteger(total) || total > 2_147_483_647) {
        throw new OrderError(
          "The order total is too large to process. Please contact the store.",
          400
        );
      }

      return tx.order.create({
        data: {
          checkoutKey,
          customerName: fullName,
          customerEmail: email,
          customerPhone: phone,
          deliveryState: state,
          deliveryCity: city,
          deliveryAddress: address,
          deliveryNotes,
          subtotal,
          deliveryFee: deliveryQuote.deliveryFee,
          total,
          orderStatus: "PENDING",
          paymentStatus: "PENDING",
          paymentExpiresAt,
          items: {
            create: orderItems,
          },
        },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          deliveryFee: true,
          paymentStatus: true,
          createdAt: true,
        },
      });
    });

    return orderResponse(order, 201);
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    if (error instanceof ShippingQuoteError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    if (checkoutKey && isUniqueConstraintError(error)) {
      const existingOrder = await prisma.order.findUnique({
        where: { checkoutKey },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          deliveryFee: true,
          paymentStatus: true,
          createdAt: true,
        },
      });

      if (existingOrder) {
        return orderResponse(existingOrder, 200);
      }
    }

    console.error("Order creation failed:", error);

    return NextResponse.json(
      { error: "We could not create your order. Please try again." },
      { status: 500 }
    );
  }
}
