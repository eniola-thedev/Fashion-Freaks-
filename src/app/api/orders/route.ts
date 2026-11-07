
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCustomerSession } from "@/lib/auth";
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
): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function orderResponse(
  order: {
    id: string;
    orderNumber: string;
    total: number;
    deliveryFee: number;
    paymentStatus: string;
    createdAt: Date | string;
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
  let customerId: string | null = null;
  let supabase: ReturnType<typeof createSupabaseAdminClient> | null = null;

  try {
    const customerSession = await getCustomerSession();
    if (!customerSession) {
      return NextResponse.json(
        { error: "Sign in to your account before placing an order." },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    customerId = customerSession.id;
    supabase = createSupabaseAdminClient();

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

    const { data: existingOrder, error: existingOrderError } = await supabase
      .from("Order")
      .select("id, orderNumber, total, deliveryFee, paymentStatus, createdAt, customerId")
      .eq("checkoutKey", checkoutKey)
      .maybeSingle();
    if (existingOrderError) throw existingOrderError;

    if (existingOrder) {
      if (existingOrder.customerId !== customerSession.id) {
        return NextResponse.json(
          { error: "This checkout session is no longer available." },
          { status: 409 }
        );
      }
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
    const email = customerSession.email;
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

    const { data: quoteVariants, error: quoteVariantsError } = await supabase
      .from("ProductVariant")
      .select(
        "id, productId, colour, size, isActive, product:Product!inner(id, name, price, discountPrice, isActive)"
      )
      .in("id", [...quantities.keys()]);
    if (quoteVariantsError) throw quoteVariantsError;
    const availableVariants = quoteVariants ?? [];
    if (availableVariants.length !== quantities.size) {
      throw new OrderError(
        "A product in your bag is no longer available.",
        409
      );
    }

    const quoteItems: ShippingQuoteItem[] = [];
    for (const [variantId, item] of quantities) {
      const variant = availableVariants.find(
        (candidate) =>
          candidate.id === variantId &&
          candidate.productId === item.productId
      );
      if (
        !variant ||
        !variant.isActive ||
        !variant.product.isActive
      ) {
        throw new OrderError(
          "A product in your bag is no longer available.",
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

    const { data: order, error: createOrderError } = await supabase.rpc(
      "create_store_order",
      {
        p_checkout_key: checkoutKey,
        p_customer_id: customerSession.id,
        p_customer_name: fullName,
        p_customer_email: email,
        p_customer_phone: phone,
        p_delivery_state: state,
        p_delivery_city: city,
        p_delivery_address: address,
        p_delivery_notes: deliveryNotes,
        p_delivery_fee: deliveryQuote.deliveryFee,
        p_items: [...quantities].map(([variantId, item]) => ({
          productId: item.productId,
          variantId,
          quantity: item.quantity,
        })),
        p_payment_expires_at: new Date(
          Date.now() + 30 * 60 * 1000
        ).toISOString(),
      }
    );
    if (createOrderError) {
      if (createOrderError.code === "P0001") {
        throw new OrderError(
          "A product in your bag is no longer available.",
          409
        );
      }
      if (createOrderError.code === "22023") {
        throw new OrderError("Please check your order details.");
      }
      throw createOrderError;
    }

    if (!order || typeof order !== "object") {
      throw new Error("Supabase did not return the created order.");
    }
    return orderResponse(order as Parameters<typeof orderResponse>[0], 201);
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

    if (supabase && checkoutKey && isUniqueConstraintError(error)) {
      const { data: existingOrder, error: existingOrderError } = await supabase
        .from("Order")
        .select("id, orderNumber, total, deliveryFee, paymentStatus, createdAt, customerId")
        .eq("checkoutKey", checkoutKey)
        .maybeSingle();
      if (existingOrderError) throw existingOrderError;

      if (existingOrder && existingOrder.customerId === customerId) {
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
