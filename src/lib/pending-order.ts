export type PendingOrder = {
  orderNumber: string;
  total: number | null;
};

const ORDER_NUMBER_KEY = "fashion-freaks-pending-order";
const ORDER_TOTAL_KEY = "fashion-freaks-pending-order-total";
const ORDER_UPDATED_EVENT = "fashion-freaks-pending-order-updated";
const EMPTY_ORDER: PendingOrder = { orderNumber: "", total: null };

let orderSnapshot: PendingOrder | null = null;

function readPendingOrder(): PendingOrder {
  try {
    const orderNumber = localStorage.getItem(ORDER_NUMBER_KEY) ?? "";
    const savedTotalValue = localStorage.getItem(ORDER_TOTAL_KEY);
    const savedTotal =
      savedTotalValue === null ? Number.NaN : Number(savedTotalValue);
    const total =
      Number.isSafeInteger(savedTotal) && savedTotal >= 0
        ? savedTotal
        : null;

    return { orderNumber, total };
  } catch (error) {
    console.error("Could not restore the pending checkout order:", error);
    return EMPTY_ORDER;
  }
}

export function getPendingOrderSnapshot() {
  if (typeof window === "undefined") return EMPTY_ORDER;
  orderSnapshot ??= readPendingOrder();
  return orderSnapshot;
}

export function getServerPendingOrderSnapshot() {
  return EMPTY_ORDER;
}

export function subscribeToPendingOrder(listener: () => void) {
  if (typeof window === "undefined") return () => {};

  const updateSnapshot = () => {
    orderSnapshot = readPendingOrder();
    listener();
  };
  const updateFromStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === ORDER_NUMBER_KEY ||
      event.key === ORDER_TOTAL_KEY
    ) {
      updateSnapshot();
    }
  };

  window.addEventListener(ORDER_UPDATED_EVENT, updateSnapshot);
  window.addEventListener("storage", updateFromStorage);

  return () => {
    window.removeEventListener(ORDER_UPDATED_EVENT, updateSnapshot);
    window.removeEventListener("storage", updateFromStorage);
  };
}

export function savePendingOrder(orderNumber: string, total: number) {
  localStorage.setItem(ORDER_NUMBER_KEY, orderNumber);
  localStorage.setItem(ORDER_TOTAL_KEY, String(total));
  orderSnapshot = { orderNumber, total };
  window.dispatchEvent(new Event(ORDER_UPDATED_EVENT));
}

export function clearPendingOrder() {
  localStorage.removeItem(ORDER_NUMBER_KEY);
  localStorage.removeItem(ORDER_TOTAL_KEY);
  orderSnapshot = EMPTY_ORDER;
  window.dispatchEvent(new Event(ORDER_UPDATED_EVENT));
}
