-- 일상 매니저 저장소. Supabase → SQL Editor에 붙여 넣고 한 번 실행한다(여러 번 실행해도 괜찮다).
-- 문서 하나 = 한 줄. path는 'days/2026-11-21' 같은 경로, col은 그 컬렉션('days').
-- 이 사이트는 주인 한 사람만 쓴다. 브라우저는 표에 직접 붙지 않고, 서버(/api/db)가 비밀 키로만 읽고 쓴다.
create table if not exists public.daily_docs (
  path text primary key,
  col text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists daily_docs_col on public.daily_docs (col);

-- RLS를 켜고 정책은 만들지 않는다: 공개 키(anon)로는 아무것도 읽거나 쓸 수 없고, 서버의 비밀 키만 통한다
alter table public.daily_docs enable row level security;
