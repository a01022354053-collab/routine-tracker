// 비밀번호를 맞추면 1년짜리 로그인 쿠키를 준다. 여러 번 틀리면 잠깐 잠근다
import { cookies } from "next/headers";
import { COOKIE, SESSION_DAYS, TABLE, db, makeToken, missingEnv, passwordMatches } from "@/lib/server";

const LOCK_AFTER = 8;
const LOCK_MINUTES = 10;
const PATH = "_auth/login";

type Guard = { fails: number; lockedUntil: number | null };

export async function POST(request: Request) {
  const missing = missingEnv();
  if (missing.length) return Response.json({ error: `Vercel 환경 변수가 없어요: ${missing.join(", ")}`, missing }, { status: 503 });

  let password = "";
  try {
    password = String(((await request.json()) as { password?: unknown }).password ?? "");
  } catch {
    return Response.json({ error: "잘못된 요청이에요" }, { status: 400 });
  }

  const sb = db();
  const { data: row, error } = await sb.from(TABLE).select("data").eq("path", PATH).maybeSingle();
  if (error) return Response.json({ error: `저장소에 연결하지 못했어요 (${error.message})` }, { status: 503 });
  const guard: Guard = { fails: 0, lockedUntil: null, ...((row?.data as Guard | undefined) ?? {}) };
  if (guard.lockedUntil && guard.lockedUntil > Date.now()) {
    return Response.json({ error: "너무 많이 틀렸어요. 잠시 후 다시 해 주세요.", until: guard.lockedUntil }, { status: 429 });
  }

  const save = (g: Guard) => sb.from(TABLE).upsert({ path: PATH, col: "_auth", data: g, updated_at: new Date().toISOString() }, { onConflict: "path" });

  if (!passwordMatches(password)) {
    const fails = guard.fails + 1;
    await save(fails >= LOCK_AFTER ? { fails: 0, lockedUntil: Date.now() + LOCK_MINUTES * 60000 } : { fails, lockedUntil: null });
    await new Promise((r) => setTimeout(r, 700));
    return Response.json({ error: "비밀번호가 달라요" }, { status: 401 });
  }

  if (guard.fails || guard.lockedUntil) await save({ fails: 0, lockedUntil: null });
  (await cookies()).set(COOKIE, makeToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return Response.json({ ok: true });
}
