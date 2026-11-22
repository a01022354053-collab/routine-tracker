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
    const models = ids.map((id) => id.replace(/^models\//, "")).filter((id) => /gemini/i.test(id));
    // 몇 모델에 "hi" 한 마디씩 보내서 실제로 답하는지(그리고 reasoning_effort가 문제인지) 본다
    const tries: Record<string, string> = {};
    const one = async (model: string, effort: boolean) => {
      try {
        const r = await client.chat.completions.create(
          { model, messages: [{ role: "user", content: "hi" }], ...(effort ? { reasoning_effort: "low" as const } : {}) },
          { timeout: 20000, maxRetries: 0 },
        );
        return `ok: ${(r.choices[0]?.message?.content ?? "").slice(0, 30)}`;
      } catch (e) {
        return e instanceof OpenAI.APIError ? `${e.status ?? "연결"} ${e.message}`.slice(0, 220) : String(e).slice(0, 220);
      }
    };
    await Promise.all(
      ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-2.5-flash"].flatMap((m) => [
        one(m, false).then((r) => (tries[m] = r)),
        one(m, true).then((r) => (tries[`${m} +effort`] = r)),
      ]),
    );
    return { tries, models: models.slice(0, 60) };
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
