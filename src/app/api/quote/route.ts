// 국내 종목 시세(네이버 증권 공개 시세). tools/stock-quote.sh와 같은 규칙:
// 토스증권처럼 정규장(KRX)과 넥스트레이드(NXT) 시간외 중 더 최근 체결가를 '지금 가격'으로 쓴다.
// GET /api/quote?codes=005930,000660 → { quotes: { "005930": { price, change, rate, ... } } }
import type { NextRequest } from "next/server";
import { signedIn, unauthorized } from "@/lib/server";

type Quote = {
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  rate: number;
  open: number | null;
  high: number | null;
  low: number | null;
  status: string | null;
  session: string;
  tradedAt: string | null;
  fetchedAt: string;
};

type NaverStock = {
  itemCode: string;
  stockName: string;
  closePrice: string;
  compareToPreviousClosePrice: string;
  fluctuationsRatio: string;
  openPrice?: string;
  highPrice?: string;
  lowPrice?: string;
  marketStatus?: string;
  localTradedAt?: string;
  overMarketPriceInfo?: {
    overPrice?: string;
    compareToPreviousClosePrice?: string;
    fluctuationsRatio?: string;
    overMarketStatus?: string;
    tradingSessionType?: string;
    localTradedAt?: string;
  } | null;
};

const num = (s: string | undefined | null) => (s == null || s === "" ? null : Number(String(s).replace(/,/g, "")));
const SESSION: Record<string, string> = { PRE_MARKET: "프리마켓", AFTER_MARKET: "애프터마켓" };

async function quote(code: string): Promise<Quote | null> {
  const res = await fetch(`https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const d = ((await res.json()) as { datas?: NaverStock[] }).datas?.[0];
  if (!d) return null;
  const q: Quote = {
    code: d.itemCode,
    name: d.stockName,
    price: num(d.closePrice),
    change: num(d.compareToPreviousClosePrice),
    rate: Number(d.fluctuationsRatio),
    open: num(d.openPrice),
    high: num(d.highPrice),
    low: num(d.lowPrice),
    status: d.marketStatus ?? null,
    session: "정규장",
    tradedAt: d.localTradedAt ?? null,
    fetchedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  };
  const o = d.overMarketPriceInfo;
  if (o?.overPrice && (o.overMarketStatus === "OPEN" || String(o.localTradedAt ?? "").slice(0, 19) > String(q.tradedAt ?? "").slice(0, 19))) {
    q.price = num(o.overPrice);
    q.change = num(o.compareToPreviousClosePrice);
    q.rate = Number(o.fluctuationsRatio || 0);
    q.status = o.overMarketStatus ?? null;
    q.session = SESSION[o.tradingSessionType ?? ""] ?? "시간외";
    q.tradedAt = `${String(o.localTradedAt).slice(0, 19)}+09:00`;
  }
  return q;
}

export async function GET(request: NextRequest) {
  if (!(await signedIn())) return unauthorized();
  const codes = [...new Set((request.nextUrl.searchParams.get("codes") ?? "").split(",").filter((c) => /^\d{6}$/.test(c)))].slice(0, 20);
  if (!codes.length) return Response.json({ error: "codes=005930 처럼 종목코드를 주세요" }, { status: 400 });
  const results = await Promise.all(codes.map((c) => quote(c).catch(() => null)));
  const quotes: Record<string, Quote> = {};
  results.forEach((q, i) => {
    if (q) quotes[codes[i]] = q;
  });
  return Response.json({ quotes }, { headers: { "cache-control": "no-store" } });
}
