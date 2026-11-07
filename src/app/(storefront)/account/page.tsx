"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "./account.css";

type CustomerSession = {
  authenticated?: boolean;
  user?: {
    email?: string;
    displayName?: string | null;
  };
};

export default function AccountPage() {
  const router = useRouter();
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/customer/auth/session", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as CustomerSession;
        if (!response.ok) throw new Error("Unable to load your account.");
        if (!result.authenticated) {
          router.replace("/account/login");
          return;
        }
        setSession(result);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") {
          return;
        }
        setError("We couldn’t load your account. Please try again.");
      });

    return () => controller.abort();
  }, [router]);

  if (!session?.authenticated) {
    return (
      <main className="account-page">
        <section className="account-panel">
          <p role={error ? "alert" : "status"}>
            {error || "Loading your account..."}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="account-page">
      <section className="account-panel account-summary">
        <Link className="account-wordmark" href="/">Fashion Freaks</Link>
        <p className="account-kicker">YOUR ACCOUNT</p>
        <h1>Account settings</h1>
        <p className="account-description">Review your account details.</p>
        {error && <p className="account-error" role="alert">{error}</p>}
        <dl className="account-details">
          <div>
            <dt>Name</dt>
            <dd>{session.user?.displayName || "Not provided"}</dd>
          </div>
          <div>
            <dt>Email address</dt>
            <dd>{session.user?.email}</dd>
          </div>
        </dl>
        <div className="account-actions">
          <Link className="account-primary-link" href="/#shop">
            Continue shopping
          </Link>
        </div>
      </section>
    </main>
  );
}
