import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    if (!request.headers.get("cookie")) {
      return NextResponse.json(
        { authenticated: false },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    const user = await getCustomerSession();
    return NextResponse.json(
      user
        ? {
            authenticated: true,
            user: {
              id: user.id,
              email: user.email,
              displayName: user.displayName,
              role: user.role,
            },
          }
        : { authenticated: false },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error("Customer session lookup failed:", error);
    return NextResponse.json(
      { error: "Unable to check your sign-in status." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
