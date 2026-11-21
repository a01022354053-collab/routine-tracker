// 들어와 있는지, 설정이 다 됐는지(빠진 환경 변수 이름만 알려 준다)
import { missingEnv, signedIn } from "@/lib/server";

export async function GET() {
  const inside = await signedIn(); // 쿠키를 읽으므로 요청마다 새로 답한다
  const missing = missingEnv();
  return Response.json({ ok: inside && missing.length === 0, missing }, { headers: { "cache-control": "no-store" } });
}
