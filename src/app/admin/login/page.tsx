"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PasswordInput from "@/app/PasswordInput";

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error || "Unable to sign in."
        );
        return;
      }

      router.replace(data.redirectTo || "/admin");
      router.refresh();
    } catch {
      setError(
        "Unable to connect to the server. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <Link
          href="/"
          className="admin-login-brand"
          aria-label="Fashion Freaks home"
        >
          <Image
            src="/logo.jpg"
            alt=""
            width={64}
            height={64}
            priority
          />
          FASHION<span>FREAKS</span>
        </Link>

        <div className="admin-login-heading">
          <p className="admin-login-eyebrow">
            ADMINISTRATION
          </p>

          <h1>Welcome back.</h1>

          <p className="admin-login-description">
            Sign in to manage your store, products,
            inventory, and orders.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="admin-login-form"
        >
          <label htmlFor="admin-email">
            Email address
          </label>

          <input
            id="admin-email"
            type="email"
            name="email"
            autoComplete="username"
            placeholder="admin@example.com"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            required
            maxLength={254}
            disabled={loading}
          />

          <label htmlFor="admin-password">
            Password
          </label>

          <PasswordInput
            id="admin-password"
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            required
            maxLength={200}
            disabled={loading}
          />

          {error && (
            <p className="admin-login-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="admin-login-button"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <Link href="/account/forgot-password" className="admin-login-back">
          Forgot your password?
        </Link>

        <Link href="/" className="admin-login-back">
          ← Back to Fashion Freaks
        </Link>

        <p className="admin-login-footer">
          Authorized administrators only.
        </p>
      </section>
    </main>
  );
}