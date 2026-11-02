"use client";

import Image from "next/image";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  cartItemCount,
  getCartSnapshot,
  getServerCartSnapshot,
  subscribeToCart,
} from "@/lib/cart";
import { whatsappUrl } from "@/lib/whatsapp";

export default function StorefrontChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const cartItems = useSyncExternalStore(
    subscribeToCart,
    getCartSnapshot,
    getServerCartSnapshot
  );
  const cartCount = cartItemCount(cartItems);

  return (
    <>
      <div className="store-announcement">
        FASHION FREAKS · LAGOS
      </div>
      <header className="store-header">
        <Link className="store-brand" href="/" aria-label="Fashion Freaks home">
          <Image
            src="/logo.jpg"
            alt="Fashion Freaks"
            width={56}
            height={56}
            priority
          />
        </Link>

        <nav className="store-nav" aria-label="Main navigation">
          <Link href="/#shop">Shop all</Link>
          <Link href="/#categories">Categories</Link>
          <Link href="/#story">Our story</Link>
        </nav>

        <Link
          className="store-cart-link"
          href="/cart"
          aria-label={`Shopping bag, ${cartCount} items`}
        >
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
            <path d="M5 8h14l1 13H4L5 8Z" />
            <path d="M9 9V6a3 3 0 0 1 6 0v3" />
          </svg>
          <span>Bag</span>
          <span className="store-cart-count" aria-live="polite">
            {cartCount}
          </span>
        </Link>
      </header>

      {children}

      <footer className="store-footer">
        <div className="store-footer-about">
          <Link href="/" className="store-footer-brand">
            <Image src="/logo.jpg" alt="" width={44} height={44} />
            <span>Fashion Freaks Clothing Store</span>
          </Link>
          <p>Wear your own rules. Find your next everyday favourite.</p>
        </div>
        <nav className="store-footer-column" aria-label="Shop navigation">
          <strong>EXPLORE</strong>
          <Link href="/#shop">Shop all</Link>
          <Link href="/#categories">Categories</Link>
          <Link href="/cart">Shopping bag</Link>
        </nav>
        <div className="store-footer-column">
          <strong>VISIT US</strong>
          <span>
            22, Billionaires Plaza,
            <br />
            Broad Street,
            <br />
            Lagos Island,
            <br />
            Lagos State, Nigeria.
          </span>
          <span>Opening hours · 9:00 AM – 6:30 PM</span>
        </div>
        <div className="store-footer-column">
          <strong>LET’S CONNECT</strong>
          <a href="tel:08053305564">08053305564</a>
          <a
            href="https://www.instagram.com/Faashionfreaks_online/"
            target="_blank"
            rel="noreferrer"
          >
            @Faashionfreaks_online
          </a>
          <a href={whatsappUrl()} target="_blank" rel="noreferrer">
            Chat with us on WhatsApp
          </a>
          <a
            href="https://chat.whatsapp.com/JKgnFHVnunD2O19kz0A3ib"
            target="_blank"
            rel="noreferrer"
          >
            Join Our WhatsApp Community
          </a>
        </div>
        <small>© Fashion Freaks Clothing Store · Nigeria</small>
      </footer>
      <a
        className="whatsapp-float"
        href={whatsappUrl(
          "Hello Fashion Freaks, I would like to know more about your collection."
        )}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat with Fashion Freaks on WhatsApp"
      >
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M16 3.2a12.1 12.1 0 0 0-10.4 18.3L4 28l6.7-1.6A12.1 12.1 0 1 0 16 3.2Zm0 22a9.9 9.9 0 0 1-5-1.4l-.4-.2-3.9.9 1-3.8-.3-.4A9.9 9.9 0 1 1 16 25.2Zm5.4-7.4c-.3-.2-1.7-.9-2-.9s-.5-.2-.7.2-.8.9-1 1.1-.4.2-.7.1a8.1 8.1 0 0 1-2.4-1.5 9 9 0 0 1-1.7-2.1c-.2-.3 0-.5.2-.6l.5-.6.2-.5a.6.6 0 0 0 0-.5c0-.2-.7-1.7-.9-2.3-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.7 3.7 0 0 0-1.2 2.7 6.4 6.4 0 0 0 1.3 3.4 14.7 14.7 0 0 0 5.6 5c.8.3 1.4.5 1.9.6.8.2 1.5.2 2.1.1.6-.1 1.7-.7 1.9-1.4s.2-1.3.2-1.4-.2-.2-.5-.4Z" />
        </svg>
      </a>
    </>
  );
}
