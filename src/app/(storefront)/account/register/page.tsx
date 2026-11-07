import { Suspense } from "react";
import AccountAuthForm from "../AccountAuthForm";

export default function AccountRegisterPage() {
  return (
    <Suspense fallback={<main className="account-page" />}>
      <AccountAuthForm mode="register" />
    </Suspense>
  );
}
