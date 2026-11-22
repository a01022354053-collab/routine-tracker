// 들어와 있는지, 설정이 다 됐는지(빠진 환경 변수 이름만 알려 준다)
import { aiEnvSummary, keyKind, managerKind, missingEnv, signedIn } from "@/lib/server";

export async function GET() {
  const inside = await signedIn(); // 쿠키를 읽으므로 요청마다 새로 답한다
  const missing = missingEnv();
  const more = inside ? { aiEnv: aiEnvSummary(), build: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) } : {};
  return Response.json({ ok: inside && missing.length === 0, missing, key: keyKind(), manager: managerKind(), ...more }, { headers: { "cache-control": "no-store" } });
}
