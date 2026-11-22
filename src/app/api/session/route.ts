// 들어와 있는지, 설정이 다 됐는지(빠진 환경 변수 이름만 알려 준다)
import OpenAI from "openai";
import type { NextRequest } from "next/server";
import { aiEnvSummary, geminiKey, keyKind, managerKind, missingEnv, signedIn } from "@/lib/server";

// 들어온 사람이 ?check=ai 로 부르면, Gemini 키로 쓸 수 있는 모델 이름을 구글에 물어본다(키 값은 내보내지 않는다)
async function geminiModels() {
  const key = geminiKey();
  if (!key) return { error: "Gemini 키 없음" };
  try {
    const client = new OpenAI({ apiKey: key, baseURL: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/" });
    const ids: string[] = [];
    for await (const m of client.models.list({ timeout: 15000, maxRetries: 0 })) ids.push(m.id);
    return { models: ids.map((id) => id.replace(/^models\//, "")).filter((id) => /gemini/i.test(id)).slice(0, 60) };
  } catch (e) {
    return e instanceof OpenAI.APIError ? { error: `${e.status ?? "연결"} ${e.code ?? ""} ${e.message}`.slice(0, 300) } : { error: String(e).slice(0, 300) };
  }
}

export async function GET(request: NextRequest) {
  const inside = await signedIn(); // 쿠키를 읽으므로 요청마다 새로 답한다
  const missing = missingEnv();
  const more = inside
    ? {
        aiEnv: aiEnvSummary(),
        build: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
        ...(request.nextUrl.searchParams.get("check") === "ai" ? { gemini: await geminiModels() } : {}),
      }
    : {};
  return Response.json({ ok: inside && missing.length === 0, missing, key: keyKind(), manager: managerKind(), ...more }, { headers: { "cache-control": "no-store" } });
}
