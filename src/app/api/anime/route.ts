// 애니 찾기: 마이애니리스트(MAL) 사이트의 검색(자동완성)으로 이름·종류·연도·썸네일을 받는다.
// GET /api/anime?q=Sousou no Frieren → { results: [{ malId, name, type, year, image, url }] }
import type { NextRequest } from "next/server";
import { signedIn, unauthorized } from "@/lib/server";

type Item = {
  id: number;
  name: string;
  url: string;
  image_url: string;
  payload?: { media_type?: string; start_year?: number };
};

export async function GET(request: NextRequest) {
  if (!(await signedIn())) return unauthorized();
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return Response.json({ error: "찾을 이름을 두 글자 넘게 넣어 주세요" }, { status: 400 });
  const res = await fetch(`https://myanimelist.net/search/prefix.json?type=anime&v=1&keyword=${encodeURIComponent(q)}`, {
    headers: { "user-agent": "Mozilla/5.0 (daily-manager)", accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!res?.ok) return Response.json({ error: "마이애니리스트에 연결하지 못했어요" }, { status: 502 });
  const items = ((await res.json()) as { categories?: { items?: Item[] }[] }).categories?.[0]?.items ?? [];
  const results = items.map((x) => ({
    malId: x.id,
    name: x.name,
    type: x.payload?.media_type ?? null,
    year: x.payload?.start_year ?? null,
    // 검색 결과의 작은 썸네일(/r/116x180/…) 대신 원본 크기 주소
    image: x.image_url ? x.image_url.split("?")[0].replace(/\/r\/\d+x\d+/, "") : null,
    url: x.url,
  }));
  return Response.json({ results }, { headers: { "cache-control": "no-store" } });
}
