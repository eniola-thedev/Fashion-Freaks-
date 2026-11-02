type ShippingRecipient = {
  fullName: string;
  email: string;
  phone: string;
  state: string;
  city: string;
  address: string;
  deliveryNotes?: string;
};

export type ShippingQuoteItem = {
  name: string;
  unitAmount: number;
  quantity: number;
};

export type ShippingQuote = {
  deliveryFee: number;
  courierName: string;
  deliveryEta: string | null;
};

export class ShippingQuoteError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function isShippingRateLimited(request: Request) {
  const key =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const now = Date.now();
  const current = requestCounts.get(key);
  if (!current || current.resetAt <= now) {
    if (requestCounts.size >= 5_000) {
      for (const [entryKey, entry] of requestCounts) {
        if (entry.resetAt <= now) requestCounts.delete(entryKey);
      }
      if (requestCounts.size >= 5_000) return true;
    }
    requestCounts.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 10;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function positiveNumber(name: string) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function positiveInteger(name: string) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function postToShipbubble(
  path: string,
  apiKey: string,
  payload: Record<string, unknown>
) {
  let response: Response;
  try {
    response = await fetch(`https://api.shipbubble.com/v1${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error("Shipbubble request failed before a response was received.", {
      path,
      reason: error instanceof Error ? error.name : "unknown",
    });
    throw new ShippingQuoteError(
      "The delivery service is temporarily unavailable. Please try again.",
      502
    );
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    console.error("Shipbubble returned a non-JSON response.", {
      path,
      status: response.status,
    });
    throw new ShippingQuoteError(
      "The delivery service returned an invalid response.",
      502
    );
  }

  if (
    !response.ok ||
    !isRecord(result) ||
    result.status !== "success" ||
    !isRecord(result.data)
  ) {
    const providerMessage =
      isRecord(result) && typeof result.message === "string"
        ? result.message
        : "";
    if (
      response.status === 401 ||
      response.status === 403 ||
      providerMessage.toLocaleLowerCase().includes("enable api access")
    ) {
      console.error("Shipbubble API access is unavailable for the configured account.", {
        path,
        status: response.status,
      });
      throw new ShippingQuoteError(
        "The store's delivery service is not available yet. Please contact the store.",
        503
      );
    }

    console.error("Shipbubble rejected a delivery request.", {
      path,
      status: response.status,
      providerStatus: isRecord(result) ? result.status : "invalid_response",
    });
    throw new ShippingQuoteError(
      response.status === 422
        ? "The delivery service could not validate this address or route."
        : response.status === 429
          ? "The delivery service is busy. Please try again in a moment."
          : "The delivery service could not provide a quote right now.",
      response.status === 422 ? 422 : response.status === 429 ? 503 : 502
    );
  }

  return result.data;
}

export async function requestShipbubbleQuote(
  recipient: ShippingRecipient,
  items: ShippingQuoteItem[]
): Promise<ShippingQuote> {
  const apiKey = process.env.SHIPBUBBLE_API_KEY?.trim();
  const senderAddressCode = positiveInteger("SHIPBUBBLE_SENDER_ADDRESS_CODE");
  const categoryId = positiveInteger("SHIPBUBBLE_FASHION_CATEGORY_ID");
  const itemWeightKg = positiveNumber("SHIPBUBBLE_ITEM_WEIGHT_KG");
  const length = positiveNumber("SHIPBUBBLE_PACKAGE_LENGTH_CM");
  const width = positiveNumber("SHIPBUBBLE_PACKAGE_WIDTH_CM");
  const height = positiveNumber("SHIPBUBBLE_PACKAGE_HEIGHT_CM");

  if (
    !apiKey ||
    !senderAddressCode ||
    !categoryId ||
    !itemWeightKg ||
    !length ||
    !width ||
    !height
  ) {
    const missingSettings = [
      !apiKey && "SHIPBUBBLE_API_KEY",
      !senderAddressCode && "SHIPBUBBLE_SENDER_ADDRESS_CODE",
      !categoryId && "SHIPBUBBLE_FASHION_CATEGORY_ID",
      !itemWeightKg && "SHIPBUBBLE_ITEM_WEIGHT_KG",
      !length && "SHIPBUBBLE_PACKAGE_LENGTH_CM",
      !width && "SHIPBUBBLE_PACKAGE_WIDTH_CM",
      !height && "SHIPBUBBLE_PACKAGE_HEIGHT_CM",
    ].filter((setting): setting is string => Boolean(setting));
    console.error("Shipbubble quote configuration is incomplete.", {
      missingSettings,
    });
    throw new ShippingQuoteError(
      "Delivery quotes are not configured yet. Please contact the store for assistance.",
      503
    );
  }

  const address = [
    recipient.address,
    recipient.city,
    recipient.state,
    "Nigeria",
  ].join(", ");

  const validatedAddress = await postToShipbubble(
    "/shipping/address/validate",
    apiKey,
    {
      name: recipient.fullName,
      email: recipient.email,
      phone: recipient.phone,
      address,
    }
  );
  const addressCode = validatedAddress.address_code;
  if (!Number.isSafeInteger(addressCode) || (addressCode as number) <= 0) {
    throw new ShippingQuoteError(
      "The delivery service could not confirm this address. Check the address and try again.",
      422
    );
  }

  const rates = await postToShipbubble(
    "/shipping/fetch_rates",
    apiKey,
    {
      sender_address_code: senderAddressCode,
      reciever_address_code: addressCode,
      pickup_date: (() => {
        const parts = new Intl.DateTimeFormat("en", {
        timeZone: "Africa/Lagos",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        }).formatToParts(new Date());
        const value = (type: string) =>
          parts.find((part) => part.type === type)?.value ?? "";
        return `${value("year")}-${value("month")}-${value("day")}`;
      })(),
      category_id: categoryId,
      package_items: items.map((item) => ({
        name: item.name,
        description: item.name,
        unit_weight: String(itemWeightKg),
        unit_amount: String(item.unitAmount),
        quantity: String(item.quantity),
      })),
      service_type: "pickup",
      delivery_instructions: recipient.deliveryNotes ?? "",
      package_dimension: { length, width, height },
    }
  );

  const couriers = rates.couriers;
  if (!Array.isArray(couriers)) {
    throw new ShippingQuoteError(
      "No delivery service is available for this address.",
      422
    );
  }

  const options: {
    amount: number;
    name: string;
    eta: string | null;
  }[] = [];
  for (const courier of couriers) {
    if (!isRecord(courier)) continue;
    const amount = courier.rate_card_amount;
    const currency = courier.rate_card_currency;
    const name = courier.courier_name;
    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      (currency !== "NGN" && currency !== "₦") ||
      typeof name !== "string" ||
      name.length === 0
    ) {
      continue;
    }
    options.push({
      amount,
      name,
      eta:
        typeof courier.delivery_eta === "string" &&
        courier.delivery_eta.length <= 120
          ? courier.delivery_eta
          : null,
    });
  }
  options.sort((first, second) => first.amount - second.amount);

  const cheapest = options[0];
  if (!cheapest) {
    throw new ShippingQuoteError(
      "No delivery service is available for this address.",
      422
    );
  }

  return {
    deliveryFee: Math.ceil(cheapest.amount),
    courierName: cheapest.name,
    deliveryEta: cheapest.eta,
  };
}
