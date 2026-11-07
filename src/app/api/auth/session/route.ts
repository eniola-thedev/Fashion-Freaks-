import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    if (!request.headers.get("cookie")) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    const user = await getAdminSession();

    return NextResponse.json(
      user
        ? {
            authenticated: true,
            user: {
              id: user.id,
              email: user.email,
              role: user.role,
            },
          }
        : { authenticated: false },
      {
        status: user ? 200 : 401,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error("Admin session lookup failed:", error);
    return NextResponse.json(
      { error: "Unable to check administrator access." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}