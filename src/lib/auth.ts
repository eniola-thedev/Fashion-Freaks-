import { errors as joseErrors, SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "fashion_freaks_admin_session";

const SESSION_DURATION = 60 * 60 * 8; // 8 hours

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be configured securely."
    );
  }

  return new TextEncoder().encode(secret);
}

export async function createAdminSession(userId: string) {
  const token = await new SignJWT({
    role: "ADMIN",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(getSessionSecret());

  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION,
  });
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(
      token,
      getSessionSecret(),
      {
        algorithms: ["HS256"],
      }
    ));
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) {
      return null;
    }

    throw error;
  }

  if (
    payload.role !== "ADMIN" ||
    typeof payload.sub !== "string"
  ) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: payload.sub,
    },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
    },
  });

  if (
    !user ||
    !user.isActive ||
    user.role !== "ADMIN"
  ) {
    return null;
  }

  return user;
}

export async function destroyAdminSession() {
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}