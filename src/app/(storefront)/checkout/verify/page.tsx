"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { writeCart } from "@/lib/cart";
import { clearPendingOrder } from "@/lib/pending-order";
import { whatsappUrl } from "@/lib/whatsapp";

type VerificationResult = {
  verified?: boolean;
  orderNumber?: string;
  error?: string;
  outcome?: "declined" | "unconfirmed";
};

export default function VerifyPaymentPage() {
  const [status, setStatus] = useState("Verifying your payment...");
  const [orderNumber, setOrderNumber] = useState("");
  const [resultState, setResultState] = useState<
    "verifying" | "success" | "declined" | "unconfirmed"
  >("verifying");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function verifyPayment() {
      const params = new URLSearchParams(window.location.search);
      const reference =
        params.get("reference") || params.get("trxref");

      if (!reference) {
        setResultState("unconfirmed");
        setStatus("No payment reference was found, so we cannot confirm the transaction.");
        return;
      }

      try {
        const response = await fetch("/api/payments/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reference }),
          cache: "no-store",
        });

        const result =
          (await response.json()) as VerificationResult;

        if (cancelled) return;

        if (!response.ok || !result.verified) {
          setResultState(
            result.outcome === "declined" ? "declined" : "unconfirmed"
          );
          setOrderNumber(result.orderNumber || "");
          setStatus(
            result.error ||
              "We could not confirm the payment status. Please contact support if you were charged."
          );
          return;
        }

        try {
          writeCart([]);
          localStorage.removeItem("fashion-freaks-checkout-key");
          clearPendingOrder();
        } catch (error) {
          console.error("Could not clear the paid cart locally:", error);
        }
        setOrderNumber(result.orderNumber || "");
        setResultState("success");
        setStatus("Your payment has been verified successfully.");
      } catch {
        if (!cancelled) {
          setResultState("unconfirmed");
          setStatus(
            "We could not reach Paystack to verify this payment. Check again before attempting another payment."
          );
        }
      }
    }

    const timer = window.setTimeout(() => {
      void verifyPayment();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [attempt]);

  return (
    <main className="checkout-page">
      <section
        className={`checkout-empty payment-result-card payment-result-${resultState}`}
        aria-labelledby="payment-result-heading"
      >
        <div className="payment-result-icon" aria-hidden="true">
          {resultState === "success" ? (
            <svg viewBox="0 0 24 24">
              <path d="m5 12 4 4L19 6" />
            </svg>
          ) : resultState === "declined" ? (
            <svg viewBox="0 0 24 24">
              <path d="m7 7 10 10M17 7 7 17" />
            </svg>
          ) : resultState === "verifying" ? (
            <svg viewBox="0 0 24 24" className="payment-spinner">
              <circle cx="12" cy="12" r="9" strokeDasharray="42 16" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24">
              <path d="M12 8v5m0 3h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          )}
        </div>
        <p className="checkout-eyebrow">
          FASHION FREAKS / PAYMENT
        </p>

        <h1 id="payment-result-heading">
          {resultState === "success"
            ? "Payment Successful"
            : resultState === "declined"
              ? "Payment Declined"
              : resultState === "verifying"
                ? "Confirming your payment"
                : "Payment Status Unconfirmed"}
        </h1>

        <p aria-live="polite" role="status">{status}</p>

        {orderNumber && (
          <p className="payment-order-reference">
            Order reference: <strong>{orderNumber}</strong>
          </p>
        )}

        {resultState === "success" ? (
          <div className="payment-result-actions">
            <Link href="/" className="checkout-primary-button">
              CONTINUE SHOPPING
            </Link>
          </div>
        ) : resultState === "verifying" ? (
          <p>
            Please wait. Do not refresh payment or start another payment while
            the transaction is being checked.
          </p>
        ) : (
          <>
            <p>
              Your bag is still saved. We have not marked the order as paid.
              Contact us if your account was charged.
            </p>
            <div className="payment-result-actions">
              <button
                type="button"
                className="checkout-primary-button"
                onClick={() => {
                  setResultState("verifying");
                  setStatus("We are confirming this transaction directly with Paystack.");
                  setAttempt((current) => current + 1);
                }}
              >
                CHECK STATUS AGAIN
              </button>
              <Link href="/cart" className="checkout-secondary-button">
                RETURN TO BAG
              </Link>
              <a
                href={whatsappUrl(
                  `Hello Fashion Freaks, please help me confirm payment status${orderNumber ? ` for order ${orderNumber}` : ""}.`
                )}
                className="checkout-secondary-button"
                target="_blank"
                rel="noreferrer"
              >
                CONTACT SUPPORT
              </a>
            </div>
          </>
        )}
      </section>
    </main>
  );
}