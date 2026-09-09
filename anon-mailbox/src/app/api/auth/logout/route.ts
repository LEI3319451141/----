import { COOKIE_NAME } from "@/lib/auth";
import { ok } from "@/lib/api";

export const runtime = "nodejs";

export async function POST() {
  const res = ok({ success: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
