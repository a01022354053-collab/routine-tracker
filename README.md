# 일상 매니저

하루 할 일, 감사한 점, 운동, 돈(통장·군적금·주식·카드), 내 물건과 살 것을 기록하는 개인 앱.

- 웹: https://leeseung06.kro.kr (Vercel, Next.js + Supabase)
- 화면 코드는 `artifact/` 한 곳에 있고, 같은 코드가 Claude 아티팩트와 웹 두 곳에서 돈다.
  - 웹에서는 `web/web.js`가 저장소(Supabase)·매니저(Anthropic API)·내려받기를 대신한다.
  - `npm run build`/`npm run dev` 전에 `tools/build-web.mjs`가 화면을 `public/`으로 옮긴다.
- 서버 기능: `src/app/api/` (Supabase 설정, 매니저 대화, 주식 시세)
- DB 준비: Supabase SQL Editor에서 `supabase/schema.sql`을 한 번 실행
- Vercel 환경 변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, (선택) `ALLOWED_EMAILS`

```bash
npm install
npm run dev
```
