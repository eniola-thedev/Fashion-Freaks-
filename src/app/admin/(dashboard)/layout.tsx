import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import AdminLogoutButton from "../AdminLogoutButton";
import AdminSessionGuard from "../AdminSessionGuard";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <AdminSessionGuard />
      <div className="admin-shell-bar">
        <Link href="/admin" aria-label="Fashion Freaks admin dashboard">
          <Image src="/logo.jpg" alt="Fashion Freaks" width={44} height={44} />
        </Link>
        <span>ADMINISTRATION</span>
        <AdminLogoutButton />
      </div>
      {children}
    </Suspense>
  );
}
