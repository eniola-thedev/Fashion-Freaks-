CREATE OR REPLACE FUNCTION public.create_store_order(
  p_checkout_key text,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_delivery_state text,
  p_delivery_city text,
  p_delivery_address text,
  p_delivery_notes text,
  p_delivery_fee integer,
  p_items jsonb,
  p_payment_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested_item jsonb;
  saved_variant record;
  saved_order record;
  item_quantity integer;
  item_subtotal bigint;
  order_subtotal bigint := 0;
  order_total bigint;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'invalid order items' USING ERRCODE = '22023';
  END IF;

  FOR requested_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    item_quantity := (requested_item ->> 'quantity')::integer;
    IF item_quantity < 1 OR item_quantity > 10 THEN
      RAISE EXCEPTION 'invalid order quantity' USING ERRCODE = '22023';
    END IF;

    SELECT
      v."id", v."productId", v."colour", v."size", v."isActive",
      p."name", p."price", p."discountPrice", p."isActive" AS "productIsActive"
    INTO saved_variant
    FROM public."ProductVariant" AS v
    JOIN public."Product" AS p ON p."id" = v."productId"
    WHERE v."id" = requested_item ->> 'variantId'
      AND v."productId" = requested_item ->> 'productId'
    FOR UPDATE OF v, p;

    IF NOT FOUND OR NOT saved_variant."isActive" OR NOT saved_variant."productIsActive" THEN
      RAISE EXCEPTION 'product unavailable' USING ERRCODE = 'P0001';
    END IF;

    item_subtotal := COALESCE(saved_variant."discountPrice", saved_variant."price") * item_quantity;
    order_subtotal := order_subtotal + item_subtotal;
  END LOOP;

  order_total := order_subtotal::bigint + p_delivery_fee;
  IF order_total < 1 OR order_total > 2147483647 THEN
    RAISE EXCEPTION 'order total is invalid' USING ERRCODE = '22003';
  END IF;

  INSERT INTO public."Order" (
    "checkoutKey", "customerId", "customerName", "customerEmail", "customerPhone",
    "deliveryState", "deliveryCity", "deliveryAddress", "deliveryNotes",
    "subtotal", "deliveryFee", "total", "orderStatus", "paymentStatus", "paymentExpiresAt"
  )
  VALUES (
    p_checkout_key, p_customer_id, p_customer_name, p_customer_email, p_customer_phone,
    p_delivery_state, p_delivery_city, p_delivery_address, p_delivery_notes,
    order_subtotal::integer, p_delivery_fee, order_total::integer, 'PENDING', 'PENDING', p_payment_expires_at
  )
  RETURNING "id", "orderNumber", "total", "deliveryFee", "paymentStatus", "createdAt", "customerId"
  INTO saved_order;

  FOR requested_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    SELECT
      v."id", v."productId", v."colour", v."size",
      p."name", p."price", p."discountPrice"
    INTO saved_variant
    FROM public."ProductVariant" AS v
    JOIN public."Product" AS p ON p."id" = v."productId"
    WHERE v."id" = requested_item ->> 'variantId'
      AND v."productId" = requested_item ->> 'productId';

    item_quantity := (requested_item ->> 'quantity')::integer;
    item_subtotal := COALESCE(saved_variant."discountPrice", saved_variant."price") * item_quantity;

    INSERT INTO public."OrderItem" (
      "orderId", "productId", "variantId", "productName", "colour", "size",
      "unitPrice", "quantity", "lineTotal"
    )
    VALUES (
      saved_order."id", saved_variant."productId", saved_variant."id", saved_variant."name",
      saved_variant."colour", saved_variant."size",
      COALESCE(saved_variant."discountPrice", saved_variant."price"),
      item_quantity, item_subtotal
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id', saved_order."id",
    'orderNumber', saved_order."orderNumber",
    'total', saved_order."total",
    'deliveryFee', saved_order."deliveryFee",
    'paymentStatus', saved_order."paymentStatus",
    'createdAt', saved_order."createdAt",
    'customerId', saved_order."customerId"
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_expired_order(
  p_order_id text,
  p_payment_reference text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  order_to_cancel public."Order"%ROWTYPE;
BEGIN
  SELECT * INTO order_to_cancel
  FROM public."Order"
  WHERE "id" = p_order_id
    AND "paymentStatus" = 'PENDING'
    AND "paymentExpiresAt" <= now()
    AND "paymentReference" IS NOT DISTINCT FROM p_payment_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public."Order"
  SET "paymentStatus" = 'FAILED', "orderStatus" = 'CANCELLED'
  WHERE "id" = order_to_cancel."id";

  RETURN true;
END;
$$;
