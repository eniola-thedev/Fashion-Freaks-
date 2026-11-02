"use client";

import { useState } from "react";

export default function AdminLogoutButton() {
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Logout failed.");
      }

      window.location.replace("/admin/login");
    } catch {
      setLoading(false);
      window.alert(
        "Unable to sign out. Please try again."
      );
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="admin-logout-button"
    >
      {loading ? "Signing out..." : "Sign out"}
    </button>
  );
}