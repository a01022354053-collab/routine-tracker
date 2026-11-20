#!/usr/bin/env bash
# 아티팩트에 함께 올리는 글꼴 파일을 app/fonts/에 받아 둔다 (저장소에는 넣지 않음).
# Pretendard 1.3.9 (SIL OFL 1.1), Tossface v1.6.1 (토스페이스 라이선스: 원본 재배포 시 라이선스 동봉)
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p app/fonts/tossface
(cd "$tmp" && npm pack pretendard@1.3.9 --silent >/dev/null && tar xzf pretendard-1.3.9.tgz)
cp "$tmp/package/dist/web/variable/woff2/PretendardVariable.woff2" app/fonts/
cp "$tmp/package/dist/LICENSE.txt" app/fonts/Pretendard-LICENSE.txt
git clone -q --depth 1 --branch v1.6.1 --filter=blob:none --sparse https://github.com/toss/tossface "$tmp/tossface"
(cd "$tmp/tossface" && git sparse-checkout set dist >/dev/null)
cp "$tmp/tossface/dist/"TossFaceFontMac-*.woff2 app/fonts/tossface/
cp "$tmp/tossface/LICENSE" app/fonts/tossface/LICENSE.txt
# woff2만 쓰도록 CSS를 고쳐 둔다 (woff 대체 경로 줄을 지운다)
python3 - "$tmp/tossface/dist/tossface.css" app/fonts/tossface/tossface.css <<'PY'
import re, sys
css = open(sys.argv[1]).read()
css = re.sub(r'format\("woff2"\),\s*url\("[^"]+\.woff"\) format\("woff"\);', 'format("woff2");', css)
open(sys.argv[2], 'w').write(css)
PY
echo "fonts ready in app/fonts"
