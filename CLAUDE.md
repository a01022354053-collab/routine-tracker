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
- 다시 올리기: Artifact 도구로 `file_path: app/index.html`, `url`은 위 주소, 바뀐 파일만 `files`에 (예: `{"assets/app.js": "app/assets/app.js"}`). `capabilities`는 생략해서 그대로 둔다(지금: db 규칙 소유자만 읽기·쓰기, sample, downloads).
- 화면: `#today` 오늘 루틴(달력 + 고른 날의 할 일 카드, 가로로 넘김) · `#archive` 저장소(달별 달성률, 날짜별 기록) · `#money` 돈 관리 · `#fixed` 고정 지출 · `#items` 내 물건 · `#shopping` 필요한 물건(마지막 둘은 빈 화면). 컴퓨터(960px 이상)에서는 두 칸으로 넓게.
- 매니저: 오른쪽 아래 동그라미(✦)를 누르면 지금 화면 위로 대화창이 열린다(휴대폰은 아래에서 올라오고, 컴퓨터는 오른쪽 아래에 뜬다). 메뉴의 '매니저와 대화'도 같은 창을 연다.
- 디자인: 밤하늘 게임 월드. 남색 배경, 팝 네온, 유리 패널, 숫자는 Unbounded, 한글은 Pretendard, 이모지는 Tossface. 군더더기 문구를 넣지 않는다.

## 저장소(db) 구조 — 규칙: 소유자만 읽고 쓴다
**기록은 절대 지우지 않는다.** 지울 때는 `removed: true`, `removedAt`을 붙여 숨기고, 고칠 때는 예전 값을 `history`에 남긴다. 문서도 지우지 않는다.
- `days/<YYYY-MM-DD>`: `{ date, todos: [{ id, emoji, title, minutes?, amount?, done, kind?, note?, items?, removed? }] }`
  - `kind`: 없음(일반) · `dev`(사이트 개발, `note`=무엇을 할지) · `workout`(운동, 부위는 `workout/`에서) · `thanks`(감사한 점 3개, `items`)
- `workout/<YYYY-MM-DD>`: `{ date, part, plan }` — 없으면 주간 루틴의 그 요일 부위
- `settings/main`: `{ split: { "0": "하체", "1": "등", "2": "가슴", "3": "하체", "4": "휴식", "5": "등", "6": "가슴" } }` (0=일요일)
- `money/main`: `{ payday: 10, savings: 550000, spend: 650000, balances: { nh, kakao, shinhan } }` — 지금 잔액
- `balhist/<YYYY-MM>`: `{ month, items: [{ at, bank, amount }] }` — 잔액이 바뀔 때마다 쌓임
- `spend/<YYYY-MM>`: `{ month, items: [{ id, date, amount, title, bank?, at, history?, removed? }] }` — 지출 내역(bank: nh·kakao·shinhan·cash)
- `chatlog/<YYYY-MM-DD>`: `{ date, messages: [{ role, content, at, actions? }] }` — 매니저와 나눈 대화 전부
- `log/<YYYY-MM-DD>`: `{ date, entries: [{ at, text }] }` — 체크, 감사한 점, 메모, 운동, 잔액, 지출, 매니저가 한 일까지 바꾼 것 전부
- `chat/log`: 예전 대화 문서(날짜별 `chatlog`로 옮겨졌고 `migrated: true`). 지우지 않고 둔다
- 저장소 화면의 '전체 기록 내려받기'는 위 전부를 JSON 한 파일로 준다(`downloads` 기능)
- 처음 넣은 기록은 `tools/seed.json`

## 규칙
- 감사한 점은 그날 자정 전까지만 적을 수 있고, 지나면 '탈락'으로 보인다. 다른 할 일은 지난 날도 체크할 수 있다(금요일은 폰을 내서 다음 날 체크).
- 달성률: 하루는 완료 비율, 한 달은 오늘까지 할 일이 있던 날들의 평균.
- XP: 끝낸 할 일은 걸린 분만큼(시간 없으면 30). 500 XP마다 레벨 업. 🔥는 연속 ALL CLEAR 일수.
- 돈: 월급날 매달 10일, 적금 55만원 자동이체, 실제로 쓰는 돈은 한 달 65만원. 통장은 농협, 카카오뱅크, 신한.
- 운동 루틴(체단): 금 등, 토 가슴, 일 하체, 월 등, 화 가슴, 수 하체, 목 휴식.
