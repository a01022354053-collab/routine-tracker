#!/usr/bin/env bash
# 국내 종목 시세를 한 줄 JSON으로 출력한다(네이버 증권 공개 시세).
# 토스증권처럼 정규장(KRX)과 넥스트레이드(NXT) 시간외 중 더 최근 체결가를 '지금 가격'으로 쓴다.
# 사용: bash tools/stock-quote.sh 005930 [다른 종목코드 ...]
# 출력: {"code","name","price","change","rate","open","high","low","status","session","tradedAt","fetchedAt"}
set -euo pipefail
for code in "$@"; do
  curl -sS --max-time 20 "https://polling.finance.naver.com/api/realtime/domestic/stock/${code}" \
  | python3 -c '
import json, sys, datetime
d = json.load(sys.stdin)["datas"][0]
num = lambda s: int(str(s).replace(",", "")) if s not in (None, "") else None
q = {"price": num(d["closePrice"]), "change": num(d["compareToPreviousClosePrice"]), "rate": float(d["fluctuationsRatio"]),
     "open": num(d.get("openPrice")), "high": num(d.get("highPrice")), "low": num(d.get("lowPrice")),
     "status": d.get("marketStatus"), "session": "정규장", "tradedAt": d.get("localTradedAt")}
o = d.get("overMarketPriceInfo") or {}
if o.get("overPrice") and (o.get("overMarketStatus") == "OPEN" or str(o.get("localTradedAt", ""))[:19] > str(q["tradedAt"] or "")[:19]):
    q.update({"price": num(o["overPrice"]), "change": num(o.get("compareToPreviousClosePrice")), "rate": float(o.get("fluctuationsRatio") or 0),
              "status": o.get("overMarketStatus"), "session": {"PRE_MARKET": "프리마켓", "AFTER_MARKET": "애프터마켓"}.get(o.get("tradingSessionType"), "시간외"),
              "tradedAt": str(o.get("localTradedAt"))[:19] + "+09:00"})
q.update({"code": d["itemCode"], "name": d["stockName"],
          "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")})
print(json.dumps(q, ensure_ascii=False))'
done
