"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { safeRedirectPath } from "@/lib/customer-auth.mjs";

type Customer = {
  email?: string;
  displayName?: string | null;
};

type SessionResponse = {
  authenticated?: boolean;
  user?: Customer;
};

export default function CustomerAccountMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const requestId = useRef(0);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadSession() {
      const currentRequest = ++requestId.current;

      try {
        const response = await fetch("/api/customer/auth/session", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Unable to check account status.");

        const result = (await response.json()) as SessionResponse;
        if (active && currentRequest === requestId.current) {
          setCustomer(result.authenticated && result.user ? result.user : null);
        }
      } catch {
        if (active && currentRequest === requestId.current) setCustomer(null);
      }
    }

    void loadSession();

    function handleAuthChange() {
      void loadSession();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") void loadSession();
    }

    window.addEventListener("customer-auth-changed", handleAuthChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      active = false;
      requestId.current += 1;
      window.removeEventListener("customer-auth-changed", handleAuthChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!detailsRef.current?.contains(event.target as Node)) {
        detailsRef.current?.removeAttribute("open");
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !detailsRef.current?.open) return;
      detailsRef.current.open = false;
      detailsRef.current.querySelector("summary")?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  async function signOut() {
    setSigningOut(true);
    setError("");
    requestId.current += 1;

    try {
      const response = await fetch("/api/customer/auth/logout", {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Unable to sign out. Please try again.");

      setCustomer(null);
      if (detailsRef.current) detailsRef.current.open = false;
      router.replace("/");
      router.refresh();
    } catch {
      setError("Unable to sign out. Please try again.");
      setSigningOut(false);
    }
  }

  if (!customer) {
    return (
      <Suspense
        fallback={
          <AccountAccessLink
            href={
              pathname === "/account/login"
                ? "/account/register?next=%2F%23shop"
                : "/account/login"
            }
            label={pathname === "/account/login" ? "Sign up" : "Login"}
          />
        }
      >
        <SignedOutAccountLink isLoginPage={pathname === "/account/login"} />
      </Suspense>
    );
  }

  const greeting = customer.displayName
    ? `Hi, ${customer.displayName}`
    : "Account";

  return (
    <details className="store-account-menu" ref={detailsRef}>
      <summary className="store-account-trigger">
        <span className="store-account-greeting">{greeting}</span>
        <AccountIcon />
      </summary>
      <div className="store-account-dropdown" id="customer-account-menu">
        <p className="store-account-dropdown-name">
          {customer.displayName || customer.email}
        </p>
        <Link
          href="/account"
          onClick={() => {
            if (detailsRef.current) detailsRef.current.open = false;
          }}
        >
          Account settings
        </Link>
        {error && <p className="store-account-error" role="alert">{error}</p>}
        <button type="button" onClick={signOut} disabled={signingOut}>
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </details>
  );
}

function SignedOutAccountLink({ isLoginPage }: { isLoginPage: boolean }) {
  const searchParams = useSearchParams();
  const nextPath = safeRedirectPath(searchParams.get("next"), "/#shop");

  return (
    <AccountAccessLink
      href={
        isLoginPage
          ? `/account/register?next=${encodeURIComponent(nextPath)}`
          : "/account/login"
      }
      label={isLoginPage ? "Sign up" : "Login"}
    />
  );
}

function AccountAccessLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="store-account-link" href={href} aria-label={label}>
      <AccountIcon />
      <span>{label}</span>
    </Link>
  );
}

function AccountIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}
