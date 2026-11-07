import { Suspense } from "react";
import AccountAuthForm from "../AccountAuthForm";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="account-page" />}>
      <AccountAuthForm mode="reset" />
    </Suspense>
  );
}
