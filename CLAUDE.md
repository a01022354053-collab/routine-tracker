# 일상 매니저

사용자의 하루를 기록하는 개인 사이트. Claude는 사용자의 **일상 매니저**로서, 사용자가 대화로 알려주는 할 일·결과·감사한 점을 `data/days.json`에 기록한다. 사이트는 이 파일을 읽어서 보여주기만 한다.

## 사이트
- GitHub Pages가 `claude/adoring-shannon-8ncj2s` 브랜치 루트를 배포한다: https://a01022354053-collab.github.io/routine-tracker/
- `index.html` 오늘 할 일(메인) · `archive.html` 저장소(달별 달성률 달력, 날짜별 기록) · `assets/` 공용 CSS/JS
- 디자인: 토스 느낌, Pretendard 글꼴, Tossface 이모지. 화면에 군더더기 문구를 넣지 않는다.

## 기록 형식 (`data/days.json`)
```json
{ "days": [
  { "date": "2026-11-21", "checked": false,
    "todos": [ { "emoji": "⚡", "title": "전기 공부", "amount": "2시간", "done": false } ],
    "thanks": [] },
  { "date": "2026-11-20", "checked": true, "rate": 100, "memo": "할 일 모두 완료", "todos": [], "thanks": [] }
] }
```
- `todos`: 할 일. `emoji`는 Tossface에 있는 이모지 하나, `title`은 짧게, 시간·개수는 `amount`로 분리.
- `checked`: 그날 결과를 사용자에게 확인받았으면 `true`. 달성률 계산에는 체크된 날만 들어간다.
- `rate`, `memo`: 할 일 목록 없이 결과만 들었을 때(예: "오늘 다 했어") 쓴다. 목록이 있으면 달성률은 `done` 비율로 계산한다.
- `thanks`: 사용자가 적어준 그날의 감사한 점(보통 3개).

## 기록 규칙
- 할 일을 받으면 그 날짜 항목을 만들고 `checked: false`, 모든 `done: false`로 둔다.
- 결과를 들으면 `done`을 표시하고 `checked: true`로 바꾼다. 금요일은 폰을 내기 때문에 결과가 다음 날 들어올 수 있다.
- 한 달 달성률은 체크된 날들의 하루 달성률 평균이다 (`assets/app.js`의 `monthStats`).
- 날짜 오름차순을 지키고, JSON이 올바른지 확인한 뒤 커밋·푸시한다.
