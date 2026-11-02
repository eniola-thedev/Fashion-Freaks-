import Link from "next/link";

export default function ProductNotFound() {
  return (
    <main className="detail-page product-not-found">
      <p className="eyebrow">FASHION FREAKS / COLLECTION</p>
      <h1>We can’t find that piece.</h1>
      <p>
        It may have sold out or the link may be incorrect. Browse the
        collection to find something else.
      </p>
      <Link href="/#shop" className="button button-dark">
        SHOP THE COLLECTION <span>↗</span>
      </Link>
    </main>
  );
}
