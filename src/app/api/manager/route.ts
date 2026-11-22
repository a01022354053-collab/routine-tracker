// 매니저 대화: 브라우저(web/web.js)가 대화와 도구 목록을 보내면 AI에게 한 번 묻고 답을 돌려준다.
// 도구 실행은 브라우저가 한다(도구가 /api/db로 기록을 읽고 쓴다). 이 서버는 API 키만 지킨다.
// 어떤 AI를 부르나(있는 키 순서): Gemini(GEMINI_API_KEY 또는 AIza… 값, 모델 GEMINI_MODEL 기본 gemini-3.8-flash, 무료 구간)
//   → ChatGPT(OPENAI_API_KEY 또는 sk-… 값, 모델 OPENAI_MODEL 기본 gpt-5.4-mini) → Claude(ANTHROPIC_API_KEY).
// Gemini는 구글의 OpenAI 호환 주소로 같은 openai SDK를 쓴다.
// 브라우저와 주고받는 모양은 하나로 정해 둔다(text · image · tool_use · tool_result 블록). ChatGPT·Gemini와는 여기서 바꿔 준다.
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam, BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import OpenAI from "openai";
import { geminiKey, openaiKey, signedIn, unauthorized } from "@/lib/server";

export const maxDuration = 120;

type Block =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: unknown; extra?: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean }
  | { type: string; [k: string]: unknown };
type Msg = { role: "user" | "assistant"; content: string | Block[] };
type Tool = { name: string; description?: string; input_schema?: Record<string, unknown> };
type Reply = { content: Block[]; stop_reason: string; model: string };

const fail = (status: number, error: string) => Response.json({ error }, { status });
const asText = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v ?? ""));

/* ---------- ChatGPT · Gemini(OpenAI 호환) ---------- */
type Compat = { client: OpenAI; model: string; gemini: boolean };
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";

function compat(): Compat | null {
  const g = geminiKey();
  if (g) return { client: new OpenAI({ apiKey: g, baseURL: process.env.GEMINI_BASE_URL || GEMINI_BASE }), model: process.env.GEMINI_MODEL || "gemini-3.8-flash", gemini: true };
  const o = openaiKey();
  if (o) return { client: new OpenAI({ apiKey: o }), model: process.env.OPENAI_MODEL || "gpt-5.4-mini", gemini: false };
  return null;
}

function toOpenAI(system: string | undefined, messages: Msg[], gemini: boolean) {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (system) out.push(gemini ? { role: "system", content: system } : { role: "developer", content: system });
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push(m.role === "user" ? { role: "user", content: m.content } : { role: "assistant", content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      const text = m.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n\n");
      const calls = m.content
        .filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use")
        .map((b) => ({
          id: b.id,
          type: "function" as const,
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
          // Gemini 3는 도구 호출에 붙여 준 thought signature를 다음 요청에 그대로 돌려받아야 한다
          ...(b.extra ? { extra_content: b.extra } : {}),
        }));
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) } as OpenAI.Chat.ChatCompletionAssistantMessageParam);
      continue;
    }
    // 사용자 차례: 도구 결과는 tool 메시지로, 사진·글은 user 메시지로
    const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];
    for (const b of m.content) {
      if (b.type === "tool_result") {
        const r = b as Extract<Block, { type: "tool_result" }>;
        out.push({ role: "tool", tool_call_id: r.tool_use_id, content: asText(r.content) });
      } else if (b.type === "image") {
        const s = (b as Extract<Block, { type: "image" }>).source;
        parts.push({ type: "image_url", image_url: { url: `data:${s.media_type};base64,${s.data}` } });
      } else if (b.type === "text") {
        parts.push({ type: "text", text: (b as Extract<Block, { type: "text" }>).text });
      }
    }
    if (parts.length) out.push({ role: "user", content: parts });
  }
  return out;
}

async function askCompat({ client, model, gemini }: Compat, system: string | undefined, messages: Msg[], tools: Tool[]): Promise<Reply> {
  const res = await client.chat.completions.create({
    model,
    messages: toOpenAI(system, messages, gemini),
    ...(gemini ? {} : { max_completion_tokens: 16000 }),
    reasoning_effort: "low",
    ...(tools.length
      ? {
          tools: tools.map((t) => ({
            type: "function" as const,
            function: { name: t.name, description: t.description ?? "", parameters: t.input_schema ?? { type: "object", properties: {} } },
          })),
        }
      : {}),
  });
  const choice = res.choices[0];
  const msg = choice?.message;
  const content: Block[] = [];
  const text = msg?.content || msg?.refusal || "";
  if (text) content.push({ type: "text", text });
  for (const [i, c] of (msg?.tool_calls ?? []).entries()) {
    if (c.type !== "function") continue;
    const extra = (c as unknown as { extra_content?: unknown }).extra_content;
    let input: unknown = {};
    try {
      input = JSON.parse(c.function.arguments || "{}");
    } catch {
      input = { _invalidArguments: c.function.arguments };
    }
    content.push({ type: "tool_use", id: c.id || `call_${Date.now()}_${i}`, name: c.function.name, input, ...(extra ? { extra } : {}) });
  }
  const usesTools = content.some((b) => b.type === "tool_use");
  const stop = usesTools ? "tool_use" : choice?.finish_reason === "length" ? "max_tokens" : "end_turn";
  return { content, stop_reason: stop, model: res.model };
}

/* ---------- Claude ---------- */
async function askClaude(system: string | undefined, messages: Msg[], tools: Tool[]): Promise<Reply> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    // 모델이 거절하면 서버에서 같은 요청을 다른 모델로 이어서 답한다
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    ...(system ? { system: [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }] } : {}),
    ...(tools.length ? { tools: tools as BetaTool[] } : {}),
    messages: messages as BetaMessageParam[],
  });
  return { content: response.content as Block[], stop_reason: response.stop_reason ?? "end_turn", model: response.model };
}

export async function POST(request: Request) {
  if (!(await signedIn())) return unauthorized();
  const ai = compat();
  if (!ai && !process.env.ANTHROPIC_API_KEY) return fail(503, "매니저 열쇠(GEMINI_API_KEY)가 없어요");

  let body: { system?: unknown; messages?: unknown; tools?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "잘못된 요청이에요");
  }
  const messages = body.messages as Msg[];
  if (!Array.isArray(messages) || !messages.length) return fail(400, "대화가 비었어요");
  const tools = (Array.isArray(body.tools) ? body.tools : []) as Tool[];
  const system = typeof body.system === "string" && body.system ? body.system : undefined;

  try {
    return Response.json(ai ? await askCompat(ai, system, messages, tools) : await askClaude(system, messages, tools));
  } catch (error) {
    // OpenAI가 알려 준 이유(code/type)를 붙여서 무엇이 문제인지 보이게 한다(키 값은 들어 있지 않다)
    if (error instanceof OpenAI.APIError) {
      const why = [error.code, error.type].filter(Boolean).join(" / ");
      console.error("openai error", error.status, why, error.message);
      const name = geminiKey() ? "Gemini" : "ChatGPT";
      if (error.code === "insufficient_quota" || error.type === "insufficient_quota") return fail(402, "OpenAI 크레딧이 없어요. platform.openai.com → Billing에서 충전해 주세요");
      if (geminiKey() && error instanceof OpenAI.RateLimitError) return fail(429, `Gemini 무료 사용량을 다 썼어요. 잠시 뒤(하루 한도면 내일) 다시 말해 주세요 (${why || "429"})`);
      if (error instanceof OpenAI.RateLimitError) return fail(429, `잠시 후 다시 말해 주세요 (${why || "rate limit"})`);
      if (error instanceof OpenAI.AuthenticationError) return fail(503, `${name} 키가 맞지 않아요`);
      if (error instanceof OpenAI.NotFoundError || error instanceof OpenAI.PermissionDeniedError) return fail(502, `이 키로는 ${compat()?.model} 모델을 쓸 수 없어요 (${why || error.status})`);
      if (error instanceof OpenAI.BadRequestError) return fail(400, error.message);
      return fail(502, `${name} 서버 오류 (${error.status ?? "연결"}${why ? `, ${why}` : ""})`);
    }
    if (error instanceof Anthropic.RateLimitError) return fail(429, "잠시 후 다시 말해 주세요");
    if (error instanceof Anthropic.AuthenticationError) return fail(503, "API 키가 맞지 않아요");
    if (error instanceof Anthropic.BadRequestError) return fail(400, error.message);
    if (error instanceof Anthropic.APIError) return fail(502, `매니저 서버 오류 (${error.status ?? "연결"})`);
    throw error;
  }
}
