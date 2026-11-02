import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NIGERIAN_STATES } from "@/lib/nigeria";
import {
  requestShipbubbleQuote,
  isShippingRateLimited,
  ShippingQuoteError,
  type ShippingQuoteItem,
} from "@/lib/shipping";

type QuoteRequest = {
  customer?: {
    fullName?: unknown;
    email?: unknown;
    phone?: unknown;
    state?: unknown;
    city?: unknown;
    address?: unknown;
    deliveryNotes?: unknown;
  };
  items?: {
    productId?: unknown;
    variantId?: unknown;
    quantity?: unknown;
  }[];
};

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  if (isShippingRateLimited(request)) {
    return NextResponse.json(
      { error: "Too many delivery quote requests. Please wait a moment." },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    let parsedBody: unknown;
    try {
      parsedBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Please submit valid delivery details." },
        { status: 400 }
      );
    }
    if (
      typeof parsedBody !== "object" ||
      parsedBody === null ||
      Array.isArray(parsedBody)
    ) {
      return NextResponse.json(
        { error: "Please submit valid delivery details." },
        { status: 400 }
      );
    }
    const body = parsedBody as QuoteRequest;

    const customer = body.customer;
    const recipient = {
      fullName: clean(customer?.fullName, 120),
      email: clean(customer?.email, 254).toLowerCase(),
      phone: clean(customer?.phone, 25),
      state: clean(customer?.state, 80),
      city: clean(customer?.city, 100),
      address: clean(customer?.address, 500),
      deliveryNotes: clean(customer?.deliveryNotes, 500),
    };

    if (
      !recipient.fullName ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email) ||
      !/^[0-9+\s()-]{7,20}$/.test(recipient.phone) ||
      !NIGERIAN_STATES.some(
        (state) => state.toLocaleLowerCase() === recipient.state.toLocaleLowerCase()
      ) ||
      !recipient.city ||
      !recipient.address
    ) {
      return NextResponse.json(
        { error: "Enter valid contact and Nigerian delivery address details to get a quote." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (
      !Array.isArray(body.items) ||
      body.items.length === 0 ||
      body.items.length > 20
    ) {
      return NextResponse.json(
        { error: "Your bag is empty or contains too many different items." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const requestedItems: {
      productId: string;
      variantId: string;
      quantity: number;
    }[] = [];
    const seenVariants = new Set<string>();

    for (const item of body.items) {
      const productId = clean(item?.productId, 100);
      const variantId = clean(item?.variantId, 100);
      const quantity = item?.quantity;
      if (
        !productId ||
        !variantId ||
        !Number.isSafeInteger(quantity) ||
        (quantity as number) < 1 ||
        (quantity as number) > 10 ||
        seenVariants.has(variantId)
      ) {
        return NextResponse.json(
          { error: "One or more items in your bag are invalid." },
          { status: 400, headers: { "Cache-Control": "no-store" } }
        );
      }
      seenVariants.add(variantId);
      requestedItems.push({
        productId,
        variantId,
        quantity: quantity as number,
      });
    }

    const variants = await prisma.productVariant.findMany({
      where: { id: { in: requestedItems.map((item) => item.variantId) } },
      include: { product: true },
    });
    if (variants.length !== requestedItems.length) {
      return NextResponse.json(
        { error: "A product in your bag is no longer available." },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    const quoteItems: ShippingQuoteItem[] = requestedItems.map((item) => {
      const variant = variants.find(
        (candidate) =>
          candidate.id === item.variantId &&
          candidate.productId === item.productId
      );
      if (
        !variant ||
        !variant.isActive ||
        !variant.product.isActive ||
        variant.stock < item.quantity
      ) {
        throw new ShippingQuoteError(
          "An item in your bag is no longer available in the requested quantity.",
          409
        );
      }
      return {
        name: variant.product.name,
        unitAmount:
          variant.product.discountPrice ?? variant.product.price,
        quantity: item.quantity,
      };
    });

    const quote = await requestShipbubbleQuote(recipient, quoteItems);
    return NextResponse.json(quote, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ShippingQuoteError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    console.error("Shipping quote request failed:", error);
    return NextResponse.json(
      { error: "Unable to get a delivery quote right now." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
