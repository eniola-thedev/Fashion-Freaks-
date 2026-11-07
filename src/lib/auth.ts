import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppSession = {
  id: string;
  email: string;
  displayName: string | null;
  role: "ADMIN" | "CUSTOMER";
};

async function getAppSession(
  expectedRole: AppSession["role"]
): Promise<AppSession | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    if (
      error.name === "AuthSessionMissingError" ||
      (error.status !== undefined && error.status < 500 && error.status !== 429)
    ) {
      return null;
    }
    throw error;
  }
  if (!user || !user.email) return null;

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("UserProfile")
    .select("id, email, displayName, role, isActive")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (
    !profile ||
    !profile.isActive ||
    profile.role !== expectedRole
  ) {
    return null;
  }

  return {
    id: profile.id as string,
    email: user.email,
    displayName: profile.displayName as string | null,
    role: expectedRole,
  };
}

export async function getAdminSession() {
  return getAppSession("ADMIN");
}

export async function getCustomerSession() {
  return getAppSession("CUSTOMER");
}
