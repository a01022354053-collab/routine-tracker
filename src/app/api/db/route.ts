// 기록 저장소. 브라우저(web/web.js)는 Supabase에 직접 붙지 않고 이 주소로만 읽고 쓴다.
//   GET  ?path=days/2026-11-21                    → { doc: { path, data } | null }
//   GET  ?col=chatlog&where=[["date",">=","2026-11-01"]] → { docs: [...] }
//   GET  ?all=1                                   → { docs: [...] } (백업 불러오기에서 겹치는지 볼 때)
//   POST { path, data } 또는 { rows: [{ path, data }] } → 덮어쓰기(upsert)
// 기록은 지우지 않으므로 DELETE는 없다.
import type { NextRequest } from "next/server";
import { TABLE, db, signedIn, unauthorized } from "@/lib/server";

const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const okPath = (p: unknown): p is string => {
  if (typeof p !== "string" || p.startsWith("_")) return false;
  const parts = p.split("/");
  return parts.length >= 2 && parts.length % 2 === 0 && parts.every((s) => SEG.test(s) && s !== "." && s !== "..");
};
const okCol = (c: string | null): c is string => !!c && !c.startsWith("_") && c.split("/").every((s) => SEG.test(s));
const colOf = (p: string) => p.split("/").slice(0, -1).join("/");

const OPS = { "==": "eq", "!=": "neq", "<": "lt", "<=": "lte", ">": "gt", ">=": "gte" } as const;
type Op = keyof typeof OPS;
const PAGE = 1000;

const fail = (status: number, error: string) => Response.json({ error }, { status });

type Row = { path: string; data: unknown };

export async function GET(request: NextRequest) {
  if (!(await signedIn())) return unauthorized();
  const q = request.nextUrl.searchParams;
  const sb = db();

  const path = q.get("path");
  if (path) {
    if (!okPath(path)) return fail(400, "잘못된 경로예요");
    const { data, error } = await sb.from(TABLE).select("path,data").eq("path", path).maybeSingle();
    if (error) return fail(502, error.message);
    return Response.json({ doc: data ?? null }, { headers: { "cache-control": "no-store" } });
  }

  const col = q.get("col");
  const all = q.get("all") === "1";
  if (!all && !okCol(col)) return fail(400, "잘못된 컬렉션이에요");
  let where: [string, Op, string | number][] = [];
  try {
    where = JSON.parse(q.get("where") || "[]");
  } catch {
    return fail(400, "잘못된 조건이에요");
  }
  if (!Array.isArray(where) || where.some((w) => !Array.isArray(w) || !SEG.test(String(w[0])) || !(w[1] in OPS))) return fail(400, "잘못된 조건이에요");

  const docs: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = sb.from(TABLE).select("path,data").order("path").range(from, from + PAGE - 1);
    query = all ? query.neq("col", "_auth") : query.eq("col", col!);
    for (const [field, op, value] of where) query = query.filter(`data->>${field}`, OPS[op], String(value));
    const { data, error } = await query;
    if (error) return fail(502, error.message);
    docs.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) break;
  }
  return Response.json({ docs }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await signedIn())) return unauthorized();
  let body: { path?: unknown; data?: unknown; rows?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "잘못된 요청이에요");
  }
  const rows = (Array.isArray(body.rows) ? body.rows : [{ path: body.path, data: body.data }]) as Row[];
  if (!rows.length || rows.length > 500) return fail(400, "한 번에 1~500개까지 넣을 수 있어요");
  for (const r of rows) {
    if (!okPath(r.path)) return fail(400, `잘못된 경로예요: ${String(r.path)}`);
    if (!r.data || typeof r.data !== "object" || Array.isArray(r.data)) return fail(400, "기록은 객체여야 해요");
  }
  const at = new Date().toISOString();
  const { error } = await db()
    .from(TABLE)
    .upsert(rows.map((r) => ({ path: r.path, col: colOf(r.path), data: r.data, updated_at: at })), { onConflict: "path" });
  if (error) return fail(502, error.message);
  return Response.json({ ok: true, count: rows.length });
}
