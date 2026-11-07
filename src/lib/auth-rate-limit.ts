import { hashAuthRateLimitKey } from "@/lib/customer-auth.mjs";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function isAuthRateLimited(
  scope: string,
  identity: string,
  maxAttempts: number
) {
  const key = hashAuthRateLimitKey(scope, identity);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("is_auth_rate_limited", {
    p_key: key,
    p_max_attempts: maxAttempts,
  });
  if (error) throw error;
  return data === true;
}
