"use client";

import { useEffect } from "react";

export default function AdminSessionGuard() {
  useEffect(() => {
    let checking = false;

    async function verifySession() {
      if (checking) return;
      checking = true;

      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "same-origin",
        });

        if (!response.ok) {
          window.location.replace("/admin/login");
        }
      } catch {
        window.location.replace("/admin/login");
      } finally {
        checking = false;
      }
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        void verifySession();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void verifySession();
      }
    }

    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, []);

  return null;
}
