"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ProductError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Product page failed to load:", error);
  }, [error]);

  return (
    <main className="detail-page product-not-found">
      <p className="eyebrow">FASHION FREAKS / PRODUCT</p>
      <h1>This piece didn’t load.</h1>
      <p>
        Something interrupted the product page. You can try again or return
        to the collection.
      </p>
      <div className="product-error-actions">
        <button type="button" className="button button-dark" onClick={reset}>
          TRY AGAIN
        </button>
        <Link href="/#shop" className="text-link">
          BACK TO THE COLLECTION <span>↗</span>
        </Link>
      </div>
    </main>
  );
}
