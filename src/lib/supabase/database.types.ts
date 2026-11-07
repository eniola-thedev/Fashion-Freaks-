export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type Table<Row, Relationships extends Relationship[] = []> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: Relationships;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  category: string;
  colour: string | null;
  imageUrl: string | null;
  imagePublicId: string | null;
  discountPrice: number | null;
  isFeatured: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProductVariant = {
  id: string;
  productId: string;
  colour: string;
  size: string;
  stock: number;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProductColour = {
  id: string;
  productId: string;
  name: string;
  hexColor: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type ProductColourImage = {
  id: string;
  colourId: string;
  imageUrl: string;
  imagePublicId: string | null;
  position: number;
  isPrimary: boolean;
  createdAt: string;
};

type UserProfile = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Order = {
  id: string;
  orderNumber: string;
  customerId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryState: string;
  deliveryCity: string;
  deliveryAddress: string;
  deliveryNotes: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  orderStatus: string;
  paymentStatus: string;
  paymentReference: string | null;
  checkoutKey: string | null;
  paymentExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  variantId: string;
  productName: string;
  colour: string;
  size: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

type AuthRateLimit = {
  key: string;
  windowStart: string;
  count: number;
};

export type Database = {
  public: {
    Tables: {
      Product: Table<Product>;
      ProductVariant: Table<
        ProductVariant,
        [
          {
            foreignKeyName: "ProductVariant_productId_fkey";
            columns: ["productId"];
            isOneToOne: false;
            referencedRelation: "Product";
            referencedColumns: ["id"];
          },
        ]
      >;
      ProductColour: Table<
        ProductColour,
        [
          {
            foreignKeyName: "ProductColour_productId_fkey";
            columns: ["productId"];
            isOneToOne: false;
            referencedRelation: "Product";
            referencedColumns: ["id"];
          },
        ]
      >;
      ProductColourImage: Table<
        ProductColourImage,
        [
          {
            foreignKeyName: "ProductColourImage_colourId_fkey";
            columns: ["colourId"];
            isOneToOne: false;
            referencedRelation: "ProductColour";
            referencedColumns: ["id"];
          },
        ]
      >;
      UserProfile: Table<UserProfile>;
      Order: Table<
        Order,
        [
          {
            foreignKeyName: "Order_customerId_fkey";
            columns: ["customerId"];
            isOneToOne: false;
            referencedRelation: "UserProfile";
            referencedColumns: ["id"];
          },
        ]
      >;
      OrderItem: Table<
        OrderItem,
        [
          {
            foreignKeyName: "OrderItem_orderId_fkey";
            columns: ["orderId"];
            isOneToOne: false;
            referencedRelation: "Order";
            referencedColumns: ["id"];
          },
        ]
      >;
      AuthRateLimit: Table<AuthRateLimit>;
    };
    Views: Record<string, never>;
    Functions: {
      is_auth_rate_limited: {
        Args: { p_key: string; p_max_attempts: number };
        Returns: boolean;
      };
      create_store_order: {
        Args: {
          p_checkout_key: string;
          p_customer_id: string;
          p_customer_name: string;
          p_customer_email: string;
          p_customer_phone: string;
          p_delivery_state: string;
          p_delivery_city: string;
          p_delivery_address: string;
          p_delivery_notes: string;
          p_delivery_fee: number;
          p_items: Json;
          p_payment_expires_at: string;
        };
        Returns: Json;
      };
      restore_expired_order: {
        Args: { p_order_id: string; p_payment_reference: string | null };
        Returns: boolean;
      };
      admin_product_json: {
        Args: { p_product_id: string };
        Returns: Json;
      };
      admin_create_product: {
        Args: { p_product: Json; p_variants: Json; p_colours: Json };
        Returns: Json;
      };
      admin_update_product: {
        Args: {
          p_product_id: string;
          p_data: Json;
          p_variants: Json | null;
          p_colours: Json | null;
          p_removed_variant_ids: string[];
        };
        Returns: Json;
      };
      admin_upsert_variant: {
        Args: {
          p_product_id: string;
          p_colour: string;
          p_size: string;
          p_stock: number;
          p_hex_color: string;
        };
        Returns: Json;
      };
      admin_delete_product: {
        Args: { p_product_id: string };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
