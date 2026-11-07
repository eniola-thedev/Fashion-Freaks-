import { Suspense } from "react";
import AccountAuthForm from "../AccountAuthForm";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<main className="account-page" />}>
      <AccountAuthForm mode="forgot" />
    </Suspense>
  );
}
