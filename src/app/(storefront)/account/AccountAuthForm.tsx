"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PasswordInput from "@/app/PasswordInput";
import "./account.css";

type FormMode = "login" | "register" | "forgot" | "reset";

const headings: Record<FormMode, string> = {
  login: "Welcome back",
  register: "Create your account",
  forgot: "Reset your password",
  reset: "Choose a new password",
};

const descriptions: Record<FormMode, string> = {
  login: "Sign in to continue to your order and saved details.",
  register: "A considered wardrobe starts here.",
  forgot: "Enter your email and we’ll send a reset link if an account exists.",
  reset: "Choose a password with at least 12 characters.",
};

export default function AccountAuthForm({
  mode,
}: {
  mode: FormMode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const nextCandidate = searchParams.get("next");
  let nextPath = "/#shop";
  if (nextCandidate?.startsWith("/") && !nextCandidate.startsWith("//")) {
    try {
      const destination = new URL(
        nextCandidate,
        "https://fashion-freaks.invalid"
      );
      if (destination.origin === "https://fashion-freaks.invalid") {
        nextPath = `${destination.pathname}${destination.search}${destination.hash}`;
      }
    } catch {
      nextPath = "/#shop";
    }
  }
  const notice = searchParams.has("reset")
    ? "Your password has been updated. Sign in with the new one."
    : searchParams.has("authError")
      ? "That sign-in link has expired. Request a new one and try again."
      : "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    const endpoint = {
      login: "/api/customer/auth/login",
      register: "/api/customer/auth/register",
      forgot: "/api/customer/auth/forgot-password",
      reset: "/api/customer/auth/reset-password",
    }[mode];
    const payload =
      mode === "register"
        ? { displayName, email, password }
        : mode === "login"
          ? { email, password }
          : mode === "forgot"
            ? { email }
            : { password };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
        success?: boolean;
        authenticated?: boolean;
        emailConfirmationRequired?: boolean;
      };

      if (!response.ok) {
        throw new Error(result.error || "We couldn’t complete that request.");
      }

      if (mode === "forgot") {
        setMessage(result.message || "Check your inbox for next steps.");
      } else if (mode === "reset") {
        router.replace("/account/login?reset=1");
      } else if (mode === "register" && result.emailConfirmationRequired) {
        setMessage(
          "Your account was created. Confirm your email from the message we sent, then sign in."
        );
      } else if (mode === "register") {
        window.dispatchEvent(new Event("customer-auth-changed"));
        router.replace(nextPath);
        router.refresh();
      } else {
        window.dispatchEvent(new Event("customer-auth-changed"));
        router.replace(nextPath);
        router.refresh();
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to connect. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="account-page">
      <section className="account-panel" aria-labelledby="account-heading">
        <Link className="account-wordmark" href="/" aria-label="Fashion Freaks home">
          Fashion Freaks
        </Link>
        <h1 id="account-heading">{headings[mode]}</h1>
        <p className="account-description">{descriptions[mode]}</p>

        {notice && <p className="account-notice" role="status">{notice}</p>}

        <form className="account-form" onSubmit={handleSubmit}>
          {mode === "register" && (
            <label>
              <span>Name</span>
              <input
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                minLength={2}
                maxLength={80}
                required
                disabled={submitting}
              />
            </label>
          )}

          {(mode === "login" || mode === "register" || mode === "forgot") && (
            <label>
              <span>Email address</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                required
                disabled={submitting}
              />
            </label>
          )}

          {(mode === "login" || mode === "register" || mode === "reset") && (
            <div className="account-password-group">
              <label htmlFor="account-password">
                {mode === "login" ? "Password" : "Password (12+ characters)"}
              </label>
              <PasswordInput
                id="account-password"
                name="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={mode === "login" ? undefined : 12}
                maxLength={200}
                required
                disabled={submitting}
              />
            </div>
          )}

          {error && <p className="account-error" role="alert">{error}</p>}
          {message && <p className="account-success" role="status">{message}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? "Please wait..." : headings[mode]}
          </button>
        </form>

        <nav className="account-links" aria-label="Account options">
          {mode === "login" && (
            <>
              <Link href="/account/forgot-password">Forgot password?</Link>
              <span>New here? <Link href={`/account/register?next=${encodeURIComponent(nextPath)}`}>Create an account</Link></span>
            </>
          )}
          {mode === "register" && (
            <span>Already have an account? <Link href="/account/login">Sign in</Link></span>
          )}
          {mode === "forgot" && (
            <Link href="/account/login">Back to sign in</Link>
          )}
          {mode === "reset" && (
            <Link href="/account/login">Back to sign in</Link>
          )}
        </nav>
      </section>
    </main>
  );
}
