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

/** 서버가 가진 Supabase 키의 종류(값은 절대 내보내지 않는다). 공개 키가 잘못 들어가면 표를 못 읽는다 */
export function keyKind(): "secret" | "service_role" | "publishable" | "anon" | "unknown" | "none" {
  const k = env.secret();
  if (!k) return "none";
  if (k.startsWith("sb_secret_")) return "secret";
  if (k.startsWith("sb_publishable_")) return "publishable";
  try {
    const role = JSON.parse(Buffer.from(k.split(".")[1] ?? "", "base64url").toString("utf8")).role;
    if (role === "service_role" || role === "anon") return role;
  } catch {}
  return "unknown";
}

/**
 * ChatGPT(OpenAI) 키. OPENAI_API_KEY가 없으면 이름을 다르게 저장했어도 찾는다:
 * 이름에 OPENAI·CHATGPT·GPT가 들어간 것 → 그래도 없으면 값이 sk-로 시작하는 것(Claude 키 sk-ant- 제외).
 */
export function openaiKey() {
  const isKey = (v: string | undefined) => !!v && v.trim().startsWith("sk-") && !v.trim().startsWith("sk-ant-");
  if (isKey(process.env.OPENAI_API_KEY)) return process.env.OPENAI_API_KEY!.trim();
  const all = Object.entries(process.env);
  const named = all.find(([name, v]) => /openai|chat_?gpt|gpt/i.test(name) && isKey(v));
  const any = named ?? all.find(([, v]) => isKey(v));
  return any ? any[1]!.trim() : "";
}

/**
 * 구글 Gemini 키(무료 구간 있음). GEMINI_API_KEY가 없으면 이름에 GEMINI·GOOGLE이 들어간 것,
 * 그래도 없으면 값이 AIza로 시작하는 것을 쓴다.
 */
export function geminiKey() {
  const isKey = (v: string | undefined) => !!v && v.trim().startsWith("AIza");
  const all = Object.entries(process.env);
  // 이름에 GEMINI가 들어간 값은 모양과 상관없이 쓴다(키 모양이 바뀌어도 되게)
  const byName = all.find(([name, v]) => /gemini/i.test(name) && !!v?.trim());
  const named = byName ?? all.find(([name, v]) => /google/i.test(name) && isKey(v));
  const any = named ?? all.find(([, v]) => isKey(v));
  return any ? any[1]!.trim() : "";
}

/** 들어온 사람에게만: AI 키로 보이는 환경 변수의 이름과 종류(값은 절대 내보내지 않는다) */
export function aiEnvSummary() {
  const kind = (v: string) => (v.startsWith("AIza") ? "gemini" : v.startsWith("sk-ant-") ? "claude" : v.startsWith("sk-") ? "openai" : "모양 모름");
  return Object.entries(process.env)
    .filter(([name, v]) => !!v && (/gemini|google|openai|gpt|anthropic|claude|api_?key|키/i.test(name) || /^(AIza|sk-)/.test(v.trim())))
    .filter(([name]) => !/^(VERCEL|NEXT_|NODE_|npm_|SUPABASE|APP_PASSWORD)/i.test(name))
    .map(([name, v]) => ({ name, kind: kind(v!.trim()) }));
}

/** 매니저가 어느 AI를 쓰는지(키 값은 내보내지 않는다). Gemini → ChatGPT → Claude 순서로 있는 것 */
export const managerKind = () => (geminiKey() ? "gemini" : openaiKey() ? "chatgpt" : process.env.ANTHROPIC_API_KEY ? "claude" : "none");

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
