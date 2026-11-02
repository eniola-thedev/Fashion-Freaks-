"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Stats = {
  totalProducts: number;
  activeProducts: number;
  totalOrders: number;
  paidOrders: number;
  pendingPayments: number;
  processingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  revenue: number;
};

type TopProduct = {
  productId: string;
  productName: string;
  unitsSold: number;
  revenue: number;
};

type LowStockVariant = {
  id: string;
  productId: string;
  productName: string;
  slug: string;
  colour: string;
  size: string;
  stock: number;
};

type RecentOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  total: number;
  orderStatus: string;
  paymentStatus: string;
  createdAt: string;
  itemCount: number;
};

type Analytics = {
  stats: Stats;
  topProducts: TopProduct[];
  lowStockVariants: LowStockVariant[];
  recentOrders: RecentOrder[];
};

const initialStats: Stats = {
  totalProducts: 0,
  activeProducts: 0,
  totalOrders: 0,
  paidOrders: 0,
  pendingPayments: 0,
  processingOrders: 0,
  shippedOrders: 0,
  deliveredOrders: 0,
  revenue: 0,
};

const money = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export default function DashboardClient() {
  const [data, setData] = useState<Analytics>({
    stats: initialStats,
    topProducts: [],
    lowStockVariants: [],
    recentOrders: [],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/analytics", {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Unable to load dashboard."
        );
      }

      setError("");
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load dashboard."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAnalytics();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadAnalytics]);

  const { stats } = data;

  return (
    <main className="ff-dashboard">
      <header className="ff-dashboard-header">
        <div>
          <p className="ff-dashboard-eyebrow">
            FASHION FREAKS / CONTROL CENTRE
          </p>

          <h1>Store overview</h1>

          <p className="ff-dashboard-description">
            Monitor sales, manage inventory, and fulfil customer orders.
          </p>
        </div>

        <button
          type="button"
          className="ff-dashboard-refresh"
          onClick={() => {
            setLoading(true);
            void loadAnalytics();
          }}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh dashboard"}
        </button>
      </header>

      {error && (
        <div className="ff-dashboard-error">
          {error}
        </div>
      )}

      <section className="ff-dashboard-revenue">
        <div>
          <span>Confirmed paid revenue</span>
          <h2>{money(stats.revenue)}</h2>
          <p>
            Based on {stats.paidOrders} paid order(s) recorded in the store.
          </p>
        </div>

        <div className="ff-dashboard-revenue-badge">
          NGN
        </div>
      </section>

      <section className="ff-dashboard-stats">
        <article>
          <span>Total orders</span>
          <strong>{stats.totalOrders}</strong>
        </article>

        <article>
          <span>Awaiting payment</span>
          <strong>{stats.pendingPayments}</strong>
        </article>

        <article>
          <span>Processing</span>
          <strong>{stats.processingOrders}</strong>
        </article>

        <article>
          <span>Shipped</span>
          <strong>{stats.shippedOrders}</strong>
        </article>

        <article>
          <span>Delivered</span>
          <strong>{stats.deliveredOrders}</strong>
        </article>

        <article>
          <span>Active products</span>
          <strong>{stats.activeProducts}</strong>
        </article>
      </section>

      <section className="ff-dashboard-shortcuts">
        <Link href="/admin/products">
          <span>01 / INVENTORY</span>
          <strong>Manage products</strong>
          <p>Create products, update prices, and manage stock.</p>
          <b>Open products →</b>
        </Link>

        <Link href="/admin/orders">
          <span>02 / FULFILMENT</span>
          <strong>Manage orders</strong>
          <p>Review customer details, payment, and delivery progress.</p>
          <b>Open orders →</b>
        </Link>
      </section>

      <div className="ff-dashboard-columns">
        <section className="ff-dashboard-panel">
          <div className="ff-dashboard-panel-heading">
            <div>
              <h2>Top-selling products</h2>
              <p>Ranked by units sold in paid orders.</p>
            </div>

            <Link href="/admin/products">View products</Link>
          </div>

          {loading ? (
            <p className="ff-dashboard-empty">Loading products...</p>
          ) : data.topProducts.length === 0 ? (
            <p className="ff-dashboard-empty">
              No paid product sales have been recorded yet.
            </p>
          ) : (
            <div className="ff-dashboard-list">
              {data.topProducts.map((product, index) => (
                <div
                  className="ff-dashboard-product-row"
                  key={product.productId}
                >
                  <span className="ff-dashboard-rank">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <div>
                    <strong>{product.productName}</strong>
                    <p>{product.unitsSold} unit(s) sold</p>
                  </div>

                  <b>{money(product.revenue)}</b>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="ff-dashboard-panel">
          <div className="ff-dashboard-panel-heading">
            <div>
              <h2>Low-stock alerts</h2>
              <p>Active variants with five units or fewer.</p>
            </div>

            <Link href="/admin/products">Manage stock</Link>
          </div>

          {loading ? (
            <p className="ff-dashboard-empty">Checking stock...</p>
          ) : data.lowStockVariants.length === 0 ? (
            <p className="ff-dashboard-empty">
              No active product variants meet the low-stock threshold.
            </p>
          ) : (
            <div className="ff-dashboard-list">
              {data.lowStockVariants.slice(0, 8).map((variant) => (
                <div
                  className="ff-dashboard-stock-row"
                  key={variant.id}
                >
                  <div>
                    <strong>{variant.productName}</strong>
                    <p>
                      {variant.colour} / {variant.size}
                    </p>
                  </div>

                  <span
                    className={
                      variant.stock === 0
                        ? "ff-stock-empty"
                        : "ff-stock-low"
                    }
                  >
                    {variant.stock === 0
                      ? "Out of stock"
                      : `${variant.stock} left`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="ff-dashboard-panel ff-dashboard-recent">
        <div className="ff-dashboard-panel-heading">
          <div>
            <h2>Recent orders</h2>
            <p>The latest orders recorded in your database.</p>
          </div>

          <Link href="/admin/orders">View all orders →</Link>
        </div>

        {loading ? (
          <p className="ff-dashboard-empty">Loading orders...</p>
        ) : data.recentOrders.length === 0 ? (
          <p className="ff-dashboard-empty">
            Orders will appear here when customers place them.
          </p>
        ) : (
          <div className="ff-dashboard-table-wrap">
            <table className="ff-dashboard-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Fulfilment</th>
                  <th>Date</th>
                </tr>
              </thead>

              <tbody>
                {data.recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.orderNumber}</td>
                    <td>{order.customerName}</td>
                    <td>{order.itemCount}</td>
                    <td>{money(order.total)}</td>
                    <td>
                      <span
                        className={`ff-dashboard-status ff-status-${order.paymentStatus.toLowerCase()}`}
                      >
                        {order.paymentStatus}
                      </span>
                    </td>
                    <td>{order.orderStatus}</td>
                    <td>{formatDate(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}