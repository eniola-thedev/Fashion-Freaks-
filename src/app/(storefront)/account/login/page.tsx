import { Suspense } from "react";
import AccountAuthForm from "../AccountAuthForm";

export default function AccountLoginPage() {
  return (
    <Suspense fallback={<main className="account-page" />}>
      <AccountAuthForm mode="login" />
    </Suspense>
  );
}
