import { cookies } from "next/headers";
import { COOKIE } from "@/lib/server";

export async function POST() {
  (await cookies()).set(COOKIE, "", { path: "/", maxAge: 0 });
  return Response.json({ ok: true });
}
