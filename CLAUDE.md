# 일상 매니저

사용자의 하루를 기록하는 개인 앱. Claude는 사용자의 **일상 매니저**다.

## 어디서 돌아가나
- 앱 본체는 Claude 아티팩트(비공개, 사용자만 열 수 있음): https://claude.ai/artifact/GAtreHbyjVG2J54DC15riv
- GitHub Pages(`claude/adoring-shannon-8ncj2s` 브랜치 루트)의 `index.html`은 위 아티팩트로 넘겨주는 페이지일 뿐이다.
- 기록은 아티팩트 저장소(db)에 있다. 사용자는 앱에서 직접 체크하고, 감사한 점·운동·잔액을 적고, 앱 안의 '매니저와 대화'로 기록을 넣는다. 이 저장소에서는 코딩만 한다.
- 기록을 직접 읽거나 고칠 때는 `ArtifactData` 도구를 쓴다(사용자가 부탁할 때만).

## 코드
- `app/index.html` 아티팩트 본문(doctype/head/body 없이 쓴다). `app/assets/app.js` 화면·저장·매니저 도구, `app/assets/fx.js` 배경 애니메이션, `app/assets/style.css`.
- 글꼴은 `tools/fetch-fonts.sh`로 `app/fonts/`에 받는다(저장소에 넣지 않음). 아티팩트에는 이미 올라가 있어서, 코드만 고쳤으면 바뀐 파일만 `files`로 다시 올리면 된다.
- 다시 올리기: Artifact 도구로 `file_path: app/index.html`, `url`은 위 주소, 바뀐 파일만 `files`에 (예: `{"assets/app.js": "app/assets/app.js"}`). `capabilities`는 생략해서 그대로 둔다(지금: db 규칙 소유자만 읽기·쓰기, sample(사진 포함), downloads).
- 화면: `#today` 오늘 루틴(달력 + 고른 날의 할 일 카드, 가로로 넘김) · `#archive` 저장소(달별 달성률, 날짜별 기록) · `#money` 돈 관리 · `#fixed` 고정 지출 · `#items` 내 물건 · `#shopping` 필요한 물건(마지막 둘은 빈 화면). 컴퓨터(960px 이상)에서는 두 칸으로 넓게.
- 할 일 정하기: 오늘을 보고 있으면 '내일 할 일' 칸이 늘 보인다(폰이 없는 날을 위해 전날 미리 정함). '+ 할 일 추가' 카드(날짜·종류·이름·아이콘·시간·양, 자주 하는 할 일, '넣고 하나 더'), '오늘 목록 그대로 가져오기', '고치기' 모드(눌러서 이름·시간 고치기, 빼기 = 숨김). 고친 할 일은 예전 값을 `history`에 남긴다.
- 돈 관리는 이 화면만 토스 다크 모드 디자인(납작한 카드 `--t-*` 색, 토스 파랑, Pretendard 큰 숫자, '~했어요' 문장). 입력은 모두 수동. 내 자산(잔액 입력·내역 추가) → 계좌(누르면 토스식 계좌 상세: 잔액, 이 통장 내역, 잔액 기록) → 월급날 → 이번 달 소비(지난달 같은 기간과 비교, 예산 65만원 대비, 분류별) → 그 달 입출금 내역. 은행 자동 연결은 불가(오픈뱅킹·마이데이터는 허가받은 사업자 전용)라서, '은행 앱 캡처로 넣기'로 사진을 매니저에게 보내면 잔액·거래를 읽어 넣는다.
- 돈 관리 구성: 내 자산(쓸 수 있는 돈=농협+신한, 따로 모으는 돈=카카오뱅크, 군적금, 주식) → 계좌 → 군적금 저금통(병 두 개가 차오름, 매달 10일 IBK 30만·신한 25만 자동 입금 기록, 만기=넣은 돈×2 정부 100% 매칭·이자 별도) → 주식 표(산 가격·지금 가격·전일 대비·손익, 한국식으로 이익 빨강·손실 파랑) → 나라사랑카드(입체 카드 `app/private/card-narasarang.png`, 카드 사용 = `method: 'card'` 지출, 이번 달 정리) → 월급날 → 소비 → 내역.
- 계좌 이체: 내 통장끼리 실제로 옮긴 돈을 숫자만 옮긴다(소비·수입 아님). 계좌 줄의 '이체' 버튼이나 내 자산의 '이체'. 이체 기록을 누르면 취소(잔액 원상복구, 기록은 removed로 남김).
- 주식 시세: 앱은 바깥에 접속할 수 없어서, 세션에서 `bash tools/stock-quote.sh 005930`(네이버 증권, 이 환경에 m.stock.naver.com·polling.finance.naver.com 허용됨)으로 받아 `ArtifactData`로 `stocks/main`의 holdings[].price·priceAt·quote·history를 갱신한다. history는 지우지 않는다.
- 카드 이미지는 공개 저장소에 넣지 않는다(`app/private/`는 .gitignore). 아티팩트에는 `private/card-narasarang.png`로 이미 올라가 있다.
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
- `chat/log`: 예전 대화 문서(날짜별 `chatlog`로 옮겨졌고 `migrated: true`). 지우지 않고 둔다
- 저장소 화면의 '전체 기록 내려받기'는 위 전부를 JSON 한 파일로 준다(`downloads` 기능)
- 처음 넣은 기록은 `tools/seed.json`

## 규칙
- 감사한 점은 그날 자정 전까지만 적을 수 있고, 지나면 '탈락'으로 보인다. 다른 할 일은 지난 날도 체크할 수 있다(금요일은 폰을 내서 다음 날 체크).
- 달성률: 하루는 완료 비율, 한 달은 오늘까지 할 일이 있던 날들의 평균.
- XP: 끝낸 할 일은 걸린 분만큼(시간 없으면 30). 500 XP마다 레벨 업. 🔥는 연속 ALL CLEAR 일수.
- 돈: 월급날 매달 10일, 적금 55만원 자동이체, 실제로 쓰는 돈은 한 달 65만원. 통장은 농협, 카카오뱅크, 신한.
- 운동 루틴(체단): 금 등, 토 가슴, 일 하체, 월 등, 화 가슴, 수 하체, 목 휴식.
