#!/usr/bin/env bash
# 네이버 증권에서 국내 종목 시세를 받아 한 줄 JSON으로 출력한다.
# 사용: bash tools/stock-quote.sh 005930 [다른 종목코드 ...]
# 출력: {"code","name","price","change","rate","open","high","low","status","tradedAt","fetchedAt"}
set -euo pipefail
for code in "$@"; do
  curl -sS --max-time 20 "https://polling.finance.naver.com/api/realtime/domestic/stock/${code}" \
  | python3 -c '
import json, sys, datetime
d = json.load(sys.stdin)["datas"][0]
num = lambda s: int(str(s).replace(",", "")) if s not in (None, "") else None
print(json.dumps({
  "code": d["itemCode"], "name": d["stockName"],
  "price": num(d["closePrice"]), "change": num(d["compareToPreviousClosePrice"]),
  "rate": float(d["fluctuationsRatio"]), "open": num(d.get("openPrice")), "high": num(d.get("highPrice")), "low": num(d.get("lowPrice")),
  "status": d.get("marketStatus"), "tradedAt": d.get("localTradedAt"),
  "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
}, ensure_ascii=False))'
done
