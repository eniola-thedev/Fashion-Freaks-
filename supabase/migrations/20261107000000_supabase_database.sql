CREATE TABLE public."Product" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "description" text NOT NULL DEFAULT '',
  "price" integer NOT NULL,
  "category" text NOT NULL,
  "colour" text,
  "imageUrl" text,
  "imagePublicId" text UNIQUE,
  "discountPrice" integer,
  "isFeatured" boolean NOT NULL DEFAULT false,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "Product_category_idx" ON public."Product" ("category");
CREATE INDEX "Product_isActive_idx" ON public."Product" ("isActive");

CREATE TABLE public."ProductVariant" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "productId" text NOT NULL REFERENCES public."Product" ("id") ON DELETE CASCADE,
  "colour" text NOT NULL,
  "size" text NOT NULL,
  "stock" integer NOT NULL DEFAULT 0,
  "imageUrl" text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("productId", "colour", "size")
);

CREATE INDEX "ProductVariant_productId_idx" ON public."ProductVariant" ("productId");

CREATE TABLE public."ProductColour" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "productId" text NOT NULL REFERENCES public."Product" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "hexColor" text NOT NULL DEFAULT '#808080',
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("productId", "name")
);

CREATE INDEX "ProductColour_productId_sortOrder_idx"
  ON public."ProductColour" ("productId", "sortOrder");

CREATE TABLE public."ProductColourImage" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "colourId" text NOT NULL REFERENCES public."ProductColour" ("id") ON DELETE CASCADE,
  "imageUrl" text NOT NULL,
  "imagePublicId" text UNIQUE,
  "position" integer NOT NULL DEFAULT 0,
  "isPrimary" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "ProductColourImage_colourId_position_idx"
  ON public."ProductColourImage" ("colourId", "position");

CREATE TABLE public."UserProfile" (
  "id" uuid PRIMARY KEY REFERENCES auth.users ("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "displayName" text,
  "role" text NOT NULL DEFAULT 'CUSTOMER',
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "UserProfile_role_idx" ON public."UserProfile" ("role");
CREATE INDEX "UserProfile_isActive_idx" ON public."UserProfile" ("isActive");

CREATE TABLE public."Order" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "orderNumber" text NOT NULL UNIQUE DEFAULT ('FF-' || gen_random_uuid()::text),
  "customerId" uuid REFERENCES public."UserProfile" ("id") ON DELETE SET NULL,
  "customerName" text NOT NULL,
  "customerEmail" text NOT NULL,
  "customerPhone" text NOT NULL,
  "deliveryState" text NOT NULL,
  "deliveryCity" text NOT NULL,
  "deliveryAddress" text NOT NULL,
  "deliveryNotes" text NOT NULL DEFAULT '',
  "subtotal" integer NOT NULL,
  "deliveryFee" integer NOT NULL DEFAULT 0,
  "total" integer NOT NULL,
  "orderStatus" text NOT NULL DEFAULT 'PENDING',
  "paymentStatus" text NOT NULL DEFAULT 'PENDING',
  "paymentReference" text UNIQUE,
  "checkoutKey" text UNIQUE,
  "paymentExpiresAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "Order_orderStatus_idx" ON public."Order" ("orderStatus");
CREATE INDEX "Order_paymentStatus_idx" ON public."Order" ("paymentStatus");
CREATE INDEX "Order_createdAt_idx" ON public."Order" ("createdAt");
CREATE INDEX "Order_customerId_idx" ON public."Order" ("customerId");

CREATE TABLE public."OrderItem" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "orderId" text NOT NULL REFERENCES public."Order" ("id") ON DELETE CASCADE,
  "productId" text NOT NULL,
  "variantId" text NOT NULL,
  "productName" text NOT NULL,
  "colour" text NOT NULL,
  "size" text NOT NULL,
  "unitPrice" integer NOT NULL,
  "quantity" integer NOT NULL,
  "lineTotal" integer NOT NULL
);

CREATE INDEX "OrderItem_orderId_idx" ON public."OrderItem" ("orderId");
CREATE INDEX "OrderItem_variantId_idx" ON public."OrderItem" ("variantId");

CREATE TABLE public."AuthRateLimit" (
  "key" text PRIMARY KEY,
  "windowStart" timestamptz NOT NULL DEFAULT now(),
  "count" integer NOT NULL DEFAULT 0
);

CREATE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Product_set_updated_at"
BEFORE UPDATE ON public."Product"
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER "ProductVariant_set_updated_at"
BEFORE UPDATE ON public."ProductVariant"
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER "ProductColour_set_updated_at"
BEFORE UPDATE ON public."ProductColour"
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER "UserProfile_set_updated_at"
BEFORE UPDATE ON public."UserProfile"
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER "Order_set_updated_at"
BEFORE UPDATE ON public."Order"
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public."UserProfile"
    ("id", "email", "displayName", "role", "isActive")
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NULLIF(NEW.raw_user_meta_data ->> 'display_name', ''),
    'CUSTOMER',
    true
  )
  ON CONFLICT ("id") DO UPDATE
  SET "email" = EXCLUDED."email";
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

CREATE TRIGGER on_auth_user_email_updated
AFTER UPDATE OF email ON auth.users
FOR EACH ROW
WHEN (OLD.email IS DISTINCT FROM NEW.email)
EXECUTE FUNCTION public.handle_new_auth_user();

CREATE FUNCTION public.is_auth_rate_limited(
  p_key text,
  p_max_attempts integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  attempt_count integer;
BEGIN
  IF p_max_attempts < 1 THEN
    RAISE EXCEPTION 'p_max_attempts must be positive';
  END IF;

  INSERT INTO public."AuthRateLimit" ("key", "windowStart", "count")
  VALUES (p_key, now(), 1)
  ON CONFLICT ("key") DO UPDATE
  SET
    "count" = CASE
      WHEN public."AuthRateLimit"."windowStart" <= now() - interval '15 minutes'
        THEN 1
      ELSE public."AuthRateLimit"."count" + 1
    END,
    "windowStart" = CASE
      WHEN public."AuthRateLimit"."windowStart" <= now() - interval '15 minutes'
        THEN now()
      ELSE public."AuthRateLimit"."windowStart"
    END
  RETURNING "count" INTO attempt_count;

  RETURN attempt_count > p_max_attempts;
END;
$$;

CREATE FUNCTION public.create_store_order(
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
      v."id", v."productId", v."colour", v."size", v."stock", v."isActive",
      p."name", p."price", p."discountPrice", p."isActive" AS "productIsActive"
    INTO saved_variant
    FROM public."ProductVariant" AS v
    JOIN public."Product" AS p ON p."id" = v."productId"
    WHERE v."id" = requested_item ->> 'variantId'
      AND v."productId" = requested_item ->> 'productId'
    FOR UPDATE OF v, p;

    IF NOT FOUND OR NOT saved_variant."isActive" OR NOT saved_variant."productIsActive"
      OR saved_variant."stock" < item_quantity THEN
      RAISE EXCEPTION 'product unavailable' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public."ProductVariant"
    SET "stock" = "stock" - item_quantity
    WHERE "id" = saved_variant."id" AND "stock" >= item_quantity;
    IF NOT FOUND THEN
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

CREATE FUNCTION public.restore_expired_order(
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
  order_item public."OrderItem"%ROWTYPE;
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

  FOR order_item IN
    SELECT * FROM public."OrderItem" WHERE "orderId" = order_to_cancel."id"
  LOOP
    UPDATE public."ProductVariant"
    SET "stock" = "stock" + order_item."quantity"
    WHERE "id" = order_item."variantId" AND "productId" = order_item."productId";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Could not restore stock for variant %', order_item."variantId";
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

CREATE FUNCTION public.admin_product_json(p_product_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT to_jsonb(p) || jsonb_build_object(
    'variants',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(v) ORDER BY v."colour", v."size")
      FROM public."ProductVariant" AS v
      WHERE v."productId" = p."id" AND v."isActive"
    ), '[]'::jsonb),
    'colours',
    COALESCE((
      SELECT jsonb_agg(
        to_jsonb(c) || jsonb_build_object(
          'images',
          COALESCE((
            SELECT jsonb_agg(to_jsonb(i) ORDER BY i."position")
            FROM public."ProductColourImage" AS i
            WHERE i."colourId" = c."id"
          ), '[]'::jsonb)
        )
        ORDER BY c."sortOrder"
      )
      FROM public."ProductColour" AS c
      WHERE c."productId" = p."id"
    ), '[]'::jsonb)
  )
  FROM public."Product" AS p
  WHERE p."id" = p_product_id;
$$;

CREATE FUNCTION public.admin_create_product(
  p_product jsonb,
  p_variants jsonb,
  p_colours jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  saved_product public."Product"%ROWTYPE;
  variant_input jsonb;
  colour_input jsonb;
  image_input jsonb;
  saved_colour public."ProductColour"%ROWTYPE;
  colour_order integer := 0;
  image_position integer;
BEGIN
  INSERT INTO public."Product" (
    "name", "slug", "description", "price", "category", "colour", "imageUrl",
    "imagePublicId", "discountPrice", "isFeatured", "isActive"
  )
  VALUES (
    p_product ->> 'name',
    p_product ->> 'slug',
    COALESCE(p_product ->> 'description', ''),
    (p_product ->> 'price')::integer,
    p_product ->> 'category',
    NULLIF(p_product ->> 'colour', ''),
    NULLIF(p_product ->> 'imageUrl', ''),
    NULLIF(p_product ->> 'imagePublicId', ''),
    NULLIF(p_product ->> 'discountPrice', '')::integer,
    COALESCE((p_product ->> 'isFeatured')::boolean, false),
    true
  )
  RETURNING * INTO saved_product;

  FOR variant_input IN SELECT value FROM jsonb_array_elements(COALESCE(p_variants, '[]'::jsonb))
  LOOP
    INSERT INTO public."ProductVariant" ("productId", "colour", "size", "stock")
    VALUES (
      saved_product."id",
      variant_input ->> 'colour',
      variant_input ->> 'size',
      (variant_input ->> 'stock')::integer
    );
  END LOOP;

  FOR colour_input IN SELECT value FROM jsonb_array_elements(COALESCE(p_colours, '[]'::jsonb))
  LOOP
    INSERT INTO public."ProductColour" ("productId", "name", "hexColor", "sortOrder")
    VALUES (
      saved_product."id",
      colour_input ->> 'name',
      colour_input ->> 'hexColor',
      colour_order
    )
    RETURNING * INTO saved_colour;

    image_position := 0;
    FOR image_input IN SELECT value FROM jsonb_array_elements(COALESCE(colour_input -> 'images', '[]'::jsonb))
    LOOP
      INSERT INTO public."ProductColourImage" (
        "colourId", "imageUrl", "imagePublicId", "isPrimary", "position"
      )
      VALUES (
        saved_colour."id",
        image_input ->> 'imageUrl',
        NULLIF(image_input ->> 'imagePublicId', ''),
        COALESCE((image_input ->> 'isPrimary')::boolean, false),
        image_position
      );
      image_position := image_position + 1;
    END LOOP;
    colour_order := colour_order + 1;
  END LOOP;

  RETURN public.admin_product_json(saved_product."id");
END;
$$;

CREATE FUNCTION public.admin_update_product(
  p_product_id text,
  p_data jsonb,
  p_variants jsonb,
  p_colours jsonb,
  p_removed_variant_ids text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  saved_product public."Product"%ROWTYPE;
  variant_input jsonb;
  colour_input jsonb;
  image_input jsonb;
  saved_colour public."ProductColour"%ROWTYPE;
  removed_variant_id text;
  retained_count integer := 0;
  colour_order integer := 0;
  image_position integer;
BEGIN
  SELECT * INTO saved_product
  FROM public."Product"
  WHERE "id" = p_product_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public."Product"
  SET
    "name" = CASE WHEN p_data ? 'name' THEN p_data ->> 'name' ELSE "name" END,
    "description" = CASE WHEN p_data ? 'description' THEN p_data ->> 'description' ELSE "description" END,
    "price" = CASE WHEN p_data ? 'price' THEN (p_data ->> 'price')::integer ELSE "price" END,
    "category" = CASE WHEN p_data ? 'category' THEN p_data ->> 'category' ELSE "category" END,
    "colour" = CASE WHEN p_data ? 'colour' THEN p_data ->> 'colour' ELSE "colour" END,
    "imageUrl" = CASE WHEN p_data ? 'imageUrl' THEN p_data ->> 'imageUrl' ELSE "imageUrl" END,
    "imagePublicId" = CASE WHEN p_data ? 'imagePublicId' THEN p_data ->> 'imagePublicId' ELSE "imagePublicId" END,
    "discountPrice" = CASE WHEN p_data ? 'discountPrice' THEN NULLIF(p_data ->> 'discountPrice', '')::integer ELSE "discountPrice" END,
    "isFeatured" = CASE WHEN p_data ? 'isFeatured' THEN (p_data ->> 'isFeatured')::boolean ELSE "isFeatured" END,
    "isActive" = CASE WHEN p_data ? 'isActive' THEN (p_data ->> 'isActive')::boolean ELSE "isActive" END
  WHERE "id" = p_product_id;

  IF p_variants IS NOT NULL THEN
    FOR variant_input IN SELECT value FROM jsonb_array_elements(p_variants)
    LOOP
      INSERT INTO public."ProductVariant" ("productId", "colour", "size", "stock", "isActive")
      VALUES (
        p_product_id,
        variant_input ->> 'colour',
        variant_input ->> 'size',
        (variant_input ->> 'stock')::integer,
        true
      )
      ON CONFLICT ("productId", "colour", "size")
      DO UPDATE SET "stock" = EXCLUDED."stock", "isActive" = true;
    END LOOP;
  END IF;

  IF p_colours IS NOT NULL THEN
    FOR colour_input IN SELECT value FROM jsonb_array_elements(p_colours)
    LOOP
      INSERT INTO public."ProductColour" ("productId", "name", "hexColor", "sortOrder")
      VALUES (
        p_product_id,
        colour_input ->> 'name',
        colour_input ->> 'hexColor',
        colour_order
      )
      ON CONFLICT ("productId", "name")
      DO UPDATE SET "hexColor" = EXCLUDED."hexColor", "sortOrder" = EXCLUDED."sortOrder"
      RETURNING * INTO saved_colour;

      DELETE FROM public."ProductColourImage" WHERE "colourId" = saved_colour."id";
      image_position := 0;
      FOR image_input IN SELECT value FROM jsonb_array_elements(COALESCE(colour_input -> 'images', '[]'::jsonb))
      LOOP
        INSERT INTO public."ProductColourImage" (
          "colourId", "imageUrl", "imagePublicId", "isPrimary", "position"
        )
        VALUES (
          saved_colour."id",
          image_input ->> 'imageUrl',
          NULLIF(image_input ->> 'imagePublicId', ''),
          COALESCE((image_input ->> 'isPrimary')::boolean, false),
          image_position
        );
        image_position := image_position + 1;
      END LOOP;
      colour_order := colour_order + 1;
    END LOOP;

    DELETE FROM public."ProductColour"
    WHERE "productId" = p_product_id
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_colours) AS desired(value)
        WHERE desired.value ->> 'name' = public."ProductColour"."name"
      );
  END IF;

  FOREACH removed_variant_id IN ARRAY COALESCE(p_removed_variant_ids, ARRAY[]::text[])
  LOOP
    IF EXISTS (
      SELECT 1 FROM public."OrderItem" WHERE "variantId" = removed_variant_id
    ) THEN
      UPDATE public."ProductVariant"
      SET "stock" = 0, "isActive" = false
      WHERE "id" = removed_variant_id AND "productId" = p_product_id;
      IF FOUND THEN retained_count := retained_count + 1; END IF;
    ELSE
      DELETE FROM public."ProductVariant"
      WHERE "id" = removed_variant_id AND "productId" = p_product_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'product', public.admin_product_json(p_product_id),
    'retainedHistoricalVariants', retained_count
  );
END;
$$;

CREATE FUNCTION public.admin_upsert_variant(
  p_product_id text,
  p_colour text,
  p_size text,
  p_stock integer,
  p_hex_color text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  locked_product_id text;
  saved_colour_name text;
  saved_variant public."ProductVariant"%ROWTYPE;
BEGIN
  SELECT "id" INTO locked_product_id
  FROM public."Product"
  WHERE "id" = p_product_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT "name" INTO saved_colour_name
  FROM public."ProductColour"
  WHERE "productId" = p_product_id
    AND lower("name") = lower(p_colour)
  ORDER BY "sortOrder"
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public."ProductColour" ("productId", "name", "hexColor", "sortOrder")
    SELECT p_product_id, p_colour, p_hex_color, COALESCE(max("sortOrder"), -1) + 1
    FROM public."ProductColour"
    WHERE "productId" = p_product_id
    RETURNING "name" INTO saved_colour_name;
  END IF;

  SELECT * INTO saved_variant
  FROM public."ProductVariant"
  WHERE "productId" = p_product_id
    AND lower("colour") = lower(saved_colour_name)
    AND lower("size") = lower(p_size)
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public."ProductVariant"
    SET "stock" = p_stock, "isActive" = true
    WHERE "id" = saved_variant."id"
    RETURNING * INTO saved_variant;
  ELSE
    INSERT INTO public."ProductVariant" ("productId", "colour", "size", "stock", "isActive")
    VALUES (p_product_id, saved_colour_name, p_size, p_stock, true)
    RETURNING * INTO saved_variant;
  END IF;

  RETURN to_jsonb(saved_variant);
END;
$$;

CREATE FUNCTION public.admin_delete_product(p_product_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_data jsonb;
BEGIN
  SELECT jsonb_build_object(
    'imageUrl', p."imageUrl",
    'imagePublicId', p."imagePublicId",
    'colours', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'images', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'imageUrl', i."imageUrl",
              'imagePublicId', i."imagePublicId"
            ))
            FROM public."ProductColourImage" AS i
            WHERE i."colourId" = c."id"
          ), '[]'::jsonb)
        )
      )
      FROM public."ProductColour" AS c
      WHERE c."productId" = p."id"
    ), '[]'::jsonb)
  )
  INTO deleted_data
  FROM public."Product" AS p
  WHERE p."id" = p_product_id
  FOR UPDATE;

  IF deleted_data IS NULL THEN
    RETURN NULL;
  END IF;

  DELETE FROM public."Product" WHERE "id" = p_product_id;
  RETURN deleted_data;
END;
$$;

ALTER TABLE public."Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProductVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProductColour" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProductColourImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuthRateLimit" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public."Product",
  public."ProductVariant",
  public."ProductColour",
  public."ProductColourImage",
  public."UserProfile",
  public."Order",
  public."OrderItem",
  public."AuthRateLimit"
FROM anon, authenticated;
GRANT ALL ON TABLE
  public."Product",
  public."ProductVariant",
  public."ProductColour",
  public."ProductColourImage",
  public."UserProfile",
  public."Order",
  public."OrderItem",
  public."AuthRateLimit"
TO service_role;
REVOKE ALL ON FUNCTION public.is_auth_rate_limited(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_store_order(text, uuid, text, text, text, text, text, text, text, integer, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_expired_order(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_product_json(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_create_product(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_product(text, jsonb, jsonb, jsonb, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_upsert_variant(text, text, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_product(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_auth_rate_limited(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_store_order(text, uuid, text, text, text, text, text, text, text, integer, jsonb, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_expired_order(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_product_json(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_product(jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_product(text, jsonb, jsonb, jsonb, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_upsert_variant(text, text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_product(text) TO service_role;
