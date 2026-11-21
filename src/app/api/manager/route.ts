// 매니저 대화: 브라우저(web/web.js)가 대화와 도구 목록을 보내면 Claude에게 한 번 묻고 답을 그대로 돌려준다.
// 도구 실행은 브라우저가 한다(도구가 /api/db로 기록을 읽고 쓴다). 이 서버는 API 키만 지킨다.
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam, BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { signedIn, unauthorized } from "@/lib/server";

export const maxDuration = 120;

type Body = {
  system?: unknown;
  messages?: unknown;
  tools?: unknown;
};

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  if (!(await signedIn())) return unauthorized();
  if (!process.env.ANTHROPIC_API_KEY) return fail(503, "ANTHROPIC_API_KEY가 설정되지 않았어요");

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return fail(400, "잘못된 요청이에요");
  }
  const messages = body.messages as BetaMessageParam[];
  if (!Array.isArray(messages) || !messages.length) return fail(400, "대화가 비었어요");
  const tools = (Array.isArray(body.tools) ? body.tools : []) as BetaTool[];
  const system = typeof body.system === "string" && body.system ? body.system : undefined;

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // 모델이 거절하면 서버에서 같은 요청을 다른 모델로 이어서 답한다
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      ...(system ? { system: [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }] } : {}),
      ...(tools.length ? { tools } : {}),
      messages,
    });
    return Response.json({ content: response.content, stop_reason: response.stop_reason, model: response.model });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return fail(429, "잠시 후 다시 말해 주세요");
    if (error instanceof Anthropic.AuthenticationError) return fail(503, "ANTHROPIC_API_KEY가 맞지 않아요");
    if (error instanceof Anthropic.BadRequestError) return fail(400, error.message);
    if (error instanceof Anthropic.APIError) return fail(502, `매니저 서버 오류 (${error.status ?? "연결"})`);
    throw error;
  }
}
