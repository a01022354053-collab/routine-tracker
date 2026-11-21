// 서버에서만 쓰는 것: 비밀번호 로그인 쿠키, Supabase(비밀 키) 연결
// 이 사이트는 주인 한 사람만 쓴다. 비밀번호는 Vercel 환경 변수 APP_PASSWORD.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const COOKIE = "dm_session";
export const SESSION_DAYS = 365;
export const TABLE = "daily_docs";

const env = {
  password: () => process.env.APP_PASSWORD ?? "",
  url: () => process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  secret: () => process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
};

/** 빠진 환경 변수 이름(값은 절대 내보내지 않는다) */
export function missingEnv() {
  const miss: string[] = [];
  if (!env.password()) miss.push("APP_PASSWORD");
  if (!env.url()) miss.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!env.secret()) miss.push("SUPABASE_SECRET_KEY");
  return miss;
}

const sha = (s: string) => createHash("sha256").update(s).digest();

export function passwordMatches(input: string) {
  const want = env.password();
  return !!want && timingSafeEqual(sha(input), sha(want));
}

// 쿠키 = v1.<만료 시각>.<서명>. 비밀번호를 바꾸면 예전 쿠키는 모두 무효가 된다
const signKey = () => sha(`${env.password()}\0${env.secret()}\0daily-manager`);
const sign = (payload: string) => createHmac("sha256", signKey()).update(payload).digest("base64url");

export function makeToken() {
  const payload = `v1.${Date.now() + SESSION_DAYS * 86400000}`;
  return `${payload}.${sign(payload)}`;
}

function tokenValid(token: string | undefined) {
  if (!token || !env.password()) return false;
  const i = token.lastIndexOf(".");
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const got = Buffer.from(token.slice(i + 1));
  const want = Buffer.from(sign(payload));
  if (got.length !== want.length || !timingSafeEqual(got, want)) return false;
  const exp = Number(payload.split(".")[1]);
  return Number.isFinite(exp) && exp > Date.now();
}

/** 지금 요청이 로그인한 주인인지 */
export async function signedIn() {
  return tokenValid((await cookies()).get(COOKIE)?.value);
}

export function db() {
  return createClient(env.url(), env.secret(), { auth: { persistSession: false, autoRefreshToken: false } });
}

export const unauthorized = () => Response.json({ error: "비밀번호를 넣어 주세요" }, { status: 401 });
