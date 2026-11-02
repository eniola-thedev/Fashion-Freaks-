export type CartItem = {
  variantId: string;
  productId: string;
  name: string;
  slug: string;
  colour: string;
  size: string;
  price: number;
  quantity: number;
  image: string;
};

export const CART_STORAGE_KEY = "fashion-freaks-cart";
export const CART_UPDATED_EVENT = "fashion-freaks-cart-updated";

const EMPTY_CART: CartItem[] = [];
let cartSnapshot: CartItem[] | null = null;

function parseCartItem(value: unknown): CartItem | null {
  if (!value || typeof value !== "object") return null;

  const item = value as Partial<CartItem>;
  if (
    typeof item.variantId === "string" &&
    typeof item.productId === "string" &&
    typeof item.name === "string" &&
    typeof item.slug === "string" &&
    typeof item.colour === "string" &&
    typeof item.size === "string" &&
    typeof item.price === "number" &&
    Number.isFinite(item.price) &&
    typeof item.quantity === "number" &&
    Number.isSafeInteger(item.quantity) &&
    item.quantity > 0
  ) {
    return {
      variantId: item.variantId,
      productId: item.productId,
      name: item.name,
      slug: item.slug,
      colour: item.colour,
      size: item.size,
      price: item.price,
      quantity: item.quantity,
      image: typeof item.image === "string" ? item.image : "",
    };
  }

  return null;
}

export function readCart(): CartItem[] {
  try {
    const saved = localStorage.getItem(CART_STORAGE_KEY);
    const parsed: unknown = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed)
      ? parsed.flatMap((item) => {
          const parsedItem = parseCartItem(item);
          return parsedItem ? [parsedItem] : [];
        })
      : [];
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  cartSnapshot = items;
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

export function cartItemCount(items: CartItem[]) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export function getCartSnapshot() {
  if (typeof window === "undefined") return EMPTY_CART;
  cartSnapshot ??= readCart();
  return cartSnapshot;
}

export function getServerCartSnapshot() {
  return EMPTY_CART;
}

export function subscribeToCart(listener: () => void) {
  if (typeof window === "undefined") return () => {};

  const updateSnapshot = () => {
    cartSnapshot = readCart();
    listener();
  };
  const updateFromStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === CART_STORAGE_KEY) {
      updateSnapshot();
    }
  };

  window.addEventListener(CART_UPDATED_EVENT, updateSnapshot);
  window.addEventListener("storage", updateFromStorage);

  return () => {
    window.removeEventListener(CART_UPDATED_EVENT, updateSnapshot);
    window.removeEventListener("storage", updateFromStorage);
  };
}

export function getCartReadySnapshot() {
  return true;
}

export function getServerCartReadySnapshot() {
  return false;
}
