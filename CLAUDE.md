# 일상 매니저

사용자의 하루를 기록하는 개인 앱. Claude는 사용자의 **일상 매니저**다.

## 어디서 돌아가나
같은 화면 코드(`artifact/`)가 두 곳에서 돈다. 기록은 두 곳이 따로 가진다(구조는 같다).
- **웹** https://leeseung06.kro.kr — 사용자 한 사람만 쓰는 사이트(가입·이메일 없음). Vercel이 `main` 브랜치를 빌드한다(Next.js 16, `node_modules/next/dist/docs/`를 먼저 읽을 것). 들어가기 = 비밀번호 하나(Vercel 환경 변수 `APP_PASSWORD`), 맞추면 1년짜리 httpOnly 쿠키, 8번 틀리면 10분 잠김. 기록은 Supabase 표 `daily_docs`(`supabase/schema.sql`, RLS 켜고 정책 없음 → 브라우저는 못 붙고 서버만 비밀 키로). Vercel 환경 변수: `APP_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`(또는 `SUPABASE_URL`), `SUPABASE_SECRET_KEY`(또는 `SUPABASE_SERVICE_ROLE_KEY`), 매니저용 ChatGPT 키(`OPENAI_API_KEY`, 다른 이름으로 넣어도 값이 `sk-`로 시작하면 서버가 찾는다 — `src/lib/server.ts` `openaiKey`. 모델은 `OPENAI_MODEL`, 기본 gpt-5.4-mini) — 없고 `ANTHROPIC_API_KEY`가 있으면 Claude.
- **Claude 아티팩트**(비공개, 사용자만 열 수 있음): https://claude.ai/artifact/GAtreHbyjVG2J54DC15riv — 기록은 아티팩트 저장소(db). 직접 읽거나 고칠 때는 `ArtifactData` 도구(사용자가 부탁할 때만).
- 아티팩트 기록을 웹으로 옮길 때: 저장소 화면 '내려받기'(또는 `ArtifactData`로 모은 같은 모양 JSON) → 웹 저장소 화면 '백업 불러오기'. 같은 경로에 다른 기록이 있으면 덮어쓰기 전 내용을 `restored/<시각>`에 남긴다.
- 루트 `index.html`은 예전 GitHub Pages용으로 아티팩트로 넘겨주는 페이지다.
- 사용자는 앱에서 직접 체크하고, 감사한 점·운동·잔액을 적고, 앱 안의 매니저로 기록을 넣는다. 이 저장소에서는 코딩만 한다.

## 코드
- 화면(두 곳 공통): `artifact/index.html` 본문(doctype/head/body 없이 쓴다). `artifact/assets/app.js` 화면·저장·매니저 도구, `artifact/assets/fx.js` 배경 애니메이션, `artifact/assets/style.css`. 루트에 `app/` 폴더를 만들면 Next.js가 `src/app`을 무시하니 만들지 않는다.
- 웹 전용: `web/web.js`는 `window.claude`가 없을 때(웹) 같은 모양의 `window.claude`를 만든다 — db → `/api/db`(문서 경로 = `path`, 컬렉션 = `col`, 화면 복귀·30초마다 다시 읽기, 지우기 없음), sample → `/api/manager`(도구는 브라우저가 실행, 최대 8번 왕복, 사진은 줄여서 JPEG), downloads → 브라우저 내려받기. 비밀번호 화면(401이면 다시 묻고 이어서 함), 백업 불러오기(`window.__webRestore`), 로그아웃(`window.__webSignOut`)도 여기. `web/web.css`는 비밀번호 화면. app.js에서 웹에서만 할 일은 `window.__webMode`로 가른다(저장소 화면의 불러오기·로그아웃, 돈 관리 화면을 열면 `/api/quote`로 시세 갱신 10분에 한 번).
- 서버(`src/lib/server.ts`에 쿠키 서명·Supabase 연결): `api/session`(들어와 있는지, 빠진 환경 변수 이름), `api/login`·`api/logout`, `api/db`(기록 읽기·쓰기, `_`로 시작하는 경로는 막음 — `_auth/login`은 틀린 횟수), `api/quote`(네이버 시세, `tools/stock-quote.sh`와 같은 규칙), `api/manager`(`OPENAI_API_KEY`가 있으면 `openai` SDK로 ChatGPT, 아니면 `@anthropic-ai/sdk`로 Claude. 브라우저와는 text·image·tool_use·tool_result 블록 모양으로 주고받고, ChatGPT와는 서버에서 바꿔 준다). 모두 쿠키가 있어야 한다.
- 웹 빌드: `npm run build`/`npm run dev` 전에 `tools/build-web.mjs`가 `artifact/`를 `public/`(index.html·assets·private·web·vendor, .gitignore)로 옮기고 본문을 완전한 HTML로 감싼다. `/`는 `next.config.ts` rewrite로 `public/index.html`. 글꼴은 `artifact/fonts/`가 있으면 그것, 없으면(Vercel) CDN(Pretendard·Tossface jsDelivr).
- 글꼴은 `tools/fetch-fonts.sh`로 `artifact/fonts/`에 받는다(저장소에 넣지 않음). 아티팩트에는 이미 올라가 있어서, 코드만 고쳤으면 바뀐 파일만 `files`로 다시 올리면 된다.
- 아티팩트 다시 올리기: Artifact 도구로 `file_path: artifact/index.html`, `url`은 위 주소, 바뀐 파일만 `files`에 (예: `{"assets/app.js": "artifact/assets/app.js"}`). `capabilities`는 생략해서 그대로 둔다(지금: db 규칙 소유자만 읽기·쓰기, sample(사진 포함), downloads). 웹은 `main`에 올리면 Vercel이 다시 배포한다.
- 화면: `#today` 오늘 루틴(달력 + 고른 날의 할 일 카드, 가로로 넘김) · `#archive` 저장소(달별 달성률, 날짜별 기록) · `#money` 돈 관리 · `#fixed` 고정 지출 · `#items` 내 물건(자주 쓰는 물건과 가격, 사진 있는 건 입체 카드, '다 떨어졌어요'로 살 것에 넣기) · `#shopping` 필요한 물건(살 것을 글로, 묶음별, 체크하면 산 것). 컴퓨터(960px 이상)에서는 두 칸으로 넓게.
- 할 일 정하기: 오늘을 보고 있으면 '내일 할 일' 칸이 늘 보인다(폰이 없는 날을 위해 전날 미리 정함). '+ 할 일 추가' 카드(날짜·종류·이름·아이콘·시간·양, 자주 하는 할 일, '넣고 하나 더'), '오늘 목록 그대로 가져오기', '고치기' 모드(눌러서 이름·시간 고치기, 빼기 = 숨김). 고친 할 일은 예전 값을 `history`에 남긴다.
- 돈 관리는 이 화면만 토스 다크 모드 디자인(납작한 카드 `--t-*` 색, 토스 파랑, Pretendard 큰 숫자, '~했어요' 문장). 입력은 모두 수동. 내 자산(잔액 입력·내역 추가) → 계좌(누르면 토스식 계좌 상세: 잔액, 이 통장 내역, 잔액 기록) → 월급날 → 이번 달 소비(지난달 같은 기간과 비교, 예산 65만원 대비, 분류별) → 그 달 입출금 내역. 은행 자동 연결은 불가(오픈뱅킹·마이데이터는 허가받은 사업자 전용)라서, '은행 앱 캡처로 넣기'로 사진을 매니저에게 보내면 잔액·거래를 읽어 넣는다.
- 돈 관리 구성: 내 자산(쓸 수 있는 돈=농협+신한, 따로 모으는 돈=카카오뱅크, 군적금, 주식) → 계좌 → 군적금 저금통(병 두 개가 차오름, 매달 10일 IBK 30만·신한 25만 자동 입금 기록, 만기=넣은 돈×2 정부 100% 매칭·이자 별도) → 주식 표(산 가격·지금 가격·전일 대비·손익, 한국식으로 이익 빨강·손실 파랑) → 나라사랑카드(입체 카드 `artifact/private/card-narasarang.png`, 카드 사용 = `method: 'card'` 지출, 이번 달 정리) → 월급날 → 소비 → 내역.
- 계좌 이체: 내 통장끼리 실제로 옮긴 돈을 숫자만 옮긴다(소비·수입 아님). 계좌 줄의 '이체' 버튼이나 내 자산의 '이체'. 이체 기록을 누르면 취소(잔액 원상복구, 기록은 removed로 남김).
- 주식 시세(웹): 돈 관리 화면을 열면 `/api/quote`로 받아 `stocks/main`을 갱신한다(10분에 한 번, 가격이 바뀔 때만 history에 쌓음).
- 주식 시세(아티팩트): 아티팩트는 바깥에 접속할 수 없어서, 예약 작업 '일상 매니저 주식 시세 갱신'(trig_01Kr3EFGi9EueK6q3P2RtCWL, 평일 KST 9:47·11:47·13:47·15:47)이 새 세션에서 시세를 받아 `ArtifactData`로 `stocks/main`의 holdings[].price·priceAt·quote·history를 갱신한다. 손으로 할 때는 `bash tools/stock-quote.sh 005930`. 토스증권과 같은 거래소 가격으로, 정규장과 넥스트레이드 시간외 중 더 최근 체결가를 쓴다(토스증권 내부 API는 로그인 브라우저 전용이라 못 씀). history는 지우지 않는다.
- 이미지: `artifact/private/card-narasarang.png`(나라사랑카드 견본 디자인), `bank-{nh,kakao,shinhan}.png`(은행 아이콘, 동그랗게 표시), `item-*.png`(상품 사진). 개인 정보가 없는 공개 이미지라 웹 배포를 위해 저장소에 넣었다. 사용자 개인 사진이나 개인 정보가 담긴 이미지는 저장소에 넣지 않는다.
- 매니저: 오른쪽 아래 동그라미(✦)를 누르면 지금 화면 위로 대화창이 열린다(휴대폰은 아래에서 올라오고, 컴퓨터는 오른쪽 아래에 뜬다). 메뉴의 '매니저와 대화'도 같은 창을 연다.
- 디자인: 밤하늘 게임 월드. 남색 배경, 팝 네온, 유리 패널, 숫자는 Unbounded, 한글은 Pretendard, 이모지는 Tossface. 군더더기 문구를 넣지 않는다.

## 저장소(db) 구조 — 규칙: 소유자만 읽고 쓴다
**기록은 절대 지우지 않는다.** 지울 때는 `removed: true`, `removedAt`을 붙여 숨기고, 고칠 때는 예전 값을 `history`에 남긴다. 문서도 지우지 않는다.
- `days/<YYYY-MM-DD>`: `{ date, todos: [{ id, emoji, title, minutes?, amount?, done, kind?, note?, items?, removed? }] }`
  - `kind`: 없음(일반) · `dev`(사이트 개발, `note`=무엇을 할지) · `workout`(운동, 부위는 `workout/`에서) · `thanks`(감사한 점 3개, `items`)
- `workout/<YYYY-MM-DD>`: `{ date, part, plan }` — 없으면 주간 루틴의 그 요일 부위
- `settings/main`: `{ split: { "0": "하체", "1": "등", "2": "가슴", "3": "하체", "4": "휴식", "5": "등", "6": "가슴" } }` (0=일요일)
- `money/main`: `{ payday: 10, savings: 550000, spend: 650000, balances: { nh, kakao, shinhan }, balanceAt: { nh, ... } }` — 지금 잔액과 넣은 시각
- `balhist/<YYYY-MM>`: `{ month, items: [{ at, bank, amount }] }` — 잔액이 바뀔 때마다 쌓임
- `spend/<YYYY-MM>`: `{ month, items: [{ id, date, amount, title, type?, cat?, bank?, at, history?, removed? }] }` — 입출금 내역. `type: 'in'`이면 들어온 돈, 없으면 나간 돈. `cat`: food·snack·life·move·shop·phone·fun·etc. bank: nh·kakao·shinhan·cash
- `chatlog/<YYYY-MM-DD>`: `{ date, messages: [{ role, content, at, actions? }] }` — 매니저와 나눈 대화 전부
- `log/<YYYY-MM-DD>`: `{ date, entries: [{ at, text }] }` — 체크, 감사한 점, 메모, 운동, 잔액, 지출, 매니저가 한 일까지 바꾼 것 전부
- `savings/main`: `{ payday, lastMonth: 'YYYY-MM'(마지막 입금 달), lastMonthGuess?, match: 1, accounts: [{ id, name, short, color, monthly, initial, asOf, deposits: [{ month, date, amount, auto, at }], history? }] }` — 잔액 = initial + deposits. 앱을 열면 지난 월급날 입금을 달마다 한 번씩 저절로 기록한다
- `stocks/main`: `{ holdings: [{ id, name, code?, qty, avg, price, priceAt, quote?: { price, change, rate, open, high, low, status, tradedAt, fetchedAt }, history: [{ at, price }], changes? }] }`
- `transfers/<YYYY-MM>`: `{ month, items: [{ id, date, at, from, to, amount, memo?, removed? }] }` — 통장끼리 옮긴 기록
- `items/main`: `{ list: [{ id, name, sub, price, image?, emoji?, at, history?, removed? }] }` — 내 물건. 사진은 아티팩트의 `private/item-*.png`(저장소에는 넣지 않음)
- `shopping/main`: `{ list: [{ id, name, option, price, qty, group, done, doneAt?, fromItem?, at, history?, removed? }] }` — 필요한 물건
- `chat/log`: 예전 대화 문서(날짜별 `chatlog`로 옮겨졌고 `migrated: true`). 지우지 않고 둔다
- 저장소 화면의 '전체 기록 내려받기'는 위 전부를 JSON 한 파일로 준다(`downloads` 기능)
- 처음 넣은 기록은 `tools/seed.json`

## 규칙
- 감사한 점은 그날 자정 전까지만 적을 수 있고, 지나면 '탈락'으로 보인다. 다른 할 일은 지난 날도 체크할 수 있다(금요일은 폰을 내서 다음 날 체크).
- 달성률: 하루는 완료 비율, 한 달은 오늘까지 할 일이 있던 날들의 평균.
- XP: 끝낸 할 일은 걸린 분만큼(시간 없으면 30). 500 XP마다 레벨 업. 🔥는 연속 ALL CLEAR 일수.
- 돈: 월급날 매달 10일, 적금 55만원 자동이체, 실제로 쓰는 돈은 한 달 65만원. 통장은 농협, 카카오뱅크, 신한.
- 운동 루틴(체단): 금 등, 토 가슴, 일 하체, 월 등, 화 가슴, 수 하체, 목 휴식.
