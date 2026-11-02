
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type OrderItem = {
  id: string;
  productId: string;
  productName: string;
  colour: string;
  size: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

type Order = {
  id: string;
  orderNumber: string;
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
  createdAt: string;
  items: OrderItem[];
};

type OrderStats = {
  totalOrders: number;
  pendingPayment: number;
  paidOrders: number;
  processingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  paidRevenue: number;
};

const emptyStats: OrderStats = {
  totalOrders: 0,
  pendingPayment: 0,
  paidOrders: 0,
  processingOrders: 0,
  shippedOrders: 0,
  deliveredOrders: 0,
  paidRevenue: 0,
};

const money = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export default function OrdersClient() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats>(emptyStats);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadOrders = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/orders", {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load orders.");
      }

      setError("");
      setOrders(data.orders ?? []);
      setStats(data.stats ?? emptyStats);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load orders."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOrders();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadOrders]);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesSearch =
        !term ||
        order.orderNumber.toLowerCase().includes(term) ||
        order.customerName.toLowerCase().includes(term) ||
        order.customerEmail.toLowerCase().includes(term) ||
        order.customerPhone.toLowerCase().includes(term);

      const matchesFilter =
        filter === "ALL" ||
        (filter === "PAID" && order.paymentStatus === "PAID") ||
        (filter === "UNPAID" && order.paymentStatus !== "PAID") ||
        order.orderStatus === filter;

      return matchesSearch && matchesFilter;
    });
  }, [orders, search, filter]);

  async function updateStatus(order: Order, status: string) {
    if (order.paymentStatus !== "PAID") {
      setError("This order must be paid before it can be fulfilled.");
      return;
    }

    const confirmed = window.confirm(
      `Update order ${order.orderNumber} to ${status.replaceAll("_", " ")}?`
    );

    if (!confirmed) return;

    setUpdatingId(order.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not update order.");
      }

      setNotice(`${order.orderNumber} updated successfully.`);
      setLoading(true);
      await loadOrders();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update order."
      );
    } finally {
      setUpdatingId(null);
    }
  }

  function statusClass(value: string) {
    return `order-status order-status-${value.toLowerCase()}`;
  }

  return (
    <main className="admin-orders-page">
      <header className="admin-orders-header">
        <div>
          <p className="admin-eyebrow">FASHION FREAKS / ADMIN</p>
          <h1>Orders & fulfilment</h1>
          <p className="admin-orders-subtitle">
            Review payments, prepare packages, and track customer deliveries.
          </p>
        </div>

        <div className="admin-orders-header-actions">
          <button
            className="admin-orders-button admin-orders-button-light"
            onClick={() => {
              setLoading(true);
              void loadOrders();
            }}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh orders"}
          </button>

          <Link
            href="/admin/products"
            className="admin-orders-button admin-orders-button-dark"
          >
            Manage products
          </Link>
        </div>
      </header>

      {error && (
        <div className="admin-orders-alert admin-orders-alert-error">
          {error}
        </div>
      )}

      {notice && (
        <div className="admin-orders-alert admin-orders-alert-success">
          {notice}
        </div>
      )}

      <section className="admin-order-stats">
        <article className="admin-order-stat">
          <span>Total orders</span>
          <strong>{stats.totalOrders}</strong>
        </article>

        <article className="admin-order-stat">
          <span>Awaiting payment</span>
          <strong>{stats.pendingPayment}</strong>
        </article>

        <article className="admin-order-stat">
          <span>Paid orders</span>
          <strong>{stats.paidOrders}</strong>
        </article>

        <article className="admin-order-stat">
          <span>Processing</span>
          <strong>{stats.processingOrders}</strong>
        </article>

        <article className="admin-order-stat">
          <span>Shipped</span>
          <strong>{stats.shippedOrders}</strong>
        </article>

        <article className="admin-order-stat">
          <span>Delivered</span>
          <strong>{stats.deliveredOrders}</strong>
        </article>

        <article className="admin-order-stat admin-order-stat-revenue">
          <span>Confirmed paid revenue</span>
          <strong>{money(stats.paidRevenue)}</strong>
        </article>
      </section>

      <section className="admin-orders-panel">
        <div className="admin-orders-toolbar">
          <div>
            <h2>Customer orders</h2>
            <p>{filteredOrders.length} order(s) shown</p>
          </div>

          <div className="admin-orders-filters">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order, customer, phone..."
              aria-label="Search orders"
            />

            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filter orders"
            >
              <option value="ALL">All orders</option>
              <option value="PAID">Paid</option>
              <option value="UNPAID">Awaiting payment</option>
              <option value="PENDING">Pending fulfilment</option>
              <option value="PROCESSING">Processing</option>
              <option value="SHIPPED">Shipped</option>
              <option value="DELIVERED">Delivered</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="admin-orders-empty">Loading orders...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="admin-orders-empty">
            <h3>No orders found</h3>
            <p>
              Try a different search, or check again after a customer places
              an order.
            </p>
          </div>
        ) : (
          <div className="admin-orders-list">
            {filteredOrders.map((order) => (
              <article className="admin-order-card" key={order.id}>
                <div className="admin-order-card-top">
                  <div>
                    <p className="admin-order-number">
                      {order.orderNumber}
                    </p>
                    <p className="admin-order-date">
                      Placed {dateTime(order.createdAt)}
                    </p>
                  </div>

                  <div className="admin-order-badges">
                    <span className={statusClass(order.paymentStatus)}>
                      Payment: {order.paymentStatus.replaceAll("_", " ")}
                    </span>
                    <span className={statusClass(order.orderStatus)}>
                      {order.orderStatus.replaceAll("_", " ")}
                    </span>
                  </div>
                </div>

                <div className="admin-order-card-grid">
                  <section className="admin-order-section">
                    <h3>Customer</h3>
                    <p className="admin-order-customer">
                      {order.customerName}
                    </p>
                    <p>{order.customerEmail}</p>
                    <p>{order.customerPhone}</p>
                  </section>

                  <section className="admin-order-section">
                    <h3>Delivery address</h3>
                    <p>{order.deliveryAddress}</p>
                    <p>
                      {order.deliveryCity}, {order.deliveryState}
                    </p>
                    {order.deliveryNotes && (
                      <p className="admin-order-notes">
                        Note: {order.deliveryNotes}
                      </p>
                    )}
                  </section>

                  <section className="admin-order-section">
                    <h3>Order total</h3>
                    <p>Subtotal: {money(order.subtotal)}</p>
                    <p>Delivery: {money(order.deliveryFee)}</p>
                    <p className="admin-order-total">
                      Total: {money(order.total)}
                    </p>
                    {order.paymentReference && (
                      <p className="admin-order-reference">
                        Ref: {order.paymentReference}
                      </p>
                    )}
                  </section>
                </div>

                <div className="admin-order-items">
                  <h3>Items ordered</h3>

                  {order.items.map((item) => (
                    <div className="admin-order-item" key={item.id}>
                      <div>
                        <strong>{item.productName}</strong>
                        <span>
                          {item.colour} / {item.size} · Qty {item.quantity}
                        </span>
                      </div>
                      <strong>{money(item.lineTotal)}</strong>
                    </div>
                  ))}
                </div>

                <div className="admin-order-card-bottom">
                  <p>
                    {order.paymentStatus === "PAID"
                      ? "Payment confirmed"
                      : "Do not dispatch until payment is confirmed."}
                  </p>

                  <div className="admin-order-status-actions">
                    {order.paymentStatus === "PAID" &&
                    order.orderStatus === "PROCESSING" ? (
                      <>
                        <button
                          className="admin-orders-button admin-orders-button-dark"
                          disabled={updatingId === order.id}
                          onClick={() =>
                            void updateStatus(order, "SHIPPED")
                          }
                        >
                          Mark shipped
                        </button>
                      </>
                    ) : order.paymentStatus === "PAID" &&
                      order.orderStatus === "SHIPPED" ? (
                      <button
                        className="admin-orders-button admin-orders-button-light"
                        disabled={updatingId === order.id}
                        onClick={() =>
                          void updateStatus(order, "DELIVERED")
                        }
                      >
                        Mark delivered
                      </button>
                    ) : order.orderStatus === "DELIVERED" ? (
                      <span className="admin-order-complete">
                        Order delivered
                      </span>
                    ) : (
                      <span className="admin-order-awaiting">
                        Awaiting verified payment
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
